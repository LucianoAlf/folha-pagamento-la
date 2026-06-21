import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, Plus } from 'lucide-react';
import { CustomSelect, DatePicker, Modal } from '../UI';
import { CategoriaDespesa, ContaPagar, UNIDADES_CONTA } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { cn } from '../CollaboratorComponents';

const UNIDADES_SIMPLES = [
  { value: 'cg', label: 'Campo Grande' },
  { value: 'rec', label: 'Recreio' },
  { value: 'bar', label: 'Barra' }
];

type LaunchType = 'unica' | 'recorrente' | 'parcelada';
type PaymentStatus = 'pendente' | 'pago';

export const NovaContaModal: React.FC<{
  isOpen: boolean;
  categorias: CategoriaDespesa[];
  onClose: () => void;
  onConfirm: (conta: Partial<ContaPagar>, options?: { valorPorParcela?: boolean }) => Promise<void>;
  defaultVencimento?: string; // yyyy-mm-dd
  defaultCompetenciaYM?: string; // yyyy-mm
  defaultUnidade?: 'cg' | 'rec' | 'bar';
}> = ({ isOpen, categorias, onClose, onConfirm, defaultVencimento, defaultCompetenciaYM, defaultUnidade }) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('cg');

  const [launchType, setLaunchType] = useState<LaunchType>('unica');
  const [parcelas, setParcelas] = useState<number>(2);
  const [parcelaInicial, setParcelaInicial] = useState<number>(1);
  const [valorMode, setValorMode] = useState<'por_parcela' | 'total'>('por_parcela');

  const [vencimento, setVencimento] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  });

  const [competenciaManual, setCompetenciaManual] = useState(false);

  const [status, setStatus] = useState<PaymentStatus>('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (defaultUnidade) setUnidade(defaultUnidade);
    if (defaultVencimento) {
      setVencimento(defaultVencimento);
      if (!competenciaManual) {
        const [y, m] = defaultVencimento.split('-');
        if (y && m) setCompetencia(`${y}-${m}-01`);
      }
    }
    if (defaultCompetenciaYM) {
      setCompetencia(`${defaultCompetenciaYM}-01`);
      setCompetenciaManual(true);
    }
  }, [isOpen, defaultVencimento, defaultCompetenciaYM, defaultUnidade]);

  // Sincronização automática Vencimento -> Competência
  useEffect(() => {
    if (vencimento && !competenciaManual) {
      const [y, m] = vencimento.split('-');
      if (y && m) {
        setCompetencia(`${y}-${m}-01`);
      }
    }
  }, [vencimento, competenciaManual]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen]);

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
  const qtdParcelas = useMemo(() => parcelas - parcelaInicial + 1, [parcelas, parcelaInicial]);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!descricao.trim()) missing.push('Descrição');
    if (!(valorNum > 0)) missing.push('Valor');
    if (!categoriaId) missing.push('Categoria');
    if (!vencimento) missing.push('Vencimento');
    if (!competencia) missing.push('Competência');
    if (launchType === 'parcelada' && parcelas < 2) missing.push('Parcelas (mín. 2)');
    return missing;
  }, [descricao, valorNum, categoriaId, vencimento, competencia, launchType, parcelas]);

  const isFormValid = missingFields.length === 0;

  // Reset tried when modal closes
  useEffect(() => {
    if (!isOpen) setTried(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="NOVA DESPESA"
      position={isMobile ? 'bottom' : 'center'}
      className={cn(isMobile ? 'max-w-none' : 'max-w-3xl')}
      footer={
        <div className="flex flex-col gap-3 w-full">
          {tried && !isFormValid && (
            <div className="flex items-start gap-2 px-1">
              <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
              <span className="text-[11px] font-bold text-danger">
                Preencha: {missingFields.join(', ')}
              </span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onClose}
              className="sm:w-auto w-full px-6 py-3.5 rounded-2xl border border-line bg-surface/30 text-secondary font-black hover:bg-surface/50 transition-all active:scale-95 text-xs uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!isFormValid) {
                  setTried(true);
                  return;
                }
                setSaving(true);
                setError(null);
                try {
                  // Data de lançamento automática (hoje)
                  const d = new Date();
                  const dataLancamentoAuto = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                  const payload: Partial<ContaPagar> = {
                    descricao: descricao.trim(),
                    categoria_id: categoriaId,
                    unidade: unidade as any,
                    valor: valorNum,
                    data_lancamento: dataLancamentoAuto,
                    data_vencimento: vencimento,
                    competencia,
                    status,
                    tipo_lancamento: launchType,
                    total_parcelas: launchType === 'parcelada' ? parcelas : null,
                    parcela_atual: launchType === 'parcelada' ? parcelaInicial : null,
                    observacoes: observacoes.trim() || null,
                  };
                  await onConfirm(
                    payload,
                    launchType === 'parcelada' ? { valorPorParcela: valorMode === 'por_parcela' } : undefined
                  );
                } catch (err: any) {
                  setError(err?.message || 'Erro ao criar lançamento. Tente novamente.');
                } finally {
                  setSaving(false);
                }
              }}
              className={cn(
                "w-full sm:w-auto px-10 py-4 rounded-[2rem] font-black shadow-xl transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2",
                isFormValid && !saving
                  ? "bg-accent hover:bg-accent/80 shadow-accent/20 text-white"
                  : "bg-surface-3 cursor-not-allowed shadow-none opacity-60 text-muted"
              )}
            >
              {saving ? <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" /> : <Plus size={16} />}
              Confirmar Lançamento
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-8 md:space-y-10 pb-2">
        <div className="rounded-3xl bg-accent/10 border border-accent/20 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent/60 shrink-0">
            <Info size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-accent/60">Dica</div>
            <div className="mt-1 text-xs font-bold text-primary leading-snug">
              A competência é o mês de referência da despesa. Depois você pode ajustar valor e vencimento em cada lançamento.
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl bg-danger/10 border border-danger/30 p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-danger">Erro</div>
              <div className="mt-1 text-xs font-bold text-danger/80 leading-snug">{error}</div>
            </div>
          </div>
        )}

        {/* A) Dados principais */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">A</span>
            Dados principais
          </div>

          <div className="grid grid-cols-1 gap-5 md:gap-6">
            <div>
              <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !descricao.trim() ? "text-danger" : "text-muted")}>
                Descrição do lançamento *
              </label>
              <input
                value={descricao}
                onChange={(e) => { setDescricao(e.target.value); if (tried && e.target.value.trim()) setTried(false); }}
                className={cn(
                  "w-full rounded-2xl border bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 transition-all",
                  tried && !descricao.trim() ? "border-danger/60 focus:ring-danger/40" : "border-line focus:ring-accent/40"
                )}
                placeholder="Ex: Aluguel Unidade Matriz"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !(valorNum > 0) ? "text-danger" : "text-muted")}>Valor (R$) *</label>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  className={cn(
                    "w-full rounded-2xl border bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 transition-all",
                    tried && !(valorNum > 0) ? "border-danger/60 focus:ring-danger/40" : "border-line focus:ring-accent/40"
                  )}
                  placeholder="R$ 0,00"
                />
                <div className="mt-2 text-[10px] text-muted font-bold px-1">{valor ? `Preview: ${valorLabel}` : ''}</div>
              </div>
              <div>
                <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !categoriaId ? "text-danger" : "text-muted")}>Categoria *</label>
                <div className={cn(tried && !categoriaId && "ring-1 ring-danger/60 rounded-2xl")}>
                  <CustomSelect
                    value={categoriaId}
                    onValueChange={(v) => setCategoriaId(v)}
                    placeholder="Selecione..."
                    options={categoriaOptions}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Unidade *</label>
                <CustomSelect
                  value={unidade}
                  onValueChange={(v) => setUnidade(v)}
                  options={UNIDADES_SIMPLES.map((u) => ({ value: u.value, label: u.label }))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tipo lançamento */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">B</span>
            Tipo de Lançamento
          </div>

          <div className="flex items-center gap-2 bg-surface/40 border border-line rounded-2xl p-1 w-full md:w-[520px]">
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
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                  launchType === t.id ? 'bg-surface-2 text-accent shadow-sm' : 'text-muted hover:text-secondary'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {launchType === 'parcelada' && (<>
            <div className="mt-6 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-full md:w-[240px]">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Nº Total de Parcelas</label>
                <input
                  type="number"
                  min={2}
                  value={parcelas}
                  onChange={(e) => {
                    const v = Number(e.target.value || 2);
                    setParcelas(v);
                    if (parcelaInicial > v) setParcelaInicial(v);
                  }}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                />
              </div>
              <div className="w-full md:w-[240px]">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Parcela Inicial</label>
                <input
                  type="number"
                  min={1}
                  max={parcelas}
                  value={parcelaInicial}
                  onChange={(e) => setParcelaInicial(Math.max(1, Math.min(parcelas, Number(e.target.value || 1))))}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                />
                <div className="mt-2 text-[10px] text-muted font-bold px-1">
                  Gera parcelas {parcelaInicial} a {parcelas} de {parcelas}
                </div>
              </div>
            </div>

            <div className="mt-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">
                O valor informado é
              </label>
              <div className="flex items-center gap-2 bg-surface/40 border border-line rounded-2xl p-1 w-full md:w-[520px]">
                <button
                  type="button"
                  onClick={() => setValorMode('por_parcela')}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                    valorMode === 'por_parcela' ? 'bg-surface-2 text-accent shadow-sm' : 'text-muted hover:text-secondary'
                  )}
                >
                  Valor por parcela
                </button>
                <button
                  type="button"
                  onClick={() => setValorMode('total')}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                    valorMode === 'total' ? 'bg-surface-2 text-accent shadow-sm' : 'text-muted hover:text-secondary'
                  )}
                >
                  Valor total
                </button>
              </div>
              {valorNum > 0 && qtdParcelas > 0 && (
                <div className="mt-2 text-[10px] text-muted font-bold px-1">
                  {valorMode === 'por_parcela'
                    ? `Cada parcela: ${formatCurrency(valorNum)} · Total: ${formatCurrency(valorNum * qtdParcelas)}`
                    : `Total: ${formatCurrency(valorNum)} · Cada parcela: ${formatCurrency(valorNum / qtdParcelas)}`
                  }
                </div>
              )}
            </div>
          </>)}
        </div>

        {/* B) Prazos */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">C</span>
            Prazos e Competência
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !vencimento ? "text-danger" : "text-muted")}>Vencimento *</label>
              <div className={cn(tried && !vencimento && "ring-1 ring-danger/60 rounded-2xl")}>
                <DatePicker value={vencimento} onChange={(v) => setVencimento(v || '')} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Mês de Competência *</label>
              <CustomSelect
                value={competencia}
                onValueChange={(v) => {
                  setCompetencia(v);
                  setCompetenciaManual(true);
                }}
                options={Array.from({ length: 12 }).map((_, i) => {
                  const d = new Date();
                  const target = new Date(d.getFullYear(), d.getMonth() - 6 + i, 1);
                  const yyyy = target.getFullYear();
                  const mm = String(target.getMonth() + 1).padStart(2, '0');
                  const label = target.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                  return { value: `${yyyy}-${mm}-01`, label: label.charAt(0).toUpperCase() + label.slice(1) };
                })}
              />
            </div>
          </div>
        </div>

        {/* D) Status */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">D</span>
            Status do Pagamento
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setStatus('pendente')}
              className={cn(
                'p-5 rounded-2xl border transition-all text-left group',
                status === 'pendente'
                  ? 'border-accent/60 bg-accent/10 shadow-lg shadow-accent/5'
                  : 'border-line bg-surface/20 hover:bg-surface/30'
              )}
            >
              <div className={cn("font-black transition-colors", status === 'pendente' ? "text-primary" : "text-secondary group-hover:text-primary")}>PENDENTE</div>
              <div className="text-[10px] text-muted font-bold uppercase tracking-wider mt-1">Ainda não pago</div>
            </button>
            <button
              type="button"
              onClick={() => setStatus('pago')}
              className={cn(
                'p-5 rounded-2xl border transition-all text-left group',
                status === 'pago'
                  ? 'border-success/60 bg-success/10 shadow-lg shadow-success/5'
                  : 'border-line bg-surface/20 hover:bg-surface/30'
              )}
            >
              <div className={cn("font-black transition-colors", status === 'pago' ? "text-primary" : "text-secondary group-hover:text-primary")}>JÁ PAGO</div>
              <div className="text-[10px] text-muted font-bold uppercase tracking-wider mt-1">Lançamento realizado</div>
            </button>
          </div>
        </div>

        {/* E) Observações */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">E</span>
            Observações
          </div>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="w-full min-h-[130px] rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
            placeholder="Notas adicionais sobre este lançamento..."
            spellCheck={false}
            maxLength={500}
          />
          <div className="text-right text-[10px] text-muted font-black mt-3 px-1 uppercase tracking-widest">{observacoes.length} / 500</div>
        </div>
      </div>
    </Modal>
  );
};
