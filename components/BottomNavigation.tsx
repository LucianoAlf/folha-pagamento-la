import React from 'react';
import { Menu } from 'lucide-react';
import {
  BOTTOM_NAVIGATION_IDS,
  getNavigationItem,
  isMoreNavigationActive,
  isNavigationItemActive,
  type NavigationDestination,
} from './navigation';

export interface BottomNavigationProps {
  current: NavigationDestination;
  moreOpen: boolean;
  onNavigate: (next: NavigationDestination) => void;
  onOpenMore: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  current,
  moreOpen,
  onNavigate,
  onOpenMore,
}) => {
  const moreActive = moreOpen || isMoreNavigationActive(current);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[10500] border-t border-line/70 bg-surface lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      aria-label="Navegacao inferior"
    >
      <div className="grid grid-cols-5 gap-1 px-3 pt-2">
        {BOTTOM_NAVIGATION_IDS.map((id) => {
          const item = getNavigationItem(id);
          const Icon = item.icon;
          const active = isNavigationItemActive(item, current);
          const label = item.shortLabel ?? item.label;

          return (
            <button
              key={id}
              type="button"
              onClick={() => item.destination && onNavigate(item.destination)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={[
                'flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                active ? 'text-accent' : 'text-muted hover:text-secondary',
              ].join(' ')}
            >
              <Icon
                className={[
                  'h-6 w-6 shrink-0 transition-transform',
                  active ? 'scale-110' : '',
                ].join(' ')}
                aria-hidden="true"
              />
              <span className="max-w-full truncate text-[10px] font-medium leading-none sm:text-[11px]">
                {label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="Mais"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          className={[
            'flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
            moreActive ? 'text-accent' : 'text-muted hover:text-secondary',
          ].join(' ')}
        >
          <Menu
            className={[
              'h-6 w-6 shrink-0 transition-transform',
              moreActive ? 'scale-110' : '',
            ].join(' ')}
            aria-hidden="true"
          />
          <span className="max-w-full truncate text-[10px] font-medium leading-none sm:text-[11px]">
            Mais
          </span>
        </button>
      </div>
    </nav>
  );
};
