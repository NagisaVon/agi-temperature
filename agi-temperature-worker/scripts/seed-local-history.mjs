#!/usr/bin/env node
/**
 * Dev-only: seed the LOCAL D1 with plausible history so charts and records
 * have something to render. Never run against --remote.
 *
 * Usage: node scripts/seed-local-history.mjs | npx wrangler d1 execute agi-temperature --local --file=/dev/stdin
 * (or pipe to a temp file first on systems where /dev/stdin misbehaves)
 */

const GAMMA = 0.25;
const tempC = (score) => -89.2 + 145.9 * Math.pow(score, GAMMA);
const bucket = (s) => Math.floor(s / 300) * 300;

const now = Math.floor(Date.now() / 1000);
const rows = [];

// Mulberry32 — deterministic so reruns are stable (INSERT OR IGNORE dedups).
let seed = 0xa61;
function rand() {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// A hype random-walk: daily news cycle + slow drift + jitter, clamped to [0.02, 0.85].
function scoreAt(t) {
	const days = (now - t) / 86400;
	const daily = 0.06 * Math.sin((t / 86400) * 2 * Math.PI * 1.0 + 1.3);
	const drift = 0.05 * Math.sin(days / 6);
	const base = 0.24 + daily + drift + (rand() - 0.5) * 0.05;
	return Math.min(0.85, Math.max(0.02, base));
}

// 35 days hourly, then the last 24h at full 5-minute resolution.
for (let t = bucket(now - 35 * 86400); t < now - 86400; t += 3600) rows.push(t);
for (let t = bucket(now - 86400); t < now - 600; t += 300) rows.push(t);

// One spicy record-high spike and one record-low trough for the banners.
const statements = rows.map((t) => {
	let s = scoreAt(t);
	if (t === rows[Math.floor(rows.length * 0.4)]) s = 0.78; // record hype day
	if (t === rows[Math.floor(rows.length * 0.7)]) s = 0.015; // the great AI winter of last week
	return `INSERT OR IGNORE INTO readings (recorded_at, score, temperature_c, classifier_version, scoring_version) VALUES (${t}, ${s.toFixed(6)}, ${tempC(s).toFixed(4)}, 'c1', 's1');`;
});

console.log(statements.join('\n'));
