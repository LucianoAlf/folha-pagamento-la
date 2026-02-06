import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, CustomSelect, DatePicker, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import {
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { Tarefa, TarefaLista } from '../../types/agenda';
import type { Categoria, Prioridade } from '../../types/agenda';
import { CATEGORIAS, PRIORIDADES } from '../../types/agenda';
import { categoriaIcon, listaIcon, prioridadeIcon } from './agendaIcons';
import {
  createSubtarefa,
  deleteSubtarefa,
  toggleSubtarefa,
  updateTarefa,
  deleteTarefa,
  concluirTarefa,
  reabrirTarefa,
} from '../../services/agendaService';
import { SubtarefaItem } from './SubtarefaItem';

const navigateTo = (module: 'folha' | 'contas' | 'agenda' | 'notificacoes', page?: string) => {
  window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module, page } }));
};

const toDatePart = (iso?: string | null) => {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return undefined;
  }
};

const toTimePart = (iso?: string | null) => {
  if (!iso) return '09:00';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '09:00';
  }
};

export const TarefaDetailPanel: React.FC<{
  tarefa: Tarefa;
  listas: TarefaLista[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  compact?: boolean;
}> = ({ tarefa, listas, onClose, onSaved, onDeleted, compact = false }) => {
  const [draft, setDraft] = useState<Tarefa>(tarefa);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const [newSub, setNewSub] = useState('');

  // sync when selection changes
  useEffect(() => {
    setDraft(tarefa);
    setError(null);
    setNewSub('');
  }, [tarefa.id]);

  const datePart = useMemo(() => toDatePart(draft.vencimento_em), [draft.vencimento_em]);
  const timePart = useMemo(() => toTimePart(draft.vencimento_em), [draft.vencimento_em]);

  const prioridadeOptions = useMemo(
    () =>
      (Object.keys(PRIORIDADES) as Prioridade[]).map((p) => ({
        value: p,
        label: `${PRIORIDADES[p].label}`,
        icon: prioridadeIcon(p),
      })),
    []
  );

  const categoriaOptions = useMemo(
    () =>
      (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({
        value: c,
        label: `${CATEGORIAS[c].label}`,
        icon: categoriaIcon(c),
      })),
    []
  );

  const listaOptions = useMemo(
    () =>
      listas
        .filter((l) => !l.is_smart)
        .map((l) => ({ value: l.id, label: `${l.nome}`, icon: listaIcon(l) })),
    [listas]
  );

  const unidadeOptions = useMemo(
    () => [
      { value: '', label: 'Sem unidade' },
      { value: 'cg', label: 'Campo Grande' },
      { value: 'rec', label: 'Recreio' },
      { value: 'bar', label: 'Barra' },
      { value: 'todas', label: 'Todas' },
    ],
    []
  );

  const scheduleSave = (next: Partial<Tarefa>) => {
    setDraft((p) => ({ ...p, ...next }));
    setSaved(false);
    setError(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const patch: any = {
          titulo: next.titulo ?? undefined,
          descricao: next.descricao ?? undefined,
          lista_id: next.lista_id ?? undefined,
          prioridade: next.prioridade ?? undefined,
          categoria: next.categoria ?? undefined,
          unidade: next.unidade ?? undefined,
          vencimento_em: next.vencimento_em ?? undefined,
          dia_inteiro: typeof next.dia_inteiro === 'boolean' ? next.dia_inteiro : undefined,
          lembrete_minutos: next.lembrete_minutos ?? undefined,
        };
        // remove undefined keys
        Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

        await updateTarefa(tarefa.id, patch);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        onSaved();
      } catch (e: any) {
        setError(e?.message || 'Falha ao salvar');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const setDue = (nextDate?: string, nextTime?: string, diaInteiro?: boolean) => {
    if (!nextDate) {
      scheduleSave({ vencimento_em: null, dia_inteiro: !!diaInteiro });
      return;
    }
    const t = diaInteiro ? '09:00' : nextTime || '09:00';
    const d = new Date(`${nextDate}T${t}:00`);
    scheduleSave({ vencimento_em: d.toISOString(), dia_inteiro: !!diaInteiro });
  };

  const containerClass = cn(
    compact ? 'w-full' : 'w-[400px]',
    'shrink-0 border-l border-slate-800/70 bg-slate-950/95 h-full'
  );

  return (
    <aside className={containerClass}>
      <div className="h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800/70 bg-slate-950/30 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white font-black truncate">Detalhes</div>
            <div className="flex items-center gap-2 mt-1">
              {saving ? <Badge variant="info">Salvando…</Badge> : null}
              {saved ? <Badge variant="success">Salvo</Badge> : null}
              {error ? <Badge variant="danger">Erro</Badge> : null}
            </div>
          </div>
          <Tooltip content="Fechar" side="left">
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-300 hover:text-white hover:bg-slate-900/40 flex items-center justify-center transition-all"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Title + done */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={async () => {
                  if (draft.status === 'concluida') await reabrirTarefa(draft.id);
                  else await concluirTarefa(draft.id);
                  onSaved();
                }}
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 shrink-0',
                  draft.status === 'concluida' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-violet-400'
                )}
                aria-label={draft.status === 'concluida' ? 'Reabrir tarefa' : 'Concluir tarefa'}
              >
                {draft.status === 'concluida' ? <Check className="w-4 h-4 text-white" /> : null}
              </button>
              <input
                value={draft.titulo}
                onChange={(e) => scheduleSave({ titulo: e.target.value })}
                className={cn(
                  'w-full bg-transparent border border-slate-800/60 rounded-2xl px-4 py-3 text-white font-black outline-none focus:ring-2 focus:ring-violet-500/50',
                  draft.status === 'concluida' ? 'line-through text-slate-400' : ''
                )}
              />
            </div>
          </div>

          {/* Linked actions (premium) */}
          {draft.vinculo_tipo && draft.vinculo_id ? (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
                Ações rápidas
              </div>

              {draft.vinculo_tipo === 'conta_pagar' ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('agenda:quickpay', {
                          detail: { tarefaId: draft.id, contaId: String(draft.vinculo_id) }
                        })
                      );
                    }}
                    className="w-full px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10"
                  >
                    <CreditCard className="w-4 h-4" />
                    Registrar pagamento
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('contas', 'visao-geral')}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 text-slate-200 font-black flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                    Ir para Contas a Pagar
                  </button>
                </div>
              ) : draft.vinculo_tipo === 'folha_pagamento' ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('folha', 'dashboard')}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 text-slate-200 font-black flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                    Ir para Folha de Pagamento
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Due */}
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              <Clock className="w-3.5 h-3.5" />
              Vencimento
            </div>
            <div className="grid grid-cols-1 gap-2">
              <DatePicker value={datePart} onChange={(d) => setDue(d, timePart, draft.dia_inteiro)} placeholder="Sem data" />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <input
                    type="checkbox"
                    checked={draft.dia_inteiro}
                    onChange={(e) => setDue(datePart, timePart, e.target.checked)}
                    className="accent-violet-500"
                  />
                  Dia inteiro
                </label>
                {!draft.dia_inteiro ? (
                  <input
                    type="time"
                    value={timePart}
                    onChange={(e) => setDue(datePart, e.target.value, draft.dia_inteiro)}
                    className="flex-1 bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* Priority + Category */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Prioridade</div>
              <CustomSelect
                value={draft.prioridade}
                onValueChange={(v) => scheduleSave({ prioridade: v as any })}
                options={prioridadeOptions}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Categoria</div>
              <CustomSelect
                value={draft.categoria}
                onValueChange={(v) => scheduleSave({ categoria: v as any })}
                options={categoriaOptions}
              />
            </div>
          </div>

          {/* Unit + List */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Unidade</div>
              <CustomSelect
                value={draft.unidade || ''}
                onValueChange={(v) => scheduleSave({ unidade: (v || null) as any })}
                options={unidadeOptions}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Lista</div>
              <CustomSelect
                value={draft.lista_id || ''}
                onValueChange={(v) => scheduleSave({ lista_id: (v || null) as any })}
                options={[{ value: '', label: 'Sem lista' }, ...listaOptions]}
              />
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Subtarefas</div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter') return;
                  const titulo = newSub.trim();
                  if (!titulo) return;
                  setNewSub('');
                  await createSubtarefa({ tarefa_id: draft.id, titulo, ordem: (draft.subtarefas?.length || 0) });
                  onSaved();
                }}
                placeholder="Adicionar subtarefa…"
                className="flex-1 bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <button
                type="button"
                onClick={async () => {
                  const titulo = newSub.trim();
                  if (!titulo) return;
                  setNewSub('');
                  await createSubtarefa({ tarefa_id: draft.id, titulo, ordem: (draft.subtarefas?.length || 0) });
                  onSaved();
                }}
                className="w-11 h-11 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0"
                aria-label="Adicionar subtarefa"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {(draft.subtarefas || []).length === 0 ? (
                <div className="text-sm text-slate-500 font-bold">Sem checklist.</div>
              ) : (
                (draft.subtarefas || [])
                  .slice()
                  .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                  .map((s) => (
                    <SubtarefaItem
                      key={s.id}
                      item={s}
                      onToggle={(next) => toggleSubtarefa(s.id, next).then(onSaved)}
                      onDelete={() => deleteSubtarefa(s.id).then(onSaved)}
                    />
                  ))
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Descrição</div>
            <textarea
              value={draft.descricao || ''}
              onChange={(e) => scheduleSave({ descricao: e.target.value })}
              spellCheck={false}
              className="w-full min-h-[110px] bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              placeholder="Detalhes, contexto, links, passos…"
            />
          </div>

          {/* Reminders */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Lembrete</div>
            <CustomSelect
              value={String((draft.lembrete_minutos || [30])[0] ?? 30)}
              onValueChange={(v) => scheduleSave({ lembrete_minutos: [Number(v) || 30] } as any)}
              options={[
                { value: '0', label: 'Sem lembrete' },
                { value: '10', label: '10 minutos antes' },
                { value: '30', label: '30 minutos antes' },
                { value: '60', label: '1 hora antes' },
                { value: '180', label: '3 horas antes' },
                { value: '1440', label: '1 dia antes' },
              ]}
            />
            <div className="text-xs text-slate-500 font-bold mt-2 flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5" />
              Envio via WhatsApp será implementado na próxima fase (cron + Edge Function).
            </div>
          </div>

          {/* Danger */}
          <div className="pt-2 border-t border-slate-800/70">
            <button
              type="button"
              onClick={async () => {
                await deleteTarefa(draft.id);
                onDeleted();
              }}
              className="w-full px-4 py-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 text-rose-200 font-black flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir tarefa
            </button>
          </div>

          {/* Meta */}
          <div className="text-[10px] text-slate-600 font-bold">
            Criada em {new Date(draft.created_at).toLocaleString('pt-BR')}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-800/70 bg-slate-950/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
            <Save className="w-4 h-4" />
            Auto-save (500ms)
          </div>
          {error ? <div className="text-xs font-bold text-rose-300">{error}</div> : null}
        </div>
      </div>
    </aside>
  );
};

