import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Save, ShieldCheck } from 'lucide-react';
import { CustomSelect, DatePicker, Modal } from '../UI';
import {
  ContaPagar,
  FinanceiroContaBancaria,
  METODOS_PAGAMENTO,
  PlanoConta,
  PlanoContaMaisUsado,
} from '../../types/contasPagar';
import { PlanoContaTreeSelect } from './PlanoContaTreeSelect';
import { deriveContaPagadoraFiscal } from '../../services/financeiroFiscal';
import type { AjusteContaPagaInput } from '../../services/contasPagarService';

const parseBRL = (raw: string): number => {
  const cleaned = String(raw || '')
    .replace(/\s/g, '')
    .replace(/^R\$\s?/i, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;
  return cleaned.includes(',')
    ? Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    : Number(cleaned) || 0;
};

const toDateOnly = (value?: string | null) => String(value || '').slice(0, 10);

export const AjustarContaPagaModal: React.FC<{
  isOpen: boolean;
  conta: ContaPagar | null;
  planosConta: PlanoConta[];
  planoContaMaisUsados?: PlanoContaMaisUsado[];
  contasBancarias: FinanceiroContaBancaria[];
  onClose: () => void;
  onConfirm: (input: AjusteContaPagaInput) => Promise<void>;
}> = ({ isOpen, conta, planosConta, planoContaMaisUsados = [], contasBancarias, onClose, onConfirm }) => {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataLancamento, setDataLancamento] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState('PIX');
  const [contaPagadoraId, setContaPagadoraId] = useState('');
  const [planoContaId, setPlanoContaId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('Correção administrativa de conta já paga.');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !conta) return;
    setDescricao(conta.descricao || '');
    setValor(Number(conta.valor || 0).toFixed(2).replace('.', ','));
    setDataLancamento(toDateOnly(conta.data_lancamento));
    setDataVencimento(toDateOnly(conta.data_vencimento));
    setDataPagamento(toDateOnly(conta.data_pagamento));
    setMetodoPagamento(conta.metodo_pagamento || 'PIX');
    setContaPagadoraId(conta.conta_pagadora_id || '');
    setPlanoContaId(conta.plano_conta_id || '');
    setObservacoes(conta.observacoes || '');
    setMotivo('Correção administrativa de conta já paga.');
  }, [conta, isOpen]);

  const contaPagadora = useMemo(
    () => contasBancarias.find((item) => item.id === contaPagadoraId) || null,
    [contaPagadoraId, contasBancarias]
  );
  const fiscal = useMemo(() => {
    if (!contaPagadora) return null;
    try {
      return deriveContaPagadoraFiscal(contaPagadora);
    } catch {
      return null;
    }
  }, [contaPagadora]);
  const valorNumerico = useMemo(() => parseBRL(valor), [valor]);

  if (!isOpen || !conta) return null;

  const saveDisabled = saving
    || !descricao.trim()
    || !(valorNumerico > 0)
    || !dataLancamento
    || !dataVencimento
    || !dataPagamento
    || !metodoPagamento
    || !contaPagadoraId
    || !planoContaId;

  const contaOptions = contasBancarias.map((item) => {
    const empresa = item.empresa?.label_operacional || item.empresa?.nome_fantasia || item.empresa?.razao_social || 'Empresa';
    const apelido = item.apelido ? ` · ${item.apelido}` : '';
    return {
      value: item.id,
      label: `${empresa} · ${item.banco} ${item.conta}${apelido}`,
    };
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AJUSTAR CONTA PAGA"
      subtitle="Corrige os dados sem desfazer a baixa. A alteração fica registrada no histórico."
      className="max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-6 py-3 rounded-2xl border border-line bg-surface/30 text-secondary font-black hover:bg-surface/50 disabled:opacity-60 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm({
                  descricao: descricao.trim(),
                  valor: valorNumerico,
                  data_lancamento: dataLancamento,
                  data_vencimento: dataVencimento,
                  data_pagamento: dataPagamento,
                  metodo_pagamento: metodoPagamento,
                  conta_pagadora_id: contaPagadoraId,
                  plano_conta_id: planoContaId,
                  observacoes,
                  motivo,
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="px-8 py-4 rounded-[2rem] bg-accent hover:bg-accent/80 text-on-accent font-black shadow-xl shadow-accent/20 disabled:opacity-50 transition-all active:scale-95 inline-flex items-center justify-center gap-2"
          >
            {saving ? <span className="w-4 h-4 border-2 border-on-accent/30 border-t-on-accent rounded-full animate-spin" /> : <Save size={16} />}
            Salvar correção
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-info/25 bg-info/10 px-5 py-4 flex gap-3 text-sm text-secondary font-semibold leading-relaxed">
          <ShieldCheck size={18} className="text-info shrink-0 mt-0.5" />
          <span>Use para corrigir valor, datas, plano, forma e conta de pagamento de uma baixa já feita. Fatura de cartão e folha continuam no fluxo de origem.</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="block">
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Descrição</span>
            <input value={descricao} onChange={(event) => setDescricao(event.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface/30 px-5 py-3.5 text-primary font-bold placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </label>
          <label className="block">
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Valor</span>
            <input inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface/30 px-5 py-3.5 text-primary font-bold placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Lançamento</span>
            <div className="mt-2"><DatePicker value={dataLancamento} onChange={(value) => setDataLancamento(value || '')} /></div>
          </div>
          <div>
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Vencimento</span>
            <div className="mt-2"><DatePicker value={dataVencimento} onChange={(value) => setDataVencimento(value || '')} /></div>
          </div>
          <div>
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Pagamento</span>
            <div className="mt-2"><DatePicker value={dataPagamento} onChange={(value) => setDataPagamento(value || '')} /></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Forma de pagamento</span>
            <div className="mt-2"><CustomSelect value={metodoPagamento} onValueChange={setMetodoPagamento} options={METODOS_PAGAMENTO.map((item) => ({ value: item, label: item }))} /></div>
          </div>
          <div>
            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Conta bancária</span>
            <div className="mt-2"><CustomSelect value={contaPagadoraId} onValueChange={setContaPagadoraId} placeholder="Selecione a conta" options={contaOptions} /></div>
          </div>
        </div>

        <div>
          <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Plano de contas</span>
          <div className="mt-2"><PlanoContaTreeSelect planos={planosConta} maisUsados={planoContaMaisUsados} value={planoContaId} onValueChange={setPlanoContaId} /></div>
        </div>

        <div className="rounded-2xl border border-line bg-surface/20 px-5 py-4 flex items-start gap-3">
          <Landmark size={18} className="text-accent shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Fiscal derivado da conta</div>
            <div className="mt-1 text-sm font-bold text-primary">
              {fiscal ? `${fiscal.label_operacional} · ${fiscal.unidade.toUpperCase()}` : 'Selecione uma conta bancária ativa.'}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Observações</span>
          <textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} className="mt-2 w-full min-h-[92px] rounded-2xl border border-line bg-surface/30 px-5 py-4 text-sm text-primary font-medium placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" placeholder="Contexto opcional da conta." />
        </label>
        <label className="block">
          <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Motivo da correção</span>
          <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface/30 px-5 py-3.5 text-primary font-bold placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" />
        </label>
      </div>
    </Modal>
  );
};
