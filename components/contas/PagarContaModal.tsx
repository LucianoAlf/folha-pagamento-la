import React, { useMemo, useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { Card, CustomSelect, DatePicker, Modal } from '../UI';
import { ContaPagar, METODOS_PAGAMENTO } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';

export const PagarContaModal: React.FC<{
  isOpen: boolean;
  conta: ContaPagar | null;
  onClose: () => void;
  onConfirm: (input: { data_pagamento: string; metodo_pagamento: string; observacoes?: string }) => Promise<void>;
}> = ({ isOpen, conta, onClose, onConfirm }) => {
  const [dataPagamento, setDataPagamento] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [metodo, setMetodo] = useState<string>('PIX');
  const [obs, setObs] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const vencidaLabel = useMemo(() => {
    if (!conta) return '';
    return getStatusVisual(conta) === 'vencida' ? ' (Vencida)' : '';
  }, [conta]);

  if (!isOpen || !conta) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="p-6 bg-slate-900/60 border-b border-slate-800/70 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
          <div>
            <div className="text-white font-black text-xl">REGISTRAR PAGAMENTO</div>
            <div className="text-xs text-slate-400 font-bold">Confirme os dados da liquidação</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="p-6">
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Categoria</div>
              <div className="text-white font-black mt-1">{(conta.categoria?.nome || '—').toUpperCase()}</div>
              <div className="mt-4 text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Descrição</div>
              <div className="text-slate-200 font-bold mt-1">{conta.descricao}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Vencimento</div>
              <div className="text-rose-400 font-black mt-1">
                {conta.data_vencimento}
                {vencidaLabel}
              </div>
              <div className="mt-4 text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Valor Total</div>
              <div className="text-3xl font-black text-violet-400 mt-1">{formatCurrency(Number(conta.valor) || 0)}</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Data do Pagamento</div>
            <DatePicker value={dataPagamento} onChange={(v) => setDataPagamento(v || '')} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Método de Pagamento</div>
            <CustomSelect
              value={metodo}
              onValueChange={(v) => setMetodo(v)}
              options={METODOS_PAGAMENTO.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Observações (opcional)</div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full min-h-[110px] rounded-2xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            placeholder="Ex: Pago com desconto de 5%..."
            spellCheck={false}
          />
        </div>
      </div>

      <div className="p-6 border-t border-slate-800/70 bg-slate-950/30 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-300 font-black hover:bg-slate-900/50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving || !dataPagamento || !metodo}
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm({ data_pagamento: dataPagamento, metodo_pagamento: metodo, observacoes: obs });
            } finally {
              setSaving(false);
            }
          }}
          className="px-8 py-4 rounded-[2rem] bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-xl shadow-emerald-600/20 disabled:opacity-50"
        >
          Confirmar Pagamento
        </button>
      </div>
    </Modal>
  );
};

