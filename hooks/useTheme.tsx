// =====================================================
// HOOK - useTheme (Light Mode Pro)
// Aplica .dark/.light no <html> e persiste em localStorage.
// Dark é o padrão; light é opt-in. Sem detecção de SO (decisão do produto).
// =====================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'theme';

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  const c = document.documentElement.classList;
  c.toggle('dark', theme === 'dark');
  c.toggle('light', theme === 'light');
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const persist = (t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
  };

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
