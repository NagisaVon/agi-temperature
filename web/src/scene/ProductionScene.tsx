import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { SceneProps } from './SceneProps';
import type { RGB, SceneParams } from './sceneParams';

// WYSIWYG colors: the shaders work in sRGB values directly.
THREE.ColorManagement.enabled = false;

const HORIZON = 0.38; // scene y (0 = bottom) of the horizon line, i.e. 62% down from the top
const SNOW_MAX = 400;
const RAIN_MAX = 500;
const TOKEN_MAX = 220;
const EMBER_MAX = 120;
const GLYPHS = ['Σ', '∂', 'π', '∫', '{', '}', ';', '=>', '(', ')', '0', '1', '▌', '§', '<eot>', '42', 'λ', '::'];
const ATLAS_COLS = 6;
const ATLAS_ROWS = 3;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uLow;
uniform vec3 uSunColor;
uniform vec2 uSunPos;
uniform float uSunIntensity;
uniform float uShimmer;
uniform float uFog;
uniform float uTime;
uniform float uAspect;
uniform float uWind;
uniform float uU;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
	float H = ${HORIZON.toFixed(3)};
	vec2 uv = vUv;

	// Heat shimmer: time-animated sinusoidal UV distortion concentrated at the horizon.
	float band = exp(-abs(uv.y - H) * 8.0);
	float wob = sin(uv.y * 110.0 + uTime * 3.1 + sin(uv.x * 9.0 + uTime * 0.7) * 2.0);
	uv.x += wob * 0.007 * uShimmer * band;
	uv.y += sin(uv.x * 70.0 - uTime * 2.4) * 0.004 * uShimmer * band;

	vec3 col;
	if (uv.y >= H) {
		float t = (uv.y - H) / (1.0 - H);
		col = mix(uHorizon, uTop, pow(t, 0.8));
	} else {
		float t = (H - uv.y) / H;
		col = mix(uHorizon * 0.55, uLow * 0.85, smoothstep(0.0, 0.75, t));
		// Sun reflection column with animated glitter on the sea.
		float dx = abs(uv.x - uSunPos.x) * uAspect;
		float glit = 0.6 + 0.4 * sin(uv.y * 240.0 + uTime * 1.8 + sin(uv.x * 50.0) * 3.0);
		col += uSunColor * exp(-dx * 14.0) * exp(-t * 5.0) * glit * uSunIntensity * 0.4;
	}

	// Sun disk + halo, occluded by the sea below the horizon.
	vec2 d = (uv - uSunPos) * vec2(uAspect, 1.0);
	float dist = length(d);
	float occ = smoothstep(H - 0.012, H + 0.004, uv.y);
	float disk = smoothstep(0.05, 0.038, dist);
	float halo = exp(-dist * mix(10.0, 4.5, uSunIntensity)) * uSunIntensity;
	col += uSunColor * (disk * (0.7 + 0.5 * uSunIntensity) + halo * 0.8) * occ;
	col += uSunColor * exp(-dist * 2.0) * 0.15 * uSunIntensity;

	// Cold-end night dressing: stars + aurora, both continuous in u.
	float cold = 1.0 - smoothstep(0.1, 0.45, uU);
	if (cold > 0.001) {
		float skyH = smoothstep(H + 0.05, H + 0.3, vUv.y);
		vec2 sp = vUv * vec2(uAspect, 1.0) * 160.0;
		float h1 = hash(floor(sp));
		float star = smoothstep(0.92, 1.0, h1) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));
		float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h1 * 3.0) + h1 * 40.0);
		col += vec3(0.75, 0.85, 1.0) * star * tw * cold * skyH * 0.9;
		float ay = smoothstep(0.5, 0.72, vUv.y) * (1.0 - smoothstep(0.82, 0.98, vUv.y));
		float cur = 0.5 + 0.5 * sin(vUv.x * 5.0 + uTime * 0.25 + sin(vUv.x * 11.0 - uTime * 0.18) * 1.6);
		col += vec3(0.12, 0.85, 0.5) * cur * cur * ay * cold * 0.18;
		col += vec3(0.35, 0.3, 0.85) * cur * ay * cold * 0.08;
	}

	// Background fog band hugging the horizon, drifting with the wind.
	float drift = 0.7 + 0.3 * sin(uv.x * 6.0 - uTime * (0.3 + uWind * 0.7) + sin(uv.x * 17.0 + uTime * 0.2));
	float fogA = uFog * exp(-abs(uv.y - H) * 11.0) * drift;
	vec3 fogC = mix(uHorizon, vec3(0.9, 0.93, 1.0), 0.25);
	col = mix(col, fogC, clamp(fogA * 0.8, 0.0, 1.0));

	gl_FragColor = vec4(col, 1.0);
}
`;

// A second, lighter fog pass in front of the props so mist overlaps bergs/datacenter.
const FOG_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uFog;
uniform float uTime;
uniform float uWind;
uniform vec3 uHorizonC;
void main() {
	float H = ${HORIZON.toFixed(3)};
	float drift = 0.65 + 0.35 * sin(vUv.x * 9.0 - uTime * (0.4 + uWind * 0.9) + sin(vUv.x * 23.0 + uTime * 0.33) * 1.2);
	float a = uFog * exp(-abs(vUv.y - H) * 16.0) * drift * 0.5;
	vec3 c = mix(uHorizonC, vec3(0.92, 0.95, 1.0), 0.35);
	gl_FragColor = vec4(c, a);
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uGlow;
void main() {
	vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.5);
	float a = exp(-dot(p, p) * 9.0) * uGlow;
	gl_FragColor = vec4(vec3(1.0, 0.5, 0.18), a * 0.55);
}
`;

