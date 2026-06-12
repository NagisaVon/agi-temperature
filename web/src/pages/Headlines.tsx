import { formatWhen } from '../format';
import { NO_DATA_NOTE } from '../taglines';
import type { CurrentState } from '../useCurrent';

export default function Headlines({ current }: { current: CurrentState }) {
	if (current.kind === 'loading') {
		return <div className="loading-state">Subpoenaing the front page…</div>;
	}

	if (current.kind === 'no_data') {
		return <div className="empty-state">{NO_DATA_NOTE}</div>;
	}

	if (current.kind === 'error') {
		return <div className="empty-state">Couldn't fetch the evidence ({current.message}).</div>;
	}

	const { data } = current;
	const aiWeightTotal = data.ai_stories.reduce((sum, s) => sum + s.weight, 0);

	return (
		<section className="section">
			<h2>The Receipts</h2>
			<p className="receipts-intro">
				Exhibit A through {String.fromCharCode(64 + Math.min(26, Math.max(1, data.ai_count)))}: the{' '}
				{data.ai_count} front-page {data.ai_count === 1 ? 'story' : 'stories'} responsible for the current
				reading, as recorded {formatWhen(data.recorded_at)}. Blame share is each story's slice of the AI
				hype weight (rank 1 carries 100×, rank 100 carries 1×).
			</p>

			{data.ai_stories.length === 0 ? (
				<div className="empty-state">
					Not a single AI story on the front page. Screenshot this; nobody will believe you.
				</div>
			) : (
				<ol className="receipt-list">
					{data.ai_stories.map((s) => {
						const blame = aiWeightTotal > 0 ? (s.weight / aiWeightTotal) * 100 : 0;
						return (
							<li key={s.rank} className="receipt">
								<span className="receipt-rank">#{s.rank}</span>
								<a
									className="receipt-title"
									href={`https://news.ycombinator.com/item?id=${s.hn_id}`}
									target="_blank"
									rel="noreferrer"
								>
									{s.title}
								</a>
								<span className="receipt-stats">
									{s.points ?? '—'} pts · {s.num_comments ?? '—'} comments
								</span>
								<span className="receipt-blame">
									<span className="bar" style={{ width: `${Math.max(2, blame)}%` }} />
									{blame.toFixed(1)}% of the blame
								</span>
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}
