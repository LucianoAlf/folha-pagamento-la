import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, FileBadge, FileWarning, Filter, UploadCloud } from 'lucide-react';
import { Badge, Card, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { cn } from '../../CollaboratorComponents';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { UserProfile } from '../../../types';
import type { RhDocumentInboxItem, RhDocumentStatus } from '../../../types/rh';
import { canManageDocumentProcess, isAdminOrRh } from '../rhPermissions';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_analise', label: 'Em analise' },
  { value: 'conferido', label: 'Conferido' },
  { value: 'rejeitado', label: 'Rejeitado' },
];

const PROCESSO_OPTIONS = [
  { value: 'all', label: 'Todos os contextos' },
  { value: 'recrutamento', label: 'Recrutamento' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'desligamento', label: 'Desligamento' },
  { value: 'colaborador', label: 'Dossie do colaborador' },
];

const STATUS_META: Record<RhDocumentStatus, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' | 'info' | 'purple' }> = {
  pendente: { label: 'Pendente', variant: 'default' },
  enviado: { label: 'Enviado', variant: 'info' },
  em_analise: { label: 'Em analise', variant: 'purple' },
  conferido: { label: 'Conferido', variant: 'success' },
  rejeitado: { label: 'Rejeitado', variant: 'danger' },
};

