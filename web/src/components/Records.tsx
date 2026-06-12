import { useEffect, useState } from 'react';
import { NoDataError, type Summary, getSummary } from '../api';
import { formatTemp, formatWhen } from '../format';
import { useUnit } from '../unit';

export default function Records() {
	const { unit } = useUnit();
	const [summary, setSummary] = useState<Summary | null>(null);
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		getSummary()
			.then(setSummary)
			.catch((err) => setHidden(err instanceof NoDataError || true));
	}, []);

	if (hidden && !summary) return null;
	if (!summary) return null;

	return (
		<section className="section">
			<h2>Station Records</h2>
			<div className="records">
				<div className="record record-high">
					<span className="record-label">Record hype</span>
					<span className="record-value">{formatTemp(summary.all_time_high.temperature_c, unit)}</span>
					<span className="record-when">{formatWhen(summary.all_time_high.recorded_at)}</span>
				</div>
				<div className="record record-low">
					<span className="record-label">Record chill</span>
					<span className="record-value">{formatTemp(summary.all_time_low.temperature_c, unit)}</span>
					<span className="record-when">{formatWhen(summary.all_time_low.recorded_at)}</span>
				</div>
				<div className="record">
					<span className="record-label">7-day mean</span>
					<span className="record-value">{formatTemp(summary.avg_7d_c, unit)}</span>
					<span className="record-when">{summary.reading_count.toLocaleString()} readings on file</span>
				</div>
			</div>
		</section>
	);
}
