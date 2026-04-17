/**
 * agi-temperature Worker
 *
 * - scheduled: cron entry point for HN ingestion (stub; real logic lands later).
 * - fetch:     HTTP API. `/api/health` is the canary used by CI smoke tests
 *              and (later) an external uptime check.
 */

export default {
	async fetch(req, env, ctx): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname === '/api/health') {
			return handleHealth(env);
		}

		if (url.pathname === '/') {
			return new Response('agi-temperature worker: OK', { status: 200 });
		}

		return new Response('Not Found', { status: 404 });
	},

	async scheduled(event, env, ctx): Promise<void> {
		// TODO: replace stub with HN ingestion once the schema + scoring module land.
		console.log(`trigger fired at ${event.cron}`);
	},
} satisfies ExportedHandler<Env>;

async function handleHealth(env: Env): Promise<Response> {
	const row = await env.DB.prepare(
		'SELECT MAX(recorded_at) AS last_recorded_at, COUNT(*) AS row_count FROM readings',
	).first<{ last_recorded_at: number | null; row_count: number }>();

	const body = {
		status: 'ok',
		last_recorded_at: row?.last_recorded_at ?? null,
		row_count: row?.row_count ?? 0,
	};

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=60',
		},
	});
}
