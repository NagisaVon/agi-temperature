import { normalize } from '../format';

/**
 * SVG thermometer pinned to the Earth-record range: −89.2 °C … +56.7 °C.
 * Mercury height tracks u; color blends cold→hot with the same normalization.
 */
export default function Thermometer({ tempC }: { tempC: number }) {
	const u = normalize(tempC);

	const TUBE_TOP = 14;
	const TUBE_BOTTOM = 150;
	const tubeSpan = TUBE_BOTTOM - TUBE_TOP;
	const mercuryTop = TUBE_BOTTOM - u * tubeSpan;

	const marks = [
		{ c: 56.7, label: '56.7° Furnace Creek, 1913' },
		{ c: 0, label: '0° actual ice' },
		{ c: -89.2, label: '−89.2° Vostok, 1983' },
	];

	// cold #7fd4ff → hot #ff8c5a, matching the app palette
	const r = Math.round(127 + u * (255 - 127));
	const g = Math.round(212 + u * (140 - 212));
	const b = Math.round(255 + u * (90 - 255));
	const mercury = `rgb(${r}, ${g}, ${b})`;

	return (
		<svg
			className="thermometer"
			viewBox="0 0 210 190"
			width="210"
			height="190"
			role="img"
			aria-label={`Thermometer reading ${tempC.toFixed(1)} degrees Celsius`}
		>
			<title>{`${tempC.toFixed(1)} °C on the Earth-record scale`}</title>
			{/* tube */}
			<rect x="22" y={TUBE_TOP - 4} width="16" height={tubeSpan + 8} rx="8" fill="var(--bg-raised)" stroke="var(--line)" />
			{/* mercury */}
			<rect x="26" y={mercuryTop} width="8" height={TUBE_BOTTOM - mercuryTop + 6} rx="4" fill={mercury} />
			{/* bulb */}
			<circle cx="30" cy={TUBE_BOTTOM + 18} r="14" fill={mercury} stroke="var(--line)" />
			{/* scale marks */}
			{marks.map((m) => {
				const y = TUBE_BOTTOM - normalize(m.c) * tubeSpan;
				return (
					<g key={m.c}>
						<line x1="40" x2="48" y1={y} y2={y} stroke="var(--muted)" strokeWidth="1" />
						<text x="53" y={y + 3.5} fill="var(--muted)" fontSize="9.5">
							{m.label}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
