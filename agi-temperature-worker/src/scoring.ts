/**
 * Rank-weighted hype score → temperature mapping (PRD §4.3, decisions D3/D4).
 * The raw score is stored alongside the temperature, so retuning GAMMA
 * (a new SCORING_VERSION) recomputes history from scores alone.
 */

export const SCORING_VERSION = 's1';

const GAMMA = 0.25;
const TEMP_MIN_C = -89.2; // Vostok Station, 1983
const TEMP_RANGE_C = 145.9; // up to +56.7 — Furnace Creek, 1913

export function weight(rank: number): number {
	return 101 - rank;
}

export function computeScore(stories: ReadonlyArray<{ rank: number; is_ai: boolean }>): number {
	let aiWeight = 0;
	let totalWeight = 0;
	for (const s of stories) {
		const w = weight(s.rank);
		totalWeight += w;
		if (s.is_ai) aiWeight += w;
	}
	return totalWeight === 0 ? 0 : aiWeight / totalWeight;
}

export function temperatureC(score: number): number {
	return TEMP_MIN_C + TEMP_RANGE_C * Math.pow(score, GAMMA);
}
