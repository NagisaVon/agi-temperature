import type { SceneParams } from './sceneParams';

/**
 * Contract both render routes implement (PRD D11). The rest of the app only
 * ever sees this boundary, so the bake-off loser can be swapped out freely.
 */
export type SceneProps = {
	params: SceneParams;
	/** True → no animation loop: static composition, particles off. */
	reducedMotion: boolean;
};
