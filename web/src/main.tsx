import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { UnitProvider } from './unit';
import './index.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<BrowserRouter>
			<UnitProvider>
				<App />
			</UnitProvider>
		</BrowserRouter>
	</StrictMode>,
);
