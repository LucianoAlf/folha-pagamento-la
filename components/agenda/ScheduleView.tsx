import React, { useMemo, useRef, useEffect } from 'react';
import { format, startOfWeek, addDays, startOfDay, isSameDay, parseISO, eachDayOfInterval, endOfWeek, addMinutes, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../CollaboratorComponents';
import { CATEGORIAS, type Tarefa } from '../../types/agenda';
import { Badge, Tooltip } from '../UI';
import { DollarSign } from 'lucide-react';

interface ScheduleViewProps {
  tarefas: Tarefa[];
  viewMode: 'dia' | '3dias' | 'semana';
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onSelectTarefa: (tarefa: Tarefa) => void;
  onDropTarefa?: (tarefaId: string, newDate: Date) => void;
  isMobile?: boolean;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 to 22:00

const WEEKDAY_ABBR: Record<number, string> = {
  1: 'SEG',
  2: 'TER',
  3: 'QUA',
  4: 'QUI',
  5: 'SEX',
  6: 'SÁB',
  0: 'DOM',
};

const PRIORITY_DOTS: Array<{ key: Tarefa['prioridade']; cls: string }> = [
  { key: 'urgente', cls: 'bg-danger' },
  { key: 'alta', cls: 'bg-warning' },
  { key: 'media', cls: 'bg-info' },
  { key: 'baixa', cls: 'bg-surface-3' },
];

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  tarefas,
  viewMode,
  selectedDate,
  onSelectDate,
  onSelectTarefa,
  onDropTarefa,
  isMobile
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Apenas habilitar swipe se estiver no mobile e não estiver arrastando uma tarefa
    if (!isMobile) return;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || touchStart.current === null) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart.current - touchEnd;
    const threshold = 60; // Sensibilidade do swipe

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe para a esquerda -> Próximo período
        const daysToMove = viewMode === 'dia' ? 1 : viewMode === '3dias' ? 3 : 7;
        onSelectDate(addDays(selectedDate, daysToMove));
      } else {
        // Swipe para a direita -> Período anterior
        const daysToMove = viewMode === 'dia' ? 1 : viewMode === '3dias' ? 3 : 7;
        onSelectDate(addDays(selectedDate, -daysToMove));
      }
    }
    touchStart.current = null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, day: Date, hour: number) => {
    e.preventDefault();
    const tarefaId = e.dataTransfer.getData('text/plain');
    if (!tarefaId || !onDropTarefa) return;

    // Calcular minutos exatos se possível (80px por hora)
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutesOffset = Math.floor((offsetY / 80) * 60);
    
    // Arredondar para 15 ou 30 min para facilitar
    const roundedMinutes = Math.round(minutesOffset / 15) * 15;
    
    const newDate = addMinutes(addDays(startOfDay(day), 0), (hour - 0) * 60 + roundedMinutes);
    onDropTarefa(tarefaId, newDate);
  };

  // Determinar os dias visíveis
  const days = useMemo(() => {
    if (viewMode === 'dia') return [startOfDay(selectedDate)];
    if (viewMode === '3dias') {
      return [0, 1, 2].map(i => addDays(startOfDay(selectedDate), i));
    }
    // Semana começa na segunda
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(selectedDate, { weekStartsOn: 1 }) });
  }, [selectedDate, viewMode]);

  // Filtrar tarefas que têm horário e pertencem aos dias visíveis
  const scheduledTasks = useMemo(() => {
    return tarefas.filter(t => {
      if (!t.vencimento_em || t.dia_inteiro) return false;
      const date = parseISO(t.vencimento_em);
      return days.some(d => isSameDay(d, date));
    });
  }, [tarefas, days]);

  // Tarefas de dia inteiro
  const allDayTasks = useMemo(() => {
    return tarefas.filter(t => {
      if (!t.vencimento_em || !t.dia_inteiro) return false;
      const date = parseISO(t.vencimento_em);
      return days.some(d => isSameDay(d, date));
    });
  }, [tarefas, days]);

  // Scroll para a hora atual ou 08:00 no início
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= 8 && currentHour <= 22) {
        const hourHeight = 80;
        const scrollPos = (currentHour - 8) * hourHeight;
        scrollRef.current.scrollTop = scrollPos - 100;
      }
    }
  }, []);

  return (
    <div 
      className="flex flex-col h-full bg-bg/40 rounded-3xl border border-base/60 overflow-hidden backdrop-blur-md"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Date Strip / Header */}
      <div className="flex border-b border-base/60 bg-surface/40 sticky top-0 z-20">
        {/* Espaço para a coluna de horas */}
        <div className="w-12 md:w-20 shrink-0 border-r border-base/60 flex flex-col items-center justify-center text-[10px] font-black text-muted uppercase tracking-widest">
          {isMobile ? '' : 'GMT-3'}
        </div>
        
        <div
          className={cn(
            "flex-1 flex overflow-x-auto md:overflow-x-hidden scrollbar-hide",
            isMobile && "overflow-x-hidden"
          )}
        >
          {days.map((day, idx) => (
            (() => {
              const tasksInDay = tarefas.filter((t) => {
                if (!t.vencimento_em) return false;
                if ((t as any).status === 'cancelada') return false;
                return isSameDay(parseISO(t.vencimento_em), day);
              });
              const dotClasses = PRIORITY_DOTS
                .filter((p) => tasksInDay.some((t) => t.prioridade === p.key))
                .map((p) => p.cls);

              return (
            <div 
              key={day.toISOString()} 
              className={cn(
                "flex-1 min-w-0 py-4 flex flex-col items-center justify-center gap-1 border-r border-base/60 last:border-r-0 transition-colors md:min-w-[100px]",
                isToday(day) && "bg-accent/5"
              )}
            >
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                isToday(day) ? "text-accent" : "text-muted"
              )}>
                {WEEKDAY_ABBR[day.getDay()]}
              </span>
              <button
                onClick={() => onSelectDate(day)}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  isToday(day) && !isSameDay(day, selectedDate) && "text-accent border border-accent/30",
                  isSameDay(day, selectedDate)
                    ? "bg-accent text-white shadow-lg shadow-accent/40 scale-105"
                    : "text-secondary hover:bg-surface-2"
                )}
              >
                {format(day, 'd')}
              </button>

              {/* Pontinhos indicativos embaixo (estilo Google) */}
              <div className="mt-2 h-2 flex items-center justify-center gap-1">
                {dotClasses.slice(0, 3).map((c, i) => (
                  <div key={`${day.toISOString()}:dot:${i}`} className={cn('w-1.5 h-1.5 rounded-full', c)} />
                ))}
                {dotClasses.length > 3 ? <div className="w-1.5 h-1.5 rounded-full bg-secondary/70" /> : null}
              </div>
            </div>
              );
            })()
          ))}
        </div>
      </div>

      {/* All-day tasks strip */}
      {allDayTasks.length > 0 && (
        <div className="flex border-b border-base/60 bg-surface/20">
          <div className="w-12 md:w-20 shrink-0 border-r border-base/60 flex items-center justify-center text-[9px] font-black text-muted uppercase tracking-widest">
            DIA
          </div>
          <div className="flex-1 flex overflow-x-auto md:overflow-x-hidden scrollbar-hide">
            {days.map((day) => {
              const dayAllDay = allDayTasks.filter((t) => isSameDay(parseISO(t.vencimento_em!), day));
              return (
                <div key={`allday-${day.toISOString()}`} className="flex-1 min-w-0 border-r border-base/40 last:border-r-0 p-1 md:min-w-[100px]">
                  {dayAllDay.length === 0 ? (
                    <div className="h-6" />
                  ) : (
                    <div className="space-y-0.5">
                      {dayAllDay.slice(0, 3).map((t) => {
                        const isConta = t.vinculo_tipo === 'conta_pagar' && t.status !== 'concluida';
                        const isFinanceiro = t.categoria === 'financeiro';
                        const handleAllDayClick = () => {
                          if (isConta && t.vinculo_id) {
                            window.dispatchEvent(
                              new CustomEvent('agenda:quickpay', {
                                detail: { tarefaId: t.id, contaId: t.vinculo_id },
                              })
                            );
                          } else {
                            onSelectTarefa(t);
                          }
                        };
                        return (
                          <Tooltip key={t.id} content={
                            <div>
                              <div className="font-bold text-xs">{t.titulo}</div>
                              {isConta && <div className="text-[10px] text-success-subtle mt-0.5">Clique para pagar</div>}
                            </div>
                          } side="bottom">
                            <button
                              type="button"
                              onClick={handleAllDayClick}
                              className={cn(
                                'w-full text-left px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold leading-tight truncate border-l-2 transition-all hover:brightness-110',
                                t.status === 'concluida'
                                  ? 'bg-success/30 text-success-subtle border-success'
                                  : isConta
                                    ? 'bg-success/40 text-success-subtle border-success'
                                    : isFinanceiro
                                      ? 'bg-accent/30 text-accent-subtle border-accent'
                                      : 'bg-surface-2/60 text-secondary border-surface-3'
                              )}
                            >
                              {(isConta || isFinanceiro) && <DollarSign size={10} className="inline mr-0.5 -mt-0.5" />}
                              {t.titulo}
                            </button>
                          </Tooltip>
                        );
                      })}
                      {dayAllDay.length > 3 && (
                        <div className="text-[8px] font-black text-muted px-1">+{dayAllDay.length - 3}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de Horários */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-surface-2 scrollbar-track-transparent"
      >
        <div className="flex min-h-full" style={{ height: HOURS.length * 80 }}>
          {/* Coluna de Horas */}
          <div className="w-12 md:w-20 shrink-0 border-r border-base/60 bg-surface/20">
            {HOURS.map(hour => (
              <div
                key={hour}
                className="h-20 border-b border-base/40 flex items-start justify-center pt-2 text-[10px] md:text-[11px] font-black text-muted"
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Colunas de Dias */}
          <div className="flex-1 flex relative">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="flex-1 min-w-0 border-r border-base/40 last:border-r-0 relative md:min-w-[100px]"
              >
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="h-20 border-b border-base/40 transition-colors hover:bg-accent/5"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day, hour)}
                  />
                ))}

                {/* Tarefas deste dia */}
                {(() => {
                  const dayTasks = scheduledTasks
                    .filter(t => isSameDay(parseISO(t.vencimento_em!), day))
                    .sort((a, b) => (a.vencimento_em || '').localeCompare(b.vencimento_em || ''));

                  // Agrupamento para detecção de colisão (Premium)
                  const groups: Tarefa[][] = [];
                  dayTasks.forEach(task => {
                    const taskStart = parseISO(task.vencimento_em!);
                    const taskEnd = addMinutes(taskStart, 60); // 1h padrão

                    let placed = false;
                    for (const group of groups) {
                      const overlaps = group.some(gTask => {
                        const gStart = parseISO(gTask.vencimento_em!);
                        const gEnd = addMinutes(gStart, 60);
                        return taskStart < gEnd && taskEnd > gStart;
                      });

                      if (overlaps) {
                        group.push(task);
                        placed = true;
                        break;
                      }
                    }
                    if (!placed) groups.push([task]);
                  });

                  return dayTasks.map(t => {
                    const date = parseISO(t.vencimento_em!);
                    const startMin = (date.getHours() - 8) * 60 + date.getMinutes();
                    const duration = 60; 
                    
                    const top = (startMin / 60) * 80;
                    const height = (duration / 60) * 80;

                    if (date.getHours() < 8 || date.getHours() > 22) return null;

                    // Encontrar o grupo e a posição
                    const group = groups.find(g => g.includes(t)) || [t];
                    const colCount = group.length;
                    const colIndex = group.indexOf(t);
                    
                    // Cálculo de largura e esquerda
                    const widthPct = 100 / colCount;
                    const leftPct = colIndex * widthPct;

                    const isFinanceiro = t.categoria === 'financeiro' || (t as any).lista?.nome?.toLowerCase().includes('finance');

                    const isConta = t.vinculo_tipo === 'conta_pagar' && t.status !== 'concluida' && !!t.vinculo_id;
                    const handleScheduledClick = () => {
                      if (isConta) {
                        window.dispatchEvent(
                          new CustomEvent('agenda:quickpay', {
                            detail: { tarefaId: t.id, contaId: t.vinculo_id },
                          })
                        );
                      } else {
                        onSelectTarefa(t);
                      }
                    };

                    return (
                      <Tooltip
                        key={t.id}
                        content={
                          <div className="p-1">
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
                              {format(date, 'HH:mm')}
                            </div>
                            <div className="font-bold text-xs">{t.titulo}</div>
                            {isConta && <div className="text-[10px] text-success-subtle mt-0.5">Clique para pagar</div>}
                            {!isConta && t.descricao && <div className="text-[10px] text-muted mt-1 line-clamp-2">{t.descricao}</div>}
                          </div>
                        }
                        side="top"
                      >
                        <div
                          onClick={handleScheduledClick}
                          className={cn(
                            "absolute rounded-lg p-1.5 border-l-2 shadow-xl cursor-pointer transition-all hover:scale-[1.02] hover:z-10 group overflow-hidden md:rounded-xl md:p-2 md:border-l-4",
                            CATEGORIAS[t.categoria]?.bg || "bg-surface-2/80",
                            CATEGORIAS[t.categoria]?.text || "text-secondary"
                          )}
                          style={{ 
                            top: `${top}px`, 
                            height: `${height}px`,
                            left: `${leftPct}%`,
                            width: `calc(${widthPct}% - 2px)`,
                            borderLeftColor: CATEGORIAS[t.categoria]?.cor || '#8b5cf6',
                            backgroundColor: `${CATEGORIAS[t.categoria]?.cor}20` || 'rgba(139, 92, 246, 0.1)',
                            backdropFilter: 'blur(4px)',
                            zIndex: colIndex + 1,
                            border: '1px solid rgba(255,255,255,0.1)', // Garantir borda visível
                          }}
                        >
                          <div className="flex flex-col h-full">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="text-[8px] font-black opacity-60 flex items-center gap-1 md:text-[10px]">
                                {format(date, 'HH:mm')}
                                {t.status === 'concluida' && <span className="text-success">✓</span>}
                              </span>
                              {isFinanceiro && <DollarSign size={10} className="text-success shrink-0" />}
                            </div>
                            <span className="text-[9px] font-black leading-tight mt-0.5 line-clamp-2 md:text-[11px]">
                              {t.titulo}
                            </span>
                            {height > 40 && t.unidade && (
                              <div className="mt-auto flex justify-end">
                                <span className="text-[8px] font-black uppercase tracking-widest bg-black/20 px-1.5 py-0.5 rounded">
                                  {t.unidade}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Tooltip>
                    );
                  });
                })()}
              </div>
            ))}

            {/* Linha do Tempo Atual */}
            {days.some(d => isToday(d)) && (
              <TimeIndicator />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TimeIndicator: React.FC = () => {
  const [now, setNow] = React.useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const min = now.getMinutes();

  if (hour < 8 || hour > 22) return null;

  const top = ((hour - 8) * 60 + min) / 60 * 80;

  return (
    <div 
      className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
      style={{ top: `${top}px` }}
    >
      <div className="w-2 h-2 rounded-full bg-danger -ml-1 shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
      <div className="flex-1 h-0.5 bg-danger shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
    </div>
  );
};