export const DocumentosTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<RhDocumentInboxItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [processFilter, setProcessFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<RhDocumentInboxItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'em_analise' | 'conferido' | 'rejeitado'>('em_analise');
  const [reviewObservation, setReviewObservation] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pendingUploadDoc, setPendingUploadDoc] = useState<RhDocumentInboxItem | null>(null);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { run } = useAsyncAction();

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, nextAccess] = await Promise.all([
        rhJornadaService.fetchDocumentInbox({ status: statusFilter === 'all' ? undefined : statusFilter, processoTipo: processFilter === 'all' || processFilter === 'colaborador' ? undefined : processFilter }),
        rhJornadaService.fetchCurrentUserContext(),
      ]);
      setDocuments(processFilter === 'colaborador' ? rows.filter((item) => item.origem === 'colaborador') : rows);
      setAccess(nextAccess);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar os documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDocuments(); }, [statusFilter, processFilter]);
  useEffect(() => { if (reviewing) { setReviewStatus(reviewing.status === 'conferido' ? 'conferido' : reviewing.status === 'rejeitado' ? 'rejeitado' : 'em_analise'); setReviewObservation(reviewing.observacao || ''); } }, [reviewing]);

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((document) => [document.tipo_documento, document.nome_arquivo, document.processo?.titulo, document.colaborador?.nome, document.candidato?.nome, document.titulo_display, document.categoria].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [documents, search]);

  const counts = useMemo(() => documents.reduce<Record<string, number>>((acc, document) => ({ ...acc, [document.status]: (acc[document.status] || 0) + 1 }), {}), [documents]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadDocuments} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Pendentes</div><div className="mt-2 text-3xl font-black text-primary">{counts.pendente || 0}</div><div className="mt-1 text-xs font-bold text-muted">Ainda sem upload</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Enviados</div><div className="mt-2 text-3xl font-black text-info">{counts.enviado || 0}</div><div className="mt-1 text-xs font-bold text-muted">Aguardando revisao</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Conferidos</div><div className="mt-2 text-3xl font-black text-success">{counts.conferido || 0}</div><div className="mt-1 text-xs font-bold text-muted">Validados pelo RH</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Rejeitados</div><div className="mt-2 text-3xl font-black text-danger">{counts.rejeitado || 0}</div><div className="mt-1 text-xs font-bold text-muted">Com ajuste</div></Card>
      </div>

      <Card className="p-5 border border-strong/50">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_220px_minmax(0,1fr)] gap-4">
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Status</div><CustomSelect value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} /></div>
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Contexto</div><CustomSelect value={processFilter} onValueChange={setProcessFilter} options={PROCESSO_OPTIONS} /></div>
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Busca</div><div className="relative"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por documento, processo ou pessoa" className="w-full rounded-2xl border border-base bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><Filter className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-muted" /></div></div>
        </div>
      </Card>

      <Card className="p-5 border border-strong/50">
        <div className="flex items-center gap-2 mb-4"><FileBadge className="w-4 h-4 text-accent" /><h3 className="text-primary text-base font-black">Inbox documental</h3></div>
        {filteredDocuments.length === 0 ? <div className="rounded-3xl border border-dashed border-strong bg-surface/30 p-8 text-center"><div className="mx-auto w-14 h-14 rounded-3xl bg-surface-2/70 flex items-center justify-center mb-4"><FileWarning className="w-6 h-6 text-muted" /></div><div className="text-white font-black">Nenhum documento encontrado</div><div className="mt-2 text-sm font-bold text-muted">Ajuste os filtros ou crie novos lancamentos documentais.</div></div> : <div className="space-y-3">{filteredDocuments.map((document) => { const canManage = document.origem === 'colaborador' ? isAdminOrRh(access.role) : canManageDocumentProcess(access, document.processo || null); const ownerLabel = document.colaborador?.nome || document.candidato?.nome || 'Sem vinculo'; const title = document.titulo_display || document.tipo_documento; return <div key={document.id} className="rounded-3xl border border-base bg-surface/30 p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="text-white text-lg font-black">{title}</div><Badge variant={STATUS_META[document.status].variant}>{STATUS_META[document.status].label}</Badge>{document.origem === 'colaborador' ? <Badge variant="purple">Dossie</Badge> : null}{document.obrigatorio ? <Badge variant="warning">Obrigatorio</Badge> : null}</div><div className="mt-2 text-sm font-bold text-muted">{document.processo?.titulo || document.categoria || 'Dossie do colaborador'} • {ownerLabel}</div><div className="mt-1 text-xs font-bold text-muted">{document.nome_arquivo || 'Nenhum arquivo enviado'} {document.enviado_em ? `• enviado em ${new Date(document.enviado_em).toLocaleDateString('pt-BR')}` : ''}</div>{document.observacao ? <div className="mt-3 rounded-2xl border border-base bg-bg/40 p-3 text-sm font-bold text-secondary">{document.observacao}</div> : null}</div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setPendingUploadDoc(document); fileInputRef.current?.click(); }} disabled={!canManage || uploadingId === document.id} className={cn('px-4 py-2.5 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canManage || uploadingId === document.id ? 'bg-surface-3 opacity-60 cursor-not-allowed' : 'bg-accent hover:bg-accent')}><UploadCloud className="w-4 h-4" />{document.storage_path ? 'Trocar arquivo' : 'Enviar arquivo'}</button><button type="button" onClick={() => setReviewing(document)} disabled={!canManage} className={cn('px-4 py-2.5 rounded-2xl border border-base bg-surface/40 text-secondary font-black flex items-center gap-2 transition-all', !canManage ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface/60')}><CheckCircle2 className="w-4 h-4" />Revisar</button>{document.storage_path ? <button type="button" onClick={() => run(async () => { const url = await rhJornadaService.getDocumentSignedUrl(document.storage_path!); window.open(url, '_blank', 'noopener,noreferrer'); }, { error: 'Não foi possível abrir o documento.' })} className="px-4 py-2.5 rounded-2xl border border-base bg-surface/40 text-secondary font-black hover:bg-surface/60 flex items-center gap-2 transition-all"><Eye className="w-4 h-4" />Visualizar</button> : null}</div></div></div>; })}</div>}
      </Card>

      <input ref={fileInputRef} type="file" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; const doc = pendingUploadDoc; if (!file || !doc) return; setUploadingId(doc.id); await run(async () => { if (doc.origem === 'colaborador') await rhJornadaService.uploadCollaboratorDocument(doc.id, file); else await rhJornadaService.uploadDocument(doc.id, file); await loadDocuments(); }, { success: 'Documento enviado.', error: 'Não foi possível enviar o documento.' }); setUploadingId(null); setPendingUploadDoc(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} />

      <Modal isOpen={!!reviewing} onClose={() => setReviewing(null)} title="Revisar documento" subtitle={reviewing ? `${reviewing.titulo_display || reviewing.tipo_documento} • ${reviewing.processo?.titulo || reviewing.colaborador?.nome || 'RH'}` : ''} className="max-w-2xl" footer={<div className="flex items-center justify-between gap-3"><button type="button" onClick={() => setReviewing(null)} className="px-6 py-3 rounded-2xl border border-base bg-surface/40 text-secondary font-black hover:bg-surface/60 transition-all">Cancelar</button><button type="button" onClick={() => { const doc = reviewing; if (!doc) return; return run(async () => { if (doc.origem === 'colaborador') await rhJornadaService.reviewCollaboratorDocument(doc.id, reviewStatus, reviewObservation); else await rhJornadaService.reviewDocument(doc.id, reviewStatus, reviewObservation); await loadDocuments(); }, { success: 'Documento revisado.', error: 'Não foi possível revisar o documento.', onSuccess: () => setReviewing(null) }); }} className="px-8 py-3 rounded-2xl font-black text-white transition-all bg-accent hover:bg-accent">Salvar revisao</button></div>}><div className="space-y-5"><div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Status</div><CustomSelect value={reviewStatus} onValueChange={(value) => setReviewStatus(value as typeof reviewStatus)} options={[{ value: 'em_analise', label: 'Em analise' }, { value: 'conferido', label: 'Conferido' }, { value: 'rejeitado', label: 'Rejeitado' }]} /></div><div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Observacao</div><textarea value={reviewObservation} onChange={(e) => setReviewObservation(e.target.value)} rows={4} className="w-full rounded-2xl border border-base bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" placeholder="Motivo da rejeicao, pendencia ou conferencia" /></div></div></Modal>
    </div>
  );
};
