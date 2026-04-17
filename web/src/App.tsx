import { useEffect, useState } from 'react';

type Health = {
	status: string;
	last_recorded_at: number | null;
	row_count: number;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export default function App() {
	const [health, setHealth] = useState<Health | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!API_BASE) {
			setError('VITE_API_BASE is not set');
			return;
		}
		fetch(`${API_BASE}/api/health`)
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
			.then((data: Health) => setHealth(data))
			.catch((e: Error) => setError(e.message));
	}, []);

	return (
		<main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
			<h1>AGI Temperature</h1>
			<p>Current reading: <strong>—°C</strong></p>
			<p style={{ color: '#666', fontSize: '0.9rem' }}>
				{error
					? `error: ${error}`
					: health
					? `worker ${health.status} · ${health.row_count} readings · API base ${API_BASE}`
					: 'loading…'}
			</p>
		</main>
	);
}
