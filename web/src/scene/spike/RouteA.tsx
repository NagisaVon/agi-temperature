import type { SceneProps } from '../SceneProps';
import { cssRGB } from '../sceneParams';

/** Route A: layered CSS/SVG scenery + one canvas particle layer. STUB — replaced by the spike. */
export default function RouteA({ params }: SceneProps) {
	const { sky } = params;
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background: `linear-gradient(${cssRGB(sky.top)}, ${cssRGB(sky.horizon)} 62%, ${cssRGB(sky.low)})`,
			}}
		/>
	);
}
