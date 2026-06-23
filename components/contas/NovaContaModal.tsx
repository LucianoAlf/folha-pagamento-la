import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, Plus } from 'lucide-react';
import { CustomSelect, DatePicker, Modal } from '../UI';
import { CentroCusto, ContaCredencial, ContaPagar, FONTE_TIPOS, FonteTipo, PlanoConta, PlanoContaMaisUsado, StatusColetaCodigo } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { cn } from '../CollaboratorComponents';
import { competenciaFromVencimento, formatCompetenciaLabel, toDateOnly } from '../../utils/dateOnly';
import { CentroCustoSelect, PlanoContaTreeSelect } from './PlanoContaTreeSelect';
import { centroCustoToUnidade } from './planoContasSelectors';

type LaunchType = 'unica' | 'recorrente' | 'parcelada';
type PaymentStatus = 'pendente' | 'pago';

export type NovaContaCodigoInput = {
  codigo_barras: string;
  chave_pix: string;
  qr_pix_payload: string;
  status_coleta: StatusColetaCodigo;
};

export type NovaContaOptions = {
  valorPorParcela?: boolean;
  codigo?: NovaContaCodigoInput;
};

export const NovaContaModal: React.FC<{
  isOpen: boolean;
  planosConta: PlanoConta[];
  planoContaMaisUsados?: PlanoContaMaisUsado[];
  centrosCusto: CentroCusto[];
  credenciais?: ContaCredencial[];
  onOpenCredenciais?: () => void;
  onClose: () => void;
  onConfirm: (conta: Partial<ContaPagar>, options?: NovaContaOptions) => Promise<void>;
  defaultVencimento?: string; // yyyy-mm-dd
  defaultCompetenciaYM?: string; // yyyy-mm
  defaultUnidade?: 'cg' | 'rec' | 'bar';
}> = ({ isOpen, planosConta, planoContaMaisUsados = [], centrosCusto, credenciais = [], onOpenCredenciais, onClose, onConfirm, defaultVencimento, defaultCompetenciaYM, defaultUnidade }) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<string>('');
  const [planoContaId, setPlanoContaId] = useState<string>('');
  const [centroCustoId, setCentroCustoId] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('cg');

  const [launchType, setLaunchType] = useState<LaunchType>('unica');
  const [parcelas, setParcelas] = useState<number>(2);
  const [parcelaInicial, setParcelaInicial] = useState<number>(1);
  const [valorMode, setValorMode] = useState<'por_parcela' | 'total'>('por_parcela');

  const [vencimento, setVencimento] = useState<string>('');

  const [status, setStatus] = useState<PaymentStatus>('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [fonteTipo, setFonteTipo] = useState<FonteTipo | ''>('');
  const [fonteUrl, setFonteUrl] = useState('');
  const [fonteInstrucoes, setFonteInstrucoes] = useState('');
  const [fonteIdentificador, setFonteIdentificador] = useState('');
  const [credencialId, setCredencialId] = useState('');
  const [pixChaveFixa, setPixChaveFixa] = useState('');
  const [emailPagamento, setEmailPagamento] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [qrPixPayload, setQrPixPayload] = useState('');
  const [codigoStatus, setCodigoStatus] = useState<StatusColetaCodigo>('pendente');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const centroDefault =
      centrosCusto.find((c) => c.codigo === defaultUnidade) ||
      centrosCusto.find((c) => c.codigo === 'cg') ||
      centrosCusto[0];
    const unidadeDefault = centroCustoToUnidade(centroDefault) || defaultUnidade || 'cg';

    setDescricao('');
    setValor('');
    setPlanoContaId('');
    setCentroCustoId(centroDefault?.id || '');
    setUnidade(unidadeDefault);
    setLaunchType('unica');
    setParcelas(2);
    setParcelaInicial(1);
    setValorMode('por_parcela');
    setVencimento(defaultVencimento || '');
    setStatus('pendente');
    setObservacoes('');
    setFonteTipo('');
    setFonteUrl('');
    setFonteInstrucoes('');
    setFonteIdentificador('');
    setCredencialId('');
    setPixChaveFixa('');
    setEmailPagamento('');
    setCodigoBarras('');
    setChavePix('');
    setQrPixPayload('');
    setCodigoStatus('pendente');
    setError(null);
    setTried(false);
  }, [isOpen, defaultVencimento, defaultUnidade, centrosCusto]);

  useEffect(() => {
    if (!isOpen) return;
    if (!centroCustoId && centrosCusto.length) {
      const centroDefault =
        centrosCusto.find((c) => c.codigo === defaultUnidade) ||
        centrosCusto.find((c) => c.codigo === 'cg') ||
        centrosCusto[0];
      setCentroCustoId(centroDefault?.id || '');
      setUnidade(centroCustoToUnidade(centroDefault) || defaultUnidade || 'cg');
    }
  }, [centroCustoId, centrosCusto, defaultUnidade, isOpen]);

  const competencia = useMemo(() => competenciaFromVencimento(vencimento), [vencimento]);
  const competenciaLabel = useMemo(() => formatCompetenciaLabel(vencimento), [vencimento]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen]);

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
    if (!planoContaId) missing.push('Plano de conta');
    if (!centroCustoId) missing.push('Centro de custo');
    if (!vencimento) missing.push('Vencimento');
    if (!competencia) missing.push('Competência');
    if (launchType === 'parcelada' && parcelas < 2) missing.push('Parcelas (mín. 2)');
    return missing;
  }, [descricao, valorNum, planoContaId, centroCustoId, vencimento, competencia, launchType, parcelas]);

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
                    categoria_id: null,
                    plano_conta_id: planoContaId,
                    centro_custo_id: centroCustoId,
                    unidade: unidade as ContaPagar['unidade'],
                    valor: valorNum,
                    data_lancamento: dataLancamentoAuto,
                    data_vencimento: toDateOnly(vencimento),
                    competencia,
                    status,
                    tipo_lancamento: launchType,
                    total_parcelas: launchType === 'parcelada' ? parcelas : null,
                    parcela_atual: launchType === 'parcelada' ? parcelaInicial : null,
                    observacoes: observacoes.trim() || null,
                    fonte_tipo: fonteTipo || null,
                    fonte_url: fonteUrl.trim() || null,
                    fonte_instrucoes: fonteInstrucoes.trim() || null,
                    fonte_identificador: fonteIdentificador.trim() || null,
                    credencial_id: credencialId || null,
                    pix_chave_fixa: pixChaveFixa.trim() || null,
                    email_pagamento: emailPagamento.trim() || null,
                  };

                  const temCodigo = codigoBarras.trim() || chavePix.trim() || qrPixPayload.trim();
                  const options: NovaContaOptions = {
                    ...(launchType === 'parcelada' ? { valorPorParcela: valorMode === 'por_parcela' } : {}),
                    ...(temCodigo
                      ? {
                          codigo: {
                            codigo_barras: codigoBarras,
                            chave_pix: chavePix,
                            qr_pix_payload: qrPixPayload,
                            status_coleta: codigoStatus,
                          },
                        }
                      : {}),
                  };

                  await onConfirm(payload, options);
                  onClose();
                } catch (err: any) {
                  setError(err?.message || 'Erro ao criar lançamento. Tente novamente.');
                } finally {
                  setSaving(false);
                }
              }}
              className={cn(
                "w-full sm:w-auto px-10 py-4 rounded-[2rem] font-black shadow-xl transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2",
                isFormValid && !saving
                  ? "bg-accent hover:bg-accent/80 shadow-accent/20 text-on-accent"
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
              Preencha tudo de uma vez: dados, origem do boleto/portal e código do mês. Parceladas e recorrentes também já saem completas.
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
                <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !planoContaId ? "text-danger" : "text-muted")}>Plano de conta *</label>
                <PlanoContaTreeSelect
                  planos={planosConta}
                  maisUsados={planoContaMaisUsados}
                  value={planoContaId}
                  onValueChange={setPlanoContaId}
                  invalid={tried && !planoContaId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:gap-6">
              <div>
                <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 px-1", tried && !centroCustoId ? "text-danger" : "text-muted")}>Centro de custo *</label>
                <CentroCustoSelect
                  centros={centrosCusto}
                  value={centroCustoId}
                  invalid={tried && !centroCustoId}
                  onValueChange={(id, unidadeLegada) => {
                    setCentroCustoId(id);
                    if (unidadeLegada) setUnidade(unidadeLegada);
                  }}
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
              <div className="w-full rounded-2xl border border-line bg-surface-2 px-5 py-4 text-sm font-bold text-primary">
                {vencimento ? competenciaLabel : '— Acompanha o vencimento —'}
              </div>
              <p className="text-[10px] text-muted font-bold mt-2 px-1">Competência = mês do vencimento (ex.: vence em julho → julho/2026).</p>
            </div>
          </div>
        </div>

        {/* D) Origem / Fonte */}
        <div className="rounded-3xl border border-line/70 bg-surface/20 p-6 md:p-8">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">D</span>
            Origem / Fonte
          </div>
          <p className="text-[10px] text-muted font-bold mb-6 px-1">Opcional — onde buscar o boleto ou qual portal usar.</p>

          <div className="grid grid-cols-1 gap-5 md:gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Tipo de fonte</label>
                <CustomSelect
                  value={fonteTipo}
                  onValueChange={(v) => setFonteTipo(v as FonteTipo)}
                  options={[{ value: '', label: '— Não definido —' }, ...FONTE_TIPOS.map((f) => ({ value: f.value, label: f.label }))]}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Credencial vinculada</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CustomSelect
                      value={credencialId}
                      onValueChange={setCredencialId}
                      options={[
                        { value: '', label: '— Nenhuma —' },
                        ...credenciais.filter((c) => c.ativo).map((c) => ({ value: c.id, label: `${c.nome} (${c.portal})` })),
                      ]}
                    />
                  </div>
                  {onOpenCredenciais && (
                    <button
                      type="button"
                      onClick={onOpenCredenciais}
                      className="shrink-0 px-3 py-2 rounded-xl border border-line text-[10px] font-black uppercase text-secondary hover:text-primary"
                    >
                      Nova
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(fonteTipo === 'site' || fonteTipo === 'banco') && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">URL do portal</label>
                <input
                  value={fonteUrl}
                  onChange={(e) => setFonteUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            )}

            {fonteTipo === 'pix_fixo' && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Chave PIX fixa</label>
                <input
                  value={pixChaveFixa}
                  onChange={(e) => setPixChaveFixa(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            )}

            {fonteTipo === 'email' && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">E-mail de pagamento</label>
                <input
                  value={emailPagamento}
                  onChange={(e) => setEmailPagamento(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Identificador (CNPJ, instalação…)</label>
              <input
                value={fonteIdentificador}
                onChange={(e) => setFonteIdentificador(e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Instruções operacionais</label>
              <textarea
                value={fonteInstrucoes}
                onChange={(e) => setFonteInstrucoes(e.target.value)}
                rows={2}
                placeholder="Passo a passo para buscar o código no portal..."
                className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>
          </div>
        </div>

        {/* E) Código do mês */}
        <div className="rounded-3xl border border-line/70 bg-surface/20 p-6 md:p-8">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">E</span>
            Código do mês
          </div>
          <p className="text-[10px] text-muted font-bold mb-6 px-1">
            Opcional — boleto ou PIX desta competência. Entra direto no relatório do dia.
            {launchType === 'parcelada' && ' Aplica-se à 1ª parcela gerada.'}
          </p>

          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Código de barras / linha digitável</label>
              <textarea
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                rows={2}
                placeholder="Cole o código de barras ou linha digitável"
                className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">PIX copia e cola (EMV)</label>
              <textarea
                value={qrPixPayload}
                onChange={(e) => setQrPixPayload(e.target.value)}
                rows={2}
                placeholder="Cole o QR PIX quando não houver boleto"
                className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Chave PIX (alternativa)</label>
                <input
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Status da coleta</label>
                <CustomSelect
                  value={codigoStatus}
                  onValueChange={(v) => setCodigoStatus(v as StatusColetaCodigo)}
                  options={[
                    { value: 'pendente', label: 'Pendente' },
                    { value: 'coletado', label: 'Coletado' },
                    { value: 'indisponivel', label: 'Indisponível' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* F) Status */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">F</span>
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

        {/* G) Observações */}
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">G</span>
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
