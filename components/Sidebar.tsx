import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavigationGroups } from './NavigationGroups';
import type { NavigationDestination } from './navigation';
import { Tooltip } from './UI';
import { useFeriasNavigationBadge } from './useFeriasNavigationBadge';

const SIDEBAR_COLLAPSED_KEY = 'la-music-sidebar-collapsed';

export interface SidebarProps {
  current: NavigationDestination;
  onNavigate: (next: NavigationDestination) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ current, onNavigate }) => {
  const [collapsed, setCollapsed] = useState(false);
  const feriasBadge = useFeriasNavigationBadge();

  useEffect(() => {
    try {
      const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (value === '1') setCollapsed(true);
      if (value === '0') setCollapsed(false);
    } catch {
      // Ignore unavailable storage and keep the expanded default.
    }
  }, []);

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Ignore unavailable storage after updating the current session.
    }
  };

  return (
    <div className="relative h-full overflow-visible">
      <aside
        className={[
          collapsed ? 'w-20' : 'w-72',
          'app-sidebar relative flex h-full flex-col border-r border-line-strong bg-surface transition-all duration-300 dark:border-line dark:bg-[#0a0d14]',
        ].join(' ')}
        aria-label="Navegação principal"
      >
        <div className="relative z-10 border-b border-line-strong/70 bg-surface-2/50 p-5 dark:border-line/80 dark:bg-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-transparent">
              <img
                src="/logo-LA-light.png"
                alt="LA"
                className="h-10 w-10 object-contain dark:hidden"
              />
              <img
                src="/logo-LA-colapsed.png"
                alt="LA"
                className="hidden h-10 w-10 object-contain dark:block"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold uppercase leading-tight tracking-[0.15em] text-primary">
                  SUPER FOLHA SYSTEM
                </div>
                <div className="truncate text-[10px] font-bold tracking-wider text-muted opacity-80">
                  Sistema Inteligente
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="relative z-10 flex-1 overflow-y-auto p-4">
          <NavigationGroups
            current={current}
            collapsed={collapsed}
            badges={{ ferias: feriasBadge }}
            onNavigate={onNavigate}
          />
        </nav>
      </aside>

      <Tooltip content={collapsed ? 'Expandir' : 'Recolher'} side="right">
        <button
          type="button"
          onClick={() => setCollapsedPersisted(!collapsed)}
          className="absolute -right-3.5 top-1/2 z-50 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-secondary shadow-md transition-colors hover:border-accent/40 hover:text-primary dark:shadow-black/40"
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </Tooltip>
    </div>
  );
};
