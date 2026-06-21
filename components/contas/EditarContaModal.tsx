import React, { useEffect, useMemo, useState } from 'react';
import { Info, Save } from 'lucide-react';
import { Modal, DatePicker, CustomSelect, ConfirmDialog } from '../UI';
import { CategoriaDespesa, ContaCredencial, ContaPagar, ContaPagarCodigoMes, FONTE_TIPOS, FonteTipo, StatusColetaCodigo } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { upsertCodigoMes } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';
import { ContaLembretesWhatsApp } from './ContaLembretesWhatsApp';

const UNIDADES_SIMPLES = [
  { value: 'cg', label: 'Campo Grande' },
  { value: 'rec', label: 'Recreio' },
  { value: 'bar', label: 'Barra' },
  { value: 'todas', label: 'Todas / Matriz' }
];

const parseBRL = (raw: string) => {
  const cleaned = (raw || '')
    .replace(/\s/g, '')
    .replace(/^R\$\s?/i, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(cleaned) || 0;
};

export const EditarContaModal: React.FC<{
  isOpen: boolean;
  conta: ContaPagar | null;
  categorias: CategoriaDespesa[];
  credenciais?: ContaCredencial[];
  codigoMes?: ContaPagarCodigoMes | null;
  operadorNome?: string;
  onCodigoChanged?: () => void;
  onOpenCredenciais?: () => void;
  onClose: () => void;
  onConfirm: (patch: Partial<ContaPagar>, aplicarAFuturos?: boolean) => Promise<void>;
}> = ({ isOpen, conta, categorias, credenciais = [], codigoMes, operadorNome = 'operador', onCodigoChanged, onOpenCredenciais, onClose, onConfirm }) => {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('');
  const [vencimento, setVencimento] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>('');
  const [launchType, setLaunchType] = useState<'unica' | 'recorrente' | 'parcelada'>('unica');
  const [observacoes, setObservacoes] = useState('');
  const [fonteTipo, setFonteTipo] = useState<FonteTipo | ''>('');
  const [fonteUrl, setFonteUrl] = useState('');
  const [fonteInstrucoes, setFonteInstrucoes] = useState('');
  const [fonteIdentificador, setFonteIdentificador] = useState('');
  const [credencialId, setCredencialId] = useState('');
  const [pixChaveFixa, setPixChaveFixa] = useState('');
  const [emailPagamento, setEmailPagamento] = useState('');
  const [parcelaAtual, setParcelaAtual] = useState<number>(1);
  const [totalParcelas, setTotalParcelas] = useState<number>(1);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [qrPixPayload, setQrPixPayload] = useState('');
  const [codigoStatus, setCodigoStatus] = useState<StatusColetaCodigo>('pendente');

  const [saving, setSaving] = useState(false);
  const [showConfirmFuturos, setShowConfirmFuturos] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<Partial<ContaPagar> | null>(null);

  useEffect(() => {
    if (!isOpen || !conta) return;
    setDescricao(conta.descricao || '');
    setValor(conta.valor ? String(conta.valor).replace('.', ',') : '');
    setCategoriaId(conta.categoria_id || '');
    setUnidade(conta.unidade || 'cg');
    setVencimento(conta.data_vencimento || '');
    setCompetencia(conta.competencia || '');
    setLaunchType(conta.tipo_lancamento || 'unica');
    setObservacoes(conta.observacoes || '');
    setFonteTipo((conta.fonte_tipo as FonteTipo) || '');
    setFonteUrl(conta.fonte_url || '');
    setFonteInstrucoes(conta.fonte_instrucoes || '');
    setFonteIdentificador(conta.fonte_identificador || '');
    setCredencialId(conta.credencial_id || '');
    setPixChaveFixa(conta.pix_chave_fixa || '');
    setEmailPagamento(conta.email_pagamento || '');
    setParcelaAtual(conta.parcela_atual || 1);
    setTotalParcelas(conta.total_parcelas || 1);
    setCodigoBarras(codigoMes?.codigo_barras || '');
    setChavePix(codigoMes?.chave_pix || '');
    setQrPixPayload(codigoMes?.qr_pix_payload || '');
    setCodigoStatus(codigoMes?.status_coleta || 'pendente');
  }, [isOpen, conta, codigoMes]);

  const categoriaOptions = useMemo(
    () =>
      categorias.map((c) => ({
        value: c.id,
        label: `${c.icone ? `${c.icone} ` : ''}${c.nome}`,
      })),
    [categorias]
  );

  const valorNum = useMemo(() => parseBRL(valor), [valor]);
  const valorPreview = useMemo(() => formatCurrency(valorNum), [valorNum]);

  const [showConfirmParceladas, setShowConfirmParceladas] = useState(false);

  const handleSave = async (aplicarAFuturos?: boolean) => {
    if (!conta) return;

    const patch: Partial<ContaPagar> = {
      descricao: descricao.trim(),
      valor: valorNum,
      categoria_id: categoriaId,
      unidade: unidade as any,
      data_vencimento: vencimento,
      competencia,
      tipo_lancamento: launchType,
      observacoes: observacoes.trim() || null,
      fonte_tipo: fonteTipo || null,
      fonte_url: fonteUrl.trim() || null,
      fonte_instrucoes: fonteInstrucoes.trim() || null,
      fonte_identificador: fonteIdentificador.trim() || null,
      credencial_id: credencialId || null,
      pix_chave_fixa: pixChaveFixa.trim() || null,
      email_pagamento: emailPagamento.trim() || null,
      ...(launchType === 'parcelada' ? { parcela_atual: parcelaAtual, total_parcelas: totalParcelas } : {}),
    };

    // Se for recorrente e não confirmou ainda, pergunta
    if (conta.tipo_lancamento === 'recorrente' && aplicarAFuturos === undefined) {
      const mudouModelo =
        patch.descricao !== conta.descricao ||
        patch.valor !== conta.valor ||
        patch.categoria_id !== conta.categoria_id ||
        patch.unidade !== conta.unidade;

      if (mudouModelo) {
        setPendingPatch(patch);
        setShowConfirmFuturos(true);
        return;
      }
    }

    // Se for parcelada e não confirmou ainda, pergunta
    if (conta.tipo_lancamento === 'parcelada' && aplicarAFuturos === undefined) {
      const mudouRelevante =
        patch.valor !== conta.valor ||
        patch.categoria_id !== conta.categoria_id;

      if (mudouRelevante) {
        setPendingPatch(patch);
        setShowConfirmParceladas(true);
        return;
      }
    }

    setSaving(true);
    try {
      await onConfirm(patch, aplicarAFuturos);

      const comp = competencia || conta.competencia;
      const temCodigo = codigoBarras.trim() || chavePix.trim() || qrPixPayload.trim();
      if (comp && (temCodigo || codigoMes)) {
        await upsertCodigoMes({
          conta_pagar_id: conta.id,
          competencia: comp.slice(0, 7) + '-01',
          codigo_barras: codigoBarras.trim() || null,
          chave_pix: chavePix.trim() || null,
          qr_pix_payload: qrPixPayload.trim() || null,
          status_coleta: temCodigo ? (codigoStatus === 'pendente' ? 'coletado' : codigoStatus) : 'indisponivel',
          coletado_por: operadorNome,
          coletado_em: temCodigo ? new Date().toISOString() : null,
        });
        onCodigoChanged?.();
      }

      onClose();
    } finally {
      setSaving(false);
      setShowConfirmFuturos(false);
      setShowConfirmParceladas(false);
      setPendingPatch(null);
    }
  };

  if (!isOpen || !conta) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="EDITAR LANÇAMENTO"
        className="max-w-3xl"
        footer={
          <div className="flex items-center justify-between gap-4 w-full">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-2xl border border-line bg-surface/30 text-secondary font-black hover:bg-surface/50 transition-all active:scale-95 text-xs uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !descricao.trim() || !vencimento || !(valorNum > 0)}
              onClick={() => handleSave()}
              className="px-10 py-4 rounded-[2rem] bg-accent hover:bg-accent/80 text-on-accent font-black shadow-xl shadow-accent/20 disabled:opacity-50 transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-on-accent/30 border-t-on-accent rounded-full animate-spin" /> : <Save size={16} />}
              Salvar Ajustes
            </button>
          </div>
        }
      >
        <div className="space-y-8 md:space-y-10 pb-2">
          {conta.tipo_lancamento === 'recorrente' && (
            <div className="rounded-3xl bg-accent/10 border border-accent/20 p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent/60 shrink-0">
                <Info size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-accent/60">Conta Recorrente</div>
                <div className="mt-1 text-xs font-bold text-primary leading-snug">
                  Este lançamento faz parte de uma recorrência. Você pode ajustar apenas este mês ou aplicar a mudança para os próximos.
                </div>
              </div>
            </div>
          )}

          {conta.tipo_lancamento === 'parcelada' && (
            <div className="rounded-3xl bg-warning/10 border border-warning/20 p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-warning/15 border border-warning/25 flex items-center justify-center text-warning/60 shrink-0">
                <Info size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-warning/60">Conta Parcelada</div>
                <div className="mt-1 text-xs font-bold text-primary leading-snug">
                  Parcela {conta.parcela_atual || '?'} de {conta.total_parcelas || '?'}. Ao alterar valor ou categoria, você pode aplicar a todas as parcelas pendentes.
                </div>
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
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">
                  Descrição do lançamento *
                </label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Valor (R$) *</label>
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                  />
                  <div className="mt-2 text-[10px] text-muted font-bold px-1">{valor ? `Preview: ${valorPreview}` : ''}</div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Categoria *</label>
                  <CustomSelect
                    value={categoriaId}
                    onValueChange={(v) => setCategoriaId(v)}
                    options={categoriaOptions}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Unidade *</label>
                  <CustomSelect
                    value={unidade}
                    onValueChange={(v) => setUnidade(v)}
                    options={UNIDADES_SIMPLES}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Tipo de Lançamento</label>
                  <div className="flex items-center gap-2 bg-surface/40 border border-line rounded-2xl p-1">
                    {(['unica', 'recorrente', 'parcelada'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setLaunchType(t)}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                          launchType === t ? 'bg-surface-2 text-accent shadow-sm' : 'text-muted hover:text-secondary'
                        )}
                      >
                        {t === 'unica' ? 'Única' : t === 'recorrente' ? 'Recorr.' : 'Parc.'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {launchType === 'parcelada' && (
                <div className="grid grid-cols-2 gap-5 md:gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Parcela Atual</label>
                    <input
                      type="number"
                      min={1}
                      max={totalParcelas}
                      value={parcelaAtual}
                      onChange={(e) => setParcelaAtual(Math.max(1, Math.min(totalParcelas, Number(e.target.value || 1))))}
                      className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Total Parcelas</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={totalParcelas}
                      onChange={(e) => {
                        const v = Math.max(1, Number(e.target.value || 1));
                        setTotalParcelas(v);
                        if (parcelaAtual > v) setParcelaAtual(v);
                      }}
                      className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                    />
                  </div>
                  <div className="col-span-2 text-[10px] text-muted font-bold px-1 -mt-3">
                    Exibirá: Parcela {parcelaAtual} de {totalParcelas}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* B) Prazos */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">B</span>
              Prazos e Competência
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Vencimento *</label>
                <DatePicker value={vencimento} onChange={(v) => setVencimento(v || '')} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Mês de Competência *</label>
                <CustomSelect
                  value={competencia}
                  onValueChange={(v) => setCompetencia(v)}
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

          {/* C) Origem / Fonte */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">C</span>
              Origem / Fonte
            </div>

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
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Identificador (CNPJ, instalação...)</label>
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
                  rows={3}
                  placeholder="Passo a passo para Rose/Maria buscar o código..."
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                />
              </div>
            </div>
          </div>

          {/* D) Código do mês */}
          <div className="rounded-3xl border border-line/70 bg-surface/20 p-6 md:p-8">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">D</span>
              Código do mês
            </div>
            <p className="text-xs text-muted font-bold mb-5 leading-relaxed">
              Boleto ou PIX desta competência — entra no relatório do dia quando a conta vence hoje ou amanhã.
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

          {/* E) WhatsApp */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">E</span>
              Notificações
            </div>
            <ContaLembretesWhatsApp contaId={conta.id} dense />
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação para Recorrentes */}
      <ConfirmDialog
        isOpen={showConfirmFuturos}
        onClose={() => {
          setShowConfirmFuturos(false);
          handleSave(false);
        }}
        onConfirm={() => handleSave(true)}
        title="Atualizar recorrência?"
        message="Você alterou dados que definem esta conta recorrente. Deseja aplicar estas mudanças também para todos os lançamentos futuros desta conta?"
        confirmLabel="Sim, atualizar futuros"
        cancelLabel="Não, apenas este mês"
      />

      {/* Modal de Confirmação para Parceladas */}
      <ConfirmDialog
        isOpen={showConfirmParceladas}
        onClose={() => {
          setShowConfirmParceladas(false);
          handleSave(false);
        }}
        onConfirm={() => handleSave(true)}
        title="Atualizar parcelas pendentes?"
        message="Você alterou valor ou categoria desta parcela. Deseja aplicar esta mudança a todas as parcelas pendentes deste parcelamento?"
        confirmLabel="Sim, todas as pendentes"
        cancelLabel="Não, apenas esta parcela"
      />
    </>
  );
};
