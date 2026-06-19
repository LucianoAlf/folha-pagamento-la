import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Badge, Card, CustomSelect } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhEvaluation, RhEvaluationDecision, RhEvaluationType, RhProcess, RhProcessParticipant, RhStage, RhStageResponsible } from '../../../types/rh';
import type { UserProfile } from '../../../types';
import { cn } from '../../CollaboratorComponents';
import { canManageEvaluation } from '../rhPermissions';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

const TYPE_OPTIONS: { value: RhEvaluationType; label: string }[] = [
  { value: 'entrevista', label: 'Entrevista' },
  { value: 'aula_teste', label: 'Aula teste' },
  { value: 'feedback_7d', label: 'Feedback 7 dias' },
  { value: 'feedback_30d', label: 'Feedback 30 dias' },
  { value: 'feedback_45d', label: 'Feedback 45 dias' },
  { value: 'feedback_90d', label: 'Feedback 90 dias' },
  { value: 'entrevista_saida', label: 'Entrevista de saída' },
];

const DECISION_OPTIONS: { value: RhEvaluationDecision; label: string }[] = [
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'ajustes', label: 'Ajustes' },
  { value: 'neutro', label: 'Neutro' },
];

const decisionVariant: Record<RhEvaluationDecision, 'success' | 'danger' | 'warning' | 'default'> = {
  aprovado: 'success',
  reprovado: 'danger',
  ajustes: 'warning',
  neutro: 'default',
};

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

const defaultTypeForStage = (stage: RhStage | null): RhEvaluationType => {
  if (!stage) return 'entrevista';
  if (stage.categoria === 'aula_teste') return 'aula_teste';
  if (stage.categoria === 'feedback') return 'feedback_30d';
  if (stage.categoria === 'saida') return 'entrevista_saida';
  return 'entrevista';
};