const FROST_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uFrost;
void main() {
	float teeth = 0.42 + 0.3 * sin(vUv.x * 150.0) * (0.6 + 0.4 * sin(vUv.x * 41.0 + 1.7));
	float m = smoothstep(teeth - 0.08, teeth + 0.12, vUv.y);
	gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), m * uFrost * 0.9);
}
`;

const PARTICLE_HEAD = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uDensity;
uniform float uPixelRatio;
uniform float uHScale;
attribute vec4 aSeed;
varying float vAlpha;
`;

// Each particle owns a random threshold (aSeed.z); populations crossfade as density sweeps past it.
const FADE = 'clamp((uDensity - aSeed.z) * 5.0, 0.0, 1.0)';

const SNOW_VERT = `${PARTICLE_HEAD}
void main() {
	float v = aSeed.w;
	float speed = mix(0.05, 0.12, v);
	float y = fract(aSeed.y - uTime * speed);
	float sway = sin(uTime * mix(0.5, 1.6, fract(v * 7.13)) + aSeed.x * 40.0) * 0.014 * (0.25 + uWind);
	float x = fract(aSeed.x + uTime * speed * uWind * 1.4 + sway);
	vAlpha = ${FADE} * mix(0.45, 1.0, fract(v * 3.71));
	vec2 p = vec2(x, y) * 1.08 - 0.04;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
	gl_PointSize = mix(1.6, 4.2, fract(v * 5.91)) * uPixelRatio * uHScale;
}
`;

