import React, { useEffect, useState } from 'react';
import { History, MessageSquare, Send } from 'lucide-react';
import { Badge, Card } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhComment, RhHistoryEvent } from '../../../types/rh';
import { cn } from '../../CollaboratorComponents';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

export const RhProcessActivityPanel: React.FC<{ processId: string | null; stageId?: string | null }> = ({ processId, stageId }) => {
  const [comments, setComments] = useState<RhComment[]>([]);
  const [history, setHistory] = useState<RhHistoryEvent[]>([]);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const { run } = useAsyncAction();

  const loadData = async () => {
    if (!processId) {
      setComments([]);
      setHistory([]);
      return;
    }
    const [nextComments, nextHistory] = await Promise.all([rhJornadaService.fetchComments(processId, stageId || null), rhJornadaService.fetchHistory(processId)]);
    setComments(nextComments);
    setHistory(nextHistory as RhHistoryEvent[]);
  };

  useEffect(() => {
    void loadData();
  }, [processId, stageId]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
      <Card className="p-5 border border-line-strong/50">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-accent" />
          <h3 className="text-primary text-base font-black">Comentários</h3>
          {stageId ? <Badge variant="info">Etapa atual</Badge> : null}
        </div>
        <div className="space-y-3 mb-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-2xl border border-line bg-surface/30 p-4">
              <div className="text-sm font-bold text-secondary whitespace-pre-wrap">{comment.comentario}</div>
              <div className="mt-2 text-[11px] font-bold text-muted">
                {new Date(comment.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
          {comments.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum comentário ainda.</div> : null}
        </div>
        <div className="space-y-3">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
            className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
            placeholder={stageId ? 'Registrar atualização da etapa selecionada...' : 'Registrar atualização, pendência, alinhamento ou contexto do processo...'}
          />
          <button
            type="button"
            disabled={!processId || !commentText.trim() || saving}
            onClick={async () => {
              if (!processId || !commentText.trim()) return;
              setSaving(true);
              await run(
                async () => {
                  await rhJornadaService.createComment(processId, commentText.trim(), stageId || null);
                  setCommentText('');
                  await loadData();
                },
                {
                  success: 'Comentário publicado.',
                  error: 'Não foi possível publicar o comentário.',
                }
              );
              setSaving(false);
            }}
            className={cn(
              'px-5 py-3 rounded-2xl font-black text-primary flex items-center gap-2 transition-all',
              !processId || !commentText.trim() || saving ? 'bg-surface-3 opacity-60 cursor-not-allowed' : 'bg-accent hover:bg-accent'
            )}
          >
            <Send className="w-4 h-4" />
            Publicar comentário
          </button>
        </div>
      </Card>

      <Card className="p-5 border border-line-strong/50">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-info" />
          <h3 className="text-primary text-base font-black">Histórico</h3>
        </div>
        <div className="space-y-3">
          {history.map((event) => (
            <div key={event.id} className="rounded-2xl border border-line bg-surface/30 p-4">
              <div className="text-primary font-black">{event.acao.replaceAll('_', ' ')}</div>
              {event.comentario ? <div className="mt-1 text-sm font-bold text-secondary">{event.comentario}</div> : null}
              <div className="mt-2 text-[11px] font-bold text-muted">
                {new Date(event.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
          {history.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum evento registrado ainda.</div> : null}
        </div>
      </Card>
    </div>
  );
};
