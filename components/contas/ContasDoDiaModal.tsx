import React, { useMemo } from 'react';
import { Calendar, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { Modal, Badge, Tooltip } from '../UI';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';

function formatDateTitleBR(iso: string) {
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  if (!yyyy || !mm || !dd) return iso;
  const d = new Date(yyyy, mm - 1, dd);
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  // "01 de janeiro"
  return label;
}

export const ContasDoDiaModal: React.FC<{
  isOpen: boolean;
  dateISO: string;
  contas: ContaPagar[];
  onClose: () => void;
  onPagar: (conta: ContaPagar) => void;
  onEditar: (conta: ContaPagar) => void;
  onExcluir: (conta: ContaPagar) => void;
  onNovaConta?: (dateISO: string) => void;
}> = ({ isOpen, dateISO, contas, onClose, onPagar, onEditar, onExcluir, onNovaConta }) => {
  const totalDia = useMemo(() => contas.reduce((s, c) => s + (Number(c.valor) || 0), 0), [contas]);

  const badgeFor = (c: ContaPagar) => {
    if (c.status === 'pago') return <Badge variant="success">Pago</Badge>;
    const v = getStatusVisual(c);
    if (v === 'vencida') return <Badge variant="danger">Vencida</Badge>;
    if (v === 'urgente') return <Badge variant="warning">Urgente</Badge>;
    if (v === 'hoje') return <Badge variant="warning">Hoje</Badge>;
    return <Badge variant="info">Pendente</Badge>;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={formatDateTitleBR(dateISO)}
      subtitle="Contas previstas para este dia"
      className="max-w-2xl"
      headerIcon={<Calendar size={18} />}
      footer={
        <div className="w-full flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-widest text-muted">Total do dia</div>
          <div className="text-xl font-black text-primary">{formatCurrency(totalDia)}</div>
        </div>
      }
    >
      <div className="space-y-4">
        {onNovaConta && (
          <button
            type="button"
            onClick={() => onNovaConta(dateISO)}
            className="w-full rounded-2xl border border-line bg-surface/20 hover:bg-surface/30 transition-all px-4 py-3 text-sm font-black text-primary"
          >
            + Nova conta para este dia
          </button>
        )}

        {contas.length === 0 ? (
          <div className="text-sm text-muted font-bold py-10 text-center">Nenhuma conta para este dia.</div>
        ) : (
          contas.map((c) => (
            (() => {
              const visual = c.status === 'pago' ? 'pago' : getStatusVisual(c);
              const cardTone =
                visual === 'pago'
                  ? 'border-success/25 bg-success/5'
                  : visual === 'vencida'
                    ? 'border-danger/30 bg-danger/5'
                    : 'border-warning/20 bg-warning/5';
              return (
            <div
              key={c.id}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                cardTone
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-primary font-black truncate">{c.descricao}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="text-secondary text-xs font-bold truncate">{c.categoria?.nome || 'Sem categoria'}</div>
                    {badgeFor(c)}
                  </div>
                </div>
                <div className="text-primary font-black text-lg whitespace-nowrap">{formatCurrency(Number(c.valor) || 0)}</div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {c.status === 'pago' ? (
                  <div className="flex items-center gap-2 text-success font-black text-xs">
                    <CheckCircle2 size={14} />
                    Liquidado
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPagar(c)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white text-xs font-black shadow-lg shadow-accent/20 transition-all"
                  >
                    <CheckCircle2 size={14} />
                    Pagar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onEditar(c)}
                  className="px-4 py-2.5 rounded-xl border border-line bg-surface/20 hover:bg-surface/30 text-secondary text-xs font-black transition-all"
                >
                  <span className="inline-flex items-center gap-2">
                    <Pencil size={14} />
                    Editar
                  </span>
                </button>

                <Tooltip content="Excluir">
                  <button
                    type="button"
                    onClick={() => onExcluir(c)}
                    className="px-3 py-2.5 rounded-xl border border-line bg-surface/20 hover:bg-danger/10 hover:border-danger/30 text-danger text-xs font-black transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
              );
            })()
          ))
        )}
      </div>
    </Modal>
  );
};
