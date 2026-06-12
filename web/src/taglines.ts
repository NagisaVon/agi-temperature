/**
 * Temperature-indexed weather-service copy. Thresholds in °C; first match
 * (descending) wins. Tuned so typical days (~0–25 °C with scoring s1) rotate
 * through the middle bands.
 */
const BANDS: Array<{ min: number; tagline: string; advisory: string }> = [
	{
		min: 50,
		tagline: 'Singularity heatwave',
		advisory: 'The front page is 100% AI. Touch grass immediately; the grass may also be AI.',
	},
	{
		min: 40,
		tagline: 'Extreme hype warning',
		advisory: 'Token rain torrential. Do not look at valuations with remaining eye.',
	},
	{
		min: 30,
		tagline: 'Severe hype advisory',
		advisory: 'GPU surfaces hot to the touch. Hydrate before reading the comments.',
	},
	{
		min: 20,
		tagline: 'Hype index elevated',
		advisory: 'Shorts and GPUs weather. A demo video is going viral somewhere.',
	},
	{
		min: 10,
		tagline: 'Warm front of announcements',
		advisory: 'Light drizzle of model releases expected through the afternoon.',
	},
	{
		min: 0,
		tagline: 'Mild with scattered papers',
		advisory: 'A balanced front page. Savor it; this never lasts.',
	},
	{
		min: -15,
		tagline: 'Hype frost advisory',
		advisory: 'People are posting about databases again. Jackets recommended.',
	},
	{
		min: -40,
		tagline: 'AGI winter watch',
		advisory: 'Venture capital observed migrating south for the season.',
	},
	{
		min: -Infinity,
		tagline: 'Full AI winter',
		advisory: 'Front page frozen solid: not a transformer in sight. Historians, take notes.',
	},
];

export function bandFor(tempC: number): { tagline: string; advisory: string } {
	return BANDS.find((b) => tempC >= b.min) ?? BANDS[BANDS.length - 1];
}

export const NO_DATA_NOTE = 'Warming up the thermometer — first reading arrives within five minutes.';
