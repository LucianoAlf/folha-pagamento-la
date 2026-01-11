import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CustomSelect, DatePicker, Modal } from '../UI';
import { CategoriaDespesa, ContaPagar, UNIDADES_CONTA } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';

type LaunchType = 'unica' | 'recorrente' | 'parcelada';
type PaymentStatus = 'pendente' | 'pago';

export const NovaContaModal: React.FC<{
  isOpen: boolean;
  categorias: CategoriaDespesa[];
  onClose: () => void;
  onConfirm: (conta: Partial<ContaPagar>) => Promise<void>;
}> = ({ isOpen, categorias, onClose, onConfirm }) => {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('todas');

  const [launchType, setLaunchType] = useState<LaunchType>('unica');
  const [parcelas, setParcelas] = useState<number>(2);

  const [dataLancamento, setDataLancamento] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [vencimento, setVencimento] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  });

  const [status, setStatus] = useState<PaymentStatus>('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  const categoriaOptions = useMemo(
    () =>
      categorias.map((c) => ({
        value: c.id,
        label: `${c.icone ? `${c.icone} ` : ''}${c.nome}`,
      })),
    [categorias]
  );

  const parseBRL = (raw: string) => {
    const cleaned = (raw || '')
      .replace(/\s/g, '')
      .replace(/^R\$\s?/i, '')
      .replace(/[^\d.,-]/g, '');
    if (!cleaned) return 0;
    if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    return Number(cleaned) || 0;
  };

  const valorNum = useMemo(() => parseBRL(valor), [valor]);
  const valorLabel = useMemo(() => formatCurrency(valorNum), [valorNum]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <div className="p-6 bg-rose-600/90 border-b border-rose-500/30 flex items-center justify-between rounded-t-[2rem]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 text-white flex items-center justify-center">
            <Plus size={22} />
          </div>
          <div>
            <div className="text-white font-black text-2xl leading-tight">Nova Despesa</div>
            <div className="text-white/80 text-xs font-bold">Gestão financeira</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="p-8 space-y-8">
        {/* A) Dados principais */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-4">
            <span className="text-rose-400">A)</span> Dados principais
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div>
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">
                Descrição do lançamento *
              </div>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                placeholder="Ex: Aluguel Unidade Matriz"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Valor (R$) *</div>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="R$ 0,00"
                />
                <div className="mt-2 text-xs text-slate-500 font-bold">{valor ? `Preview: ${valorLabel}` : ''}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Categoria *</div>
                <CustomSelect
                  value={categoriaId}
                  onValueChange={(v) => setCategoriaId(v)}
                  placeholder="Selecione..."
                  options={categoriaOptions}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Unidade *</div>
                <CustomSelect
                  value={unidade}
                  onValueChange={(v) => setUnidade(v)}
                  options={UNIDADES_CONTA.map((u) => ({ value: u.value, label: u.label }))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tipo lançamento */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-4">
            Tipo de Lançamento
          </div>

          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-1 w-full md:w-[520px]">
            {(
              [
                { id: 'unica', label: 'Única' },
                { id: 'recorrente', label: 'Recorrente' },
                { id: 'parcelada', label: 'Parcelada' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLaunchType(t.id)}
                className={[
                  'flex-1 px-4 py-2.5 rounded-xl text-xs font-black transition-colors',
                  launchType === t.id ? 'bg-white/10 text-violet-300' : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {launchType === 'parcelada' && (
            <div className="mt-4 w-full md:w-[240px]">
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Nº Parcelas</div>
              <input
                type="number"
                min={2}
                max={60}
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value || 2))}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          )}
        </div>

        {/* B) Prazos */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-4">
            <span className="text-rose-400">B)</span> Prazos e Competência
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Data Lançamento *</div>
              <DatePicker value={dataLancamento} onChange={(v) => setDataLancamento(v || '')} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Vencimento *</div>
              <DatePicker value={vencimento} onChange={(v) => setVencimento(v || '')} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Competência *</div>
              <DatePicker value={competencia} onChange={(v) => setCompetencia(v || '')} />
            </div>
          </div>
        </div>

        {/* D) Status */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-4">
            <span className="text-rose-400">D)</span> Status do Pagamento
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setStatus('pendente')}
              className={[
                'p-5 rounded-2xl border transition-all text-left',
                status === 'pendente'
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : 'border-slate-800 bg-slate-900/20 hover:bg-slate-900/30',
              ].join(' ')}
            >
              <div className="text-white font-black">Pendente</div>
              <div className="text-xs text-slate-400 font-bold">Ainda não pago</div>
            </button>
            <button
              type="button"
              onClick={() => setStatus('pago')}
              className={[
                'p-5 rounded-2xl border transition-all text-left',
                status === 'pago'
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/20 hover:bg-slate-900/30',
              ].join(' ')}
            >
              <div className="text-white font-black">Já Pago</div>
              <div className="text-xs text-slate-400 font-bold">Lançamento realizado</div>
            </button>
          </div>
        </div>

        {/* E) Observações */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-4">
            <span className="text-rose-400">E)</span> Observações
          </div>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="w-full min-h-[130px] rounded-2xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            placeholder="Notas adicionais sobre este lançamento..."
            spellCheck={false}
            maxLength={500}
          />
          <div className="text-right text-xs text-slate-500 font-bold mt-2">{observacoes.length}/500</div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-800/70 bg-slate-950/30 flex items-center justify-between gap-4 rounded-b-[2rem]">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-300 font-black hover:bg-slate-900/50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={
            saving ||
            !descricao.trim() ||
            !categoriaId ||
            !vencimento ||
            !competencia ||
            !dataLancamento ||
            !(valorNum > 0)
          }
          onClick={async () => {
            setSaving(true);
            try {
              const payload: Partial<ContaPagar> = {
                descricao: descricao.trim(),
                categoria_id: categoriaId,
                unidade: unidade as any,
                valor: valorNum,
                data_lancamento: dataLancamento,
                data_vencimento: vencimento,
                competencia,
                status,
                tipo_lancamento: launchType,
                total_parcelas: launchType === 'parcelada' ? parcelas : null,
                parcela_atual: null,
                observacoes: observacoes.trim() || null,
              };
              await onConfirm(payload);
            } finally {
              setSaving(false);
            }
          }}
          className="px-10 py-4 rounded-[2rem] bg-rose-600 hover:bg-rose-500 text-white font-black shadow-xl shadow-rose-600/20 disabled:opacity-50"
        >
          Confirmar Lançamento
        </button>
      </div>
    </Modal>
  );
};

