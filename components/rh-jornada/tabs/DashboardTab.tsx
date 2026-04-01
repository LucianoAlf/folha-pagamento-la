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
    setLoading(true);
    setError(null);
    try {
      const [nextKpis, nextPdiKpis, nextAlerts, nextPendingDocuments, nextMyQueue, nextRecentEvents, nextAiInsight, nextDevelopmentHealth] = await Promise.all([
        rhJornadaService.fetchDashboardKpis(),
        rhJornadaService.fetchPdiDashboardKpis(),
        rhJornadaService.fetchCriticalAlerts(),
        rhJornadaService.fetchPendingDocumentsView(),
        rhJornadaService.fetchMyQueue(),
        rhJornadaService.fetchRecentHistory(8),
        rhJornadaService.fetchDashboardAiInsights().catch(() => null),
        rhJornadaService.fetchDevelopmentHealthSnapshot().catch(() => null),
      ]);
      setKpis(nextKpis);
      setPdiKpis(nextPdiKpis);
      setAlerts((nextAlerts as RhAlertCritical[]).slice(0, 8));
      setPendingDocuments(nextPendingDocuments.slice(0, 8));
      setMyQueue(nextMyQueue.slice(0, 6));
      setRecentEvents(nextRecentEvents);
      setAiInsight(nextAiInsight);
      setDevelopmentHealth(nextDevelopmentHealth);
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
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-10 gap-4">
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Recrutamentos</div><div className="mt-2 text-3xl font-black text-white">{kpis?.recrutamentos_ativos || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Ativos</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Onboardings</div><div className="mt-2 text-3xl font-black text-white">{kpis?.onboardings_ativos || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Em andamento</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Desligamentos</div><div className="mt-2 text-3xl font-black text-white">{kpis?.desligamentos_ativos || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Abertos</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Documentos</div><div className="mt-2 text-3xl font-black text-amber-300">{kpis?.documentos_pendentes || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Pendentes</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Criticos</div><div className="mt-2 text-3xl font-black text-rose-300">{myCriticalCount}</div><div className="mt-1 text-xs font-bold text-slate-400">Atrasados</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">PDI ativos</div><div className="mt-2 text-3xl font-black text-violet-300">{pdiKpis?.pdis_ativos || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Planos em andamento</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Checkpoints</div><div className="mt-2 text-3xl font-black text-cyan-300">{pdiKpis?.checkpoints_atrasados || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Atrasados</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Conquistas</div><div className="mt-2 text-3xl font-black text-emerald-300">{pdiKpis?.conquistas_mes || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">No mes</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Promocao</div><div className="mt-2 text-3xl font-black text-cyan-300">{developmentHealth?.prontos_para_promocao || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Prontos</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Travados</div><div className="mt-2 text-3xl font-black text-rose-300">{developmentHealth?.colaboradores_travados || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Desenvolvimento</div></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4 text-rose-300" /><h3 className="text-white text-base font-black">Alertas criticos</h3></div>
          <div className="space-y-3">{alerts.map((alert) => <div key={alert.etapa_id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-white font-black">{alert.etapa_titulo}</div><div className="mt-1 text-sm font-bold text-slate-400">{alert.processo_titulo}</div></div><Badge variant={(alert.dias_para_vencimento ?? 99) <= 0 ? 'danger' : 'warning'}>{(alert.dias_para_vencimento ?? 99) <= 0 ? 'Atrasado' : `Vence em ${alert.dias_para_vencimento} dia(s)`}</Badge></div></div>)}{alerts.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum alerta critico no momento.</div> : null}</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><FileBadge className="w-4 h-4 text-amber-300" /><h3 className="text-white text-base font-black">Pendencias documentais</h3></div>
          <div className="space-y-3">{pendingDocuments.map((document) => <div key={document.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-white font-black">{document.tipo_documento}</div><div className="mt-1 text-sm font-bold text-slate-400">{document.processo_titulo}</div></div><Badge variant={document.status === 'rejeitado' ? 'danger' : 'warning'}>{document.status}</Badge></div></div>)}{pendingDocuments.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma pendencia documental relevante.</div> : null}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><BellRing className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Minha fila</h3></div>
          <div className="space-y-3">{myQueue.map((process) => <div key={process.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-white font-black">{process.titulo}</div><div className="mt-1 text-sm font-bold text-slate-400">{process.tipo} • {process.status}</div></div><Badge variant="info">{Math.round(process.percentual_conclusao)}%</Badge></div></div>)}{myQueue.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum processo atribuido ao usuario atual.</div> : null}</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-violet-300" /><h3 className="text-white text-base font-black">Resumo operacional</h3></div>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-center gap-2 text-white font-black"><Clock3 className="w-4 h-4 text-slate-400" /> Etapas atrasadas</div><div className="mt-2 text-3xl font-black text-rose-300">{kpis?.etapas_atrasadas || 0}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-center gap-2 text-white font-black"><CheckSquare className="w-4 h-4 text-slate-400" /> Processos ativos</div><div className="mt-2 text-3xl font-black text-white">{(kpis?.recrutamentos_ativos || 0) + (kpis?.onboardings_ativos || 0) + (kpis?.desligamentos_ativos || 0)}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-center gap-2 text-white font-black"><Target className="w-4 h-4 text-slate-400" /> PDI em curso</div><div className="mt-2 text-3xl font-black text-violet-300">{pdiKpis?.pdis_ativos || 0}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-center gap-2 text-white font-black"><Trophy className="w-4 h-4 text-slate-400" /> Conquistas do mes</div><div className="mt-2 text-3xl font-black text-emerald-300">{pdiKpis?.conquistas_mes || 0}</div></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Resumo executivo IA</h3></div>
          {aiInsight ? <div className="space-y-4"><div className="text-sm font-bold text-slate-200 leading-relaxed">{aiInsight.resumo_executivo}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Prioridades</div><div className="space-y-2">{aiInsight.prioridades.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-slate-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Riscos</div><div className="space-y-2">{aiInsight.riscos.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-amber-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Recomendacoes</div><div className="space-y-2">{aiInsight.recomendacoes.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-emerald-200">{item}</div>)}</div></div></div></div> : <div className="text-sm font-bold text-slate-500">Insights IA indisponiveis no momento.</div>}
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><BellRing className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Ultimos eventos</h3></div>
          <div className="space-y-3">{recentEvents.map((event) => <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-white font-black">{event.comentario || event.acao}</div><div className="mt-1 text-sm font-bold text-slate-400">{event.processo?.titulo || 'Processo RH'} • {new Date(event.created_at).toLocaleString('pt-BR')}</div></div>)}{recentEvents.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum evento recente registrado.</div> : null}</div>
        </Card>
      </div>
    </div>
  );
};
