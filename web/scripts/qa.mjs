#!/usr/bin/env node
/**
 * End-to-end QA sweep with Playwright against a running stack
 * (wrangler dev on :8787 with data, vite on :5173).
 *
 * Usage: node scripts/qa.mjs [--base http://localhost:5173] [--shots /tmp/qa-shots]
 * Requires: npx playwright (uses the system Chrome channel, no browser download).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : dflt;
};
const BASE = flag('base', 'http://localhost:5173');
const SHOTS = flag('shots', '/tmp/qa-shots');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const passes = [];
function check(name, ok, detail = '') {
	(ok ? passes : failures).push(`${name}${detail ? ` — ${detail}` : ''}`);
	console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function run(label, { viewport, reducedMotion = 'no-preference' }) {
	console.log(`\n[${label}] viewport ${viewport.width}x${viewport.height}, reduced-motion: ${reducedMotion}`);
	const ctx = await browser.newContext({ viewport, reducedMotion });
	const page = await ctx.newPage();
	const consoleErrors = [];
	page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
	page.on('pageerror', (e) => consoleErrors.push(String(e)));

	// Home: reading, tagline, scene canvas
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2000);
	const temp = await page.textContent('.reading-temp').catch(() => null);
	check(`${label}: temperature renders`, /-?−?\d+\.\d°[CF]/.test(temp ?? ''), `got "${temp?.trim()}"`);
	check(`${label}: tagline present`, ((await page.textContent('.reading-tagline').catch(() => '')) ?? '').length > 3);
	const canvases = await page.locator('.scene-backdrop canvas').count();
	check(`${label}: scene canvas mounted`, canvases >= 1);
	check(`${label}: page title is alive`, (await page.title()).includes('AGI Temperature'));
	await page.screenshot({ path: `${SHOTS}/${label}-home.png` });

	// °F toggle persists
	const before = await page.textContent('.reading-temp');
	await page.click('.unit-toggle');
	await page.waitForTimeout(300);
	const after = await page.textContent('.reading-temp');
	check(`${label}: °F toggle changes reading`, before !== after, `${before?.trim()} → ${after?.trim()}`);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	const persisted = await page.textContent('.reading-temp');
	check(`${label}: unit persists across reload`, persisted?.endsWith(after?.slice(-2) ?? ''));
	await page.click('.unit-toggle'); // back to °C for cleanliness

	// Chart ranges
	for (const range of ['24 hours', '30 days', 'all time', '7 days']) {
		await page.click(`.range-btn:has-text("${range}")`);
		await page.waitForTimeout(700);
		const paths = await page.locator('.chart-frame svg path').count();
		check(`${label}: chart renders for "${range}"`, paths > 0, `${paths} svg paths`);
	}

	// Records
	const records = await page.locator('.record').count();
	check(`${label}: station records render`, records === 3, `${records} cards`);

	// Headlines
	await page.goto(`${BASE}/headlines`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	const receipts = await page.locator('.receipt').count();
	check(`${label}: receipts list renders`, receipts > 0, `${receipts} receipts`);
	const firstLink = await page.locator('.receipt-title').first().getAttribute('href');
	check(`${label}: receipt links to HN`, firstLink?.startsWith('https://news.ycombinator.com/item?id=') ?? false);
	await page.screenshot({ path: `${SHOTS}/${label}-headlines.png` });

	// 404 humor
	await page.goto(`${BASE}/definitely-not-a-page`, { waitUntil: 'networkidle' });
	check(`${label}: 404 page renders`, ((await page.textContent('.empty-state')) ?? '').includes('404°'));

	// Spike harness (both routes still render)
	for (const route of ['A', 'B']) {
		await page.goto(`${BASE}/spike?route=${route}&u=0.7`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const fps = await page.textContent('[data-testid="fps"]').catch(() => null);
		check(`${label}: spike route ${route} alive`, fps !== null, fps?.trim());
	}

	check(`${label}: zero console errors across sweep`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
	await ctx.close();
}

await run('desktop', { viewport: { width: 1440, height: 900 } });
await run('phone', { viewport: { width: 390, height: 844 } });
await run('reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

await browser.close();

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
	console.log('FAILURES:');
	for (const f of failures) console.log('  ✗ ' + f);
	process.exit(1);
}
