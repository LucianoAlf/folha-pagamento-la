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
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/20 px-3 py-2">
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
          item.concluida ? 'bg-success border-success' : 'border-line-strong hover:border-accent'
        )}
        aria-label={item.concluida ? 'Marcar como pendente' : 'Concluir subtarefa'}
      >
        {item.concluida ? <Check className="w-3 h-3 text-primary" /> : null}
      </button>

      <div className={cn('flex-1 text-sm font-bold', item.concluida ? 'text-muted line-through' : 'text-primary')}>
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
          className="w-9 h-9 rounded-2xl border border-transparent hover:border-danger/30 hover:bg-danger/10 text-muted hover:text-danger-subtle flex items-center justify-center transition-all"
          aria-label="Excluir subtarefa"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </Tooltip>
    </div>
  );
};

