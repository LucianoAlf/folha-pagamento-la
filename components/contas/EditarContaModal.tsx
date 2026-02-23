import React, { useEffect, useMemo, useState } from 'react';
import { Info, Save } from 'lucide-react';
import { Modal, DatePicker, CustomSelect, ConfirmDialog } from '../UI';
import { CategoriaDespesa, ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
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
  onClose: () => void;
  onConfirm: (patch: Partial<ContaPagar>, aplicarAFuturos?: boolean) => Promise<void>;
}> = ({ isOpen, conta, categorias, onClose, onConfirm }) => {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('');
  const [vencimento, setVencimento] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>('');
  const [launchType, setLaunchType] = useState<'unica' | 'recorrente' | 'parcelada'>('unica');
  const [observacoes, setObservacoes] = useState('');
  const [parcelaAtual, setParcelaAtual] = useState<number>(1);
  const [totalParcelas, setTotalParcelas] = useState<number>(1);

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
    setParcelaAtual(conta.parcela_atual || 1);
    setTotalParcelas(conta.total_parcelas || 1);
  }, [isOpen, conta]);

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
      ...(launchType === 'parcelada' ? { parcela_atual: parcelaAtual, total_parcelas: totalParcelas } : {}),
    };

    // Se for recorrente e não confirmou ainda, pergunta
    if (conta.tipo_lancamento === 'recorrente' && aplicarAFuturos === undefined) {
      // Verifica se mudou algo que impacta o "modelo"
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

    setSaving(true);
    try {
      await onConfirm(patch, aplicarAFuturos);
      onClose();
    } finally {
      setSaving(false);
      setShowConfirmFuturos(false);
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
              className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-300 font-black hover:bg-slate-900/50 transition-all active:scale-95 text-xs uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !descricao.trim() || !vencimento || !(valorNum > 0)}
              onClick={() => handleSave()}
              className="px-10 py-4 rounded-[2rem] bg-violet-600 hover:bg-violet-500 text-white font-black shadow-xl shadow-violet-600/20 disabled:opacity-50 transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
              Salvar Ajustes
            </button>
          </div>
        }
      >
        <div className="space-y-8 md:space-y-10 pb-2">
          {conta.tipo_lancamento === 'recorrente' && (
            <div className="rounded-3xl bg-violet-500/10 border border-violet-500/20 p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-200 shrink-0">
                <Info size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200/80">Conta Recorrente</div>
                <div className="mt-1 text-xs font-bold text-slate-200 leading-snug">
                  Este lançamento faz parte de uma recorrência. Você pode ajustar apenas este mês ou aplicar a mudança para os próximos.
                </div>
              </div>
            </div>
          )}

          {/* A) Dados principais */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 text-violet-400 text-[10px]">A</span> 
              Dados principais
            </div>

            <div className="grid grid-cols-1 gap-5 md:gap-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">
                  Descrição do lançamento *
                </label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Valor (R$) *</label>
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                  />
                  <div className="mt-2 text-[10px] text-slate-500 font-bold px-1">{valor ? `Preview: ${valorPreview}` : ''}</div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Categoria *</label>
                  <CustomSelect
                    value={categoriaId}
                    onValueChange={(v) => setCategoriaId(v)}
                    options={categoriaOptions}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Unidade *</label>
                  <CustomSelect
                    value={unidade}
                    onValueChange={(v) => setUnidade(v)}
                    options={UNIDADES_SIMPLES}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Tipo de Lançamento</label>
                  <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-1">
                    {(['unica', 'recorrente', 'parcelada'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setLaunchType(t)}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                          launchType === t ? 'bg-slate-800 text-violet-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
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
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Parcela Atual</label>
                    <input
                      type="number"
                      min={1}
                      max={totalParcelas}
                      value={parcelaAtual}
                      onChange={(e) => setParcelaAtual(Math.max(1, Math.min(totalParcelas, Number(e.target.value || 1))))}
                      className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Total Parcelas</label>
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
                      className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                    />
                  </div>
                  <div className="col-span-2 text-[10px] text-slate-500 font-bold px-1 -mt-3">
                    Exibirá: Parcela {parcelaAtual} de {totalParcelas}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* B) Prazos */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 text-violet-400 text-[10px]">B</span>
              Prazos e Competência
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Vencimento *</label>
                <DatePicker value={vencimento} onChange={(v) => setVencimento(v || '')} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 px-1">Mês de Competência *</label>
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

          {/* C) WhatsApp */}
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 text-violet-400 text-[10px]">C</span>
              Notificações
            </div>
            <ContaLembretesWhatsApp contaId={conta.id} dense />
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação para Recorrentes */}
      <ConfirmDialog
        isOpen={showConfirmFuturos}
        onClose={() => setShowConfirmFuturos(false)}
        onConfirm={() => handleSave(true)}
        title="Atualizar recorrência?"
        message="Você alterou dados que definem esta conta recorrente. Deseja aplicar estas mudanças também para todos os lançamentos futuros desta conta?"
        confirmLabel="Sim, atualizar futuros"
        cancelLabel="Não, apenas este mês"
      />
    </>
  );
};
