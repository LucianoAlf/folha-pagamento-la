import React, { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { MAX_HUMAN_NOTE_LENGTH, normalizeMemoryStatus, type MemoryStatus } from '../../shared/contasVariationMemory';

export type VariationAlertCardData = {
  key: string;
  titulo: string;
  descricao: string;
  unidade: string;
  prev: number;
  curr: number;
  diff: number;
  perc: number;
  statusVariacao: 'NOVO' | 'SAIU' | 'RECORRENTE';
  notaSalva: string;
  statusOperacional: MemoryStatus | 'verificado' | null;
  sugestaoJustificativa: string | null;
};

const STATUS_OPTIONS: Array<{ value: MemoryStatus; label: string }> = [
  { value: 'justificada', label: 'Justificada' },
  { value: 'corrigir_lancamento', label: 'Corrigir lançamento' },
  { value: 'monitorar', label: 'Monitorar' },
  { value: 'pendente', label: 'Pendente' },
];

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function variationLabel(value: VariationAlertCardData['statusVariacao']): string {
  if (value === 'NOVO') return 'Novo item';
  if (value === 'SAIU') return 'Item removido';
  return 'Recorrente';
}

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '−'}${money.format(Math.abs(value))}`;
}

export function ContasVariationAlertCard({
  data,
  onSave,
}: {
  data: VariationAlertCardData;
  onSave: (input: { nota: string; status: MemoryStatus | null }) => Promise<void>;
}) {
  const [nota, setNota] = useState(data.notaSalva || '');
  const [status, setStatus] = useState<MemoryStatus | null>(normalizeMemoryStatus(data.statusOperacional));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = nota.length > MAX_HUMAN_NOTE_LENGTH;
  const savedStatusLabel = useMemo(() => {
    const normalized = normalizeMemoryStatus(data.statusOperacional);
    if (!normalized) return null;
    return STATUS_OPTIONS.find((option) => option.value === normalized)?.label || 'Justificada';
  }, [data.statusOperacional]);

  const save = async () => {
    if (invalid || saving) return;
    setError(null);
    setSaving(true);
    try {
      await onSave({ nota, status });
    } catch (saveError: any) {
      setError(saveError?.message || 'Não foi possível salvar a justificativa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-variation-key={data.key}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{variationLabel(data.statusVariacao)} · {data.unidade}</p>
          <h3 className="mt-1 text-base font-bold text-slate-900">{data.titulo}</h3>
          <p className="mt-1 text-sm text-slate-600">{data.descricao}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Variação</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Anterior', money.format(data.prev)],
          ['Atual', money.format(data.curr)],
          ['Diferença', signedMoney(data.diff)],
          ['Percentual', `${data.perc >= 0 ? '+' : '−'}${Math.abs(data.perc).toFixed(1)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {data.notaSalva ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Justificativa</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-950">{data.notaSalva}</p>
          {savedStatusLabel ? <p className="mt-2 text-xs font-semibold text-emerald-700">Status: {savedStatusLabel}</p> : null}
        </div>
      ) : null}

      {data.sugestaoJustificativa ? (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-700"><Sparkles size={14} /> Sugestão da IA</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-violet-950">{data.sugestaoJustificativa}</p>
          <button type="button" className="mt-2 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100" onClick={() => setNota(data.sugestaoJustificativa || '')}>Usar rascunho</button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor={`nota-${data.key}`}>Justificativa operacional</label>
        <textarea id={`nota-${data.key}`} value={nota} onChange={(event) => setNota(event.target.value)} rows={3} maxLength={MAX_HUMAN_NOTE_LENGTH + 200} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Escreva o contexto desta variação..." />
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className={invalid ? 'font-semibold text-rose-600' : 'text-slate-500'}>{nota.length}/{MAX_HUMAN_NOTE_LENGTH}{invalid ? ' · limite excedido' : ''}</span>
          {error ? <span className="text-rose-600">{error}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <select value={status || ''} onChange={(event) => setStatus((event.target.value || null) as MemoryStatus | null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="">Sem status</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" onClick={save} disabled={invalid || saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check size={15} /> {saving ? 'Salvando...' : 'Salvar justificativa'}</button>
        </div>
      </div>
    </article>
  );
}
