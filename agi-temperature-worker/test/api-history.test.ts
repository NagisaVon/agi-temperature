import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const HOUR = 3600;
const DAY = 86400;

function bucket5m(unixSeconds: number): number {
	return Math.floor(unixSeconds / 300) * 300;
}

async function seedReading(recordedAt: number, tempC: number, score = 0.2) {
	await env.DB.prepare(
		'INSERT INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
	)
		.bind(recordedAt, score, tempC, 'c1', 's1')
		.run();
}

describe('/api/history', () => {
	it('rejects an invalid range with 400', async () => {
		const res = await SELF.fetch('https://example.com/api/history?range=fortnight');
		expect(res.status).toBe(400);
	});

	it('returns empty points (200) when no data exists', async () => {
		const res = await SELF.fetch('https://example.com/api/history?range=24h');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { range: string; bucket: string; points: unknown[] };
		expect(body).toEqual({ range: '24h', bucket: '5m', points: [] });
	});

	it('serves raw 5-minute readings for 24h, excluding older rows', async () => {
		const now = Math.floor(Date.now() / 1000);
		const t1 = bucket5m(now - 2 * HOUR);
		const t2 = bucket5m(now - 1 * HOUR);
		const old = bucket5m(now - 25 * HOUR);
		await seedReading(t1, 10.5, 0.1);
		await seedReading(t2, 20.5, 0.3);
		await seedReading(old, -50, 0.01);

		const res = await SELF.fetch('https://example.com/api/history?range=24h');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('public, max-age=300');

		const body = (await res.json()) as {
			range: string;
			bucket: string;
			points: Array<{ t: number; avg_c: number; min_c: number; max_c: number; avg_score: number }>;
		};
		expect(body.range).toBe('24h');
		expect(body.bucket).toBe('5m');
		expect(body.points).toHaveLength(2);
		expect(body.points[0]).toEqual({ t: t1, avg_c: 10.5, min_c: 10.5, max_c: 10.5, avg_score: 0.1 });
		expect(body.points[1]).toEqual({ t: t2, avg_c: 20.5, min_c: 20.5, max_c: 20.5, avg_score: 0.3 });
	});

	it('aggregates 7d into UTC-aligned hourly buckets', async () => {
		const now = Math.floor(Date.now() / 1000);
		const hourStart = Math.floor((now - 3 * HOUR) / HOUR) * HOUR;
		await seedReading(hourStart, 10, 0.1);
		await seedReading(hourStart + 300, 30, 0.3);
		await seedReading(hourStart - 2 * HOUR, 0, 0.05);

		const res = await SELF.fetch('https://example.com/api/history?range=7d');
		const body = (await res.json()) as {
			bucket: string;
			points: Array<{ t: number; avg_c: number; min_c: number; max_c: number; avg_score: number }>;
		};
		expect(body.bucket).toBe('1h');
		expect(body.points).toHaveLength(2);
		for (const p of body.points) expect(p.t % HOUR).toBe(0);

		const merged = body.points.find((p) => p.t === hourStart)!;
		expect(merged.avg_c).toBeCloseTo(20, 6);
		expect(merged.min_c).toBe(10);
		expect(merged.max_c).toBe(30);
		expect(merged.avg_score).toBeCloseTo(0.2, 6);
	});

	it('aggregates all-time into UTC-aligned daily buckets', async () => {
		const now = Math.floor(Date.now() / 1000);
		const dayStart = Math.floor((now - 3 * DAY) / DAY) * DAY;
		await seedReading(dayStart + 100 * 300, -5, 0.05);
		await seedReading(dayStart + 101 * 300, 15, 0.15);
		await seedReading(now - 300, 25, 0.25);

		const res = await SELF.fetch('https://example.com/api/history?range=all');
		const body = (await res.json()) as {
			bucket: string;
			points: Array<{ t: number; avg_c: number; min_c: number; max_c: number }>;
		};
		expect(body.bucket).toBe('1d');
		expect(body.points).toHaveLength(2);
		for (const p of body.points) expect(p.t % DAY).toBe(0);
		const oldDay = body.points.find((p) => p.t === dayStart)!;
		expect(oldDay.avg_c).toBeCloseTo(5, 6);
		expect(oldDay.min_c).toBe(-5);
		expect(oldDay.max_c).toBe(15);
	});
});
