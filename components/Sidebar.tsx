import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Modal, CustomSelect, Tooltip } from './UI';
import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  CreditCard,
  Calendar,
  CalendarCheck,
  Bell,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const SIDEBAR_COLLAPSED_KEY = 'la-music-sidebar-collapsed';
const FERIAS_BADGE_TTL_MS = 60_000;

let feriasBadgeCache: { at: number; vencidos: number; proximos: number } | null = null;
let feriasBadgeInFlight: Promise<{ vencidos: number; proximos: number }> | null = null;

const getFeriasBadgeCounts = async (): Promise<{ vencidos: number; proximos: number }> => {
  const now = Date.now();
  if (feriasBadgeCache && now - feriasBadgeCache.at < FERIAS_BADGE_TTL_MS) {
    return { vencidos: feriasBadgeCache.vencidos, proximos: feriasBadgeCache.proximos };
  }

  if (feriasBadgeInFlight) return feriasBadgeInFlight;

  feriasBadgeInFlight = (async () => {
    const { feriasService } = await import('../services/feriasService');
    const colaboradores = await feriasService.fetchColaboradoresStatus();

    const vencidos = colaboradores.filter((c) => c.tem_ferias_vencidas).length;
    const proximos = colaboradores.filter((c) => {
      if (c.tem_ferias_vencidas || !c.proxima_expiracao) return false;
      const diasRestantes = Math.ceil(
        (new Date(c.proxima_expiracao).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      );
      return diasRestantes > 0 && diasRestantes <= 30;
    }).length;

    feriasBadgeCache = { at: Date.now(), vencidos, proximos };
    return { vencidos, proximos };
  })();

  try {
    return await feriasBadgeInFlight;
  } finally {
    feriasBadgeInFlight = null;
  }
};

type ModuleId = 'folha' | 'contas' | 'agenda' | 'notificacoes' | 'ferias' | 'rh';
type FolhaPageId = 'dashboard' | 'colaboradores' | 'lancamentos' | 'comparativo';

export interface SidebarNavigate {
  module: ModuleId;
  page?: FolhaPageId | string;
}

export interface SidebarProps {
  current: SidebarNavigate;
  onNavigate: (next: SidebarNavigate) => void;
  onLogout: () => void;
  onEditProfile?: () => void;
  userLabel: string;
  userAvatarUrl?: string | null;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  current,
  onNavigate,
  onLogout,
  onEditProfile,
  userLabel,
  userAvatarUrl,
  isMobileDrawer = false,
  onCloseMobileDrawer,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [feriasVencidas, setFeriasVencidas] = useState(0);
  const [feriasProximasVencer, setFeriasProximasVencer] = useState(0);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (v === '1') setCollapsed(true);
      if (v === '0') setCollapsed(false);
    } catch {
      // ignore
    }
  }, []);

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  // Fetch vacation status for badges
  useEffect(() => {
    const fetchFeriasStatus = async () => {
      try {
        const { vencidos, proximos } = await getFeriasBadgeCounts();
        setFeriasVencidas(vencidos);
        setFeriasProximasVencer(proximos);
      } catch (err) {
        // Silently fail - badges won't show
        console.error('Erro ao buscar status de férias:', err);
      }
    };

    fetchFeriasStatus();

    // Refresh every 5 minutes
    const interval = setInterval(fetchFeriasStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const modules = useMemo(
    () => [
      {
        id: 'folha' as const,
        label: 'Folha de Pagamento',
        icon: Users,
        disabled: false,
      },
      {
        id: 'contas' as const,
        label: 'Contas a Pagar',
        icon: CreditCard,
        disabled: false,
      },
      {
        id: 'agenda' as const,
        label: 'Agenda',
        icon: Calendar,
        disabled: false,
      },
      {
        id: 'ferias' as const,
        label: 'Férias CLT',
        icon: CalendarCheck,
        disabled: false,
        badge:
          feriasVencidas > 0
            ? { count: feriasVencidas, variant: 'danger' as const, pulse: true }
            : feriasProximasVencer > 0
              ? { count: feriasProximasVencer, variant: 'warning' as const }
              : undefined,
      },
      {
        id: 'notificacoes' as const,
        label: 'Notificações',
        icon: Bell,
        disabled: false,
      },
      {
        id: 'rh' as const,
        label: 'Jornada RH',
        icon: UserCheck,
        disabled: false,
      },
    ],
    [feriasVencidas, feriasProximasVencer]
  );

  const containerClass = [
    collapsed ? 'w-20' : 'w-72',
    'h-full relative flex flex-col transition-all duration-300',
    'bg-bg border-r border-base',
    'before:content-[""] before:absolute before:inset-0 before:pointer-events-none',
    'before:bg-[radial-gradient(900px_circle_at_20%_-10%,rgba(139,92,246,0.20),transparent_55%),radial-gradient(700px_circle_at_80%_30%,rgba(6,182,212,0.10),transparent_60%)]',
    'before:opacity-100',
    'after:content-[""] after:absolute after:inset-0 after:pointer-events-none',
    'after:bg-gradient-to-b after:from-white/[0.03] after:via-transparent after:to-black/40',
    isMobileDrawer ? 'shadow-2xl shadow-black/60' : '',
  ].join(' ');

  const handleNav = (next: SidebarNavigate) => {
    onNavigate(next);
    onCloseMobileDrawer?.();
  };

  const activeModuleId: ModuleId = current.module || 'folha';

  return (
    <aside className={containerClass} aria-label="Navegação principal">
      {/* Logo Area */}
      <div className="p-5 border-b border-base">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 flex items-center justify-center shrink-0 rounded-2xl bg-transparent">
            <img src="/logo-LA-colapsed.png" alt="LA" className="w-10 h-10 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-primary font-bold leading-tight truncate uppercase tracking-[0.15em] text-[11px]">
                SUPER FOLHA SYSTEM
              </div>
              <div className="text-[10px] text-muted font-bold truncate tracking-wider opacity-80">
                Sistema Inteligente
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {modules.map((module) => {
          const ModuleIcon = module.icon;
          const isActiveModule = activeModuleId === module.id;

          const button = (
            <button
              type="button"
              onClick={() => {
                if (module.disabled) return;
                handleNav({ module: module.id });
              }}
              disabled={module.disabled}
              className={[
                'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 relative',
                module.disabled
                  ? 'opacity-50 cursor-not-allowed text-muted'
                  : isActiveModule
                    ? 'bg-accent/15 text-accent border border-accent/20 shadow-lg shadow-accent/5'
                    : 'text-secondary hover:bg-surface-2/40 hover:text-primary border border-transparent',
              ].join(' ')}
            >
              <ModuleIcon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm font-bold">{module.label}</span>
                  {module.disabled && (
                    <span className="text-[10px] bg-surface-2 px-2 py-0.5 rounded-full font-bold text-secondary">
                      Em breve
                    </span>
                  )}
                  {(module as any).badge && (
                    <span
                      className={[
                        'min-w-[22px] h-[22px] flex items-center justify-center text-[10px] px-1.5 rounded-full font-black',
                        (module as any).badge.variant === 'danger'
                          ? 'bg-danger/20 text-danger border border-danger/40'
                          : 'bg-warning/20 text-warning border border-warning/40',
                        (module as any).badge.pulse && 'animate-pulse',
                      ].join(' ')}
                    >
                      {(module as any).badge.count}
                    </span>
                  )}
                </>
              )}
              {collapsed && (module as any).badge && (
                <span
                  className={[
                    'absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[9px] px-1 rounded-full font-black',
                    (module as any).badge.variant === 'danger'
                      ? 'bg-danger text-white border-2 border-bg'
                      : 'bg-warning text-white border-2 border-bg',
                    (module as any).badge.pulse && 'animate-pulse',
                  ].join(' ')}
                >
                  {(module as any).badge.count}
                </span>
              )}
            </button>
          );

          return (
            <div key={module.id}>
              {collapsed ? (
                <Tooltip content={module.label} side="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-base">
        <Tooltip content={!collapsed ? 'Editar Perfil' : userLabel} side="right">
          <button
            type="button"
            className={[
              'w-full flex items-center gap-3 rounded-2xl border border-base bg-surface/30 hover:bg-surface/50 hover:border-accent/30 transition-all group/profile',
              collapsed ? 'justify-center p-2.5' : 'p-3',
            ].join(' ')}
            onClick={onEditProfile}
            aria-label="Editar Perfil"
          >
            <div className="w-10 h-10 rounded-full border border-strong overflow-hidden bg-surface/40 shrink-0 group-hover/profile:border-accent/50 transition-colors">
              <img
                src={userAvatarUrl || '/logo-LA-colapsed.png'}
                alt="Usuário"
                className="w-full h-full object-cover group-hover/profile:scale-110 transition-transform duration-300"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo-LA-colapsed.png';
                }}
              />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <div className="text-primary text-sm font-black truncate group-hover/profile:text-accent transition-colors">{userLabel}</div>
                <div className="text-[10px] text-muted font-bold uppercase tracking-widest truncate group-hover/profile:text-secondary">Meu Perfil</div>
              </div>
            )}
          </button>
        </Tooltip>

        <div key="logout">
          {collapsed ? (
            <Tooltip content="Sair" side="right">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2.5 rounded-xl text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2.5 rounded-xl text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-bold">Sair</span>
            </button>
          )}
        </div>
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Collapse Toggle (desktop only) */}
      {!isMobileDrawer && (
        <Tooltip content={collapsed ? 'Expandir' : 'Recolher'} side="right">
          <button
            type="button"
            onClick={() => setCollapsedPersisted(!collapsed)}
            className="absolute top-1/2 -right-3 w-7 h-7 bg-surface border border-strong rounded-full flex items-center justify-center text-secondary hover:text-primary transition-colors"
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </Tooltip>
      )}
    </aside>
  );
};
