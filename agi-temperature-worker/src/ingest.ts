/**
 * Cron ingestion: HN top stories → classify → score → one atomic D1 batch.
 *
 * Subrequest budget (free tier: 50/invocation, and D1 calls count):
 * 1 topstories + 1 Algolia bulk + ≤35 Firebase fallbacks + 1 bucket-check
 * + 1 batch ≈ 39 worst case.
 */

import { CLASSIFIER_VERSION, isAI } from './classifier';
import { SCORING_VERSION, computeScore, temperatureC } from './scoring';

const MAX_STORIES = 100;
const FALLBACK_CAP = 35;

export function bucketRecordedAt(scheduledTimeMs: number): number {
	return Math.floor(scheduledTimeMs / 1000 / 300) * 300;
}

type FetchedStory = {
	rank: number;
	hn_id: number;
	title: string;
	points: number | null;
	num_comments: number | null;
};

type AlgoliaHit = { objectID: string; title: string | null; points: number | null; num_comments: number | null };
type FirebaseItem = { title?: string; score?: number; descendants?: number } | null;

async function fetchAlgoliaBulk(ids: number[]): Promise<Map<number, AlgoliaHit>> {
	const byId = new Map<number, AlgoliaHit>();
	const tags = `story,(${ids.map((id) => `story_${id}`).join(',')})`;
	try {
		const res = await fetch(
			`https://hn.algolia.com/api/v1/search?hitsPerPage=${MAX_STORIES}&tags=${encodeURIComponent(tags)}`,
		);
		if (!res.ok) return byId;
		const data = (await res.json()) as { hits?: AlgoliaHit[] };
		for (const hit of data.hits ?? []) byId.set(Number(hit.objectID), hit);
	} catch (err) {
		console.error('algolia bulk fetch failed, relying on fallback:', err);
	}
	return byId;
}

async function fetchFirebaseItem(id: number, rank: number): Promise<FetchedStory | null> {
	try {
		const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
		if (!res.ok) return null;
		const item = (await res.json()) as FirebaseItem;
		if (!item?.title) return null;
		return { rank, hn_id: id, title: item.title, points: item.score ?? null, num_comments: item.descendants ?? null };
	} catch {
		return null;
	}
}

export async function runIngestion(env: Env, scheduledTimeMs: number): Promise<void> {
	const recordedAt = bucketRecordedAt(scheduledTimeMs);

	// Checked before fetching so a late duplicate fire can't mix a second
	// fetch's stories into an existing snapshot (PRD §4.1).
	const existing = await env.DB.prepare('SELECT 1 FROM readings WHERE recorded_at = ?').bind(recordedAt).first();
	if (existing) {
		console.log(`bucket ${recordedAt} already recorded; duplicate fire is a no-op`);
		return;
	}

	const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
	if (!idsRes.ok) throw new Error(`topstories fetch failed: HTTP ${idsRes.status}`);
	const ids = ((await idsRes.json()) as number[]).slice(0, MAX_STORIES);

	const algolia = await fetchAlgoliaBulk(ids);

	const stories: FetchedStory[] = [];
	const missing: Array<{ id: number; rank: number }> = [];
	ids.forEach((id, i) => {
		const rank = i + 1;
		const hit = algolia.get(id);
		if (hit?.title) {
			stories.push({ rank, hn_id: id, title: hit.title, points: hit.points ?? null, num_comments: hit.num_comments ?? null });
		} else {
			missing.push({ id, rank });
		}
	});

	if (missing.length > FALLBACK_CAP) {
		console.warn(`${missing.length} stories missing from Algolia; fetching ${FALLBACK_CAP}, skipping the rest`);
	}
	const fallbacks = await Promise.all(missing.slice(0, FALLBACK_CAP).map(({ id, rank }) => fetchFirebaseItem(id, rank)));
	for (const story of fallbacks) if (story) stories.push(story);
	stories.sort((a, b) => a.rank - b.rank);

	const classified = stories.map((s) => ({ ...s, is_ai: isAI(s.title) }));
	const score = computeScore(classified);
	const tempC = temperatureC(score);

	await env.DB.batch([
		env.DB
			.prepare(
				'INSERT OR IGNORE INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
			)
			.bind(recordedAt, score, tempC, CLASSIFIER_VERSION, SCORING_VERSION),
		...classified.map((s) =>
			env.DB
				.prepare(
					'INSERT OR IGNORE INTO stories (recorded_at, rank, hn_id, title, is_ai, points, num_comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
				)
				.bind(recordedAt, s.rank, s.hn_id, s.title, s.is_ai ? 1 : 0, s.points, s.num_comments),
		),
	]);

	const aiCount = classified.filter((s) => s.is_ai).length;
	console.log(
		`recorded ${recordedAt}: score=${score.toFixed(4)} temp=${tempC.toFixed(1)}°C ai=${aiCount}/${classified.length}`,
	);
}