const SNOW_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
	float d = length(gl_PointCoord - 0.5);
	float a = smoothstep(0.5, 0.12, d) * vAlpha;
	gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), a * 0.9);
}
`;

const RAIN_VERT = `${PARTICLE_HEAD}
void main() {
	float v = aSeed.w;
	float speed = mix(0.85, 1.5, v);
	float y = fract(aSeed.y - uTime * speed);
	float x = fract(aSeed.x + uTime * speed * uWind * 0.22);
	vAlpha = ${FADE} * mix(0.5, 1.0, fract(v * 4.7));
	vec2 p = vec2(x, y) * 1.1 - 0.05;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
	gl_PointSize = mix(18.0, 30.0, fract(v * 6.3)) * uPixelRatio * uHScale;
}
`;

const RAIN_FRAG = /* glsl */ `
uniform float uWind;
varying float vAlpha;
void main() {
	vec2 p = gl_PointCoord - 0.5;
	vec2 dir = normalize(vec2(uWind * 0.22, 1.0));
	float t = dot(p, dir);
	float perp = abs(p.x * dir.y - p.y * dir.x);
	float a = (1.0 - smoothstep(0.0, 0.045, perp)) * (1.0 - smoothstep(0.2, 0.5, abs(t)));
	gl_FragColor = vec4(vec3(0.62, 0.72, 0.88), a * vAlpha * 0.55);
}
`;

const TOKEN_VERT = `${PARTICLE_HEAD}
attribute float aGlyph;
varying float vGlyph;
void main() {
	float v = aSeed.w;
	float speed = mix(0.1, 0.22, v);
	float y = fract(aSeed.y - uTime * speed);
	float x = fract(aSeed.x + uTime * speed * uWind * 0.25 + sin(uTime * mix(0.4, 1.0, v) + aSeed.x * 30.0) * 0.008);
	float flicker = 0.7 + 0.3 * sin(uTime * mix(2.0, 6.0, fract(v * 8.7)) + aSeed.x * 50.0);
	vAlpha = ${FADE} * flicker;
	vGlyph = aGlyph;
	vec2 p = vec2(x, y) * 1.08 - 0.04;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
	gl_PointSize = mix(14.0, 26.0, fract(v * 5.13)) * uPixelRatio * uHScale;
}
`;

const TOKEN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying float vAlpha;
varying float vGlyph;
void main() {
	float col6 = mod(vGlyph, ${ATLAS_COLS.toFixed(1)});
	float row = floor(vGlyph / ${ATLAS_COLS.toFixed(1)});
	vec2 uv = vec2((col6 + gl_PointCoord.x) / ${ATLAS_COLS.toFixed(1)}, 1.0 - (row + gl_PointCoord.y) / ${ATLAS_ROWS.toFixed(1)});
	float m = texture2D(uAtlas, uv).a;
	vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.92, 0.7), m * 0.5);
	gl_FragColor = vec4(col, m * vAlpha);
}
`;

const EMBER_VERT = `${PARTICLE_HEAD}
void main() {
	float v = aSeed.w;
	float speed = mix(0.05, 0.13, v);
	float life = fract(aSeed.y + uTime * speed);
	float rise = mix(0.25, 0.55, fract(v * 3.3));
	float y = ${(HORIZON + 0.005).toFixed(3)} + life * rise;
	float x = mix(0.55, 1.0, aSeed.x) + sin(uTime * mix(1.0, 2.4, v) + aSeed.x * 60.0) * 0.015 * (0.4 + uWind) + life * uWind * 0.04;
	vAlpha = ${FADE} * (1.0 - life) * (1.0 - life);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
	gl_PointSize = mix(2.0, 4.5, fract(v * 7.7)) * (1.0 - life * 0.5) * uPixelRatio * uHScale;
}
`;

