import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '../UI';
import { cn } from '../CollaboratorComponents';
import { FinanceiroDocumentoContaPagar } from '../../types/contasPagar';
import { fetchComprovantesContaPagar, getFinanceiroDocumentoSignedUrl, rejeitarComprovanteContaPagar } from '../../services/contasPagarService';
import { formatDateBR } from '../../utils/dateOnly';

const statusLabel: Record<FinanceiroDocumentoContaPagar['status_documento'], string> = {
  ativo: 'Ativo',
  pendente_vinculo: 'Pendente',
  rejeitado: 'Rejeitado',
};

const statusVariant: Record<FinanceiroDocumentoContaPagar['status_documento'], 'success' | 'warning' | 'danger'> = {
  ativo: 'success',
  pendente_vinculo: 'warning',
  rejeitado: 'danger',
};

const formatDateTimeBR = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDateBR(iso);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
};

export const ContaComprovantesCard: React.FC<{ contaId: string }> = ({ contaId }) => {
  const [docs, setDocs] = useState<FinanceiroDocumentoContaPagar[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [savingReject, setSavingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contaId) return;
    setLoading(true);
    setError(null);
    try {
      setDocs(await fetchComprovantesContaPagar(contaId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar comprovantes.');
    } finally {
      setLoading(false);
    }
  }, [contaId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (doc: FinanceiroDocumentoContaPagar) => {
    if (!doc.storage_path) {
      setError('Este comprovante não tem caminho de arquivo vinculado.');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    setOpeningId(doc.documento_id);
    setError(null);
    try {
      const url = await getFinanceiroDocumentoSignedUrl(doc.storage_path);
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (popup) popup.close();
      setError(err instanceof Error ? err.message : 'Erro ao abrir comprovante.');
    } finally {
      setOpeningId(null);
    }
  };

  const startReject = (doc: FinanceiroDocumentoContaPagar) => {
    setRejectingId(doc.documento_id);
    setMotivo('');
    setError(null);
  };

  const cancelReject = () => {
    setRejectingId(null);
    setMotivo('');
  };

  const confirmReject = async () => {
    if (!rejectingId || !motivo.trim()) return;
    setSavingReject(true);
    setError(null);
    try {
      await rejeitarComprovanteContaPagar(rejectingId, motivo.trim());
      setRejectingId(null);
      setMotivo('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar comprovante.');
    } finally {
      setSavingReject(false);
    }
  };

  const ativos = docs.filter((doc) => doc.status_documento === 'ativo').length;

  return (
    <div className="rounded-3xl border border-line/70 bg-surface/20 p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 text-accent text-[10px]">E</span>
            Comprovantes
          </div>
          <p className="mt-3 text-xs text-muted font-bold leading-relaxed">
            Arquivos anexados pela Maria/WhatsApp. São evidência financeira: não apague nem substitua; se estiver errado, rejeite com motivo.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2/60 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-secondary hover:text-primary disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge variant={ativos > 0 ? 'success' : 'default'} className="text-[10px] font-black uppercase tracking-wider">
          {ativos} ativo{ativos === 1 ? '' : 's'}
        </Badge>
        <Badge variant="info" className="text-[10px] font-black uppercase tracking-wider">
          Link seguro 10 min
        </Badge>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted">
          <ShieldCheck size={12} /> Bucket privado
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 p-3 text-xs font-bold text-danger flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-line bg-bg/40 p-5 text-xs font-bold text-secondary flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Carregando comprovantes…
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-bg/30 p-5 text-xs font-bold text-muted">
          Nenhum comprovante anexado nesta conta ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const isRejected = doc.status_documento === 'rejeitado';
            const isRejecting = rejectingId === doc.documento_id;
            return (
              <div
                key={doc.documento_id}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  isRejected ? 'border-danger/20 bg-danger/[0.04]' : 'border-line bg-bg/40'
                )}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex items-start gap-3">
                    <div className={cn(
                      'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                      isRejected ? 'border-danger/20 bg-danger/10 text-danger' : 'border-accent/20 bg-accent/10 text-accent'
                    )}>
                      <FileText size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-black text-primary">
                          {doc.nome_arquivo || 'Comprovante'}
                        </span>
                        <Badge variant={statusVariant[doc.status_documento]} className="text-[9px] font-black uppercase tracking-wider">
                          {statusLabel[doc.status_documento]}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-secondary">
                        <span>{formatDateTimeBR(doc.created_at)}</span>
                        <span>{doc.origem || doc.canal_origem || 'origem não informada'}</span>
                        <span>{formatBytes(doc.tamanho_bytes)}</span>
                        {doc.hash_parcial && <span>hash {doc.hash_parcial}</span>}
                      </div>
                      {(doc.enviado_por || doc.confirmado_por) && (
                        <div className="mt-1 text-[11px] font-bold text-muted">
                          {doc.enviado_por ? `Enviado por ${doc.enviado_por}` : ''}
                          {doc.enviado_por && doc.confirmado_por ? ' · ' : ''}
                          {doc.confirmado_por ? `Confirmado por ${doc.confirmado_por}` : ''}
                        </div>
                      )}
                      {isRejected && (
                        <div className="mt-2 text-[11px] font-bold text-danger">
                          Rejeitado por {doc.rejeitado_por || 'usuário'} em {formatDateTimeBR(doc.rejeitado_em)}
                          {doc.rejeitado_motivo ? ` · ${doc.rejeitado_motivo}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpen(doc)}
                      disabled={!doc.storage_path || openingId === doc.documento_id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-accent shadow-lg shadow-accent/15 transition-all hover:bg-accent/90 disabled:opacity-50"
                    >
                      {openingId === doc.documento_id ? <RefreshCw size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                      Ver
                    </button>
                    {!isRejected && (
                      <button
                        type="button"
                        onClick={() => startReject(doc)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-danger hover:bg-danger/15"
                      >
                        <XCircle size={13} />
                        Rejeitar
                      </button>
                    )}
                  </div>
                </div>

                {isRejecting && (
                  <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/[0.04] p-4">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-danger mb-2">
                      Motivo da rejeição *
                    </label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      placeholder="Ex.: comprovante anexado na conta errada"
                      className="w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-danger/30 resize-none"
                    />
                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={cancelReject}
                        disabled={savingReject}
                        className="rounded-xl border border-line bg-surface-2/70 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-secondary hover:text-primary disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={confirmReject}
                        disabled={savingReject || !motivo.trim()}
                        className="rounded-xl bg-danger px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-danger/20 hover:bg-danger/90 disabled:opacity-50"
                      >
                        {savingReject ? 'Rejeitando…' : 'Confirmar rejeição'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
