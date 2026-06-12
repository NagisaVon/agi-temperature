export type Unit = 'C' | 'F';

export const toF = (c: number): number => (c * 9) / 5 + 32;

export function formatTemp(c: number, unit: Unit, decimals = 1): string {
	const value = unit === 'F' ? toF(c) : c;
	return `${value.toFixed(decimals)}°${unit}`;
}

/** Scene/display normalization: −89.2 °C → 0, +56.7 °C → 1. */
export function normalize(c: number): number {
	return Math.min(1, Math.max(0, (c + 89.2) / 145.9));
}

export function formatWhen(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}
