import React from 'react';
import { Bell, Calendar, Columns3, LayoutGrid, LayoutList, Settings } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';

export type AgendaMode = 'tarefas' | 'config';
export type AgendaViewMode = 'lista' | 'cards' | 'kanban' | 'calendario';

export const AgendaHeader: React.FC<{
  leftIcon?: React.ReactNode;
  accentColor?: string;
  title: string;
  subtitle?: string | null;
  mode: AgendaMode;
  viewMode: AgendaViewMode;
  onChangeViewMode: (m: AgendaViewMode) => void;
  onOpenConfig: () => void;
  rightSlot?: React.ReactNode;
}> = ({ leftIcon, accentColor = '#8b5cf6', title, subtitle, mode, viewMode, onChangeViewMode, onOpenConfig, rightSlot }) => {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {leftIcon ? (
            <div className="text-[1.6rem] leading-none select-none drop-shadow-sm hover:scale-110 transition-transform cursor-default py-0.5">
              {leftIcon}
            </div>
          ) : null}
          <h2 className="text-2xl font-black text-white truncate tracking-tight">{title}</h2>
          {rightSlot}
        </div>
        {subtitle ? <p className="text-sm text-slate-500 font-bold mt-1 tracking-wide">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {mode === 'tarefas' ? (
          <div className="flex items-center gap-1 p-1 rounded-2xl border border-slate-800 bg-slate-900/95">
            <Tooltip content="Lista" side="bottom">
              <button
                type="button"
                onClick={() => onChangeViewMode('lista')}
                className={cn(
                  'h-10 px-3 rounded-xl border flex items-center gap-2 transition-all',
                  viewMode === 'lista'
                    ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                )}
                aria-label="Lista"
              >
                <LayoutList className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-black">Lista</span>
              </button>
            </Tooltip>

            <Tooltip content="Cards" side="bottom">
              <button
                type="button"
                onClick={() => onChangeViewMode('cards')}
                className={cn(
                  'h-10 px-3 rounded-xl border flex items-center gap-2 transition-all',
                  viewMode === 'cards'
                    ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                )}
                aria-label="Cards"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-black">Cards</span>
              </button>
            </Tooltip>

            <Tooltip content="Kanban" side="bottom">
              <button
                type="button"
                onClick={() => onChangeViewMode('kanban')}
                className={cn(
                  'h-10 px-3 rounded-xl border flex items-center gap-2 transition-all',
                  viewMode === 'kanban'
                    ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                )}
                aria-label="Kanban"
              >
                <Columns3 className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-black">Kanban</span>
              </button>
            </Tooltip>

            <Tooltip content="Calendário" side="bottom">
              <button
                type="button"
                onClick={() => onChangeViewMode('calendario')}
                className={cn(
                  'h-10 px-3 rounded-xl border flex items-center gap-2 transition-all',
                  viewMode === 'calendario'
                    ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                )}
                aria-label="Calendário"
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-black">Calendário</span>
              </button>
            </Tooltip>
          </div>
        ) : null}

        <Tooltip content="Configurações" side="bottom">
          <button
            type="button"
            onClick={onOpenConfig}
            className={cn(
              'w-11 h-11 rounded-2xl border flex items-center justify-center transition-all',
              mode === 'config'
                ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                : 'bg-slate-900/20 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40'
            )}
            aria-label="Configurações"
          >
            <Settings className="w-5 h-5" />
          </button>
        </Tooltip>

        <Tooltip content="Notificações" side="bottom">
          <button
            type="button"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
              } catch {
                // ignore
              }
            }}
            className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-400 hover:text-white hover:bg-slate-900/40 flex items-center justify-center transition-all"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

