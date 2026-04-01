import React, { useEffect, useMemo, useState } from 'react';
import { Plus, UserCog } from 'lucide-react';
import { Badge, Card, CustomSelect } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhProcess, RhProcessParticipant } from '../../../types/rh';
import type { UserProfile } from '../../../types';
import { cn } from '../../CollaboratorComponents';
import { canManageProcessParticipants } from '../rhPermissions';

const ROLE_OPTIONS = [
  { value: 'rh', label: 'RH' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'avaliador', label: 'Avaliador' },
  { value: 'financeiro', label: 'Financeiro' },
];

export const RhParticipantsPanel: React.FC<{ process: RhProcess | null }> = ({ process }) => {
  const [participants, setParticipants] = useState<RhProcessParticipant[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('rh');
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });

  const loadData = async () => {
    if (!process) {
      setParticipants([]);
      return;
    }
    const [nextParticipants, nextUsers] = await Promise.all([
      rhJornadaService.fetchProcessParticipants(process.id),
      rhJornadaService.fetchUserProfiles(),
    ]);
    setParticipants(nextParticipants);
    setUsers(nextUsers);
    setAccess(await rhJornadaService.fetchCurrentUserContext());
  };

  useEffect(() => {
    void loadData();
  }, [process?.id]);

  const userOptions = useMemo(() => users.map((user) => ({ value: user.id, label: `${user.nome} • ${user.role}` })), [users]);
  const canManage = canManageProcessParticipants(access, process);

  if (!process) return null;

  return (
    <Card className="p-5 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-4">
        <UserCog className="w-4 h-4 text-cyan-300" />
        <h3 className="text-white text-base font-black">Participantes do processo</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Owner</div>
          <div className="mt-2 text-sm font-black text-white">{process.owner_user_id}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Mentor</div>
          <div className="mt-2 text-sm font-black text-white">{process.mentor_user_id || 'Não definido'}</div>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        {participants.map((participant) => (
          <div key={participant.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-black">{participant.user?.nome || participant.user_id}</div>
              <div className="mt-1 text-sm font-bold text-slate-400">{participant.papel}</div>
            </div>
            {participant.principal ? <Badge variant="success">Principal</Badge> : <Badge variant="info">Apoio</Badge>}
          </div>
        ))}
        {participants.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum participante adicional atribuído.</div> : null}
      </div>

      {!canManage ? <div className="mb-5 text-sm font-bold text-slate-500">Você tem acesso de leitura aos participantes deste processo.</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
        <CustomSelect value={selectedUserId} onValueChange={setSelectedUserId} options={userOptions} placeholder="Selecione um usuário" />
        <CustomSelect value={selectedRole} onValueChange={setSelectedRole} options={ROLE_OPTIONS} />
        <button
          type="button"
          disabled={!canManage || !selectedUserId || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await rhJornadaService.addProcessParticipant(process.id, selectedUserId, selectedRole as any, participants.length === 0);
              setSelectedUserId('');
              await loadData();
            } finally {
              setSaving(false);
            }
          }}
          className={cn(
            'px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
            !canManage || !selectedUserId || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
          )}
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>
    </Card>
  );
};
