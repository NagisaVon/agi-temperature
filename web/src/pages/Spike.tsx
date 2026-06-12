import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sceneParamsFor } from '../scene/sceneParams';

const RouteA = lazy(() => import('../scene/spike/RouteA'));
const RouteB = lazy(() => import('../scene/spike/RouteB'));

/**
 * Scene tech bake-off harness (PRD D11). Not linked from the nav.
 * /spike?route=A|B&u=0.0..1.0&rm=1
 */
export default function Spike() {
	const [search, setSearch] = useSearchParams();
	const route = (search.get('route') ?? 'A').toUpperCase() === 'B' ? 'B' : 'A';
	const u = Math.min(1, Math.max(0, Number.parseFloat(search.get('u') ?? '0.5') || 0));
	const reducedMotion = search.get('rm') === '1';
	const params = sceneParamsFor(u);
	const tempC = -89.2 + u * 145.9;

	const [fps, setFps] = useState(0);
	useEffect(() => {
		let frames = 0;
		let last = performance.now();
		let raf = 0;
		const loop = (t: number) => {
			frames++;
			if (t - last >= 1000) {
				setFps(Math.round((frames * 1000) / (t - last)));
				frames = 0;
				last = t;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);

	const set = (key: string, value: string) => {
		const next = new URLSearchParams(search);
		next.set(key, value);
		setSearch(next, { replace: true });
	};

	const Scene = route === 'B' ? RouteB : RouteA;

	return (
		<div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#000' }}>
			<Suspense fallback={null}>
				<Scene params={params} reducedMotion={reducedMotion} />
			</Suspense>

			<div
				data-testid="spike-controls"
				style={{
					position: 'absolute',
					left: 12,
					bottom: 12,
					zIndex: 10,
					background: 'rgba(8, 10, 20, 0.8)',
					border: '1px solid #2a3350',
					borderRadius: 10,
					padding: '10px 14px',
					font: '12px/1.5 ui-monospace, monospace',
					color: '#dde4f0',
					width: 320,
				}}
			>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
					<strong>spike</strong>
					<button type="button" onClick={() => set('route', 'A')} disabled={route === 'A'}>
						A · css/canvas
					</button>
					<button type="button" onClick={() => set('route', 'B')} disabled={route === 'B'}>
						B · webgl
					</button>
					<span style={{ marginLeft: 'auto' }} data-testid="fps">
						{fps} fps
					</span>
				</div>
				<input
					type="range"
					min={0}
					max={1}
					step={0.001}
					value={u}
					style={{ width: '100%' }}
					onChange={(e) => set('u', e.target.value)}
				/>
				<div>
					u = {u.toFixed(3)} · {tempC.toFixed(1)}°C · snow {params.particles.snow.toFixed(2)} ·
					rain {params.particles.rain.toFixed(2)} · tokens {params.particles.tokens.toFixed(2)} · berg{' '}
					{params.iceberg.toFixed(2)} · glow {params.rackGlow.toFixed(2)}
				</div>
			</div>
		</div>
	);
}
