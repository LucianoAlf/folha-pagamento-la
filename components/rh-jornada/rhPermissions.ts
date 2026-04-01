import type { UserProfile } from '../../types';
import type { RhProcess, RhProcessParticipant, RhStageResponsible } from '../../types/rh';

export type RhAccessContext = {
  userId: string | null;
  role: UserProfile['role'] | 'user';
};

export const isAdminOrRh = (role: string | null | undefined) => role === 'admin' || role === 'rh';

export const canManageProcessParticipants = (access: RhAccessContext, process: RhProcess | null) => {
  if (!access.userId || !process) return false;
  return isAdminOrRh(access.role) || process.owner_user_id === access.userId || process.mentor_user_id === access.userId;
};

export const canManageStage = (
  access: RhAccessContext,
  process: RhProcess | null,
  responsibles: RhStageResponsible[],
  participants: RhProcessParticipant[]
) => {
  if (!access.userId || !process) return false;
  if (isAdminOrRh(access.role)) return true;
  if (process.owner_user_id === access.userId || process.mentor_user_id === access.userId) return true;
  if (responsibles.some((item) => item.user_id === access.userId)) return true;
  return participants.some(
    (item) => item.user_id === access.userId && ['rh', 'gestor', 'mentor'].includes(item.papel)
  );
};

export const canManageEvaluation = (
  access: RhAccessContext,
  process: RhProcess | null,
  responsibles: RhStageResponsible[],
  participants: RhProcessParticipant[]
) => {
  if (canManageStage(access, process, responsibles, participants)) return true;
  if (!access.userId) return false;
  return participants.some(
    (item) => item.user_id === access.userId && item.papel === 'avaliador'
  );
};

export const canManageDocumentProcess = (
  access: RhAccessContext,
  process: Pick<RhProcess, 'owner_user_id' | 'mentor_user_id'> | null | undefined
) => {
  if (!access.userId || !process) return false;
  return isAdminOrRh(access.role) || process.owner_user_id === access.userId || process.mentor_user_id === access.userId;
};
