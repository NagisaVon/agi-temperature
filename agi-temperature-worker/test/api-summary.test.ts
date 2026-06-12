import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const DAY = 86400;

async function seedReading(recordedAt: number, tempC: number, score = 0.2) {
	await env.DB.prepare(
		'INSERT INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
	)
		.bind(recordedAt, score, tempC, 'c1', 's1')
		.run();
}

describe('/api/summary', () => {
	it('returns 503 no_data before the first ingestion', async () => {
		const res = await SELF.fetch('https://example.com/api/summary');
		expect(res.status).toBe(503);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe('no_data');
	});

	it('reports all-time extremes, 7-day average, and reading count', async () => {
		const now = Math.floor(Date.now() / 1000);
		const oldLow = now - 30 * DAY; // outside the 7d window, still an all-time record
		await seedReading(oldLow, -42.5, 0.01);
		await seedReading(now - 2 * DAY, 10, 0.1);
		await seedReading(now - 1 * DAY, 30, 0.3);

		const res = await SELF.fetch('https://example.com/api/summary');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('public, max-age=300');

		const body = (await res.json()) as {
			all_time_high: { temperature_c: number; recorded_at: number };
			all_time_low: { temperature_c: number; recorded_at: number };
			avg_7d_c: number;
			reading_count: number;
		};
		expect(body.all_time_high).toEqual({ temperature_c: 30, recorded_at: now - 1 * DAY });
		expect(body.all_time_low).toEqual({ temperature_c: -42.5, recorded_at: oldLow });
		expect(body.avg_7d_c).toBeCloseTo(20, 6); // only the two readings inside 7d
		expect(body.reading_count).toBe(3);
	});
});
