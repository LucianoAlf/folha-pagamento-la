import React from 'react';
import { Tooltip } from './UI';
import {
  NAVIGATION_GROUPS,
  isNavigationItemActive,
  type NavigationBadge,
  type NavigationDestination,
  type NavigationItemId,
} from './navigation';

interface NavigationGroupsProps {
  current: NavigationDestination;
  collapsed?: boolean;
  badges?: Partial<Record<NavigationItemId, NavigationBadge>>;
  onNavigate: (next: NavigationDestination) => void;
  onItemSelected?: () => void;
}

export const NavigationGroups: React.FC<NavigationGroupsProps> = ({
  current,
  collapsed = false,
  badges = {},
  onNavigate,
  onItemSelected,
}) => (
  <div className="space-y-6">
    {NAVIGATION_GROUPS.map((group) => (
      <section
        key={group.id}
        aria-label={collapsed ? group.label : undefined}
        aria-labelledby={collapsed ? undefined : `navigation-group-${group.id}`}
      >
        {!collapsed && (
          <h2
            id={`navigation-group-${group.id}`}
            className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted"
          >
            {group.label}
          </h2>
        )}
        <div className="space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon;
            const badge = badges[item.id];
            const active = isNavigationItemActive(item, current);
            const accessibleLabel = [
              item.label,
              item.status === 'future' ? 'Em breve' : undefined,
              badge?.accessibleLabel,
            ]
              .filter(Boolean)
              .join(', ');
            const button = (
              <button
                key={item.id}
                type="button"
                disabled={item.status === 'future'}
                aria-label={accessibleLabel}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!item.destination) return;
                  onNavigate(item.destination);
                  onItemSelected?.();
                }}
                className={[
                  'relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                  item.status === 'future'
                    ? 'cursor-not-allowed border-transparent text-muted opacity-55'
                    : active
                      ? 'border-accent/25 bg-accent/12 text-accent shadow-sm shadow-accent/10'
                      : 'border-transparent text-secondary hover:bg-surface-2 hover:text-primary',
                ].join(' ')}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-bold">{item.label}</span>
                    {item.status === 'future' && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-secondary">
                        Em breve
                      </span>
                    )}
                    {badge && (
                      <span
                        className={[
                          'flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[10px] font-black',
                          badge.variant === 'danger'
                            ? 'border-danger/40 bg-danger/20 text-danger'
                            : 'border-warning/40 bg-warning/20 text-warning',
                          badge.pulse ? 'animate-pulse' : '',
                        ].join(' ')}
                      >
                        {badge.count}
                      </span>
                    )}
                  </>
                )}
                {collapsed && badge && (
                  <span
                    className={[
                      'absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg px-1 text-[9px] font-black text-white',
                      badge.variant === 'danger' ? 'bg-danger' : 'bg-warning',
                      badge.pulse ? 'animate-pulse' : '',
                    ].join(' ')}
                  >
                    {badge.count}
                  </span>
                )}
              </button>
            );

            return collapsed ? (
              <Tooltip key={item.id} content={accessibleLabel} side="right">
                {button}
              </Tooltip>
            ) : (
              <React.Fragment key={item.id}>{button}</React.Fragment>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);
