import { Suspense, lazy } from 'react';
import { sceneParamsFor, uFromTempC } from './sceneParams';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const ProductionScene = lazy(() => import('./ProductionScene'));

/**
 * Full-viewport scene behind the page content. tempC === null renders the
 * PRD no-data state: mid-range (u = 0.5), paused.
 */
export default function SceneBackdrop({ tempC, paused = false }: { tempC: number | null; paused?: boolean }) {
	const reduced = usePrefersReducedMotion();
	const u = tempC === null ? 0.5 : uFromTempC(tempC);

	return (
		<div className="scene-backdrop" aria-hidden="true">
			<Suspense fallback={null}>
				<ProductionScene params={sceneParamsFor(u)} reducedMotion={reduced || paused} />
			</Suspense>
			<div className="scene-scrim" />
		</div>
	);
}
