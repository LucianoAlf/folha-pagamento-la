import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Cake, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { cn } from '../CollaboratorComponents';
import type { TarefaLista } from '../../types/agenda';
import { Tooltip } from '../UI';

type ListKey = `smart:${string}` | `list:${string}` | 'config';

type ListaItem = TarefaLista & { _key: ListKey };

export const AgendaSidebarListas: React.FC<{
  listasInteligentes: ListaItem[];
  listas: ListaItem[];
  activeKey: ListKey;
  counts: Record<string, number>;
  onSelect: (key: ListKey) => void;
  onOpenConfig: () => void;
  onCreateLista: () => void;
  onEditLista: (lista: TarefaLista) => void;
  onDeleteLista: (lista: TarefaLista) => void;
  isMobile?: boolean;
  aniversariosCount?: number;
}> = ({ listasInteligentes, listas, activeKey, counts, onSelect, onOpenConfig, onCreateLista, onEditLista, onDeleteLista, isMobile, aniversariosCount = 0 }) => {
  return (
    <aside className={cn(
      "shrink-0 flex flex-col h-full transition-all duration-300 bg-bg/95",
      isMobile ? "w-full" : "w-[270px] border-r border-line/70"
    )}>
      {/* Nota UX: removemos o header "Agenda" aqui para não ficar redundante com o módulo Agenda do sidebar principal */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div>
          <div className="px-2 pb-2 text-[10px] text-muted font-black uppercase tracking-[0.2em]">
            Visualizações
          </div>
          <div className="space-y-1">
            {listasInteligentes.map((l) => {
              const isActive = activeKey === l._key;
              const count = counts[l._key] || 0;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onSelect(l._key)}
                  className={cn(
                    'group w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all border',
                    'hover:bg-surface-2/40',
                    isActive ? 'bg-accent/15 text-accent-subtle border-accent/20' : 'text-secondary border-transparent'
                  )}
                >
                  <span className="text-base shrink-0">{l.icone}</span>
                  <span className="min-w-0 flex-1 text-left text-sm font-bold truncate">{l.nome}</span>
                  <span className="ml-auto text-[10px] bg-surface/60 border border-line px-2 py-0.5 rounded-full font-black text-muted">
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Aniversários */}
            <button
              type="button"
              onClick={() => onSelect('smart:aniversarios' as ListKey)}
              className={cn(
                'group w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all border',
                'hover:bg-surface-2/40',
                activeKey === 'smart:aniversarios' ? 'bg-danger/15 text-danger-subtle border-danger/20' : 'text-secondary border-transparent'
              )}
            >
              <span className="text-base shrink-0">🎂</span>
              <span className="min-w-0 flex-1 text-left text-sm font-bold truncate">Aniversários</span>
              <span className="ml-auto text-[10px] bg-surface/60 border border-line px-2 py-0.5 rounded-full font-black text-muted">
                {aniversariosCount}
              </span>
            </button>
          </div>
        </div>

        <div className="border-t border-line/70" />

        <div>
          <div className="px-2 pb-2 text-[10px] text-muted font-black uppercase tracking-[0.2em]">Minhas Listas</div>
          <div className="space-y-1">
            {listas.map((l) => {
              const isActive = activeKey === l._key;
              const count = counts[l._key] || 0;
              const canDelete = !l.is_default; // listas padrão não podem ser deletadas
              return (
                <div
                  key={l.id}
                  className={cn(
                    'group relative w-full flex items-center rounded-2xl transition-all border',
                    'hover:bg-surface-2/40',
                    isActive ? 'bg-accent/10 text-primary border-accent/15' : 'text-secondary border-transparent'
                  )}
                  style={
                    isActive
                      ? { boxShadow: `inset 3px 0 0 0 ${l.cor || '#8b5cf6'}` }
                      : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(l._key)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3"
                  >
                    <span className="text-lg shrink-0">{l.icone}</span>
                    <span className="min-w-0 flex-1 text-left text-sm font-bold truncate">{l.nome}</span>
                  </button>

                  <span className="text-[10px] bg-surface/60 border border-line px-2 py-0.5 rounded-full font-black text-muted mr-1">
                    {count}
                  </span>

                  <Popover.Root>
                    <Tooltip content="Ações" side="top">
                      <Popover.Trigger
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'ml-2 mr-2 w-9 h-9 rounded-xl border flex items-center justify-center transition-all shrink-0',
                          'border-transparent bg-transparent text-muted hover:text-primary hover:bg-surface/40 hover:border-line-strong/60',
                          'opacity-0 group-hover:opacity-100'
                        )}
                        aria-label="Ações da lista"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Popover.Trigger>
                    </Tooltip>
                    <Popover.Portal>
                      <Popover.Content
                        sideOffset={8}
                        align="end"
                          // Precisa ficar acima do Modal (z ~12000/13000)
                          className="z-[20000] w-56 rounded-2xl border border-line bg-bg/95 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-sm font-bold text-secondary hover:bg-surface/60 flex items-center gap-2"
                          onClick={() => onEditLista(l)}
                        >
                          <Pencil className="w-4 h-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={!canDelete}
                          className={cn(
                            'w-full px-4 py-3 text-left text-sm font-bold flex items-center gap-2',
                            canDelete ? 'text-danger-subtle hover:bg-danger/10' : 'text-muted cursor-not-allowed'
                          )}
                          onClick={() => {
                            if (!canDelete) return;
                            onDeleteLista(l);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
              </div>
            );
          })}

            <button
              type="button"
              onClick={() => {
                // Agora habilitado: criação de listas (RLS authenticated)
                // A UI abre modal no container (AgendaPage).
                onCreateLista();
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-2xl transition-all border border-transparent',
                'text-muted hover:text-primary hover:bg-surface-2/30'
              )}
            >
              <Plus className="w-4 h-4" />
              <span className="flex-1 text-left text-sm font-bold">Nova Lista</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted">Criar</span>
            </button>
          </div>
        </div>
      </div>

    </aside>
  );
};

