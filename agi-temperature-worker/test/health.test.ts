import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

describe('/api/health', () => {
	beforeAll(async () => {
		// Apply migrations against the Miniflare in-memory D1 so the endpoint can query.
		await env.DB.exec(
			"CREATE TABLE IF NOT EXISTS readings (recorded_at INTEGER PRIMARY KEY, score REAL NOT NULL, temperature_c REAL NOT NULL, classifier_version TEXT NOT NULL, scoring_version TEXT NOT NULL)",
		);
	});

	it('returns 200 with status payload on empty DB', async () => {
		const res = await SELF.fetch('https://example.com/api/health');
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			last_recorded_at: number | null;
			row_count: number;
		};
		expect(body.status).toBe('ok');
		expect(body.row_count).toBe(0);
		expect(body.last_recorded_at).toBeNull();
	});
});
