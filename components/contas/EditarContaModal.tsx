import React, { useEffect, useMemo, useState } from 'react';
import { Modal, DatePicker } from '../UI';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { ContaLembretesWhatsApp } from './ContaLembretesWhatsApp';

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
  onClose: () => void;
  onConfirm: (patch: { valor?: number; data_vencimento?: string }) => Promise<void>;
}> = ({ isOpen, conta, onClose, onConfirm }) => {
  const [valor, setValor] = useState<string>('');
  const [vencimento, setVencimento] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !conta) return;
    setValor(conta.valor ? String(conta.valor).replace('.', ',') : '');
    setVencimento(conta.data_vencimento || '');
  }, [isOpen, conta]);

  const valorNum = useMemo(() => parseBRL(valor), [valor]);
  const valorPreview = useMemo(() => formatCurrency(valorNum), [valorNum]);

  if (!isOpen || !conta) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="EDITAR CONTA"
      className="max-w-2xl"
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
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const patch: { valor?: number; data_vencimento?: string } = {};
                if (valorNum > 0) patch.valor = valorNum;
                if (vencimento) patch.data_vencimento = vencimento;
                await onConfirm(patch);
              } finally {
                setSaving(false);
              }
            }}
            className="px-8 py-4 rounded-[2rem] bg-violet-600 hover:bg-violet-500 text-white font-black shadow-xl shadow-violet-600/20 disabled:opacity-50 transition-all active:scale-95 text-xs uppercase tracking-widest"
          >
            {saving ? 'Salvando…' : 'Salvar ajustes'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Categoria</div>
          <div className="text-white font-black mt-1">{conta.categoria?.nome || '—'}</div>
          <div className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Descrição</div>
          <div className="text-slate-200 font-bold mt-1">{conta.descricao}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
              Valor (R$)
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
              placeholder="R$ 0,00"
            />
            <div className="mt-2 text-[10px] text-slate-500 font-bold px-1">
              {valor ? `Preview: ${valorPreview}` : ''}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
              Vencimento
            </label>
            <DatePicker value={vencimento} onChange={(v) => setVencimento(v || '')} />
          </div>
        </div>

        <div className="text-xs text-slate-500 font-bold">
          Dica: conta recorrente aparece todo mês. Ajuste aqui o valor deste mês específico (ex.: conta de luz).
        </div>

        {conta?.id ? <ContaLembretesWhatsApp contaId={conta.id} /> : null}
      </div>
    </Modal>
  );
};

