import { describe, expect, it } from 'vitest';
import { SCORING_VERSION, computeScore, temperatureC, weight } from '../src/scoring';

describe('scoring s1', () => {
	it('exports a version string', () => {
		expect(SCORING_VERSION).toBe('s1');
	});

	describe('weight', () => {
		it('is linear 101 - rank', () => {
			expect(weight(1)).toBe(100);
			expect(weight(50)).toBe(51);
			expect(weight(100)).toBe(1);
		});
	});

	describe('computeScore', () => {
		const story = (rank: number, is_ai: boolean) => ({ rank, is_ai });

		it('is 0 when nothing is AI', () => {
			const stories = Array.from({ length: 100 }, (_, i) => story(i + 1, false));
			expect(computeScore(stories)).toBe(0);
		});

		it('is 1 when everything is AI', () => {
			const stories = Array.from({ length: 100 }, (_, i) => story(i + 1, true));
			expect(computeScore(stories)).toBe(1);
		});

		it('weights rank 1 as 100/5050 on a full snapshot', () => {
			const stories = Array.from({ length: 100 }, (_, i) => story(i + 1, i === 0));
			expect(computeScore(stories)).toBeCloseTo(100 / 5050, 10);
		});

		it('normalizes by actual total weight on partial snapshots', () => {
			// 3 stories, ranks 1..3, only rank 1 is AI: 100 / (100+99+98)
			const stories = [story(1, true), story(2, false), story(3, false)];
			expect(computeScore(stories)).toBeCloseTo(100 / 297, 10);
		});

		it('handles rank gaps (skipped stories) by summing only what exists', () => {
			// ranks 1 and 3 only; rank 3 AI: 98 / (100+98)
			const stories = [story(1, false), story(3, true)];
			expect(computeScore(stories)).toBeCloseTo(98 / 198, 10);
		});

		it('returns 0 for an empty snapshot rather than NaN', () => {
			expect(computeScore([])).toBe(0);
		});
	});

	describe('temperatureC (power curve, γ = 0.25)', () => {
		// Reference table from PRD §4.3
		it.each([
			[0.0, -89.2],
			[0.05, -20.2],
			[0.15, 1.6],
			[0.3, 18.8],
			[0.5, 33.5],
			[0.7, 44.3],
			[1.0, 56.7],
		])('maps score %f to %f °C', (score, expected) => {
			expect(temperatureC(score)).toBeCloseTo(expected, 1);
		});

		it('is monotonically increasing', () => {
			let prev = -Infinity;
			for (let s = 0; s <= 1.0001; s += 0.01) {
				const t = temperatureC(Math.min(s, 1));
				expect(t).toBeGreaterThanOrEqual(prev);
				prev = t;
			}
		});

		it('never leaves the Earth-record range', () => {
			expect(temperatureC(0)).toBeGreaterThanOrEqual(-89.2);
			expect(temperatureC(1)).toBeLessThanOrEqual(56.7);
		});
	});
});
