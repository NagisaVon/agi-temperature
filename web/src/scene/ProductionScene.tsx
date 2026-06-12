import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { SceneProps } from './SceneProps';
import { cssRGB, type RGB, type SceneParams } from './sceneParams';

/**
 * Route A: layered DOM/CSS/SVG scenery + ONE 2D canvas for all particle
 * systems (snow / rain / tokens / embers) and the heat shimmer.
 *
 * Heat shimmer technique: the canvas draws ~9 horizontal slices of a
 * horizon-colored gradient strip across the horizon band, each slice given an
 * animated sinusoidal x-offset and composited with 'lighter' at low alpha
 * (∝ params.shimmer). The wavering bright bands read as rising heat haze
 * without needing to sample the DOM behind the canvas.
 */

const HORIZON = 0.62;

const SNOW_MAX = 400;
const RAIN_MAX = 500;
const TOKEN_MAX = 220;
const EMBER_MAX = 120;

const GLYPHS = ['Σ', '∂', 'π', '∫', '{', '}', ';', '=>', '(', ')', '0', '1', '▌', '§', '<eot>', '42', 'λ', '::'];

const TAU = Math.PI * 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixRGB(a: RGB, b: RGB, t: number): RGB {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgba(c: RGB, a: number): string {
	return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${clamp01(a).toFixed(3)})`;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Particle = {
	/** Normalized [0,1] coords so resize keeps relative positions. */
	x: number;
	y: number;
	seed: number;
	phase: number;
	/** Crossfade 0..1 toward its density-driven target, so scrubbing blends populations. */
	fade: number;
	life: number;
	g: number;
};

function makePool(n: number, rand: () => number): Particle[] {
	return Array.from({ length: n }, () => ({
		x: rand(),
		y: rand(),
		seed: rand(),
		phase: rand() * TAU,
		fade: 0,
		life: 0.15 + 0.85 * rand(),
		g: Math.floor(rand() * GLYPHS.length),
	}));
}

type Pools = { snow: Particle[]; rain: Particle[]; tokens: Particle[]; embers: Particle[] };

type GlyphSprite = { c: HTMLCanvasElement; w: number; h: number };

/** Pre-render each glyph (with its glow baked in) so the loop is pure drawImage. */
function makeGlyphSprites(): GlyphSprite[] {
	const font = '600 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
	const measure = document.createElement('canvas').getContext('2d');
	return GLYPHS.map((g) => {
		let tw = 14;
		if (measure) {
			measure.font = font;
			tw = Math.ceil(measure.measureText(g).width);
		}
		const pad = 8;
		const w = tw + pad * 2;
		const h = 15 + pad * 2;
		const c = document.createElement('canvas');
		c.width = w * 2;
		c.height = h * 2;
		const cx = c.getContext('2d');
		if (cx) {
			cx.setTransform(2, 0, 0, 2, 0, 0);
			cx.font = font;
			cx.textAlign = 'center';
			cx.textBaseline = 'middle';
			cx.shadowColor = 'rgba(255, 138, 40, 0.95)';
			cx.shadowBlur = 7;
			cx.fillStyle = 'rgb(255, 216, 152)';
			cx.fillText(g, w / 2, h / 2);
			cx.fillText(g, w / 2, h / 2);
		}
		return { c, w, h };
	});
}

const KEYFRAMES = `
@keyframes raPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
@keyframes raBeacon { 0%, 100% { opacity: 0.15; } 50% { opacity: 1; } }
@keyframes raBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
@keyframes raAurora {
	0%, 100% { transform: skewX(-14deg) translateX(-1.5%); }
	50% { transform: skewX(-11deg) translateX(1.5%); }
}
`;

export default function ProductionScene({ params, reducedMotion }: SceneProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const fogARef = useRef<HTMLDivElement | null>(null);
	const fogBRef = useRef<HTMLDivElement | null>(null);
	const poolsRef = useRef<Pools | null>(null);

	const paramsRef = useRef(params);
	paramsRef.current = params;

	useEffect(() => {
		const root = rootRef.current;
		const canvas = canvasRef.current;
		if (!root || !canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let w = 1;
		let h = 1;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const resize = () => {
			w = Math.max(1, root.clientWidth);
			h = Math.max(1, root.clientHeight);
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(root);

		if (reducedMotion) {
			ctx.clearRect(0, 0, w, h);
			return () => ro.disconnect();
		}

		if (!poolsRef.current) {
			const rand = mulberry32(0x5eed);
			poolsRef.current = {
				snow: makePool(SNOW_MAX, rand),
				rain: makePool(RAIN_MAX, rand),
				tokens: makePool(TOKEN_MAX, rand),
				embers: makePool(EMBER_MAX, rand),
			};
		}
		const pools = poolsRef.current;
		const sprites = makeGlyphSprites();

		// Offscreen gradient strip re-tinted from params each frame, sliced for the shimmer.
		const strip = document.createElement('canvas');
		strip.width = 64;
		strip.height = 64;
		const stripCtx = strip.getContext('2d');

		let fogPhaseA = 0;
		let fogPhaseB = 0;

		const fadeStep = (pt: Particle, active: boolean, dt: number) => {
			pt.fade += ((active ? 1 : 0) - pt.fade) * Math.min(1, dt * 2.5);
		};

		const drawShimmer = (p: SceneParams, t: number) => {
			if (p.shimmer < 0.004 || !stripCtx) return;
			const grad = stripCtx.createLinearGradient(0, 0, 0, 64);
			grad.addColorStop(0, rgba(p.sky.horizon, 0));
			grad.addColorStop(0.45, rgba(p.sky.horizon, 0.9));
			grad.addColorStop(1, rgba(p.sky.low, 0));
			stripCtx.clearRect(0, 0, 64, 64);
			stripCtx.fillStyle = grad;
			stripCtx.fillRect(0, 0, 64, 64);

			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			const slices = 9;
			const sliceH = 7;
			const baseY = h * HORIZON - 18;
			for (let i = 0; i < slices; i++) {
				const amp = (2 + 10 * (i / slices)) * p.shimmer;
				const off = Math.sin(t * (1.9 + 0.17 * i) + i * 1.31) * amp;
				ctx.globalAlpha = p.shimmer * 0.16 * (1 - Math.abs(i - slices * 0.45) / (slices * 0.75));
				ctx.drawImage(strip, 0, (i / slices) * 64, 64, 64 / slices, off - 16, baseY + i * sliceH, w + 32, sliceH);
			}
			ctx.restore();
		};

		const drawSnow = (p: SceneParams, t: number, dt: number, area: number) => {
			const target = Math.round(SNOW_MAX * area * p.particles.snow);
			ctx.fillStyle = '#eef6ff';
			for (let i = 0; i < pools.snow.length; i++) {
				const pt = pools.snow[i];
				pt.y += ((32 + 52 * pt.seed) / h) * dt;
				pt.x += ((p.wind * 72 * (0.4 + 0.6 * pt.seed) + Math.sin(t * 1.3 + pt.phase) * 14) / w) * dt;
				if (pt.y > 1.02) pt.y -= 1.04;
				if (pt.x > 1.02) pt.x -= 1.04;
				else if (pt.x < -0.02) pt.x += 1.04;
				fadeStep(pt, i < target, dt);
				if (pt.fade < 0.02) continue;
				ctx.globalAlpha = pt.fade * (0.45 + 0.5 * pt.seed);
				ctx.beginPath();
				ctx.arc(pt.x * w, pt.y * h, 0.9 + 2.1 * pt.seed, 0, TAU);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		};

		const drawRain = (p: SceneParams, dt: number, area: number) => {
			const target = Math.round(RAIN_MAX * area * p.particles.rain);
			ctx.strokeStyle = 'rgb(186, 208, 238)';
			ctx.lineWidth = 1;
			for (let i = 0; i < pools.rain.length; i++) {
				const pt = pools.rain[i];
				pt.y += ((520 + 340 * pt.seed) / h) * dt;
				pt.x += ((p.wind * 130) / w) * dt;
				if (pt.y > 1.03) {
					pt.y -= 1.06;
					pt.x = Math.random();
				}
				if (pt.x > 1.02) pt.x -= 1.04;
				fadeStep(pt, i < target, dt);
				if (pt.fade < 0.02) continue;
				const len = 10 + 10 * pt.seed;
				const slant = p.wind * 0.45 * len;
				const x = pt.x * w;
				const y = pt.y * h;
				ctx.globalAlpha = pt.fade * (0.28 + 0.3 * pt.seed);
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x - slant, y - len);
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		};

		const drawTokens = (p: SceneParams, t: number, dt: number, area: number) => {
			const target = Math.round(TOKEN_MAX * area * p.particles.tokens);
			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			for (let i = 0; i < pools.tokens.length; i++) {
				const pt = pools.tokens[i];
				pt.y += ((72 + 112 * pt.seed) / h) * dt;
				pt.x += ((Math.sin(t * 0.8 + pt.phase) * 9 + p.wind * 28) / w) * dt;
				if (pt.y > 1.04) {
					pt.y -= 1.1;
					pt.x = Math.random();
					pt.g = Math.floor(Math.random() * GLYPHS.length);
				}
				if (pt.x > 1.02) pt.x -= 1.04;
				else if (pt.x < -0.02) pt.x += 1.04;
				fadeStep(pt, i < target, dt);
				if (pt.fade < 0.02) continue;
				const spr = sprites[pt.g % sprites.length];
				const s = 0.55 + 0.6 * pt.seed;
				const dw = spr.w * s;
				const dh = spr.h * s;
				const x = pt.x * w - dw / 2;
				const y = pt.y * h - dh / 2;
				const flicker = 0.72 + 0.28 * Math.sin(t * 4.2 + pt.phase);
				const a = pt.fade * flicker * (0.5 + 0.5 * pt.seed);
				ctx.globalAlpha = a * 0.3;
				ctx.drawImage(spr.c, x, y - dh * 0.55, dw, dh);
				ctx.globalAlpha = a;
				ctx.drawImage(spr.c, x, y, dw, dh);
			}
			ctx.restore();
		};

		const drawEmbers = (p: SceneParams, t: number, dt: number, area: number) => {
			const target = Math.round(EMBER_MAX * area * p.particles.embers);
			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			for (let i = 0; i < pools.embers.length; i++) {
				const pt = pools.embers[i];
				pt.life -= dt * (0.3 + 0.35 * pt.seed);
				if (pt.life <= 0) {
					// Re-spawn at the datacenter (right side, near the rack hall).
					pt.life = 1;
					pt.x = 0.58 + 0.38 * Math.random();
					pt.y = 0.64 + 0.18 * Math.random();
					pt.phase = Math.random() * TAU;
				}
				pt.y -= ((46 + 92 * pt.seed) / h) * dt;
				pt.x += ((Math.sin(t * 2.4 + pt.phase) * 16 + p.wind * 22) / w) * dt;
				fadeStep(pt, i < target, dt);
				if (pt.fade < 0.02) continue;
				const x = pt.x * w;
				const y = pt.y * h;
				const a = pt.fade * pt.life * 0.9;
				ctx.globalAlpha = a;
				ctx.fillStyle = 'rgb(255, 158, 66)';
				ctx.beginPath();
				ctx.arc(x, y, 0.8 + 1.7 * pt.seed, 0, TAU);
				ctx.fill();
				ctx.globalAlpha = a * 0.7;
				ctx.fillStyle = 'rgb(255, 226, 170)';
				ctx.beginPath();
				ctx.arc(x, y, 0.4 + 0.7 * pt.seed, 0, TAU);
				ctx.fill();
			}
			ctx.restore();
		};

		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
			last = now;
			const t = now / 1000;
			const p = paramsRef.current;
			const area = Math.min(1, (w * h) / (1440 * 900));

			// Wind-driven fog drift (two layers at different speeds for parallax).
			fogPhaseA += (8 + 36 * p.wind) * dt;
			fogPhaseB += (16 + 62 * p.wind) * dt;
			if (fogARef.current) fogARef.current.style.backgroundPositionX = `${(-fogPhaseA).toFixed(2)}px`;
			if (fogBRef.current) fogBRef.current.style.backgroundPositionX = `${(-fogPhaseB).toFixed(2)}px`;

			ctx.clearRect(0, 0, w, h);
			drawShimmer(p, t);
			drawSnow(p, t, dt, area);
			drawRain(p, dt, area);
			drawTokens(p, t, dt, area);
			drawEmbers(p, t, dt, area);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [reducedMotion]);

	const stars = useMemo(() => {
		const rand = mulberry32(1234);
		const dots: string[] = [];
		for (let i = 0; i < 90; i++) {
			dots.push(
				`${(rand() * 100).toFixed(1)}vw ${(rand() * 56).toFixed(1)}vh 0 ${rand() > 0.78 ? 1 : 0}px rgba(255,255,255,${(0.3 + 0.6 * rand()).toFixed(2)})`,
			);
		}
		return dots.join(', ');
	}, []);

	const wins = useMemo(() => {
		const list: { x: number; y: number; w: number; h: number }[] = [];
		for (let r = 0; r < 4; r++)
			for (let c = 0; c < 11; c++) list.push({ x: 28 + c * 26, y: 84 + r * 18, w: 18, h: 9 });
		for (let r = 0; r < 6; r++)
			for (let c = 0; c < 3; c++) list.push({ x: 328 + c * 27, y: 52 + r * 18, w: 16, h: 9 });
		return list;
	}, []);

	const icicles = useMemo(() => {
		const main = [34, 64, 102, 146, 190, 238, 282, 306].map(
			(x, i) => `M ${x} 73 h 5 l -2.5 ${8 + ((i * 7) % 9)} z`,
		);
		const side = [322, 352, 386].map((x, i) => `M ${x} 43 h 5 l -2.5 ${7 + ((i * 5) % 8)} z`);
		return [...main, ...side];
	}, []);

	const { sky, sun } = params;
	const anim = (a: string): string => (reducedMotion ? 'none' : a);

	const sunTopPct = (0.6 - 0.5 * sun.elevation) * 100;
	const haloSize = 24 + 32 * sun.intensity;
	const coreSize = 6.5 + 4.5 * sun.intensity;
	const sunCore = mixRGB(sun.color, [255, 255, 255], 0.4);

	const seaTop = mixRGB(sky.horizon, sky.low, 0.45);
	const seaBot = mixRGB(sky.low, [0, 0, 0], 0.55);

	const heat = clamp01(0.35 * (1 - params.frost) + 0.65 * params.rackGlow);
	const windowFill = cssRGB(mixRGB([168, 208, 236], [255, 148, 44], heat));
	const bldgFill = cssRGB(mixRGB(sky.low, [0, 0, 0], 0.62));
	const roofFill = cssRGB(mixRGB(sky.low, [0, 0, 0], 0.76));

	const fogTint = mixRGB(sky.horizon, [255, 255, 255], 0.5);
	const fogImg = (a: number) =>
		`radial-gradient(closest-side at 18% 55%, ${rgba(fogTint, a)}, transparent), ` +
		`radial-gradient(closest-side at 50% 38%, ${rgba(fogTint, a * 0.8)}, transparent), ` +
		`radial-gradient(closest-side at 82% 62%, ${rgba(fogTint, a * 0.9)}, transparent)`;

	const bergScale = 0.4 + 0.6 * params.iceberg;
	const layer: CSSProperties = { position: 'absolute', inset: 0 };

	return (
		<div ref={rootRef} style={{ ...layer, overflow: 'hidden', background: '#000' }}>
			<style>{KEYFRAMES}</style>

			{/* Sky */}
			<div
				style={{
					...layer,
					background: `linear-gradient(180deg, ${cssRGB(sky.top)} 0%, ${cssRGB(sky.horizon)} 62%, ${cssRGB(sky.low)} 100%)`,
				}}
			/>

			{/* Stars — fade out as the sun gains intensity */}
			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: 2,
					height: 2,
					borderRadius: '50%',
					boxShadow: stars,
					opacity: (1 - sun.intensity) * 0.9,
				}}
			/>

			{/* Aurora — cold-end flourish, melts away with the frost */}
			<div
				style={{
					position: 'absolute',
					top: '4%',
					left: '3%',
					width: '54%',
					height: '36%',
					background:
						'linear-gradient(100deg, transparent 8%, rgba(80, 255, 190, 0.22) 32%, rgba(110, 170, 255, 0.18) 58%, transparent 84%)',
					filter: 'blur(14px)',
					transform: 'skewX(-13deg)',
					opacity: params.frost * (1 - sun.intensity) * 0.7,
					animation: anim('raAurora 11s ease-in-out infinite'),
				}}
			/>

			{/* Sun halo + core */}
			<div
				style={{
					position: 'absolute',
					left: '70%',
					top: `${sunTopPct}%`,
					width: `${haloSize}vmin`,
					height: `${haloSize}vmin`,
					transform: 'translate(-50%, -50%)',
					borderRadius: '50%',
					background: `radial-gradient(circle, ${rgba(sun.color, 0.5 * sun.intensity + 0.08)} 0%, ${rgba(sun.color, 0.16 * sun.intensity)} 40%, transparent 70%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: '70%',
					top: `${sunTopPct}%`,
					width: `${coreSize}vmin`,
					height: `${coreSize}vmin`,
					transform: 'translate(-50%, -50%)',
					borderRadius: '50%',
					background: cssRGB(sunCore),
					boxShadow: `0 0 ${24 + 56 * sun.intensity}px ${4 + 12 * sun.intensity}px ${rgba(sun.color, 0.35 + 0.5 * sun.intensity)}`,
				}}
			/>

			{/* Sea / ground plane */}
			<div
				style={{
					position: 'absolute',
					top: '62%',
					left: 0,
					right: 0,
					bottom: 0,
					background: `linear-gradient(180deg, ${cssRGB(seaTop)} 0%, ${cssRGB(seaBot)} 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					top: 'calc(62% - 1px)',
					left: 0,
					right: 0,
					height: 2,
					background: rgba(sky.horizon, 0.5),
					filter: 'blur(1px)',
				}}
			/>

			{/* Sun reflection column on the water */}
			<div
				style={{
					position: 'absolute',
					left: '70%',
					top: '62%',
					width: '7%',
					height: '25%',
					transform: 'translateX(-50%)',
					background: `linear-gradient(180deg, ${rgba(sun.color, 0.5)}, transparent)`,
					filter: 'blur(5px)',
					opacity: sun.intensity * 0.8,
				}}
			/>

			{/* Icebergs (left) — scale + opacity melt with params.iceberg */}
			<div
				style={{
					position: 'absolute',
					left: '-1%',
					top: '42%',
					width: '58%',
					height: '30%',
					animation: anim('raBob 7.5s ease-in-out infinite'),
				}}
			>
				<svg width="100%" height="100%" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden="true">
					<defs>
						<linearGradient id="ra-berg" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="#eaf7ff" />
							<stop offset="1" stopColor="#85b8da" />
						</linearGradient>
					</defs>
					{/* Distant ice shelf (does not scale — far away, just fades) */}
					<polygon
						points="0,150 70,128 150,142 230,122 330,140 440,132 600,144 600,150"
						fill="rgba(196, 228, 246, 0.4)"
						opacity={0.55 * params.iceberg}
					/>
					<g
						opacity={params.iceberg}
						transform={`translate(260 150) scale(${bergScale.toFixed(4)}) translate(-260 -150)`}
					>
						<polygon points="52,150 178,150 150,188 86,182" fill="rgba(150, 200, 230, 0.16)" />
						<polygon points="250,150 350,150 322,178 276,174" fill="rgba(150, 200, 230, 0.13)" />
						<polygon points="30,150 58,72 84,98 112,40 138,92 168,64 196,150" fill="url(#ra-berg)" />
						<polygon points="232,150 262,96 288,116 316,78 344,118 362,150" fill="url(#ra-berg)" opacity={0.9} />
						<polygon points="430,150 452,116 470,128 492,150" fill="url(#ra-berg)" opacity={0.65} />
					</g>
				</svg>
			</div>

			{/* Datacenter heat glow (amplitude ∝ rackGlow, inner layer pulses) */}
			<div style={{ position: 'absolute', right: 0, top: '42%', width: '56%', height: '52%', opacity: params.rackGlow * 0.65 }}>
				<div
					style={{
						...layer,
						background: 'radial-gradient(ellipse at 62% 64%, rgba(255, 118, 36, 0.55) 0%, transparent 65%)',
						animation: anim('raPulse 2.7s ease-in-out infinite'),
					}}
				/>
			</div>

			{/* Datacenter campus (right) */}
			<div style={{ position: 'absolute', right: '1%', top: '46%', width: '46%', height: '42%' }}>
				<svg width="100%" height="100%" viewBox="0 0 420 170" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
					<rect x={14} y={72} width={302} height={98} fill={bldgFill} />
					<rect x={10} y={64} width={310} height={9} rx={2} fill={roofFill} />
					<rect x={318} y={42} width={92} height={128} fill={bldgFill} />
					<rect x={314} y={34} width={100} height={9} rx={2} fill={roofFill} />
					<rect x={44} y={54} width={26} height={11} fill={roofFill} />
					<rect x={96} y={54} width={26} height={11} fill={roofFill} />
					<rect x={148} y={54} width={26} height={11} fill={roofFill} />
					<rect x={152} y={144} width={22} height={26} fill={roofFill} />
					<line x1={364} y1={34} x2={364} y2={8} stroke={roofFill} strokeWidth={2.5} />
					<circle cx={364} cy={7} r={3} fill="#ff6a55" style={{ animation: anim('raBeacon 2.4s ease-in-out infinite') }} />

					{/* Rack windows: frosty pale blue → hot orange (continuous blend) */}
					<g>
						{wins.map((wn, i) => (
							<rect key={i} x={wn.x} y={wn.y} width={wn.w} height={wn.h} rx={1.5} fill={windowFill} />
						))}
					</g>
					{/* Hot overlay: pulse amplitude scales continuously with rackGlow */}
					<g opacity={params.rackGlow}>
						<g style={{ animation: anim('raPulse 2.7s ease-in-out infinite') }}>
							{wins.map((wn, i) => (
								<rect key={i} x={wn.x} y={wn.y} width={wn.w} height={wn.h} rx={1.5} fill="rgb(255, 156, 56)" />
							))}
						</g>
					</g>

					{/* Frost cap + icicles on the roofline */}
					<g opacity={params.frost}>
						<rect x={10} y={60} width={310} height={7} rx={3.5} fill="rgba(228, 244, 255, 0.9)" />
						<rect x={314} y={30} width={100} height={7} rx={3.5} fill="rgba(228, 244, 255, 0.9)" />
						<g transform={`translate(0 73) scale(1 ${(0.15 + 0.85 * params.frost).toFixed(4)}) translate(0 -73)`}>
							{icicles.map((d, i) => (
								<path key={i} d={d} fill="rgba(225, 243, 255, 0.85)" />
							))}
						</g>
					</g>
				</svg>
			</div>

			{/* Fog: two drifting layers hugging the horizon (speed ∝ wind via rAF) */}
			<div
				ref={fogARef}
				style={{
					position: 'absolute',
					top: '52%',
					left: 0,
					right: 0,
					height: '17%',
					backgroundImage: fogImg(0.5),
					backgroundSize: '860px 100%',
					backgroundRepeat: 'repeat-x',
					opacity: params.fog * 0.85,
				}}
			/>
			<div
				ref={fogBRef}
				style={{
					position: 'absolute',
					top: '57%',
					left: 0,
					right: 0,
					height: '11%',
					backgroundImage: fogImg(0.45),
					backgroundSize: '520px 100%',
					backgroundRepeat: 'repeat-x',
					opacity: params.fog * 0.7,
				}}
			/>

			{/* One canvas: all particles + heat shimmer */}
			<canvas ref={canvasRef} style={{ ...layer, width: '100%', height: '100%', pointerEvents: 'none' }} />

			{/* Vignette */}
			<div
				style={{
					...layer,
					pointerEvents: 'none',
					background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.45) 100%)',
				}}
			/>
		</div>
	);
}
