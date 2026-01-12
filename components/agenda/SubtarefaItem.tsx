import React, { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { TarefaSubtarefa } from '../../types/agenda';

export const SubtarefaItem: React.FC<{
  item: TarefaSubtarefa;
  onToggle: (next: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}> = ({ item, onToggle, onDelete }) => {
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/20 px-3 py-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onToggle(!item.concluida);
          } finally {
            setBusy(false);
          }
        }}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          item.concluida ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-violet-400'
        )}
        aria-label={item.concluida ? 'Marcar como pendente' : 'Concluir subtarefa'}
      >
        {item.concluida ? <Check className="w-3 h-3 text-white" /> : null}
      </button>

      <div className={cn('flex-1 text-sm font-bold', item.concluida ? 'text-slate-400 line-through' : 'text-slate-100')}>
        {item.titulo}
      </div>

      <Tooltip content="Excluir" side="left">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete();
            } finally {
              setBusy(false);
            }
          }}
          className="w-9 h-9 rounded-2xl border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-500 hover:text-rose-300 flex items-center justify-center transition-all"
          aria-label="Excluir subtarefa"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </Tooltip>
    </div>
  );
};

