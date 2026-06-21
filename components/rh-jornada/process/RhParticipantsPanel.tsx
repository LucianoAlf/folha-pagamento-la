import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserCog } from 'lucide-react';
import { Badge, Card, CustomSelect } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhProcess, RhProcessParticipant } from '../../../types/rh';
import type { UserProfile } from '../../../types';
import { cn } from '../../CollaboratorComponents';
import { canManageProcessParticipants } from '../rhPermissions';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

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
    case 'admin':
      return 'Administrador';
    default:
      return 'Equipe';
  }
};

const buildUserOptions = (users: UserProfile[]) =>
  users.map((user) => ({ value: user.id, label: `${user.nome} • ${humanizeRole(user.role)}` }));

export const RhParticipantsPanel: React.FC<{ process: RhProcess | null }> = ({ process }) => {
  const [participants, setParticipants] = useState<RhProcessParticipant[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('rh');
  const [selectedMentorId, setSelectedMentorId] = useState('');
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });
  const { run } = useAsyncAction();

  const loadData = async () => {
    if (!process) {
      setParticipants([]);
      return;
    }

    const [nextParticipants, nextUsers, nextAccess] = await Promise.all([
      rhJornadaService.fetchProcessParticipants(process.id),
      rhJornadaService.fetchUserProfiles(),
      rhJornadaService.fetchCurrentUserContext(),
    ]);

    setParticipants(nextParticipants);
    setUsers(nextUsers);
    setAccess(nextAccess);
    setSelectedMentorId(process.mentor_user_id || '');
  };

  useEffect(() => {
    void loadData();
  }, [process?.id, process?.mentor_user_id]);

  const userOptions = useMemo(() => buildUserOptions(users), [users]);
  const canManage = canManageProcessParticipants(access, process);
  const owner = useMemo(() => users.find((user) => user.id === process?.owner_user_id) || null, [users, process?.owner_user_id]);
  const mentor = useMemo(
    () => users.find((user) => user.id === (selectedMentorId || process?.mentor_user_id || '')) || null,
    [users, selectedMentorId, process?.mentor_user_id]
  );

  if (!process) return null;

  return (
    <Card className="p-5 border border-line-strong/50">
      <div className="flex items-center gap-2 mb-4">
        <UserCog className="w-4 h-4 text-info" />
        <h3 className="text-primary text-base font-black">Participantes do processo</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl border border-line bg-surface/30 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Responsável principal</div>
          <div className="mt-2 text-sm font-black text-primary">{owner?.nome || 'Responsável não identificado'}</div>
          <div className="mt-1 text-xs font-bold text-muted">{owner ? humanizeRole(owner.role) : 'Pessoa que conduz esta jornada'}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface/30 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Mentor</div>
          <div className="mt-2 text-sm font-black text-primary">{mentor?.nome || 'Não definido'}</div>
          <div className="mt-1 text-xs font-bold text-muted">{mentor ? humanizeRole(mentor.role) : 'Defina quem acompanha o colaborador'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-5">
        <CustomSelect value={selectedMentorId} onValueChange={setSelectedMentorId} options={[{ value: '', label: 'Sem mentor definido' }, ...userOptions]} />
        <button
          type="button"
          disabled={!canManage || saving || selectedMentorId === (process.mentor_user_id || '')}
          onClick={async () => {
            setSaving(true);
            await run(
              async () => {
                await rhJornadaService.updateProcessMentor(process.id, selectedMentorId || null);
                await loadData();
              },
              {
                success: 'Mentor atualizado.',
                error: 'Não foi possível atualizar o mentor.',
              }
            );
            setSaving(false);
          }}
          className={cn(
            'px-5 py-3 rounded-2xl font-black text-primary transition-all',
            !canManage || saving || selectedMentorId === (process.mentor_user_id || '')
              ? 'bg-surface-2 text-muted border border-line cursor-not-allowed'
              : 'bg-accent hover:bg-accent'
          )}
        >
          Salvar mentor
        </button>
      </div>

      <div className="space-y-3 mb-5">
        {participants.map((participant) => (
          <div key={participant.id} className="rounded-2xl border border-line bg-surface/30 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-primary font-black">{participant.user?.nome || 'Usuário não identificado'}</div>
              <div className="mt-1 text-sm font-bold text-muted">{humanizeRole(participant.papel)}</div>
            </div>
            <div className="flex items-center gap-2">
              {participant.principal ? <Badge variant="success">Principal</Badge> : <Badge variant="info">Apoio</Badge>}
              <button
                type="button"
                disabled={!canManage || saving}
                onClick={async () => {
                  setSaving(true);
                  await run(
                    async () => {
                      await rhJornadaService.removeProcessParticipant(participant.id);
                      await loadData();
                    },
                    {
                      success: 'Participante removido.',
                      error: 'Não foi possível remover o participante.',
                    }
                  );
                  setSaving(false);
                }}
                className={cn(
                  'p-2 rounded-xl border border-danger/30 text-danger transition-all',
                  !canManage || saving ? 'opacity-60 cursor-not-allowed bg-surface/30' : 'bg-danger/10 hover:bg-danger/20'
                )}
                title="Remover participante"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {participants.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum participante adicional atribuído.</div> : null}
      </div>

      {!canManage ? <div className="mb-5 text-sm font-bold text-muted">Você tem acesso de leitura aos participantes deste processo.</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
        <CustomSelect value={selectedUserId} onValueChange={setSelectedUserId} options={userOptions} placeholder="Selecione um usuário" />
        <CustomSelect value={selectedRole} onValueChange={setSelectedRole} options={ROLE_OPTIONS} />
        <button
          type="button"
          disabled={!canManage || !selectedUserId || saving}
          onClick={async () => {
            setSaving(true);
            await run(
              async () => {
                await rhJornadaService.addProcessParticipant(process.id, selectedUserId, selectedRole as any, participants.length === 0);
                setSelectedUserId('');
                await loadData();
              },
              {
                success: 'Participante adicionado.',
                error: 'Não foi possível adicionar o participante.',
              }
            );
            setSaving(false);
          }}
          className={cn(
            'px-5 py-3 rounded-2xl font-black text-primary flex items-center gap-2 transition-all',
            !canManage || !selectedUserId || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-accent hover:bg-accent'
          )}
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>
    </Card>
  );
};
