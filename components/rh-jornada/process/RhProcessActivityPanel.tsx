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
      <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-violet-300" />
          <h3 className="text-white text-base font-black">Comentários</h3>
          {stageId ? <Badge variant="info">Etapa atual</Badge> : null}
        </div>
        <div className="space-y-3 mb-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-sm font-bold text-slate-200 whitespace-pre-wrap">{comment.comentario}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">
                {new Date(comment.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
          {comments.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum comentário ainda.</div> : null}
        </div>
        <div className="space-y-3">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
            className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
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
              'px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
              !processId || !commentText.trim() || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
            )}
          >
            <Send className="w-4 h-4" />
            Publicar comentário
          </button>
        </div>
      </Card>

      <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-cyan-300" />
          <h3 className="text-white text-base font-black">Histórico</h3>
        </div>
        <div className="space-y-3">
          {history.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-white font-black">{event.acao.replaceAll('_', ' ')}</div>
              {event.comentario ? <div className="mt-1 text-sm font-bold text-slate-300">{event.comentario}</div> : null}
              <div className="mt-2 text-[11px] font-bold text-slate-500">
                {new Date(event.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
          {history.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum evento registrado ainda.</div> : null}
        </div>
      </Card>
    </div>
  );
};
