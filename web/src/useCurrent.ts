import { useEffect, useState } from 'react';
import { type Current, NoDataError, getCurrent } from './api';

export type CurrentState =
	| { kind: 'loading' }
	| { kind: 'no_data' }
	| { kind: 'error'; message: string }
	| { kind: 'ready'; data: Current };

/** Polls /api/current; matches the 60s edge-cache TTL. Keeps the last good reading on transient errors. */
export function useCurrent(pollMs = 60_000): CurrentState {
	const [state, setState] = useState<CurrentState>({ kind: 'loading' });

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const data = await getCurrent();
				if (!cancelled) setState({ kind: 'ready', data });
			} catch (err) {
				if (cancelled) return;
				if (err instanceof NoDataError) {
					setState({ kind: 'no_data' });
				} else {
					setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', message: String(err) }));
				}
			}
		};

		void load();
		const timer = setInterval(load, pollMs);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [pollMs]);

	return state;
}
