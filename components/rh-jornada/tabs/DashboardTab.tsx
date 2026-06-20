import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckSquare, Clock3, FileBadge, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { Badge, Card, ErrorState, LoadingSpinner } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhAlertCritical, RhDashboardAiInsight, RhDashboardKpis, RhDevelopmentHealthSnapshot, RhPdiDashboardKpis, RhPendingDocumentView, RhProcessSummary } from '../../../types/rh';

export const DashboardTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<RhDashboardKpis | null>(null);
  const [pdiKpis, setPdiKpis] = useState<RhPdiDashboardKpis | null>(null);
  const [alerts, setAlerts] = useState<RhAlertCritical[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<RhPendingDocumentView[]>([]);
  const [myQueue, setMyQueue] = useState<RhProcessSummary[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [aiInsight, setAiInsight] = useState<RhDashboardAiInsight | null>(null);
  const [developmentHealth, setDevelopmentHealth] = useState<RhDevelopmentHealthSnapshot | null>(null);

  const loadData = async () => {
    const shouldBlock = !kpis && !pdiKpis && alerts.length === 0 && pendingDocuments.length === 0 && myQueue.length === 0;
    if (shouldBlock) setLoading(true);
    setError(null);
    try {
      const [nextKpis, nextPdiKpis, nextAlerts, nextPendingDocuments, nextMyQueue, nextRecentEvents] = await Promise.all([
        rhJornadaService.fetchDashboardKpis(),
        rhJornadaService.fetchPdiDashboardKpis(),
        rhJornadaService.fetchCriticalAlerts(),
        rhJornadaService.fetchPendingDocumentsView(),
        rhJornadaService.fetchMyQueue(),
        rhJornadaService.fetchRecentHistory(8),
      ]);
      setKpis(nextKpis);
      setPdiKpis(nextPdiKpis);
      setAlerts((nextAlerts as RhAlertCritical[]).slice(0, 8));
      setPendingDocuments(nextPendingDocuments.slice(0, 8));
      setMyQueue(nextMyQueue.slice(0, 6));
      setRecentEvents(nextRecentEvents);
      void Promise.all([
        rhJornadaService.fetchDashboardAiInsights().catch(() => null),
        rhJornadaService.fetchDevelopmentHealthSnapshot().catch(() => null),
      ]).then(([nextAiInsight, nextDevelopmentHealth]) => {
        setAiInsight(nextAiInsight);
        setDevelopmentHealth(nextDevelopmentHealth);
      });
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar o dashboard RH.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const myCriticalCount = useMemo(() => alerts.filter((item) => (item.dias_para_vencimento ?? 99) <= 0).length, [alerts]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Recrutamentos</div><div className="mt-2 text-3xl font-black text-primary">{kpis?.recrutamentos_ativos || 0}</div><div className="mt-1 text-xs font-bold text-muted">Ativos</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Onboardings</div><div className="mt-2 text-3xl font-black text-primary">{kpis?.onboardings_ativos || 0}</div><div className="mt-1 text-xs font-bold text-muted">Em andamento</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Desligamentos</div><div className="mt-2 text-3xl font-black text-primary">{kpis?.desligamentos_ativos || 0}</div><div className="mt-1 text-xs font-bold text-muted">Abertos</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Documentos</div><div className="mt-2 text-3xl font-black text-warning">{kpis?.documentos_pendentes || 0}</div><div className="mt-1 text-xs font-bold text-muted">Pendentes</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Criticos</div><div className="mt-2 text-3xl font-black text-danger">{myCriticalCount}</div><div className="mt-1 text-xs font-bold text-muted">Atrasados</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">PDI ativos</div><div className="mt-2 text-3xl font-black text-accent">{pdiKpis?.pdis_ativos || 0}</div><div className="mt-1 text-xs font-bold text-muted">Planos em andamento</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Checkpoints</div><div className="mt-2 text-3xl font-black text-info">{pdiKpis?.checkpoints_atrasados || 0}</div><div className="mt-1 text-xs font-bold text-muted">Atrasados</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Conquistas</div><div className="mt-2 text-3xl font-black text-success">{pdiKpis?.conquistas_mes || 0}</div><div className="mt-1 text-xs font-bold text-muted">No mes</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Promocao</div><div className="mt-2 text-3xl font-black text-info">{developmentHealth?.prontos_para_promocao || 0}</div><div className="mt-1 text-xs font-bold text-muted">Prontos</div></Card>
        <Card className="p-5 border border-strong/50"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Travados</div><div className="mt-2 text-3xl font-black text-danger">{developmentHealth?.colaboradores_travados || 0}</div><div className="mt-1 text-xs font-bold text-muted">Desenvolvimento</div></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4 text-danger" /><h3 className="text-primary text-base font-black">Alertas criticos</h3></div>
          <div className="space-y-3">{alerts.map((alert) => <div key={alert.etapa_id} className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-primary font-black">{alert.etapa_titulo}</div><div className="mt-1 text-sm font-bold text-muted">{alert.processo_titulo}</div></div><Badge variant={(alert.dias_para_vencimento ?? 99) <= 0 ? 'danger' : 'warning'}>{(alert.dias_para_vencimento ?? 99) <= 0 ? 'Atrasado' : `Vence em ${alert.dias_para_vencimento} dia(s)`}</Badge></div></div>)}{alerts.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum alerta critico no momento.</div> : null}</div>
        </Card>
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><FileBadge className="w-4 h-4 text-warning" /><h3 className="text-primary text-base font-black">Pendencias documentais</h3></div>
          <div className="space-y-3">{pendingDocuments.map((document) => <div key={document.id} className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-primary font-black">{document.tipo_documento}</div><div className="mt-1 text-sm font-bold text-muted">{document.processo_titulo}</div></div><Badge variant={document.status === 'rejeitado' ? 'danger' : 'warning'}>{document.status}</Badge></div></div>)}{pendingDocuments.length === 0 ? <div className="text-sm font-bold text-muted">Nenhuma pendencia documental relevante.</div> : null}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><BellRing className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Minha fila</h3></div>
          <div className="space-y-3">{myQueue.map((process) => <div key={process.id} className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-primary font-black">{process.titulo}</div><div className="mt-1 text-sm font-bold text-muted">{process.tipo} • {process.status}</div></div><Badge variant="info">{Math.round(process.percentual_conclusao)}%</Badge></div></div>)}{myQueue.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum processo atribuido ao usuario atual.</div> : null}</div>
        </Card>
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-accent" /><h3 className="text-primary text-base font-black">Resumo operacional</h3></div>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex items-center gap-2 text-primary font-black"><Clock3 className="w-4 h-4 text-muted" /> Etapas atrasadas</div><div className="mt-2 text-3xl font-black text-danger">{kpis?.etapas_atrasadas || 0}</div></div>
            <div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex items-center gap-2 text-primary font-black"><CheckSquare className="w-4 h-4 text-muted" /> Processos ativos</div><div className="mt-2 text-3xl font-black text-primary">{(kpis?.recrutamentos_ativos || 0) + (kpis?.onboardings_ativos || 0) + (kpis?.desligamentos_ativos || 0)}</div></div>
            <div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex items-center gap-2 text-primary font-black"><Target className="w-4 h-4 text-muted" /> PDI em curso</div><div className="mt-2 text-3xl font-black text-accent">{pdiKpis?.pdis_ativos || 0}</div></div>
            <div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="flex items-center gap-2 text-primary font-black"><Trophy className="w-4 h-4 text-muted" /> Conquistas do mes</div><div className="mt-2 text-3xl font-black text-success">{pdiKpis?.conquistas_mes || 0}</div></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Resumo executivo IA</h3></div>
          {aiInsight ? <div className="space-y-4"><div className="text-sm font-bold text-secondary leading-relaxed">{aiInsight.resumo_executivo}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Prioridades</div><div className="space-y-2">{aiInsight.prioridades.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-secondary">{item}</div>)}</div></div><div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Riscos</div><div className="space-y-2">{aiInsight.riscos.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-warning">{item}</div>)}</div></div><div className="rounded-2xl border border-base bg-surface/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Recomendacoes</div><div className="space-y-2">{aiInsight.recomendacoes.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-success">{item}</div>)}</div></div></div></div> : <div className="text-sm font-bold text-muted">Insights IA indisponiveis no momento.</div>}
        </Card>
        <Card className="p-5 border border-strong/50">
          <div className="flex items-center gap-2 mb-4"><BellRing className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Ultimos eventos</h3></div>
          <div className="space-y-3">{recentEvents.map((event) => <div key={event.id} className="rounded-2xl border border-base bg-surface/30 p-4"><div className="text-primary font-black">{event.comentario || event.acao}</div><div className="mt-1 text-sm font-bold text-muted">{event.processo?.titulo || 'Processo RH'} • {new Date(event.created_at).toLocaleString('pt-BR')}</div></div>)}{recentEvents.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum evento recente registrado.</div> : null}</div>
        </Card>
      </div>
    </div>
  );
};
