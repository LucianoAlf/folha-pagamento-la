import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CreditCard, FileText, Receipt, Sparkles, UserPlus, Users } from 'lucide-react';
import { Modal } from '../UI';
import { cn } from '../CollaboratorComponents';
import { CustomSelect, DatePicker } from '../UI';
import type { Categoria, Prioridade, TarefaTemplate } from '../../types/agenda';
import { CATEGORIAS, PRIORIDADES } from '../../types/agenda';
import { criarTarefaDoTemplate, fetchTemplates } from '../../services/agendaService';
import { useAsyncAction } from '../../hooks/useAsyncAction';

const extractVars = (s: string) => {
  const out = new Set<string>();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.add(m[1]);
  return Array.from(out);
};

export const TemplatesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultListaId?: string | null;
  defaultCategoria?: Categoria;
}> = ({ isOpen, onClose, onCreated, defaultListaId = null, defaultCategoria }) => {
  const { run } = useAsyncAction();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TarefaTemplate[]>([]);
  const [selected, setSelected] = useState<TarefaTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});

  const [date, setDate] = useState<string | undefined>(undefined); // yyyy-mm-dd
  const [time, setTime] = useState('09:00');
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>('geral');
  const [prioridade, setPrioridade] = useState<Prioridade>('media');

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setVars({});
    setDate(undefined);
    setTime('09:00');
    setDiaInteiro(false);
    setLoading(true);
    fetchTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, [isOpen]);

  const neededVars = useMemo(() => {
    const title = selected?.template?.titulo || '';
    return extractVars(title);
  }, [selected]);

  const canCreate = !!selected && neededVars.every((k) => (vars[k] || '').trim().length > 0);

  const fillDefaults = (k: string) => {
    const now = new Date();
    if (k === 'ano') return String(now.getFullYear());
    if (k === 'mes') return String(now.getMonth() + 1).padStart(2, '0');
    if (k === 'data') return now.toLocaleDateString('pt-BR');
    if (k === 'semana') {
      const onejan = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil((((now.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
      return String(week);
    }
    return '';
  };

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const k of neededVars) next[k] = vars[k] ?? fillDefaults(k);
    setVars(next);
    // Defaults de UI (premium: sem emojis, mas com semântica)
    setCategoria(((defaultCategoria as any) || (selected.template?.categoria as any) || 'geral') as Categoria);
    setPrioridade(((selected.template?.prioridade as any) || 'media') as Prioridade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const priorityOptions = useMemo(
    () =>
      (Object.keys(PRIORIDADES) as Prioridade[]).map((p) => ({
        value: p,
        label: `${PRIORIDADES[p].label}`,
      })),
    []
  );

  const categoryOptions = useMemo(
    () =>
      (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({
        value: c,
        label: `${CATEGORIAS[c].label}`,
      })),
    []
  );

  const templateIcon = (t: TarefaTemplate) => {
    const name = (t.nome || '').toLowerCase();
    if (name.includes('cart')) return CreditCard;
    if (name.includes('impost') || name.includes('tax')) return Receipt;
    if (name.includes('folha') || name.includes('fech')) return BarChart3;
    if (name.includes('reuni') || name.includes('adm')) return Users;
    if (name.includes('admiss') || name.includes('contrat')) return UserPlus;
    return FileText;
  };

  const computeVencimentoISO = () => {
    if (!date) return null;
    const t = diaInteiro ? '09:00' : time || '09:00';
    const d = new Date(`${date}T${t}:00`);
    return d.toISOString();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Templates de Tarefas"
      subtitle="Crie rotinas em segundos (conciliações, fechamento, impostos…) "
    >
      <div className="space-y-4">
        {loading ? <div className="text-slate-400 font-bold">Carregando…</div> : null}

        {!loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => {
              const isActive = selected?.id === t.id;
              const Icon = templateIcon(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={cn(
                    'p-4 rounded-2xl border text-left transition-all',
                    isActive
                      ? 'bg-violet-500/10 border-violet-500/25 text-white'
                      : 'bg-slate-900/20 border-slate-800 text-slate-200 hover:bg-slate-900/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-200">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black truncate">{t.nome}</div>
                      {t.descricao ? <div className="text-xs text-slate-400 font-bold mt-1 line-clamp-2">{t.descricao}</div> : null}
                    </div>
                  </div>
                </button>
              );
            })}
            {templates.length === 0 ? <div className="text-slate-500 font-bold">Nenhum template ativo.</div> : null}
          </div>
        ) : null}

        {selected ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="flex items-center gap-2 text-white font-black">
              <Sparkles className="w-4 h-4 text-violet-300" />
              Variáveis do template
            </div>
            <div className="text-xs text-slate-500 font-bold mt-1">
              Preencha os campos para personalizar o título (ex.: unidade, mês, ano).
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {neededVars.length === 0 ? (
                <div className="text-sm text-slate-400 font-bold">Esse template não precisa de variáveis.</div>
              ) : (
                neededVars.map((k) => (
                  <div key={k}>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                      {k}
                    </label>
                    <input
                      value={vars[k] || ''}
                      onChange={(e) => setVars((p) => ({ ...p, [k]: e.target.value }))}
                      className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                      placeholder={`Informe ${k}...`}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/10 p-4">
              <div className="text-white font-black">Detalhes da tarefa</div>
              <div className="text-xs text-slate-500 font-bold mt-1">Defina vencimento e ajustes finais antes de criar.</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <CustomSelect value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)} options={priorityOptions} />
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Categoria</div>
                  <CustomSelect value={categoria} onValueChange={(v) => setCategoria(v as Categoria)} options={categoryOptions} />
                </div>
              </div>

              <div className="mt-3 text-[11px] text-slate-400 font-bold">
                Dica: para aparecer em <span className="text-slate-200">Planejado</span>, selecione uma data.
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2.5 rounded-2xl bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800 text-slate-200 font-black"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canCreate}
                className={cn(
                  'px-5 py-2.5 rounded-2xl font-black text-white transition-all',
                  canCreate ? 'bg-violet-600 hover:bg-violet-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                )}
                onClick={() => {
                  const template = selected;
                  if (!template) return;
                  return run(
                    async () => {
                      await criarTarefaDoTemplate(template, vars, {
                        lista_id: defaultListaId,
                        categoria,
                        prioridade,
                        vencimento_em: computeVencimentoISO(),
                        dia_inteiro: diaInteiro,
                      });
                    },
                    {
                      success: 'Tarefa criada a partir do template.',
                      error: 'Não foi possível criar a tarefa.',
                      onSuccess: () => onCreated(),
                    }
                  );
                }}
              >
                Criar Tarefa
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

