import { useEffect, useState } from 'react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { type HistoryPoint, type HistoryRange, getHistory } from '../api';
import { formatTemp, toF } from '../format';
import { useUnit } from '../unit';

const RANGES: HistoryRange[] = ['24h', '7d', '30d', 'all'];

const RANGE_LABELS: Record<HistoryRange, string> = {
	'24h': '24 hours',
	'7d': '7 days',
	'30d': '30 days',
	all: 'all time',
};

function tickFormatter(range: HistoryRange) {
	return (t: number) => {
		const d = new Date(t * 1000);
		if (range === '24h') return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		if (range === '7d') return d.toLocaleDateString(undefined, { weekday: 'short' });
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};
}

export default function TrendChart() {
	const { unit } = useUnit();
	const [range, setRange] = useState<HistoryRange>('7d');
	const [points, setPoints] = useState<HistoryPoint[] | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setPoints(null);
		setFailed(false);
		getHistory(range)
			.then((h) => {
				if (!cancelled) setPoints(h.points);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [range]);

	const data = (points ?? []).map((p) => ({
		...p,
		display_c: unit === 'F' ? toF(p.avg_c) : p.avg_c,
	}));

	return (
		<section className="section">
			<h2>Hype Forecast (Hindcast)</h2>
			<div className="range-switcher" role="tablist" aria-label="History range">
				{RANGES.map((r) => (
					<button
						key={r}
						type="button"
						role="tab"
						aria-selected={r === range}
						className={r === range ? 'range-btn active' : 'range-btn'}
						onClick={() => setRange(r)}
					>
						{RANGE_LABELS[r]}
					</button>
				))}
			</div>

			{failed ? (
				<div className="empty-state">History service is hiding from the benchmark.</div>
			) : points === null ? (
				<div className="loading-state">Exhuming the archives…</div>
			) : points.length === 0 ? (
				<div className="empty-state">No readings in this window yet. The thermometer is young.</div>
			) : (
				<div className="chart-frame">
					<ResponsiveContainer width="100%" height={260}>
						<AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
							<defs>
								<linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--hot)" stopOpacity={0.45} />
									<stop offset="100%" stopColor="var(--cold)" stopOpacity={0.06} />
								</linearGradient>
							</defs>
							<CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
							<XAxis
								dataKey="t"
								tickFormatter={tickFormatter(range)}
								stroke="var(--muted)"
								tickLine={false}
								fontSize={12}
								minTickGap={32}
							/>
							<YAxis
								stroke="var(--muted)"
								tickLine={false}
								fontSize={12}
								width={42}
								tickFormatter={(v: number) => `${Math.round(v)}°`}
							/>
							<Tooltip
								contentStyle={{
									background: 'var(--bg-raised)',
									border: '1px solid var(--line)',
									borderRadius: 8,
									color: 'var(--fg)',
								}}
								labelFormatter={(t: number) =>
									new Date(t * 1000).toLocaleString(undefined, {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit',
									})
								}
								formatter={(value: number, _name, item) => {
									const p = item?.payload as HistoryPoint | undefined;
									const spread =
										p && p.min_c !== p.max_c
											? ` (${formatTemp(p.min_c, unit, 0)} – ${formatTemp(p.max_c, unit, 0)})`
											: '';
									return [`${value.toFixed(1)}°${unit}${spread}`, 'hype'];
								}}
							/>
							{unit === 'C' && data.some((d) => d.avg_c < 2) && (
								<ReferenceLine y={0} stroke="var(--cold)" strokeDasharray="4 4" label={{ value: 'ice', fill: 'var(--cold)', fontSize: 11 }} />
							)}
							<Area
								type="monotone"
								dataKey="display_c"
								stroke="var(--accent)"
								strokeWidth={2}
								fill="url(#tempFill)"
								isAnimationActive={false}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}
		</section>
	);
}
