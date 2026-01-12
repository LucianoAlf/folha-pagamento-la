import React, { useMemo, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { CustomSelect, DatePicker, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { TarefaLista } from '../../types/agenda';
import type { Categoria, Prioridade } from '../../types/agenda';
import { CATEGORIAS, PRIORIDADES } from '../../types/agenda';
import { createTarefa } from '../../services/agendaService';
import { TemplatesModal } from './TemplatesModal';
import { categoriaIcon, prioridadeIcon } from './agendaIcons';

type ListKey = `smart:${string}` | `list:${string}` | 'config';

const guessCategoriaFromLista = (nome?: string | null): Categoria => {
  const n = (nome || '').toLowerCase();
  if (n.includes('finance')) return 'financeiro';
  if (n === 'rh' || n.includes('rh')) return 'rh';
  if (n.includes('admin')) return 'administrativo';
  if (n.includes('pessoal')) return 'pessoal';
  return 'geral';
};

export const TarefaQuickAdd: React.FC<{
  listKey: ListKey;
  listaAtiva: TarefaLista | null;
  onCreated: () => void;
  defaultDateISO?: string; // yyyy-mm-dd
  startOpen?: boolean;
}> = ({ listKey, listaAtiva, onCreated, defaultDateISO, startOpen = false }) => {
  const [open, setOpen] = useState(!!startOpen);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | undefined>(defaultDateISO); // yyyy-mm-dd
  const [time, setTime] = useState('09:00');
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [prioridade, setPrioridade] = useState<Prioridade>('media');
  const [categoria, setCategoria] = useState<Categoria>(() => guessCategoriaFromLista(listaAtiva?.nome));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const listaId = useMemo(() => (listKey.startsWith('list:') ? listKey.replace('list:', '') : null), [listKey]);

  const priorityOptions = useMemo(
    () =>
      (Object.keys(PRIORIDADES) as Prioridade[]).map((p) => ({
        value: p,
        label: `${PRIORIDADES[p].label}`,
        icon: prioridadeIcon(p),
      })),
    []
  );

  const categoryOptions = useMemo(
    () =>
      (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({
        value: c,
        label: `${CATEGORIAS[c].label}`,
        icon: categoriaIcon(c),
      })),
    []
  );

  const canSave = title.trim().length >= 2 && !saving;

  const computeVencimentoISO = () => {
    if (!date) return null;
    const t = diaInteiro ? '09:00' : time || '09:00';
    const d = new Date(`${date}T${t}:00`);
    return d.toISOString();
  };

  const reset = () => {
    setTitle('');
    setDate(defaultDateISO || undefined);
    setTime('09:00');
    setDiaInteiro(false);
    setPrioridade('media');
    setCategoria(guessCategoriaFromLista(listaAtiva?.nome));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const venc = computeVencimentoISO();
      // Se estiver no Meu Dia (smart), default = hoje às 09:00
      const defaultMeuDia = listKey === 'smart:meu-dia' && !venc ? new Date().toISOString() : venc;

      await createTarefa({
        titulo: title.trim(),
        lista_id: listaId,
        categoria,
        prioridade,
        dia_inteiro: diaInteiro,
        vencimento_em: defaultMeuDia,
        lembrete_minutos: [30],
        status: 'pendente',
      } as any);

      reset();
      setOpen(false);
      onCreated();
    } catch (err: any) {
      // Mostra o erro real (geralmente RLS/sessão) para destravar debug e uso.
      const msg =
        err?.message ||
        err?.error_description ||
        (typeof err === 'string' ? err : '') ||
        'Falha ao criar tarefa. Verifique login/RLS.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden',
          open ? 'shadow-xl shadow-black/30' : ''
        )}
      >
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 text-slate-400 hover:text-white hover:bg-slate-900/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
              <span className="text-sm font-bold">Adicionar uma tarefa…</span>
            </div>
            <Plus className="w-5 h-5" />
          </button>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                    reset();
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                placeholder="Título da tarefa…"
                className="flex-1 bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <Tooltip content="Fechar" side="left">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-400 hover:text-white hover:bg-slate-900/40 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            {saveError ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                <div className="text-rose-200 text-sm font-black">Não foi possível criar a tarefa</div>
                <div className="text-rose-200/80 text-xs font-bold mt-1 break-words">{saveError}</div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Data</div>
                <DatePicker value={date} onChange={setDate} placeholder="Sem data" className="w-full" />
                <label className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-400">
                  <input
                    type="checkbox"
                    checked={diaInteiro}
                    onChange={(e) => setDiaInteiro(e.target.checked)}
                    className="accent-violet-500"
                  />
                  Dia inteiro
                </label>
                {!diaInteiro ? (
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="mt-2 w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                ) : null}
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Prioridade</div>
                <CustomSelect
                  value={prioridade}
                  onValueChange={(v) => setPrioridade(v as Prioridade)}
                  options={priorityOptions}
                />
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Categoria</div>
                <CustomSelect
                  value={categoria}
                  onValueChange={(v) => setCategoria(v as Categoria)}
                  options={categoryOptions}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setTemplatesOpen(true)}
                className="px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 text-slate-200 font-black flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-violet-300" />
                Usar template
              </button>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="px-4 py-3 rounded-2xl bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800 text-slate-200 font-black"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={handleSave}
                  className={cn(
                    'px-5 py-3 rounded-2xl font-black text-white transition-all',
                    canSave ? 'bg-violet-600 hover:bg-violet-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  )}
                >
                  {saving ? 'Salvando…' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TemplatesModal
        isOpen={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        defaultListaId={listaId}
        defaultCategoria={categoria}
        onCreated={() => {
          setTemplatesOpen(false);
          setOpen(false);
          reset();
          onCreated();
        }}
      />
    </>
  );
};

