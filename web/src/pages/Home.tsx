import { Link } from 'react-router-dom';
import Records from '../components/Records';
import TrendChart from '../components/TrendChart';
import { formatTemp, formatWhen } from '../format';
import { NO_DATA_NOTE, bandFor } from '../taglines';
import { useUnit } from '../unit';
import type { CurrentState } from '../useCurrent';

export default function Home({ current }: { current: CurrentState }) {
	const { unit } = useUnit();

	if (current.kind === 'loading') {
		return <div className="loading-state">Taking the temperature…</div>;
	}

	if (current.kind === 'no_data') {
		return (
			<section className="reading">
				<h1 className="reading-temp">—°</h1>
				<p className="reading-tagline">Calibrating</p>
				<p className="reading-advisory">{NO_DATA_NOTE}</p>
			</section>
		);
	}

	if (current.kind === 'error') {
		return (
			<section className="reading">
				<h1 className="reading-temp">?°</h1>
				<p className="reading-tagline">Thermometer offline</p>
				<p className="reading-advisory">
					Couldn't reach the weather station ({current.message}). It is either a network blip or the AGI got it first.
				</p>
			</section>
		);
	}

	const { data } = current;
	const band = bandFor(data.temperature_c);

	return (
		<>
			<section className="reading">
				<h1 className="reading-temp">{formatTemp(data.temperature_c, unit)}</h1>
				<p className="reading-tagline">{band.tagline}</p>
				<p className="reading-advisory">{band.advisory}</p>
				<p className="reading-meta">
					{data.ai_count} of {data.total_count} front-page stories are feeding the furnace ·{' '}
					<Link to="/headlines">see the receipts</Link>
					<br />
					Station report {formatWhen(data.recorded_at)} · refreshes every 5 minutes
				</p>
			</section>

			<TrendChart />
			<Records />
		</>
	);
}
