import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  CreditCard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
} from 'lucide-react';

const SIDEBAR_COLLAPSED_KEY = 'la-music-sidebar-collapsed';

type ModuleId = 'folha' | 'contas' | 'agenda';
type FolhaPageId = 'dashboard' | 'colaboradores' | 'lancamentos' | 'comparativo';

export interface SidebarNavigate {
  module: ModuleId;
  page?: FolhaPageId | string;
}

export interface SidebarProps {
  current: SidebarNavigate;
  onNavigate: (next: SidebarNavigate) => void;
  onLogout: () => void;
  userLabel: string;
  userAvatarUrl?: string | null;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  current,
  onNavigate,
  onLogout,
  userLabel,
  userAvatarUrl,
  isMobileDrawer = false,
  onCloseMobileDrawer,
}) => {
  const [collapsed, setCollapsed] = useState(false);

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
        disabled: true,
      },
      {
        id: 'agenda' as const,
        label: 'Agenda',
        icon: Calendar,
        disabled: true,
      },
    ],
    []
  );

  const containerClass = [
    collapsed ? 'w-20' : 'w-72',
    'h-full bg-[#0a0d14] border-r border-slate-800/80 flex flex-col transition-all duration-300 relative',
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
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <img src="/logo-LA-colapsed.png" alt="LA" className="w-10 h-10 object-contain drop-shadow-2xl" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-white font-black leading-tight truncate uppercase tracking-tight text-sm">
                SUPER FOLHA SYSTEM
              </div>
              <div className="text-xs text-slate-500 font-bold truncate">Sistema Inteligente</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {modules.map((module) => {
          const ModuleIcon = module.icon;
          const isActiveModule = activeModuleId === module.id;

          return (
            <div key={module.id}>
              <button
                type="button"
                onClick={() => {
                  if (module.disabled) return;
                  handleNav({ module: module.id });
                }}
                disabled={module.disabled}
                className={[
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200',
                  module.disabled
                    ? 'opacity-50 cursor-not-allowed text-slate-500'
                    : isActiveModule
                      ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-white border border-transparent',
                ].join(' ')}
              >
                <ModuleIcon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left text-sm font-bold">{module.label}</span>
                    {module.disabled && (
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full font-bold text-slate-400">
                        Em breve
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800/80">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden bg-slate-900/40 shrink-0">
              <img
                src={userAvatarUrl || '/logo-LA-colapsed.png'}
                alt="Usuário"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo-LA-colapsed.png';
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-sm font-black truncate">{userLabel}</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">Acesso</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="text-sm font-bold">Sair</span>}
        </button>
      </div>

      {/* Collapse Toggle (desktop only) */}
      {!isMobileDrawer && (
        <button
          type="button"
          onClick={() => setCollapsedPersisted(!collapsed)}
          className="absolute top-1/2 -right-3 w-7 h-7 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          title={collapsed ? 'Expandir' : 'Recolher'}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      )}
    </aside>
  );
};

