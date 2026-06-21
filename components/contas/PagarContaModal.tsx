import React, { useMemo, useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { Card, CustomSelect, DatePicker, Modal } from '../UI';
import { ContaPagar, METODOS_PAGAMENTO } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';

const formatDateBR = (isoDate: string) => {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="REGISTRAR PAGAMENTO"
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-4 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl border border-line bg-surface/30 text-secondary font-black hover:bg-surface/50"
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
            className="px-8 py-4 rounded-[2rem] bg-success hover:bg-success/80 text-white font-black shadow-xl shadow-success/20 disabled:opacity-50"
          >
            Confirmar Pagamento
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card className="p-6 mb-6 bg-surface/40 border-line">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Categoria</div>
              <div className="text-primary font-black mt-1">{(conta.categoria?.nome || '—').toUpperCase()}</div>
              <div className="mt-4 text-[10px] text-muted font-black uppercase tracking-[0.2em]">Descrição</div>
              <div className="text-secondary font-bold mt-1">{conta.descricao}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Vencimento</div>
              <div className="text-danger font-black mt-1">
                {formatDateBR(conta.data_vencimento)}
                {vencidaLabel}
              </div>
              <div className="mt-4 text-[10px] text-muted font-black uppercase tracking-[0.2em]">Valor Total</div>
              <div className="text-3xl font-black text-accent mt-1">{formatCurrency(Number(conta.valor) || 0)}</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mb-2">Data do Pagamento</div>
            <DatePicker value={dataPagamento} onChange={(v) => setDataPagamento(v || '')} />
          </div>
          <div>
            <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mb-2">Método de Pagamento</div>
            <CustomSelect
              value={metodo}
              onValueChange={(v) => setMetodo(v)}
              options={METODOS_PAGAMENTO.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mb-2">Observações (opcional)</div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full min-h-[110px] rounded-2xl border border-line bg-surface/30 px-5 py-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="Ex: Pago com desconto de 5%..."
            spellCheck={false}
          />
        </div>
      </div>
    </Modal>
  );
};
