import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export const ThemeToggle: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2.5 rounded-xl text-secondary hover:text-primary hover:bg-surface-3 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {!collapsed && <span className="text-sm font-bold">{isDark ? 'Tema claro' : 'Tema escuro'}</span>}
    </button>
  );
};