const EMBER_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
	float d = length(gl_PointCoord - 0.5) * 2.0;
	float core = exp(-d * d * 5.0);
	vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.32, 0.06), d);
	gl_FragColor = vec4(col, core * vAlpha);
}
`;

function makeGlyphAtlas(): THREE.CanvasTexture {
	const cell = 64;
	const canvas = document.createElement('canvas');
	canvas.width = ATLAS_COLS * cell;
	canvas.height = ATLAS_ROWS * cell;
	const ctx = canvas.getContext('2d')!;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#fff';
	ctx.shadowColor = 'rgba(255,255,255,0.9)';
	ctx.shadowBlur = 7;
	GLYPHS.forEach((g, i) => {
		const cx = (i % ATLAS_COLS) * cell + cell / 2;
		const cy = Math.floor(i / ATLAS_COLS) * cell + cell / 2;
		let size = 44;
		ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
		const w = ctx.measureText(g).width;
		if (w > cell - 10) {
			size = Math.floor((size * (cell - 10)) / w);
			ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
		}
		ctx.fillText(g, cx, cy);
	});
	const tex = new THREE.CanvasTexture(canvas);
	tex.generateMipmaps = false;
	tex.minFilter = THREE.LinearFilter;
	return tex;
}

/** Jagged berg silhouette (unit outline, waterline at y=0) with a vertical ice gradient baked into vertex colors. */
function bergGeometry(outline: ReadonlyArray<readonly [number, number]>): THREE.ShapeGeometry {
	const shape = new THREE.Shape();
	shape.moveTo(outline[0][0], outline[0][1]);
	for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
	shape.closePath();
	const geo = new THREE.ShapeGeometry(shape);
	const pos = geo.getAttribute('position');
	let maxY = 0.001;
	for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
	const colors = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const t = Math.max(0, pos.getY(i) / maxY);
		const facet = 0.92 + 0.08 * Math.sin(pos.getX(i) * 37);
		colors[i * 3] = (0.45 + 0.47 * t) * facet;
		colors[i * 3 + 1] = (0.6 + 0.37 * t) * facet;
		colors[i * 3 + 2] = (0.8 + 0.2 * t) * facet;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return geo;
}

function makePoints(
	count: number,
	vert: string,
	frag: string,
	blending: THREE.Blending,
	extra: Record<string, THREE.IUniform> = {},
	glyphs = false,
): THREE.Points {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	const seeds = new Float32Array(count * 4);
	for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
	geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
	if (glyphs) {
		const g = new Float32Array(count);
		for (let i = 0; i < count; i++) g[i] = Math.floor(Math.random() * GLYPHS.length);
		geo.setAttribute('aGlyph', new THREE.BufferAttribute(g, 1));
	}
	const mat = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uWind: { value: 0 },
			uDensity: { value: 0 },
			uPixelRatio: { value: 1 },
			uHScale: { value: 1 },
			...extra,
		},
		vertexShader: vert,
		fragmentShader: frag,
		transparent: true,
		depthWrite: false,
		blending,
	});
	const pts = new THREE.Points(geo, mat);
	pts.frustumCulled = false;
	return pts;
}

// Packed param layout: 0-2 skyTop, 3-5 skyHorizon, 6-8 skyLow, 9-11 sunColor, 12 sunEl,
// 13 sunInt, 14 wind, 15 snow, 16 rain, 17 tokens, 18 embers, 19 shimmer, 20 fog,
// 21 iceberg, 22 frost, 23 rackGlow, 24 u.
const PACK_LEN = 25;

function packRGB(out: Float32Array, i: number, rgb: RGB): void {
	out[i] = rgb[0] / 255;
	out[i + 1] = rgb[1] / 255;
	out[i + 2] = rgb[2] / 255;
}

function packParams(p: SceneParams, out: Float32Array): void {
	packRGB(out, 0, p.sky.top);
	packRGB(out, 3, p.sky.horizon);
	packRGB(out, 6, p.sky.low);
	packRGB(out, 9, p.sun.color);
	out[12] = p.sun.elevation;
	out[13] = p.sun.intensity;
	out[14] = p.wind;
	out[15] = p.particles.snow;
	out[16] = p.particles.rain;
	out[17] = p.particles.tokens;
	out[18] = p.particles.embers;
	out[19] = p.shimmer;
	out[20] = p.fog;
	out[21] = p.iceberg;
	out[22] = p.frost;
	out[23] = p.rackGlow;
	out[24] = p.u;
}

const BERGS = [
	{
		outline: [[-0.5, 0], [-0.4, 0.34], [-0.28, 0.18], [-0.14, 0.62], [-0.02, 0.4], [0.1, 1.0], [0.22, 0.46], [0.34, 0.6], [0.44, 0.2], [0.5, 0]],
		x: 0.13, w: 0.22, h: 0.16, phase: 0,
	},
	{
		outline: [[-0.5, 0], [-0.34, 0.5], [-0.16, 0.3], [0.0, 0.9], [0.2, 0.35], [0.36, 0.55], [0.5, 0]],
		x: 0.3, w: 0.15, h: 0.11, phase: 2.1,
	},
	{
		outline: [[-0.5, 0], [-0.28, 0.6], [-0.05, 0.25], [0.18, 0.8], [0.38, 0.3], [0.5, 0]],
		x: 0.43, w: 0.1, h: 0.07, phase: 4.2,
	},
] as const;

const WIN_COLS = 24;
const WIN_ROWS = 5;
const WIN_COUNT = WIN_COLS * WIN_ROWS;
const WIN_COLD: RGB = [0.45, 0.66, 0.85];
const WIN_HOT: RGB = [1.0, 0.45, 0.12];

export default function ProductionScene({ params, reducedMotion }: SceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const paramsRef = useRef(params);
	paramsRef.current = params;
	const renderOnceRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		const canvas = renderer.domElement;
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
		container.appendChild(canvas);

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10);
		camera.position.z = 2;

		const quadGeo = new THREE.PlaneGeometry(1, 1);

		// --- Sky / sun / shimmer / background fog (fullscreen shader quad) ---
		const skyMat = new THREE.ShaderMaterial({
			uniforms: {
				uTop: { value: new THREE.Vector3() },
				uHorizon: { value: new THREE.Vector3() },
				uLow: { value: new THREE.Vector3() },
				uSunColor: { value: new THREE.Vector3() },
				uSunPos: { value: new THREE.Vector2(0.7, HORIZON) },
				uSunIntensity: { value: 0 },
				uShimmer: { value: 0 },
				uFog: { value: 0 },
				uTime: { value: 0 },
				uAspect: { value: 16 / 9 },
				uWind: { value: 0 },
				uU: { value: 0.5 },
			},
			vertexShader: QUAD_VERT,
			fragmentShader: SKY_FRAG,
			depthWrite: true,
		});
		const sky = new THREE.Mesh(quadGeo, skyMat);
		sky.position.set(0.5, 0.5, -3);
		scene.add(sky);

		// --- Icebergs (left half of the sea) ---
		const bergRefs = BERGS.map((b) => {
			const geo = bergGeometry(b.outline);
			const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
			const reflMat = new THREE.MeshBasicMaterial({
				vertexColors: true,
				transparent: true,
				depthWrite: false,
				color: new THREE.Color(0.4, 0.5, 0.65),
			});
			const group = new THREE.Group();
			const top = new THREE.Mesh(geo, mat);
			const refl = new THREE.Mesh(geo, reflMat);
			refl.scale.set(1, -0.35, 1);
			group.add(top, refl);
			group.position.set(b.x, HORIZON, -2.4);
			scene.add(group);
			return { ...b, group, mat, reflMat };
		});

		// --- Datacenter (right side) ---
		const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0a0e16 });
		const body = new THREE.Mesh(quadGeo, bodyMat);
		body.scale.set(0.41, 0.085, 1);
		body.position.set(0.765, HORIZON + 0.0425, -2.2);
		const annexMat = new THREE.MeshBasicMaterial({ color: 0x070a10 });
		const annex = new THREE.Mesh(quadGeo, annexMat);
		annex.scale.set(0.07, 0.055, 1);
		annex.position.set(0.535, HORIZON + 0.0275, -2.21);
		const stackA = new THREE.Mesh(quadGeo, annexMat);
		stackA.scale.set(0.02, 0.04, 1);
		stackA.position.set(0.64, HORIZON + 0.105, -2.21);
		const stackB = new THREE.Mesh(quadGeo, annexMat);
		stackB.scale.set(0.02, 0.04, 1);
		stackB.position.set(0.88, HORIZON + 0.105, -2.21);
		scene.add(body, annex, stackA, stackB);

		const winGeo = new THREE.PlaneGeometry(0.0095, 0.0085);
		const winMat = new THREE.MeshBasicMaterial();
		const wins = new THREE.InstancedMesh(winGeo, winMat, WIN_COUNT);
		const winPhase = new Float32Array(WIN_COUNT);
		const winVar = new Float32Array(WIN_COUNT);
		{
			const m = new THREE.Matrix4();
			const col = new THREE.Color(0.1, 0.1, 0.1);
			for (let i = 0; i < WIN_COUNT; i++) {
				const cx = 0.585 + (i % WIN_COLS) * ((0.945 - 0.585) / (WIN_COLS - 1));
				const cy = HORIZON + 0.016 + Math.floor(i / WIN_COLS) * (0.056 / (WIN_ROWS - 1));
				m.makeTranslation(cx, cy, 0);
				wins.setMatrixAt(i, m);
				wins.setColorAt(i, col);
				winPhase[i] = Math.random() * Math.PI * 2;
				winVar[i] = 0.55 + 0.45 * Math.random();
			}
			wins.instanceMatrix.needsUpdate = true;
		}
		wins.position.set(0, 0, -2.19);
		scene.add(wins);

		const frostMat = new THREE.ShaderMaterial({
			uniforms: { uFrost: { value: 0 } },
			vertexShader: QUAD_VERT,
			fragmentShader: FROST_FRAG,
			transparent: true,
			depthWrite: false,
		});
		const frost = new THREE.Mesh(quadGeo, frostMat);
		frost.scale.set(0.43, 0.024, 1);
		frost.position.set(0.765, HORIZON + 0.085, -2.18);
		scene.add(frost);

		const glowMat = new THREE.ShaderMaterial({
			uniforms: { uGlow: { value: 0 } },
			vertexShader: QUAD_VERT,
			fragmentShader: GLOW_FRAG,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const glow = new THREE.Mesh(quadGeo, glowMat);
		glow.scale.set(0.6, 0.4, 1);
		glow.position.set(0.78, HORIZON + 0.09, -2.1);
		scene.add(glow);

		// --- Foreground fog (in front of props) ---
		const fogMat = new THREE.ShaderMaterial({
			uniforms: {
				uFog: { value: 0 },
				uTime: { value: 0 },
				uWind: { value: 0 },
				uHorizonC: { value: new THREE.Vector3() },
			},
			vertexShader: QUAD_VERT,
			fragmentShader: FOG_FRAG,
			transparent: true,
			depthWrite: false,
		});
		const fog = new THREE.Mesh(quadGeo, fogMat);
		fog.position.set(0.5, 0.5, -1.8);
		scene.add(fog);

		// --- Particles (skipped entirely under reduced motion) ---
		// Order matches the packed density slots 15–18 (snow, rain, tokens, embers).
		const particleMats: THREE.ShaderMaterial[] = [];
		let atlas: THREE.CanvasTexture | null = null;
		if (!reducedMotion) {
			atlas = makeGlyphAtlas();
			const snow = makePoints(SNOW_MAX, SNOW_VERT, SNOW_FRAG, THREE.NormalBlending);
			snow.position.z = -1.2;
			const rain = makePoints(RAIN_MAX, RAIN_VERT, RAIN_FRAG, THREE.NormalBlending);
			rain.position.z = -1.2;
			const tokens = makePoints(TOKEN_MAX, TOKEN_VERT, TOKEN_FRAG, THREE.AdditiveBlending, { uAtlas: { value: atlas } }, true);
			tokens.position.z = -1.1;
			const embers = makePoints(EMBER_MAX, EMBER_VERT, EMBER_FRAG, THREE.AdditiveBlending);
			embers.position.z = -1.0;
			scene.add(snow, rain, tokens, embers);
			for (const p of [snow, rain, tokens, embers]) particleMats.push(p.material as THREE.ShaderMaterial);
		}

		// --- Param smoothing + per-frame application ---
		const target = new Float32Array(PACK_LEN);
		const cur = new Float32Array(PACK_LEN);
		packParams(paramsRef.current, cur);
		let areaScale = 1;
		const tmpColor = new THREE.Color();

		const apply = (time: number, k: number) => {
			packParams(paramsRef.current, target);
			for (let i = 0; i < PACK_LEN; i++) cur[i] += (target[i] - cur[i]) * k;

			const su = skyMat.uniforms;
			(su.uTop.value as THREE.Vector3).set(cur[0], cur[1], cur[2]);
			(su.uHorizon.value as THREE.Vector3).set(cur[3], cur[4], cur[5]);
			(su.uLow.value as THREE.Vector3).set(cur[6], cur[7], cur[8]);
			(su.uSunColor.value as THREE.Vector3).set(cur[9], cur[10], cur[11]);
			(su.uSunPos.value as THREE.Vector2).set(0.7, HORIZON + cur[12] * 0.54);
			su.uSunIntensity.value = cur[13];
			su.uWind.value = cur[14];
			su.uShimmer.value = cur[19];
			su.uFog.value = cur[20];
			su.uU.value = cur[24];
			su.uTime.value = time;

			const fu = fogMat.uniforms;
			fu.uFog.value = cur[20];
			fu.uWind.value = cur[14];
			fu.uTime.value = time;
			(fu.uHorizonC.value as THREE.Vector3).set(cur[3], cur[4], cur[5]);

			const ice = cur[21];
			for (const b of bergRefs) {
				const s = 0.3 + 0.7 * ice;
				b.group.scale.set(b.w * s, b.h * s, 1);
				b.group.position.y = HORIZON + Math.sin(time * 0.4 + b.phase) * 0.006 * ice;
				b.mat.opacity = 0.96 * ice;
				b.reflMat.opacity = 0.28 * ice;
			}

			const frostV = cur[22];
			const glowV = cur[23];
			frostMat.uniforms.uFrost.value = frostV;
			glowMat.uniforms.uGlow.value = glowV * (1 + 0.1 * glowV * Math.sin(time * 2.2));
			bodyMat.color.setRGB(0.04 + 0.05 * frostV + 0.2 * glowV, 0.055 + 0.07 * frostV + 0.07 * glowV, 0.09 + 0.1 * frostV + 0.03 * glowV);
			annexMat.color.setRGB(0.03 + 0.04 * frostV + 0.12 * glowV, 0.04 + 0.05 * frostV + 0.045 * glowV, 0.065 + 0.075 * frostV + 0.02 * glowV);

			const mixT = Math.min(1, glowV * 0.85 + (1 - frostV) * 0.35);
			const bright = 0.5 + 0.8 * mixT;
			for (let i = 0; i < WIN_COUNT; i++) {
				const pulse = 1 + 0.2 * glowV * Math.sin(time * 2.7 + winPhase[i]);
				const b = winVar[i] * bright * pulse;
				tmpColor.setRGB(
					(WIN_COLD[0] + (WIN_HOT[0] - WIN_COLD[0]) * mixT) * b,
					(WIN_COLD[1] + (WIN_HOT[1] - WIN_COLD[1]) * mixT) * b,
					(WIN_COLD[2] + (WIN_HOT[2] - WIN_COLD[2]) * mixT) * b,
				);
				wins.setColorAt(i, tmpColor);
			}
			if (wins.instanceColor) wins.instanceColor.needsUpdate = true;

			for (let i = 0; i < particleMats.length; i++) {
				const mat = particleMats[i];
				mat.uniforms.uTime.value = time;
				mat.uniforms.uWind.value = cur[14];
				mat.uniforms.uDensity.value = cur[15 + i] * areaScale;
			}
		};

		// --- Sizing ---
		const resize = () => {
			const w = container.clientWidth || 1;
			const h = container.clientHeight || 1;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(w, h, false);
			areaScale = Math.min(1, (w * h) / (1440 * 900));
			skyMat.uniforms.uAspect.value = w / h;
			const pr = renderer.getPixelRatio();
			const hScale = Math.min(1.6, Math.max(0.6, h / 900));
			for (const mat of particleMats) {
				mat.uniforms.uPixelRatio.value = pr;
				mat.uniforms.uHScale.value = hScale;
			}
			renderOnceRef.current?.();
		};

		// --- Render loop / static render ---
		let last = performance.now();
		let elapsed = 0;
		if (reducedMotion) {
			renderOnceRef.current = () => {
				apply(0, 1);
				renderer.render(scene, camera);
			};
		} else {
			renderer.setAnimationLoop((now: number) => {
				const dt = Math.min((now - last) / 1000, 0.1);
				last = now;
				elapsed += dt;
				apply(elapsed, 1 - Math.exp(-dt * 8));
				renderer.render(scene, camera);
			});
		}

		resize();
		renderOnceRef.current?.();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const onContextLost = (e: Event) => e.preventDefault();
		const onContextRestored = () => renderOnceRef.current?.();
		canvas.addEventListener('webglcontextlost', onContextLost);
		canvas.addEventListener('webglcontextrestored', onContextRestored);

		return () => {
			renderOnceRef.current = null;
			renderer.setAnimationLoop(null);
			ro.disconnect();
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);
			scene.traverse((o) => {
				if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
					o.geometry.dispose();
					const mats = Array.isArray(o.material) ? o.material : [o.material];
					for (const m of mats) m.dispose();
				}
			});
			wins.dispose();
			atlas?.dispose();
			renderer.dispose();
			// Release the GL context now; A/B route toggling in the spike would
			// otherwise stack live contexts until GC (browsers cap ~16).
			renderer.forceContextLoss();
			container.removeChild(canvas);
		};
	}, [reducedMotion]);

	// Reduced motion has no loop, so re-render statically whenever params change.
	useEffect(() => {
		renderOnceRef.current?.();
	}, [params]);

	return <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />;
}
