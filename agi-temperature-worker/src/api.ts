import { weight } from './scoring';

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

type ReadingRow = {
	recorded_at: number;
	score: number;
	temperature_c: number;
	classifier_version: string;
	scoring_version: string;
};

type StoryRow = {
	rank: number;
	hn_id: number;
	title: string;
	is_ai: number;
	points: number | null;
	num_comments: number | null;
};

export async function handleCurrent(env: Env): Promise<Response> {
	const reading = await env.DB.prepare('SELECT * FROM readings ORDER BY recorded_at DESC LIMIT 1').first<ReadingRow>();
	if (!reading) return json({ status: 'no_data' }, 503);

	const stories = (
		await env.DB.prepare(
			'SELECT rank, hn_id, title, is_ai, points, num_comments FROM stories WHERE recorded_at = ? ORDER BY rank',
		)
			.bind(reading.recorded_at)
			.all<StoryRow>()
	).results;

	const aiStories = stories.filter((s) => s.is_ai === 1);
	return json({
		recorded_at: reading.recorded_at,
		temperature_c: reading.temperature_c,
		score: reading.score,
		classifier_version: reading.classifier_version,
		scoring_version: reading.scoring_version,
		ai_count: aiStories.length,
		total_count: stories.length,
		ai_stories: aiStories.map((s) => ({
			rank: s.rank,
			hn_id: s.hn_id,
			title: s.title,
			points: s.points,
			num_comments: s.num_comments,
			weight: weight(s.rank),
		})),
	});
}

const HISTORY_RANGES = {
	'24h': { windowS: 24 * 3600, bucketS: 300, bucket: '5m' },
	'7d': { windowS: 7 * 86400, bucketS: 3600, bucket: '1h' },
	'30d': { windowS: 30 * 86400, bucketS: 3600, bucket: '1h' },
	all: { windowS: null, bucketS: 86400, bucket: '1d' },
} as const;

type HistoryPoint = { t: number; avg_c: number; min_c: number; max_c: number; avg_score: number };

export async function handleHistory(env: Env, url: URL): Promise<Response> {
	const range = url.searchParams.get('range') ?? '24h';
	const spec = HISTORY_RANGES[range as keyof typeof HISTORY_RANGES];
	if (!spec) return json({ error: 'invalid range; expected 24h|7d|30d|all' }, 400);

	const since = spec.windowS === null ? 0 : Math.floor(Date.now() / 1000) - spec.windowS;

	let points: HistoryPoint[];
	if (spec.bucket === '5m') {
		// Raw readings are already 5-minute buckets; avg = min = max.
		const rows = (
			await env.DB.prepare(
				'SELECT recorded_at, temperature_c, score FROM readings WHERE recorded_at >= ? ORDER BY recorded_at',
			)
				.bind(since)
				.all<{ recorded_at: number; temperature_c: number; score: number }>()
		).results;
		points = rows.map((r) => ({
			t: r.recorded_at,
			avg_c: r.temperature_c,
			min_c: r.temperature_c,
			max_c: r.temperature_c,
			avg_score: r.score,
		}));
	} else {
		// bucketS is a trusted constant; integer division aligns to UTC clock boundaries.
		const rows = (
			await env.DB.prepare(
				`SELECT (recorded_at / ${spec.bucketS}) * ${spec.bucketS} AS t,
				        AVG(temperature_c) AS avg_c, MIN(temperature_c) AS min_c,
				        MAX(temperature_c) AS max_c, AVG(score) AS avg_score
				 FROM readings WHERE recorded_at >= ?
				 GROUP BY t ORDER BY t`,
			)
				.bind(since)
				.all<HistoryPoint>()
		).results;
		points = rows;
	}

	return json({ range, bucket: spec.bucket, points });
}

export async function handleSummary(env: Env): Promise<Response> {
	const since7d = Math.floor(Date.now() / 1000) - 7 * 86400;
	const [highRes, lowRes, statsRes] = await env.DB.batch([
		env.DB.prepare('SELECT temperature_c, recorded_at FROM readings ORDER BY temperature_c DESC, recorded_at ASC LIMIT 1'),
		env.DB.prepare('SELECT temperature_c, recorded_at FROM readings ORDER BY temperature_c ASC, recorded_at ASC LIMIT 1'),
		env.DB
			.prepare(
				'SELECT COUNT(*) AS reading_count, (SELECT AVG(temperature_c) FROM readings WHERE recorded_at >= ?) AS avg_7d_c FROM readings',
			)
			.bind(since7d),
	]);

	const high = highRes.results[0] as { temperature_c: number; recorded_at: number } | undefined;
	const low = lowRes.results[0] as { temperature_c: number; recorded_at: number } | undefined;
	const stats = statsRes.results[0] as { reading_count: number; avg_7d_c: number | null };

	if (!high || !low || stats.reading_count === 0) return json({ status: 'no_data' }, 503);

	return json({
		all_time_high: high,
		all_time_low: low,
		avg_7d_c: stats.avg_7d_c,
		reading_count: stats.reading_count,
	});
}

// 3 missed 5-minute crons (PRD D8): any dumb uptime checker alerts on the 503 alone.
const STALE_AFTER_S = 15 * 60;

export async function handleHealth(env: Env): Promise<Response> {
	const row = await env.DB.prepare(
		'SELECT MAX(recorded_at) AS last_recorded_at, COUNT(*) AS row_count FROM readings',
	).first<{ last_recorded_at: number | null; row_count: number }>();

	const last = row?.last_recorded_at ?? null;
	const stale = last === null || Math.floor(Date.now() / 1000) - last > STALE_AFTER_S;

	return json(
		{ status: stale ? 'stale' : 'ok', last_recorded_at: last, row_count: row?.row_count ?? 0 },
		stale ? 503 : 200,
	);
}
