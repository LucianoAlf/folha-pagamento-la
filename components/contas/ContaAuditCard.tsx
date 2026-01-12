import React from 'react';
import { Calendar, Clock, MoreVertical, Repeat, Tag, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Badge, Card, Tooltip } from '../UI';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  conta: ContaPagar;
  onPagar: (conta: ContaPagar) => void;
  onEditar: (conta: ContaPagar) => void;
  onDelete?: (conta: ContaPagar) => void;
}

export const ContaAuditCard: React.FC<Props> = ({ conta, onPagar, onEditar, onDelete }) => {
  const statusVisual = getStatusVisual(conta);
  
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
    if (conta.status === 'pago') return 'text-emerald-400';
    if (statusVisual === 'vencida') return 'text-rose-400';
    if (statusVisual === 'urgente' || statusVisual === 'hoje') return 'text-amber-400';
    return 'text-slate-400';
  };

  return (
    <Card className={cn(
      "group relative flex flex-col p-5 h-full transition-all hover:shadow-xl hover:shadow-black/20 hover:border-slate-700",
      conta.status === 'pago' ? "border-emerald-500/10 bg-emerald-500/[0.02]" : "border-slate-800 bg-slate-900/40"
    )}>
      {/* Header: Title and Type */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-black truncate text-sm uppercase tracking-tight group-hover:text-violet-400 transition-colors">
            {conta.descricao}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            {conta.tipo_lancamento === 'recorrente' && (
              <Badge variant="info" className="text-[9px] h-4 px-1.5 flex items-center gap-1 border-violet-500/20 bg-violet-500/10 text-violet-300">
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
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              {(conta.unidade || 'todas').toUpperCase()}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content="Editar lançamento">
            <button 
              onClick={() => onEditar(conta)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-all"
            >
              <MoreVertical size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Value */}
      <div className="mt-auto">
        <div className="text-2xl font-black text-white tracking-tighter">
          {formatCurrency(Number(conta.valor) || 0)}
        </div>
        
        {/* Date / Status Info */}
        <div className={cn("flex items-center gap-1.5 mt-2 text-[11px] font-bold", getStatusColor())}>
          {conta.status === 'pago' ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              Liquidado em {new Date(conta.data_pagamento!).toLocaleDateString('pt-BR')}
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
      <div className="mt-5 pt-4 border-t border-slate-800/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <Badge 
            variant={conta.status === 'pago' ? 'success' : (statusVisual === 'vencida' ? 'danger' : (statusVisual === 'urgente' ? 'warning' : 'info'))}
            className="text-[10px] font-bold px-2 py-0.5 whitespace-nowrap"
          >
            {conta.status === 'pago' ? 'Pago' : (statusVisual === 'vencida' ? 'Pendente' : (statusVisual === 'urgente' ? 'Urgente' : 'Pendente'))}
          </Badge>
          
          {conta.categoria && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-[10px] font-bold truncate">
              <span className="shrink-0">{conta.categoria.icone}</span>
              <span className="truncate">{conta.categoria.nome}</span>
            </div>
          )}
        </div>

        {conta.status !== 'pago' && (
          <Tooltip content="Pagar agora" side="top">
            <button
              onClick={() => onPagar(conta)}
              className="shrink-0 w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-600/20 transition-all active:scale-95"
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
