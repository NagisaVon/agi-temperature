const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

export type AIStory = {
	rank: number;
	hn_id: number;
	title: string;
	points: number | null;
	num_comments: number | null;
	weight: number;
};

export type Current = {
	recorded_at: number;
	temperature_c: number;
	score: number;
	classifier_version: string;
	scoring_version: string;
	ai_count: number;
	total_count: number;
	ai_stories: AIStory[];
};

export type HistoryRange = '24h' | '7d' | '30d' | 'all';

export type HistoryPoint = {
	t: number;
	avg_c: number;
	min_c: number;
	max_c: number;
	avg_score: number;
};

export type History = {
	range: HistoryRange;
	bucket: '5m' | '1h' | '1d';
	points: HistoryPoint[];
};

export type Summary = {
	all_time_high: { temperature_c: number; recorded_at: number };
	all_time_low: { temperature_c: number; recorded_at: number };
	avg_7d_c: number;
	reading_count: number;
};

/** The API's documented 503 { status: "no_data" } — expected before the first cron run. */
export class NoDataError extends Error {
	constructor() {
		super('no data recorded yet');
		this.name = 'NoDataError';
	}
}

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`);
	if (res.status === 503) throw new NoDataError();
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as T;
}

export const getCurrent = () => get<Current>('/api/current');
export const getHistory = (range: HistoryRange) => get<History>(`/api/history?range=${range}`);
export const getSummary = () => get<Summary>('/api/summary');
