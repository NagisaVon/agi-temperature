import { Link } from 'react-router-dom';

export default function NotFound() {
	return (
		<div className="empty-state">
			<h1 style={{ fontSize: '3rem', margin: 0 }}>404°</h1>
			<p>This page hasn't been invented yet. Give the labs a quarter or two.</p>
			<Link to="/">Back to the weather station</Link>
		</div>
	);
}
