import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function seedSnapshot(recordedAt: number) {
	const stmts = [
		env.DB.prepare(
			'INSERT INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
		).bind(recordedAt, 0.25, 14.1, 'c1', 's1'),
		env.DB.prepare(
			'INSERT INTO stories (recorded_at, rank, hn_id, title, is_ai, points, num_comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).bind(recordedAt, 1, 11, 'OpenAI does a thing', 1, 500, 300),
		env.DB.prepare(
			'INSERT INTO stories (recorded_at, rank, hn_id, title, is_ai, points, num_comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).bind(recordedAt, 2, 22, 'Homebrew 6.0.0', 0, 200, 80),
		env.DB.prepare(
			'INSERT INTO stories (recorded_at, rank, hn_id, title, is_ai, points, num_comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).bind(recordedAt, 3, 33, 'NVIDIA earnings', 1, 400, 250),
	];
	await env.DB.batch(stmts);
}

describe('/api/current', () => {
	it('returns 503 no_data before the first ingestion', async () => {
		const res = await SELF.fetch('https://example.com/api/current');
		expect(res.status).toBe(503);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe('no_data');
	});

	it('returns the latest reading with its AI stories sorted by rank', async () => {
		await seedSnapshot(1781179200);
		// an older snapshot that must NOT be returned
		await env.DB.prepare(
			'INSERT INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
		)
			.bind(1781178900, 0.5, 33.5, 'c1', 's1')
			.run();

		const res = await SELF.fetch('https://example.com/api/current');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('public, max-age=60');

		const body = (await res.json()) as {
			recorded_at: number;
			temperature_c: number;
			score: number;
			classifier_version: string;
			scoring_version: string;
			ai_count: number;
			total_count: number;
			ai_stories: Array<{
				rank: number;
				hn_id: number;
				title: string;
				points: number | null;
				num_comments: number | null;
				weight: number;
			}>;
		};

		expect(body.recorded_at).toBe(1781179200);
		expect(body.temperature_c).toBeCloseTo(14.1, 6);
		expect(body.score).toBeCloseTo(0.25, 6);
		expect(body.classifier_version).toBe('c1');
		expect(body.scoring_version).toBe('s1');
		expect(body.ai_count).toBe(2);
		expect(body.total_count).toBe(3);
		expect(body.ai_stories).toEqual([
			{ rank: 1, hn_id: 11, title: 'OpenAI does a thing', points: 500, num_comments: 300, weight: 100 },
			{ rank: 3, hn_id: 33, title: 'NVIDIA earnings', points: 400, num_comments: 250, weight: 98 },
		]);
	});

	it('serves repeat requests from the edge cache', async () => {
		await seedSnapshot(1781179500);
		const first = await SELF.fetch('https://example.com/api/current');
		expect(first.status).toBe(200);
		expect(first.headers.get('x-cache')).toBe('MISS');

		const second = await SELF.fetch('https://example.com/api/current');
		expect(second.status).toBe(200);
		expect(second.headers.get('x-cache')).toBe('HIT');
		const body = (await second.json()) as { recorded_at: number };
		expect(body.recorded_at).toBe(1781179500);
	});
});
