import React from 'react';
import { Calendar, Clock, MoreVertical, Repeat, Tag, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Badge, Card, Tooltip } from '../UI';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';
import { formatContaCentroCustoLabel, formatContaPlanoLabel } from './planoContasSelectors';

interface Props {
  conta: ContaPagar;
  onPagar: (conta: ContaPagar) => void;
  onEditar: (conta: ContaPagar) => void;
  onDelete?: (conta: ContaPagar) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const ContaAuditCard: React.FC<Props> = ({ conta, onPagar, onEditar, onDelete, selected, onToggleSelect }) => {
  const statusVisual = getStatusVisual(conta);
  const planoLabel = formatContaPlanoLabel(conta);
  const centroLabel = formatContaCentroCustoLabel(conta);

  const formatDateShortBR = (iso: string) => {
    // iso can be YYYY-MM-DD (preferred) or a full ISO string; we only need dd/MM
    if (!iso) return '';
    const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  };
  
  const getRelativeDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const diff = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Vence hoje';
    if (diffDays === 1) return 'Amanhã';
    if (diffDays === -1) return 'Venceu ontem';
    
    if (diffDays < 0) {
      return `Venceu há ${Math.abs(diffDays)} dias`;
    }
    
    return `Vence em ${diffDays} dias`;
  };

  const getStatusColor = () => {
    if (conta.status === 'pago') return 'text-success';
    if (statusVisual === 'vencida') return 'text-danger';
    if (statusVisual === 'urgente' || statusVisual === 'hoje') return 'text-warning';
    return 'text-secondary';
  };

  return (
    <Card className={cn(
      "group relative flex flex-col p-5 h-full transition-all hover:shadow-[var(--shadow-card)] hover:border-line-strong",
      conta.status === 'pago' ? "border-success/10 bg-success/[0.02]" : "border-line bg-surface/40",
      selected && "border-accent/40 bg-accent/[0.04]"
    )}>
      {/* Checkbox de seleção */}
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(conta.id); }}
          className={cn(
            "absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10",
            selected
              ? "bg-accent border-accent text-white"
              : "border-line-strong opacity-0 group-hover:opacity-100 hover:border-accent"
          )}
          aria-label="Selecionar"
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
      )}

      {/* Header: Title and Type */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-primary font-black truncate text-sm uppercase tracking-tight group-hover:text-accent transition-colors">
            {conta.descricao}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            {conta.tipo_lancamento === 'recorrente' && (
              <Badge variant="info" className="text-[9px] h-4 px-1.5 flex items-center gap-1 border-accent/20 bg-accent/10 text-accent">
                <Repeat size={10} />
                Recorrente
              </Badge>
            )}
            {conta.tipo_lancamento === 'parcelada' && (
              <Badge variant="purple" className="text-[9px] h-4 px-1.5 flex items-center gap-1">
                <Tag size={10} />
                Parcela {conta.parcela_atual}/{conta.total_parcelas}
              </Badge>
            )}
            {conta.tipo_lancamento === 'eventual' && (
              <Badge variant="info" className="text-[9px] h-4 px-1.5 flex items-center gap-1">
                <Tag size={10} />
                Eventual
              </Badge>
            )}
            {/* Centro de custo como mini-chip */}
            <div className="text-[9px] h-4 px-1.5 rounded-md bg-surface-2/40 border border-line-strong/50 text-secondary font-black flex items-center">
              {centroLabel}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content="Editar lançamento">
            <button 
              onClick={() => onEditar(conta)}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-primary transition-all"
            >
              <MoreVertical size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Value */}
      <div className="mt-auto">
        <div className="text-base font-bold text-primary tracking-tighter">
          {formatCurrency(Number(conta.valor) || 0)}
        </div>
        
        {/* Date / Status Info */}
        <div className={cn("flex items-center gap-1.5 mt-2 text-[11px] font-bold", getStatusColor())}>
          {conta.status === 'pago' ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              <span className="lg:hidden">Liquidado em {formatDateShortBR(conta.data_pagamento!)}</span>
              <span className="hidden lg:inline">Liquidado em {new Date(conta.data_pagamento!).toLocaleDateString('pt-BR')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {statusVisual === 'vencida' ? <AlertTriangle size={12} /> : <Clock size={12} />}
              {getRelativeDate(conta.data_vencimento)}
            </div>
          )}
        </div>
      </div>

      {/* Footer: Badges and Action */}
      <div className="mt-4 pt-3 border-t border-line/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <Badge 
            variant={conta.status === 'pago' ? 'success' : (statusVisual === 'vencida' ? 'danger' : (statusVisual === 'urgente' || statusVisual === 'hoje' ? 'warning' : 'info'))}
            className="text-[10px] font-black px-2.5 h-6 inline-flex items-center whitespace-nowrap"
          >
            {conta.status === 'pago' ? 'Pago' : (statusVisual === 'vencida' ? 'Pendente' : (statusVisual === 'hoje' ? 'Hoje' : (statusVisual === 'urgente' ? 'Urgente' : 'Pendente')))}
          </Badge>
          
          <div className="h-6 flex items-center gap-1.5 px-2.5 rounded-md bg-surface-2/50 border border-line-strong/50 text-secondary text-[10px] font-black truncate">
            <span className="truncate">{planoLabel}</span>
          </div>
          <div className="hidden sm:flex h-6 items-center px-2.5 rounded-md bg-surface-2/30 border border-line text-secondary text-[10px] font-black truncate">
            <span className="truncate">{centroLabel}</span>
          </div>
        </div>

        {conta.status !== 'pago' && (
          <Tooltip content="Pagar agora" side="top">
            <button
              onClick={() => onPagar(conta)}
              className="shrink-0 w-8 h-8 rounded-lg bg-accent hover:bg-accent/80 text-white flex items-center justify-center shadow-lg shadow-accent/20 transition-all active:scale-95"
              aria-label="Pagar agora"
            >
              <CheckCircle2 size={16} />
            </button>
          </Tooltip>
        )}
      </div>
    </Card>
  );
};
