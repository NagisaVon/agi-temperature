/**
 * agi-temperature Worker
 *
 * - scheduled: cron entry point — HN ingestion every 5 minutes.
 * - fetch:     HTTP API, edge-cached per route (PRD §4.5).
 */

import { handleCurrent, handleHealth, handleHistory, handleSummary } from './api';
import { runIngestion } from './ingest';

const CORS_HEADERS: Record<string, string> = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, OPTIONS',
	'access-control-max-age': '86400',
};

function withCors(res: Response): Response {
	const headers = new Headers(res.headers);
	for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function withEdgeCache(req: Request, ttlSeconds: number, make: () => Promise<Response>): Promise<Response> {
	const cache = caches.default;
	const cached = await cache.match(req.url);
	if (cached) {
		const res = new Response(cached.body, cached);
		res.headers.set('x-cache', 'HIT');
		return res;
	}

	const res = await make();
	res.headers.set('cache-control', `public, max-age=${ttlSeconds}`);
	res.headers.set('x-cache', 'MISS');
	// Awaited (not waitUntil) so a cache.put pending across requests can't
	// deadlock the test runtime; the extra latency on a MISS is negligible.
	if (res.status === 200) await cache.put(req.url, res.clone());
	return res;
}

export default {
	async fetch(req, env, ctx): Promise<Response> {
		if (req.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		const url = new URL(req.url);

		switch (url.pathname) {
			case '/api/current':
				return withCors(await withEdgeCache(req, 60, () => handleCurrent(env)));
			case '/api/history':
				return withCors(await withEdgeCache(req, 300, () => handleHistory(env, url)));
			case '/api/summary':
				return withCors(await withEdgeCache(req, 300, () => handleSummary(env)));
			case '/api/health':
				return withCors(await withEdgeCache(req, 60, () => handleHealth(env)));
			case '/':
				return withCors(new Response('agi-temperature worker: OK', { status: 200 }));
			default:
				return withCors(new Response('Not Found', { status: 404 }));
		}
	},

	async scheduled(event, env, ctx): Promise<void> {
		ctx.waitUntil(
			runIngestion(env, event.scheduledTime).catch((err) => {
				// Abort, don't throw: a failed run leaves a visible gap (PRD §4.1)
				// and persistent failure is caught by /api/health staleness.
				console.error('ingestion failed:', err);
			}),
		);
	},
} satisfies ExportedHandler<Env>;
