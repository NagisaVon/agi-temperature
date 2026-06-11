import { NavLink, Route, Routes } from 'react-router-dom';
import { useUnit } from './unit';
import { useCurrent } from './useCurrent';
import Home from './pages/Home';
import Headlines from './pages/Headlines';
import NotFound from './pages/NotFound';

export default function App() {
	const { unit, toggle } = useUnit();
	const current = useCurrent();

	return (
		<div className="app">
			<header className="app-header">
				<NavLink to="/" className="wordmark">
					AGI <span>Temperature</span>
				</NavLink>
				<nav className="app-nav">
					<NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
						Now
					</NavLink>
					<NavLink to="/headlines" className={({ isActive }) => (isActive ? 'active' : '')}>
						The Receipts
					</NavLink>
					<button
						type="button"
						className="unit-toggle"
						onClick={toggle}
						title={unit === 'C' ? 'Switch to Freedom Units' : 'Switch back to SI, like the researchers intended'}
					>
						°{unit} → °{unit === 'C' ? 'F' : 'C'}
					</button>
				</nav>
			</header>

			<main className="app-main">
				<Routes>
					<Route path="/" element={<Home current={current} />} />
					<Route path="/headlines" element={<Headlines current={current} />} />
					<Route path="*" element={<NotFound />} />
				</Routes>
			</main>

			<footer className="app-footer">
				<span>
					Range: −89.2 °C (Vostok, 1983) to +56.7 °C (Furnace Creek, 1913) — the only benchmarks AI hasn't saturated.
				</span>
				<span>
					{current.kind === 'ready'
						? `classifier ${current.data.classifier_version} · scoring ${current.data.scoring_version} · `
						: ''}
					<a href="https://github.com/NagisaVon/agi-temperature" target="_blank" rel="noreferrer">
						source
					</a>
				</span>
			</footer>
		</div>
	);
}
