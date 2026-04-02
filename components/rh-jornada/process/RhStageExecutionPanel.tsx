import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CalendarClock, CheckSquare, ExternalLink, FileText, Plus, Save, Trash2, Users } from 'lucide-react';
import { Badge, Card, CustomSelect } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhChecklistItem, RhDocument, RhProcess, RhProcessParticipant, RhStage, RhStageResponsible } from '../../../types/rh';
import type { UserProfile } from '../../../types';
import { cn } from '../../CollaboratorComponents';
import { canManageProcessParticipants, canManageStage } from '../rhPermissions';

const ROLE_OPTIONS = [
  { value: 'rh', label: 'RH' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'avaliador', label: 'Avaliador' },
  { value: 'financeiro', label: 'Financeiro' },
];

const humanizeRole = (role?: string | null) => {
  switch (role) {
    case 'rh':
      return 'RH';
    case 'gestor':
      return 'Gestor';
    case 'mentor':
      return 'Mentor';
    case 'avaliador':
      return 'Avaliador';
    case 'financeiro':
      return 'Financeiro';
    default:
      return 'Equipe';
  }
};

const STAGE_STATUS_OPTIONS = [
  { value: 'nao_iniciada', label: 'Não iniciada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'dispensada', label: 'Dispensada' },
  { value: 'atrasada', label: 'Atrasada' },
];

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const RhStageExecutionPanel: React.FC<{ process: RhProcess | null; stage: RhStage | null; onStageUpdated?: () => Promise<void> | void; }> = ({ process, stage, onStageUpdated }) => {
  const [checklist, setChecklist] = useState<RhChecklistItem[]>([]);
  const [responsibles, setResponsibles] = useState<RhStageResponsible[]>([]);
  const [participants, setParticipants] = useState<RhProcessParticipant[]>([]);
  const [documents, setDocuments] = useState<RhDocument[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newChecklist, setNewChecklist] = useState({ titulo: '', descricao: '', link_url: '', obrigatorio: true });
  const [newDocumentType, setNewDocumentType] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('rh');
  const [selectedStageStatus, setSelectedStageStatus] = useState('nao_iniciada');
  const [stageForm, setStageForm] = useState({ data_limite: '', agendado_em: '', instrucoes: '', modelo_mensagem: '', link_referencia: '', link_reuniao: '', observacoes: '', notificar_responsaveis: true, notificar_colaborador: false });
  const [savingItem, setSavingItem] = useState(false);
  const [savingResponsible, setSavingResponsible] = useState(false);
  const [savingStageStatus, setSavingStageStatus] = useState(false);
  const [savingStageConfig, setSavingStageConfig] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null);

  const loadData = async () => {
    if (!stage || !process) {
      setChecklist([]); setResponsibles([]); setParticipants([]); setDocuments([]);
      return;
    }
    const [nextChecklist, nextResponsibles, nextParticipants, nextUsers, nextAccess, nextDocuments] = await Promise.all([
      rhJornadaService.fetchChecklistItems(stage.id),
      rhJornadaService.fetchStageResponsibles(stage.id),
      rhJornadaService.fetchProcessParticipants(process.id),
      rhJornadaService.fetchUserProfiles(),
      rhJornadaService.fetchCurrentUserContext(),
      rhJornadaService.fetchStageDocuments(stage.id),
    ]);
    setChecklist(nextChecklist); setResponsibles(nextResponsibles); setParticipants(nextParticipants); setUsers(nextUsers); setAccess(nextAccess); setDocuments(nextDocuments);
  };

  useEffect(() => { void loadData(); }, [process?.id, stage?.id]);

  useEffect(() => {
    setSelectedStageStatus(stage?.status || 'nao_iniciada');
    setStageForm({
      data_limite: stage?.data_limite || '',
      agendado_em: toDateTimeLocalValue(stage?.agendado_em),
      instrucoes: stage?.instrucoes || '',
      modelo_mensagem: stage?.modelo_mensagem || '',
      link_referencia: stage?.link_referencia || '',
      link_reuniao: stage?.link_reuniao || '',
      observacoes: stage?.observacoes || '',
      notificar_responsaveis: stage?.notificar_responsaveis ?? true,
      notificar_colaborador: stage?.notificar_colaborador ?? false,
    });
  }, [stage?.id, stage?.status, stage?.data_limite, stage?.agendado_em, stage?.instrucoes, stage?.modelo_mensagem, stage?.link_referencia, stage?.link_reuniao, stage?.observacoes, stage?.notificar_responsaveis, stage?.notificar_colaborador]);

  const userOptions = useMemo(() => users.map((user) => ({ value: user.id, label: `${user.nome} • ${humanizeRole(user.role)}` })), [users]);
  const canOperateStage = canManageStage(access, process, responsibles, participants);
  const canAssignResponsibles = canManageProcessParticipants(access, process);
  const primaryResponsible = responsibles.find((responsible) => responsible.principal) || null;

  if (!stage) return <Card className="p-5 border border-slate-700/50"><div className="text-sm font-bold text-slate-500">Selecione uma etapa para ver checklist, responsáveis, links e comunicação operacional.</div></Card>;

  return (
    <div className="space-y-6">
      <Card className="p-5 border border-slate-700/50">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Etapa atual</div>
            <div className="mt-2 text-lg font-black text-white">{stage.titulo}</div>
            <div className="mt-1 text-sm font-bold text-slate-400">Categoria: {stage.categoria}{stage.data_limite ? ` • Prazo ${new Date(`${stage.data_limite}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}{stage.agendado_em ? ` • Agendado ${new Date(stage.agendado_em).toLocaleString('pt-BR')}` : ''}</div>
            {primaryResponsible ? <div className="mt-2 text-xs font-bold text-cyan-300">Principal: {primaryResponsible.user?.nome || 'Responsável não identificado'} • {humanizeRole(primaryResponsible.papel)}</div> : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[220px_auto_auto] gap-3">
            <CustomSelect value={selectedStageStatus} onValueChange={setSelectedStageStatus} options={STAGE_STATUS_OPTIONS} />
            <button type="button" disabled={!canOperateStage || savingStageStatus || selectedStageStatus === stage.status} onClick={async () => { setSavingStageStatus(true); try { await rhJornadaService.updateStageStatus(stage.id, selectedStageStatus as RhStage['status']); await loadData(); await onStageUpdated?.(); } finally { setSavingStageStatus(false); } }} className={cn('px-5 py-3 rounded-2xl font-black text-white transition-all', !canOperateStage || savingStageStatus || selectedStageStatus === stage.status ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}>Salvar status</button>
            <button type="button" disabled={!canOperateStage || sendingWhatsApp} onClick={async () => { setSendingWhatsApp(true); try { await rhJornadaService.sendStageWhatsAppNotifications(stage.id); } finally { setSendingWhatsApp(false); } }} className={cn('px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canOperateStage || sendingWhatsApp ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')}><BellRing className="w-4 h-4" />Avisar via WhatsApp</button>
          </div>
        </div>
        {!canOperateStage ? <div className="mt-4 text-sm font-bold text-slate-500">Você tem acesso de leitura nesta etapa.</div> : null}
      </Card>

      <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4"><CalendarClock className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Configuração operacional da etapa</h3></div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Prazo</div><input type="date" value={stageForm.data_limite} onChange={(e) => setStageForm((current) => ({ ...current, data_limite: e.target.value }))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Data e hora</div><input type="datetime-local" value={stageForm.agendado_em} onChange={(e) => setStageForm((current) => ({ ...current, agendado_em: e.target.value }))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
          <div className="xl:col-span-2"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Instruções da etapa</div><textarea value={stageForm.instrucoes} onChange={(e) => setStageForm((current) => ({ ...current, instrucoes: e.target.value }))} rows={4} placeholder="Passo a passo, texto-base e orientação da etapa." className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
          <div className="xl:col-span-2"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Modelo de mensagem</div><textarea value={stageForm.modelo_mensagem} onChange={(e) => setStageForm((current) => ({ ...current, modelo_mensagem: e.target.value }))} rows={4} placeholder="Ex.: Olá, {colaborador}. Sua etapa {etapa} foi agendada para {data_hora}. Mentor: {mentor}. Link: {link_reuniao}." className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><div className="mt-2 text-xs font-bold text-slate-500">Os campos entre chaves são preenchidos automaticamente pelo sistema.</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Link de referência</div><input value={stageForm.link_referencia} onChange={(e) => setStageForm((current) => ({ ...current, link_referencia: e.target.value }))} placeholder="Vídeo, playbook, docs" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
          <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Link de reunião</div><input value={stageForm.link_reuniao} onChange={(e) => setStageForm((current) => ({ ...current, link_reuniao: e.target.value }))} placeholder="Meet, Zoom, etc." className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
          <div className="xl:col-span-2"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Observações internas</div><textarea value={stageForm.observacoes} onChange={(e) => setStageForm((current) => ({ ...current, observacoes: e.target.value }))} rows={3} placeholder="Anotações operacionais e contexto." className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={stageForm.notificar_responsaveis} onChange={(e) => setStageForm((current) => ({ ...current, notificar_responsaveis: e.target.checked }))} className="accent-violet-500" />Notificar responsáveis</label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={stageForm.notificar_colaborador} onChange={(e) => setStageForm((current) => ({ ...current, notificar_colaborador: e.target.checked }))} className="accent-violet-500" />Notificar colaborador/candidato</label>
          <button type="button" disabled={!canOperateStage || savingStageConfig} onClick={async () => { setSavingStageConfig(true); try { await rhJornadaService.updateStage(stage.id, { data_limite: stageForm.data_limite || null, agendado_em: stageForm.agendado_em ? new Date(stageForm.agendado_em).toISOString() : null, instrucoes: stageForm.instrucoes || null, modelo_mensagem: stageForm.modelo_mensagem || null, link_referencia: stageForm.link_referencia || null, link_reuniao: stageForm.link_reuniao || null, observacoes: stageForm.observacoes || null, notificar_responsaveis: stageForm.notificar_responsaveis, notificar_colaborador: stageForm.notificar_colaborador }); await loadData(); await onStageUpdated?.(); } finally { setSavingStageConfig(false); } }} className={cn('px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canOperateStage || savingStageConfig ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}><Save className="w-4 h-4" />Salvar configuração da etapa</button>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><CheckSquare className="w-4 h-4 text-amber-300" /><h3 className="text-white text-base font-black">Checklist oficial da etapa</h3></div>
          <div className="space-y-3 mb-4">
            {checklist.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={item.concluido} disabled={!canOperateStage} onChange={async (e) => { await rhJornadaService.toggleChecklistItem(item.id, e.target.checked); await loadData(); await onStageUpdated?.(); }} className="accent-violet-500 mt-1" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                      <input value={item.titulo} disabled={!canOperateStage} onChange={(e) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, titulo: e.target.value } : entry))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                      <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-300"><input type="checkbox" checked={item.obrigatorio} disabled={!canOperateStage} onChange={(e) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, obrigatorio: e.target.checked } : entry))} className="accent-violet-500" />Obrigatório</label>
                    </div>
                    <textarea value={item.descricao || ''} disabled={!canOperateStage} onChange={(e) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, descricao: e.target.value } : entry))} rows={3} placeholder="Texto operacional, observações e conteúdo reutilizável." className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                      <input value={item.link_url || ''} disabled={!canOperateStage} onChange={(e) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, link_url: e.target.value } : entry))} placeholder="Link de apoio" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                      {item.link_url ? <button type="button" onClick={() => window.open(item.link_url!, '_blank', 'noopener,noreferrer')} className="px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black hover:bg-slate-900/60 flex items-center gap-2 transition-all"><ExternalLink className="w-4 h-4" />Abrir</button> : <div />}
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={!canOperateStage || savingItem} onClick={async () => { setSavingItem(true); try { await rhJornadaService.updateChecklistItem(item.id, { titulo: item.titulo, descricao: item.descricao || null, link_url: item.link_url || null, obrigatorio: item.obrigatorio, ordem: item.ordem }); await loadData(); } finally { setSavingItem(false); } }} className={cn('px-4 py-3 rounded-2xl font-black text-white transition-all', !canOperateStage || savingItem ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500')}>Salvar</button>
                        <button type="button" disabled={!canOperateStage || savingItem} onClick={async () => { setSavingItem(true); try { await rhJornadaService.deleteChecklistItem(item.id); await loadData(); await onStageUpdated?.(); } finally { setSavingItem(false); } }} className={cn('p-3 rounded-2xl border border-rose-500/30 text-rose-200 transition-all', !canOperateStage || savingItem ? 'bg-slate-900/30 opacity-60 cursor-not-allowed' : 'bg-rose-500/10 hover:bg-rose-500/20')} title="Excluir item"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {checklist.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum item ainda. Adicione o checklist operacional desta etapa.</div> : null}
          </div>
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/20 p-4 space-y-3">
            <input value={newChecklist.titulo} onChange={(e) => setNewChecklist((current) => ({ ...current, titulo: e.target.value }))} placeholder="Novo item do checklist" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            <textarea value={newChecklist.descricao} onChange={(e) => setNewChecklist((current) => ({ ...current, descricao: e.target.value }))} rows={3} placeholder="Descrição operacional, texto-base ou passo a passo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
              <input value={newChecklist.link_url} onChange={(e) => setNewChecklist((current) => ({ ...current, link_url: e.target.value }))} placeholder="Link opcional" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-300"><input type="checkbox" checked={newChecklist.obrigatorio} onChange={(e) => setNewChecklist((current) => ({ ...current, obrigatorio: e.target.checked }))} className="accent-violet-500" />Obrigatório</label>
              <button type="button" disabled={!canOperateStage || !newChecklist.titulo.trim() || savingItem} onClick={async () => { setSavingItem(true); try { await rhJornadaService.createChecklistItem({ etapa_id: stage.id, titulo: newChecklist.titulo.trim(), descricao: newChecklist.descricao.trim() || null, link_url: newChecklist.link_url.trim() || null, obrigatorio: newChecklist.obrigatorio }); setNewChecklist({ titulo: '', descricao: '', link_url: '', obrigatorio: true }); await loadData(); await onStageUpdated?.(); } finally { setSavingItem(false); } }} className={cn('px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canOperateStage || !newChecklist.titulo.trim() || savingItem ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}><Plus className="w-4 h-4" />Adicionar</button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Responsáveis da etapa</h3></div>
            <div className="space-y-3 mb-4">
              {responsibles.map((responsible) => (
                <div key={responsible.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex items-center justify-between gap-3">
                  <div><div className="text-white font-black">{responsible.user?.nome || 'Responsável não identificado'}</div><div className="mt-1 text-sm font-bold text-slate-400">{humanizeRole(responsible.papel)}</div></div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!canAssignResponsibles} onClick={async () => { await rhJornadaService.setStageResponsibleAsPrimary(responsible.id); await loadData(); }} className={cn('px-3 py-2 rounded-xl font-black text-xs transition-all', !canAssignResponsibles ? 'bg-slate-700 opacity-60 cursor-not-allowed text-slate-300' : responsible.principal ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700')}>{responsible.principal ? 'Principal' : 'Tornar principal'}</button>
                    <button type="button" disabled={!canAssignResponsibles} onClick={async () => { await rhJornadaService.removeStageResponsible(responsible.id); await loadData(); }} className={cn('p-2 rounded-xl border border-rose-500/30 text-rose-200 transition-all', !canAssignResponsibles ? 'opacity-60 cursor-not-allowed bg-slate-900/30' : 'bg-rose-500/10 hover:bg-rose-500/20')}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {responsibles.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum responsável atribuído ainda.</div> : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
              <CustomSelect value={selectedUserId} onValueChange={setSelectedUserId} options={userOptions} placeholder="Selecione um usuário" />
              <CustomSelect value={selectedRole} onValueChange={setSelectedRole} options={ROLE_OPTIONS} />
              <button type="button" disabled={!canAssignResponsibles || !selectedUserId || savingResponsible} onClick={async () => { setSavingResponsible(true); try { await rhJornadaService.addStageResponsible(stage.id, selectedUserId, selectedRole as any, responsibles.length === 0); setSelectedUserId(''); await loadData(); } finally { setSavingResponsible(false); } }} className={cn('px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canAssignResponsibles || !selectedUserId || savingResponsible ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}><Plus className="w-4 h-4" />Atribuir</button>
            </div>
          </Card>

          <Card className="p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-fuchsia-300" /><h3 className="text-white text-base font-black">Documentos da etapa</h3></div>
            <div className="space-y-3 mb-4">
              {documents.map((document) => (
                <div key={document.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><div className="text-white font-black">{document.tipo_documento}</div><div className="mt-1 text-xs font-bold text-slate-400">{document.nome_arquivo || 'Sem arquivo anexado'} • {document.status}</div></div>
                    <div className="flex flex-wrap gap-2">
                      {document.storage_path ? <button type="button" onClick={async () => { const url = await rhJornadaService.getDocumentSignedUrl(document.storage_path!); window.open(url, '_blank', 'noopener,noreferrer'); }} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40 text-slate-200 text-xs font-black hover:bg-slate-900/60 transition-all">Visualizar</button> : null}
                      <button type="button" disabled={!canOperateStage || uploadingDocumentId === document.id} onClick={() => { setPendingDocumentId(document.id); fileInputRef.current?.click(); }} className={cn('px-3 py-2 rounded-xl border border-slate-800 text-xs font-black transition-all', !canOperateStage || uploadingDocumentId === document.id ? 'bg-slate-700 opacity-60 cursor-not-allowed text-slate-200' : 'bg-violet-600 text-white hover:bg-violet-500')}>{document.storage_path ? 'Trocar arquivo' : 'Enviar arquivo'}</button>
                      <button type="button" disabled={!canOperateStage} onClick={async () => { await rhJornadaService.deleteProcessDocument(document.id); await loadData(); await onStageUpdated?.(); }} className={cn('px-3 py-2 rounded-xl border border-rose-500/30 text-xs font-black transition-all', !canOperateStage ? 'bg-slate-900/30 opacity-60 cursor-not-allowed text-rose-200' : 'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20')}>Excluir</button>
                    </div>
                  </div>
                </div>
              ))}
              {documents.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum documento criado para esta etapa.</div> : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input value={newDocumentType} onChange={(e) => setNewDocumentType(e.target.value)} placeholder="Tipo do documento da etapa" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <button type="button" disabled={!canOperateStage || !newDocumentType.trim()} onClick={async () => { const created = await rhJornadaService.createProcessDocumentEntry({ processo_id: process!.id, etapa_id: stage.id, colaborador_id: process?.colaborador_id || null, candidato_id: process?.candidato_id || null, tipo_documento: newDocumentType.trim(), obrigatorio: false }); setNewDocumentType(''); await loadData(); setPendingDocumentId(created.id); fileInputRef.current?.click(); }} className={cn('px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all', !canOperateStage || !newDocumentType.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}><Plus className="w-4 h-4" />Criar documento</button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file || !pendingDocumentId) return; setUploadingDocumentId(pendingDocumentId); try { await rhJornadaService.uploadDocument(pendingDocumentId, file); await loadData(); await onStageUpdated?.(); } finally { setUploadingDocumentId(null); setPendingDocumentId(null); event.currentTarget.value = ''; } }} />
          </Card>
        </div>
      </div>
    </div>
  );
};
