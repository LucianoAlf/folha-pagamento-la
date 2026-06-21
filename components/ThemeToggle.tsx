import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ThemeToggleProps {
  collapsed?: boolean;
  /** 'full' = botão largo com label (sidebar antiga). 'icon' = botão quadrado só com ícone (header). */
  variant?: 'full' | 'icon';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ collapsed = false, variant = 'full' }) => {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        title={isDark ? 'Tema claro' : 'Tema escuro'}
        className="w-10 h-10 rounded-2xl border border-line-strong/60 bg-surface/40 hover:bg-surface/60 flex items-center justify-center text-secondary hover:text-primary transition-all active:scale-95 shadow-inner"
      >
        {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
      </button>
    );
  }

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
