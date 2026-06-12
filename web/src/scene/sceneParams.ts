/**
 * The single source of truth mapping temperature → scene (PRD D12).
 * Everything is a continuous function of u ∈ [0,1] (−89.2 °C → 0, +56.7 °C → 1);
 * sceneParams.test.ts enforces continuity, so band edges cannot sneak in.
 * Both render routes (CSS/canvas and WebGL) consume this same object.
 */

export type RGB = readonly [number, number, number];

export type SceneParams = {
	u: number;
	sky: { top: RGB; horizon: RGB; low: RGB };
	sun: { elevation: number; intensity: number; color: RGB };
	/** 0..1 — blizzard gales at the cold end, convection updraft at the hot end. */
	wind: number;
	/** Densities 0..1; regimes crossfade: snow → rain → falling tokens + embers. */
	particles: { snow: number; rain: number; tokens: number; embers: number };
	/** Heat-haze distortion strength. */
	shimmer: number;
	fog: number;
	/** Iceberg presence/size; melts away as u rises. */
	iceberg: number;
	/** Frost coating on the datacenter racks. */
	frost: number;
	/** Rack LED/heat glow once the GPUs start cooking. */
	rackGlow: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Hermite smoothstep between edges a → b. */
function smooth(u: number, a: number, b: number): number {
	const t = clamp01((u - a) / (b - a));
	return t * t * (3 - 2 * t);
}

/** Smooth bump centered at c with half-width w (0 outside [c−w, c+w]). */
function bump(u: number, c: number, w: number): number {
	const t = clamp01(1 - Math.abs(u - c) / w);
	return t * t * (3 - 2 * t);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

type Stop = { at: number; color: RGB };

function gradientAt(stops: Stop[], u: number): RGB {
	if (u <= stops[0].at) return stops[0].color;
	for (let i = 1; i < stops.length; i++) {
		if (u <= stops[i].at) {
			const span = stops[i].at - stops[i - 1].at;
			return lerpRGB(stops[i - 1].color, stops[i].color, (u - stops[i - 1].at) / span);
		}
	}
	return stops[stops.length - 1].color;
}

// Sky palettes: arctic night → overcast thaw → sodium dusk → furnace.
const SKY_TOP: Stop[] = [
	{ at: 0.0, color: [6, 14, 34] },
	{ at: 0.3, color: [22, 38, 64] },
	{ at: 0.55, color: [46, 44, 72] },
	{ at: 0.8, color: [72, 26, 42] },
	{ at: 1.0, color: [38, 6, 10] },
];

const SKY_HORIZON: Stop[] = [
	{ at: 0.0, color: [108, 150, 188] },
	{ at: 0.3, color: [120, 138, 160] },
	{ at: 0.55, color: [196, 134, 108] },
	{ at: 0.8, color: [232, 110, 52] },
	{ at: 1.0, color: [255, 92, 28] },
];

const SKY_LOW: Stop[] = [
	{ at: 0.0, color: [16, 28, 48] },
	{ at: 0.3, color: [30, 40, 56] },
	{ at: 0.55, color: [54, 42, 56] },
	{ at: 0.8, color: [60, 22, 26] },
	{ at: 1.0, color: [30, 6, 8] },
];

const SUN_COLOR: Stop[] = [
	{ at: 0.0, color: [200, 224, 255] },
	{ at: 0.4, color: [255, 236, 196] },
	{ at: 0.7, color: [255, 176, 96] },
	{ at: 1.0, color: [255, 96, 40] },
];

export function sceneParamsFor(rawU: number): SceneParams {
	const u = clamp01(rawU);

	return {
		u,
		sky: {
			top: SKY_TOP.length ? gradientAt(SKY_TOP, u) : [0, 0, 0],
			horizon: gradientAt(SKY_HORIZON, u),
			low: gradientAt(SKY_LOW, u),
		},
		sun: {
			elevation: lerp(0.12, 0.78, smooth(u, 0.05, 0.95)),
			intensity: lerp(0.15, 1, smooth(u, 0.1, 0.9)),
			color: gradientAt(SUN_COLOR, u),
		},
		// Katabatic gales off the ice, calm in the middle, convection at the top.
		wind: clamp01(0.25 + 0.65 * (1 - smooth(u, 0.05, 0.5)) + 0.3 * smooth(u, 0.75, 1)),
		particles: {
			snow: 1 - smooth(u, 0.2, 0.45),
			rain: bump(u, 0.5, 0.22),
			tokens: smooth(u, 0.62, 0.85),
			embers: smooth(u, 0.82, 0.97),
		},
		shimmer: smooth(u, 0.65, 0.95),
		fog: clamp01(0.5 * (1 - smooth(u, 0.1, 0.4)) + 0.35 * bump(u, 0.52, 0.18) + 0.25 * smooth(u, 0.9, 1)),
		iceberg: 1 - smooth(u, 0.28, 0.55),
		frost: 1 - smooth(u, 0.3, 0.62),
		rackGlow: smooth(u, 0.45, 0.85),
	};
}

export function cssRGB(c: RGB): string {
	return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

/** Normalized u from a °C reading. */
export function uFromTempC(tempC: number): number {
	return clamp01((tempC + 89.2) / 145.9);
}
