import {
	createExecutionContext,
	createScheduledController,
	env,
	fetchMock,
	waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { bucketRecordedAt } from '../src/ingest';
import { temperatureC } from '../src/scoring';

beforeAll(() => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
});

// 2026-06-11T12:02:34Z — deliberately mid-bucket.
const SCHEDULED_MS = 1781179354000;
const BUCKET = Math.floor(SCHEDULED_MS / 1000 / 300) * 300;

function mockTopStories(ids: number[]) {
	fetchMock
		.get('https://hacker-news.firebaseio.com')
		.intercept({ path: '/v0/topstories.json' })
		.reply(200, JSON.stringify(ids), { headers: { 'content-type': 'application/json' } });
}

type Hit = { objectID: string; title: string; points: number; num_comments: number };

function mockAlgolia(hits: Hit[]) {
	fetchMock
		.get('https://hn.algolia.com')
		.intercept({ path: (p) => p.startsWith('/api/v1/search') })
		.reply(200, JSON.stringify({ hits }), { headers: { 'content-type': 'application/json' } });
}

async function fireCron(scheduledMs = SCHEDULED_MS) {
	const ctrl = createScheduledController({
		scheduledTime: new Date(scheduledMs),
		cron: '*/5 * * * *',
	});
	const ctx = createExecutionContext();
	await worker.scheduled(ctrl, env, ctx);
	await waitOnExecutionContext(ctx);
}

describe('bucketRecordedAt', () => {
	it('floors to the 5-minute mark in unix seconds', () => {
		expect(bucketRecordedAt(1717999800000)).toBe(1717999800);
		expect(bucketRecordedAt(1718000099999)).toBe(1717999800);
		expect(bucketRecordedAt(1718000100000)).toBe(1718000100);
	});
});

describe('scheduled ingestion', () => {
	it('fetches, classifies, scores and persists one snapshot', async () => {
		mockTopStories([101, 102, 103]);
		mockAlgolia([
			{ objectID: '101', title: 'OpenAI melts a datacenter', points: 512, num_comments: 321 },
			{ objectID: '102', title: 'Show HN: Homebrew 6.0.0', points: 200, num_comments: 80 },
			{ objectID: '103', title: 'Postgres 18 released', points: 150, num_comments: 60 },
		]);

		await fireCron();

		const reading = await env.DB.prepare('SELECT * FROM readings').first<{
			recorded_at: number;
			score: number;
			temperature_c: number;
			classifier_version: string;
			scoring_version: string;
		}>();
		expect(reading).not.toBeNull();
		expect(reading!.recorded_at).toBe(BUCKET);
		// rank 1 (weight 100) AI of weights 100+99+98
		expect(reading!.score).toBeCloseTo(100 / 297, 10);
		expect(reading!.temperature_c).toBeCloseTo(temperatureC(100 / 297), 6);
		expect(reading!.classifier_version).toBe('c1');
		expect(reading!.scoring_version).toBe('s1');

		const stories = (
			await env.DB.prepare('SELECT * FROM stories ORDER BY rank').all<{
				recorded_at: number;
				rank: number;
				hn_id: number;
				title: string;
				is_ai: number;
				points: number | null;
				num_comments: number | null;
			}>()
		).results;
		expect(stories).toHaveLength(3);
		expect(stories[0]).toMatchObject({
			recorded_at: BUCKET,
			rank: 1,
			hn_id: 101,
			title: 'OpenAI melts a datacenter',
			is_ai: 1,
			points: 512,
			num_comments: 321,
		});
		expect(stories[1].is_ai).toBe(0);
		expect(stories[2].is_ai).toBe(0);
	});

	it('is idempotent: a duplicate fire in the same bucket is a no-op and does not refetch', async () => {
		mockTopStories([101]);
		mockAlgolia([{ objectID: '101', title: 'AGI achieved internally', points: 9999, num_comments: 1234 }]);

		await fireCron();
		// No interceptors remain; a second fetch attempt would fail the test.
		await fireCron(SCHEDULED_MS + 60_000); // 1 min later, same bucket

		const counts = await env.DB.prepare(
			'SELECT (SELECT COUNT(*) FROM readings) AS readings, (SELECT COUNT(*) FROM stories) AS stories',
		).first<{ readings: number; stories: number }>();
		expect(counts).toEqual({ readings: 1, stories: 1 });
	});

	it('falls back to Firebase items for stories missing from Algolia', async () => {
		mockTopStories([201, 202, 203]);
		mockAlgolia([
			{ objectID: '201', title: 'Claude ships a worker', points: 300, num_comments: 100 },
			{ objectID: '203', title: 'Rust 2.0 announced', points: 250, num_comments: 90 },
		]);
		fetchMock
			.get('https://hacker-news.firebaseio.com')
			.intercept({ path: '/v0/item/202.json' })
			.reply(
				200,
				JSON.stringify({ id: 202, type: 'story', title: 'NVIDIA earnings beat expectations', score: 432, descendants: 99 }),
				{ headers: { 'content-type': 'application/json' } },
			);

		await fireCron();

		const story = await env.DB.prepare('SELECT * FROM stories WHERE rank = 2').first<{
			hn_id: number;
			title: string;
			is_ai: number;
			points: number | null;
			num_comments: number | null;
		}>();
		expect(story).toMatchObject({
			hn_id: 202,
			title: 'NVIDIA earnings beat expectations',
			is_ai: 1,
			points: 432, // Firebase `score` → points
			num_comments: 99, // Firebase `descendants` → num_comments
		});

		const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM stories').first<{ n: number }>();
		expect(count!.n).toBe(3);
	});

	it('skips stories that fail both sources but keeps the snapshot comparable', async () => {
		mockTopStories([301, 302]);
		mockAlgolia([{ objectID: '301', title: 'An LLM ate my homework', points: 100, num_comments: 50 }]);
		fetchMock
			.get('https://hacker-news.firebaseio.com')
			.intercept({ path: '/v0/item/302.json' })
			.reply(500, 'boom');

		await fireCron();

		const reading = await env.DB.prepare('SELECT score FROM readings').first<{ score: number }>();
		// only rank 1 exists, and it is AI → score normalizes to 1 over the weight that resolved
		expect(reading!.score).toBeCloseTo(1, 10);
		const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM stories').first<{ n: number }>();
		expect(count!.n).toBe(1);
	});

	it('writes nothing when the top-stories fetch itself fails', async () => {
		fetchMock
			.get('https://hacker-news.firebaseio.com')
			.intercept({ path: '/v0/topstories.json' })
			.reply(500, 'firebase down');

		await fireCron(); // must not throw

		const counts = await env.DB.prepare(
			'SELECT (SELECT COUNT(*) FROM readings) AS readings, (SELECT COUNT(*) FROM stories) AS stories',
		).first<{ readings: number; stories: number }>();
		expect(counts).toEqual({ readings: 0, stories: 0 });
	});
});
