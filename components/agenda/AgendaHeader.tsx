import { Bell, Calendar, Columns3, LayoutGrid, LayoutList, Menu, Palette, Settings } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';

export type AgendaMode = 'tarefas' | 'config';
export type AgendaViewMode = 'lista' | 'cards' | 'kanban' | 'mes' | 'calendario' | 'semana' | '3dias' | 'dia';

export const AgendaHeader: React.FC<{
  leftIcon?: React.ReactNode;
  accentColor?: string;
  title: string;
  subtitle?: string | null;
  mode: AgendaMode;
  viewMode: AgendaViewMode;
  onChangeViewMode: (m: AgendaViewMode) => void;
  onOpenConfig: () => void;
  onGoToToday?: () => void;
  rightSlot?: React.ReactNode;
  isMobile?: boolean;
  onOpenMobileSidebar?: () => void;
}> = ({ leftIcon, accentColor = '#8b5cf6', title, subtitle, mode, viewMode, onChangeViewMode, onOpenConfig, onGoToToday, rightSlot, isMobile, onOpenMobileSidebar }) => {
  const scheduleTabs = ['dia', '3dias', 'semana'] as const;
  const scheduleIndex = scheduleTabs.indexOf(viewMode as any);
  const isScheduleView = scheduleIndex >= 0;
  
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex items-start gap-3">
        {isMobile && (
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all shrink-0"
            aria-label="Abrir menu lateral"
          >
            <Menu size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {leftIcon && !isMobile ? (
              <div className="text-[1.6rem] leading-none select-none drop-shadow-sm hover:scale-110 transition-transform cursor-default py-0.5">
                {leftIcon}
              </div>
            ) : null}
            <h2 className="text-xl md:text-2xl font-black text-white truncate tracking-tight uppercase md:normal-case">{title}</h2>
            {rightSlot}
            
            {onGoToToday && (
              <button
                onClick={onGoToToday}
                className="ml-2 px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/40 text-[10px] font-black uppercase text-slate-400 hover:text-white hover:border-slate-700 transition-all"
              >
                Hoje
              </button>
            )}
          </div>
          {subtitle ? <p className="text-[11px] md:text-sm text-slate-500 font-bold mt-1 tracking-wide line-clamp-1">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full md:w-auto">
        {mode === 'tarefas' ? (
          <>
            {/* Linha principal: Lista / Mês + Ações na mesma linha */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl flex-1 min-w-[220px] md:flex-none">
                <button
                  type="button"
                  onClick={() => onChangeViewMode('lista')}
                  className={cn(
                    'flex-1 h-9 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all md:flex-none',
                    viewMode === 'lista'
                      ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                      : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                  )}
                >
                  <LayoutList className="w-4 h-4" />
                  <span className="text-xs font-black">Lista</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeViewMode('mes')}
                  className={cn(
                    'flex-1 h-9 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all md:flex-none',
                    viewMode === 'mes'
                      ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                      : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                  )}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="text-xs font-black">Mês</span>
                </button>

                {!isMobile && (
                  <>
                    <div className="h-6 w-px bg-slate-800 mx-1" />
                    <button
                      type="button"
                      onClick={() => onChangeViewMode('kanban')}
                      className={cn(
                        'h-9 px-3 rounded-xl border flex items-center gap-2 transition-all',
                        viewMode === 'kanban'
                          ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                          : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
                      )}
                    >
                      <Columns3 className="w-4 h-4" />
                      <span className="text-xs font-black">Kanban</span>
                    </button>
                  </>
                )}
              </div>

              {/* Ações (engrenagem + sininho) alinhadas na mesma linha */}
              <div className="flex items-center gap-2">
                <Tooltip content="Configurações" side="bottom">
                  <button
                    type="button"
                    onClick={onOpenConfig}
                    className={cn(
                      'w-10 h-10 md:w-11 md:h-11 rounded-2xl border flex items-center justify-center transition-all',
                      // Este botão só é renderizado no modo 'tarefas' (ternário acima),
                      // então sempre exibe o estilo inativo.
                      'bg-slate-900/20 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40'
                    )}
                    aria-label="Configurações"
                  >
                    {isMobile ? <Palette className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
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
                    className="w-10 h-10 md:w-11 md:h-11 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-400 hover:text-white hover:bg-slate-900/40 flex items-center justify-center transition-all"
                    aria-label="Notificações"
                  >
                    <Bell className="w-5 h-5" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Linha secundária: visões de horário (sem scroll) */}
            <div className="relative p-1 rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl w-full overflow-hidden">
              {isScheduleView ? (
                <div
                  className="absolute top-1 bottom-1 rounded-xl bg-violet-600/25 border border-violet-500/25 shadow-lg shadow-violet-600/10 transition-all duration-200 ease-out"
                  style={{
                    width: 'calc((100% - 1rem) / 3)',
                    left: `calc(0.25rem + ${scheduleIndex} * (((100% - 1rem) / 3) + 0.25rem))`,
                  }}
                />
              ) : null}

              <div className="relative z-10 grid grid-cols-3 gap-1">
                {[
                  { id: 'dia', label: 'Dia' },
                  { id: '3dias', label: '3 Dias' },
                  { id: 'semana', label: 'Semana' },
                ].map((v) => {
                  const active = viewMode === (v.id as any);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onChangeViewMode(v.id as any)}
                      className={cn(
                        'h-9 rounded-xl border border-transparent flex items-center justify-center transition-colors',
                        active ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                      )}
                      aria-label={v.label}
                    >
                      <span className="text-[10px] md:text-xs font-black uppercase md:normal-case">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

