import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function seedReading(recordedAt: number) {
	await env.DB.prepare(
		'INSERT INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (?, ?, ?, ?, ?)',
	)
		.bind(recordedAt, 0.2, 10, 'c1', 's1')
		.run();
}

describe('/api/health', () => {
	it('returns 503 stale when no rows exist (PRD D8: dumb uptime checkers must alert)', async () => {
		const res = await SELF.fetch('https://example.com/api/health');
		expect(res.status).toBe(503);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		const body = (await res.json()) as { status: string; last_recorded_at: number | null; row_count: number };
		expect(body.status).toBe('stale');
		expect(body.row_count).toBe(0);
		expect(body.last_recorded_at).toBeNull();
	});

	it('returns 200 ok while the newest reading is fresh (≤ 15 min)', async () => {
		const now = Math.floor(Date.now() / 1000);
		await seedReading(now - 5 * 60);

		const res = await SELF.fetch('https://example.com/api/health');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; last_recorded_at: number; row_count: number };
		expect(body.status).toBe('ok');
		expect(body.last_recorded_at).toBe(now - 5 * 60);
		expect(body.row_count).toBe(1);
	});

	it('returns 503 stale when the newest reading is older than 15 minutes', async () => {
		const now = Math.floor(Date.now() / 1000);
		await seedReading(now - 16 * 60);

		const res = await SELF.fetch('https://example.com/api/health');
		expect(res.status).toBe(503);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe('stale');
	});

	it('responds to CORS preflight with 204 and CORS headers', async () => {
		const res = await SELF.fetch('https://example.com/api/health', { method: 'OPTIONS' });
		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		expect(res.headers.get('access-control-allow-methods')).toContain('GET');
	});
});
