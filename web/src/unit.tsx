import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Unit } from './format';

const STORAGE_KEY = 'agi-temp-unit';

const UnitContext = createContext<{ unit: Unit; toggle: () => void }>({ unit: 'C', toggle: () => {} });

export function UnitProvider({ children }: { children: ReactNode }) {
	const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem(STORAGE_KEY) === 'F' ? 'F' : 'C'));

	const toggle = () =>
		setUnit((prev) => {
			const next = prev === 'C' ? 'F' : 'C';
			localStorage.setItem(STORAGE_KEY, next);
			return next;
		});

	return <UnitContext.Provider value={{ unit, toggle }}>{children}</UnitContext.Provider>;
}

export const useUnit = () => useContext(UnitContext);
