import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Plus, Users } from 'lucide-react';
import { Badge, Card, CustomSelect } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhChecklistItem, RhProcess, RhProcessParticipant, RhStage, RhStageResponsible } from '../../../types/rh';
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

const STAGE_STATUS_OPTIONS = [
  { value: 'nao_iniciada', label: 'Não iniciada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'dispensada', label: 'Dispensada' },
  { value: 'atrasada', label: 'Atrasada' },
];

export const RhStageExecutionPanel: React.FC<{
  process: RhProcess | null;
  stage: RhStage | null;
  onStageUpdated?: () => Promise<void> | void;
}> = ({ process, stage, onStageUpdated }) => {
  const [checklist, setChecklist] = useState<RhChecklistItem[]>([]);
  const [responsibles, setResponsibles] = useState<RhStageResponsible[]>([]);
  const [participants, setParticipants] = useState<RhProcessParticipant[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('rh');
  const [selectedStageStatus, setSelectedStageStatus] = useState('nao_iniciada');
  const [savingItem, setSavingItem] = useState(false);
  const [savingResponsible, setSavingResponsible] = useState(false);
  const [savingStageStatus, setSavingStageStatus] = useState(false);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });

  const loadData = async () => {
    if (!stage || !process) {
      setChecklist([]);
      setResponsibles([]);
      setParticipants([]);
      return;
    }
    const [nextChecklist, nextResponsibles, nextParticipants, nextUsers, nextAccess] = await Promise.all([
      rhJornadaService.fetchChecklistItems(stage.id),
      rhJornadaService.fetchStageResponsibles(stage.id),
      rhJornadaService.fetchProcessParticipants(process.id),
      rhJornadaService.fetchUserProfiles(),
      rhJornadaService.fetchCurrentUserContext(),
    ]);
    setChecklist(nextChecklist);
    setResponsibles(nextResponsibles);
    setParticipants(nextParticipants);
    setUsers(nextUsers);
    setAccess(nextAccess);
  };

  useEffect(() => {
    void loadData();
  }, [process?.id, stage?.id]);

  useEffect(() => {
    setSelectedStageStatus(stage?.status || 'nao_iniciada');
  }, [stage?.id, stage?.status]);

  const userOptions = useMemo(() => users.map((user) => ({ value: user.id, label: `${user.nome} • ${user.role}` })), [users]);
  const canOperateStage = canManageStage(access, process, responsibles, participants);
  const canAssignResponsibles = canManageProcessParticipants(access, process);

  if (!stage) {
    return (
      <Card className="p-5 border border-slate-700/50">
        <div className="text-sm font-bold text-slate-500">Selecione uma etapa para ver checklist e responsáveis.</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 border border-slate-700/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Etapa atual</div>
            <div className="mt-2 text-lg font-black text-white">{stage.titulo}</div>
            <div className="mt-1 text-sm font-bold text-slate-400">
              Categoria: {stage.categoria}
              {stage.data_limite ? ` • Prazo ${new Date(`${stage.data_limite}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[220px_auto] gap-3">
            <CustomSelect value={selectedStageStatus} onValueChange={setSelectedStageStatus} options={STAGE_STATUS_OPTIONS} />
            <button
              type="button"
              disabled={!canOperateStage || savingStageStatus || selectedStageStatus === stage.status}
              onClick={async () => {
                setSavingStageStatus(true);
                try {
                  await rhJornadaService.updateStageStatus(stage.id, selectedStageStatus as RhStage['status']);
                  await loadData();
                  await onStageUpdated?.();
                } finally {
                  setSavingStageStatus(false);
                }
              }}
              className={cn(
                'px-5 py-3 rounded-2xl font-black text-white transition-all',
                !canOperateStage || savingStageStatus || selectedStageStatus === stage.status
                  ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-500'
              )}
            >
              Salvar status
            </button>
          </div>
        </div>
        {!canOperateStage ? <div className="mt-4 text-sm font-bold text-slate-500">Você tem acesso de leitura nesta etapa.</div> : null}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare className="w-4 h-4 text-amber-300" />
          <h3 className="text-white text-base font-black">Checklist da etapa</h3>
        </div>
        <div className="space-y-3 mb-4">
          {checklist.map((item) => (
            <label key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={item.concluido}
                disabled={!canOperateStage}
                onChange={async (e) => {
                  await rhJornadaService.toggleChecklistItem(item.id, e.target.checked);
                  await loadData();
                  await onStageUpdated?.();
                }}
                className="accent-violet-500 mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className={cn('font-black', item.concluido ? 'text-slate-400 line-through' : 'text-white')}>{item.titulo}</div>
                {item.descricao ? <div className="mt-1 text-sm font-bold text-slate-400">{item.descricao}</div> : null}
              </div>
              <Badge variant={item.obrigatorio ? 'warning' : 'default'}>{item.obrigatorio ? 'Obrigatório' : 'Opcional'}</Badge>
            </label>
          ))}
          {checklist.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum item ainda. Adicione o checklist operacional desta etapa.</div> : null}
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Novo item de checklist"
            className="flex-1 rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          <button
            type="button"
            disabled={!canOperateStage || !newItemTitle.trim() || savingItem}
            onClick={async () => {
              setSavingItem(true);
              try {
                await rhJornadaService.createChecklistItem({ etapa_id: stage.id, titulo: newItemTitle.trim() });
                setNewItemTitle('');
                await loadData();
                await onStageUpdated?.();
              } finally {
                setSavingItem(false);
              }
            }}
            className={cn(
              'px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
              !canOperateStage || !newItemTitle.trim() || savingItem ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
            )}
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </Card>

        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-cyan-300" />
            <h3 className="text-white text-base font-black">Responsáveis da etapa</h3>
          </div>
          <div className="space-y-3 mb-4">
            {responsibles.map((responsible) => (
              <div key={responsible.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-white font-black">{responsible.user?.nome || responsible.user_id}</div>
                  <div className="mt-1 text-sm font-bold text-slate-400">{responsible.papel}</div>
                </div>
                {responsible.principal ? <Badge variant="success">Principal</Badge> : <Badge variant="info">Apoio</Badge>}
              </div>
            ))}
            {responsibles.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum responsável atribuído ainda.</div> : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
            <CustomSelect value={selectedUserId} onValueChange={setSelectedUserId} options={userOptions} placeholder="Selecione um usuário" />
            <CustomSelect value={selectedRole} onValueChange={setSelectedRole} options={ROLE_OPTIONS} />
            <button
              type="button"
              disabled={!canAssignResponsibles || !selectedUserId || savingResponsible}
              onClick={async () => {
                setSavingResponsible(true);
                try {
                  await rhJornadaService.addStageResponsible(stage.id, selectedUserId, selectedRole as any, responsibles.length === 0);
                  setSelectedUserId('');
                  await loadData();
                } finally {
                  setSavingResponsible(false);
                }
              }}
              className={cn(
                'px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
                !canAssignResponsibles || !selectedUserId || savingResponsible ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
              )}
            >
              <Plus className="w-4 h-4" />
              Atribuir
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
