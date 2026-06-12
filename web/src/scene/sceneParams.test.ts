import { describe, expect, it } from 'vitest';
import { type SceneParams, cssRGB, sceneParamsFor } from './sceneParams';

/**
 * D12: one continuous scene — every parameter interpolates with temperature.
 * These tests are the no-banding guarantee: a discrete band edge shows up as
 * a jump between adjacent samples and fails the slope caps below.
 */

const DU = 0.001;

type Leaf = { path: string; get: (p: SceneParams) => number; maxSlopePerStep: number };

const LEAVES: Leaf[] = [
	{ path: 'sun.elevation', get: (p) => p.sun.elevation, maxSlopePerStep: 0.01 },
	{ path: 'sun.intensity', get: (p) => p.sun.intensity, maxSlopePerStep: 0.01 },
	{ path: 'wind', get: (p) => p.wind, maxSlopePerStep: 0.01 },
	{ path: 'particles.snow', get: (p) => p.particles.snow, maxSlopePerStep: 0.01 },
	{ path: 'particles.rain', get: (p) => p.particles.rain, maxSlopePerStep: 0.01 },
	{ path: 'particles.tokens', get: (p) => p.particles.tokens, maxSlopePerStep: 0.01 },
	{ path: 'particles.embers', get: (p) => p.particles.embers, maxSlopePerStep: 0.01 },
	{ path: 'shimmer', get: (p) => p.shimmer, maxSlopePerStep: 0.01 },
	{ path: 'fog', get: (p) => p.fog, maxSlopePerStep: 0.01 },
	{ path: 'iceberg', get: (p) => p.iceberg, maxSlopePerStep: 0.01 },
	{ path: 'frost', get: (p) => p.frost, maxSlopePerStep: 0.01 },
	{ path: 'rackGlow', get: (p) => p.rackGlow, maxSlopePerStep: 0.01 },
	...(['top', 'horizon', 'low'] as const).flatMap((band) =>
		[0, 1, 2].map((ch) => ({
			path: `sky.${band}[${ch}]`,
			get: (p: SceneParams) => p.sky[band][ch],
			maxSlopePerStep: 5,
		})),
	),
	...[0, 1, 2].map((ch) => ({
		path: `sun.color[${ch}]`,
		get: (p: SceneParams) => p.sun.color[ch],
		maxSlopePerStep: 5,
	})),
];

function sweep(): SceneParams[] {
	const out: SceneParams[] = [];
	for (let u = 0; u <= 1 + 1e-9; u += DU) out.push(sceneParamsFor(Math.min(1, u)));
	return out;
}

describe('sceneParamsFor', () => {
	const samples = sweep();

	it('every parameter is continuous in u (no band edges)', () => {
		for (const leaf of LEAVES) {
			for (let i = 1; i < samples.length; i++) {
				const delta = Math.abs(leaf.get(samples[i]) - leaf.get(samples[i - 1]));
				if (delta > leaf.maxSlopePerStep) {
					throw new Error(
						`${leaf.path} jumps by ${delta.toFixed(4)} between u=${samples[i - 1].u.toFixed(3)} and u=${samples[i].u.toFixed(3)}`,
					);
				}
			}
		}
	});

	it('keeps unit-range params in [0, 1] and colors in [0, 255]', () => {
		for (const p of samples) {
			for (const v of [
				p.sun.elevation,
				p.sun.intensity,
				p.wind,
				p.particles.snow,
				p.particles.rain,
				p.particles.tokens,
				p.particles.embers,
				p.shimmer,
				p.fog,
				p.iceberg,
				p.frost,
				p.rackGlow,
			]) {
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(1);
			}
			for (const band of [p.sky.top, p.sky.horizon, p.sky.low, p.sun.color]) {
				for (const ch of band) {
					expect(ch).toBeGreaterThanOrEqual(0);
					expect(ch).toBeLessThanOrEqual(255);
				}
			}
		}
	});

	it('melts the cold props and ignites the hot ones monotonically', () => {
		for (let i = 1; i < samples.length; i++) {
			expect(samples[i].iceberg).toBeLessThanOrEqual(samples[i - 1].iceberg + 1e-9);
			expect(samples[i].frost).toBeLessThanOrEqual(samples[i - 1].frost + 1e-9);
			expect(samples[i].particles.snow).toBeLessThanOrEqual(samples[i - 1].particles.snow + 1e-9);
			expect(samples[i].rackGlow).toBeGreaterThanOrEqual(samples[i - 1].rackGlow - 1e-9);
			expect(samples[i].particles.tokens).toBeGreaterThanOrEqual(samples[i - 1].particles.tokens - 1e-9);
			expect(samples[i].shimmer).toBeGreaterThanOrEqual(samples[i - 1].shimmer - 1e-9);
		}
	});

	it('shows distinct weather regimes at the reference points', () => {
		const cold = sceneParamsFor(0.1);
		const mid = sceneParamsFor(0.5);
		const hot = sceneParamsFor(0.9);

		expect(cold.particles.snow).toBeGreaterThan(0.5);
		expect(cold.iceberg).toBeGreaterThan(0.8);
		expect(cold.particles.tokens).toBe(0);

		expect(mid.particles.rain).toBeGreaterThan(0.4);
		expect(mid.particles.snow).toBeLessThan(0.2);

		expect(hot.particles.tokens).toBeGreaterThan(0.7);
		expect(hot.shimmer).toBeGreaterThan(0.5);
		expect(hot.iceberg).toBeLessThan(0.05);
		expect(hot.rackGlow).toBeGreaterThan(0.7);
	});

	it('clamps u outside [0, 1]', () => {
		expect(sceneParamsFor(-3).u).toBe(0);
		expect(sceneParamsFor(42).u).toBe(1);
	});

	it('renders css colors', () => {
		expect(cssRGB([12, 34, 56])).toBe('rgb(12, 34, 56)');
	});
});