export const RhEvaluationPanel: React.FC<{
  process: RhProcess | null;
  processId: string | null;
  stage: RhStage | null;
}> = ({ process, processId, stage }) => {
  const [evaluations, setEvaluations] = useState<RhEvaluation[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [participants, setParticipants] = useState<RhProcessParticipant[]>([]);
  const [stageResponsibles, setStageResponsibles] = useState<RhStageResponsible[]>([]);
  const [evaluationType, setEvaluationType] = useState<RhEvaluationType>('entrevista');
  const [decision, setDecision] = useState<RhEvaluationDecision>('neutro');
  const [score, setScore] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [evaluatorUserId, setEvaluatorUserId] = useState('');
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState<{ userId: string | null; role: UserProfile['role'] | 'user' }>({ userId: null, role: 'user' });
  const { run } = useAsyncAction();

  const resetForm = () => {
    setEditingEvaluationId(null);
    setEvaluationType(defaultTypeForStage(stage));
    setDecision('neutro');
    setScore('');
    setSummary('');
    setNotes('');
    setEvaluatorUserId('');
  };

  const loadData = async () => {
    if (!processId) {
      setEvaluations([]);
      return;
    }
    const [nextEvaluations, nextUsers, nextParticipants, nextAccess, nextStageResponsibles] = await Promise.all([
      rhJornadaService.fetchEvaluations(processId, stage?.id || null),
      rhJornadaService.fetchUserProfiles(),
      process ? rhJornadaService.fetchProcessParticipants(process.id) : Promise.resolve([]),
      rhJornadaService.fetchCurrentUserContext(),
      stage ? rhJornadaService.fetchStageResponsibles(stage.id) : Promise.resolve([]),
    ]);
    setEvaluations(nextEvaluations);
    setUsers(nextUsers);
    setParticipants(nextParticipants);
    setAccess(nextAccess);
    setStageResponsibles(nextStageResponsibles);
  };

  useEffect(() => {
    setEvaluationType(defaultTypeForStage(stage));
  }, [stage?.id, stage?.categoria]);

  useEffect(() => {
    void loadData();
  }, [process?.id, processId, stage?.id]);

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.nome} • ${humanizeRole(user.role)}` })),
    [users]
  );
  const canCreateEvaluation = canManageEvaluation(access, process, stageResponsibles, participants);

  if (!processId) return null;

  return (
    <Card className="p-5 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-4 h-4 text-emerald-300" />
        <h3 className="text-white text-base font-black">Avaliações</h3>
        {stage ? <Badge variant="info">Etapa atual</Badge> : null}
      </div>

      <div className="space-y-3 mb-5">
        {evaluations.map((evaluation) => (
          <div key={evaluation.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-white font-black">{TYPE_OPTIONS.find((item) => item.value === evaluation.tipo)?.label || evaluation.tipo}</div>
                {evaluation.decisao ? <Badge variant={decisionVariant[evaluation.decisao]}>{evaluation.decisao}</Badge> : null}
                {typeof evaluation.nota === 'number' ? <Badge variant="purple">Nota {evaluation.nota}</Badge> : null}
              </div>
              {canCreateEvaluation ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvaluationId(evaluation.id);
                      setEvaluationType(evaluation.tipo);
                      setDecision(evaluation.decisao || 'neutro');
                      setScore(typeof evaluation.nota === 'number' ? String(evaluation.nota) : '');
                      setSummary(evaluation.resumo || '');
                      setNotes(evaluation.observacoes || '');
                      setEvaluatorUserId(evaluation.avaliador_user_id || '');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-200 hover:bg-slate-900/70 transition-all flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm('Excluir esta avaliação?');
                      if (!confirmed) return;
                      return run(
                        async () => {
                          await rhJornadaService.deleteEvaluation(evaluation.id);
                          if (editingEvaluationId === evaluation.id) resetForm();
                          await loadData();
                        },
                        {
                          success: 'Avaliação excluída.',
                          error: 'Não foi possível excluir a avaliação.',
                        }
                      );
                    }}
                    className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              ) : null}
            </div>
            {evaluation.resumo ? <div className="mt-2 text-sm font-bold text-slate-200">{evaluation.resumo}</div> : null}
            {evaluation.observacoes ? <div className="mt-2 text-xs font-bold text-slate-400 whitespace-pre-wrap">{evaluation.observacoes}</div> : null}
            <div className="mt-3 text-[11px] font-bold text-slate-500">{new Date(evaluation.realizada_em).toLocaleString('pt-BR')}</div>
          </div>
        ))}
        {evaluations.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma avaliação registrada ainda.</div> : null}
      </div>

      {!canCreateEvaluation ? <div className="mb-5 text-sm font-bold text-slate-500">Você tem acesso de leitura às avaliações deste processo.</div> : null}
      {editingEvaluationId ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
          <div className="text-sm font-bold text-cyan-200">Editando uma avaliação existente.</div>
          <button type="button" onClick={resetForm} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40 text-xs font-black text-slate-200 hover:bg-slate-900/60 transition-all">Cancelar edição</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Tipo</div>
          <CustomSelect value={evaluationType} onValueChange={(value) => setEvaluationType(value as RhEvaluationType)} options={TYPE_OPTIONS} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Decisão</div>
          <CustomSelect value={decision} onValueChange={(value) => setDecision(value as RhEvaluationDecision)} options={DECISION_OPTIONS} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Avaliador</div>
          <CustomSelect value={evaluatorUserId} onValueChange={setEvaluatorUserId} options={userOptions} placeholder="Selecione..." />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Nota</div>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="0 a 10"
            className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Resumo</div>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Síntese da avaliação"
            className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Observações</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Pontos fortes, ajustes, contexto e encaminhamentos"
            className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!canCreateEvaluation || saving || !summary.trim()}
          onClick={async () => {
            const isEditing = !!editingEvaluationId;
            setSaving(true);
            await run(
              async () => {
                if (editingEvaluationId) {
                  await rhJornadaService.updateEvaluation({
                    id: editingEvaluationId,
                    processo_id: processId,
                    etapa_id: stage?.id || null,
                    tipo: evaluationType,
                    avaliador_user_id: evaluatorUserId || null,
                    nota: score ? Number(score) : null,
                    decisao: decision,
                    resumo: summary.trim(),
                    observacoes: notes.trim() || null,
                  });
                } else {
                  await rhJornadaService.createEvaluation({
                    processo_id: processId,
                    etapa_id: stage?.id || null,
                    tipo: evaluationType,
                    avaliador_user_id: evaluatorUserId || null,
                    nota: score ? Number(score) : null,
                    decisao: decision,
                    resumo: summary.trim(),
                    observacoes: notes.trim() || null,
                  });
                }
                resetForm();
                await loadData();
              },
              {
                success: isEditing ? 'Avaliação atualizada.' : 'Avaliação registrada.',
                error: isEditing ? 'Não foi possível atualizar a avaliação.' : 'Não foi possível registrar a avaliação.',
              }
            );
            setSaving(false);
          }}
          className={cn(
            'px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
            !canCreateEvaluation || saving || !summary.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'
          )}
        >
          {saving ? <Save className="w-4 h-4" /> : editingEvaluationId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {editingEvaluationId ? 'Salvar avaliação' : 'Registrar avaliação'}
        </button>
      </div>
    </Card>
  );
};
