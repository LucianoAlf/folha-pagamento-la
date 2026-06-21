import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CustomSelect, DatePicker, Modal } from '../../UI';
import type { RhCandidate, RhTemplate } from '../../../types/rh';
import { cn } from '../../CollaboratorComponents';

const DEPARTMENT_OPTIONS = [
  { value: 'professores', label: 'Professor' },
  { value: 'equipe_operacional', label: 'Operacional' },
  { value: 'staff_rateado', label: 'Staff' },
];

const CONTRACT_OPTIONS = [
  { value: 'pj', label: 'PJ' },
  { value: 'clt', label: 'CLT' },
  { value: 'mei', label: 'MEI' },
  { value: 'estagiario', label: 'Estagiário' },
  { value: 'diarista', label: 'Diarista' },
  { value: 'rpa', label: 'RPA' },
];

const UNIDADE_OPTIONS = [
  { value: 'cg', label: 'Campo Grande' },
  { value: 'rec', label: 'Recreio' },
  { value: 'bar', label: 'Barra' },
];

export const CandidateApprovalModal: React.FC<{
  candidate: RhCandidate | null;
  onboardingTemplates: RhTemplate[];
  onClose: () => void;
  onConfirm: (payload: {
    candidateId: string;
    nome: string;
    funcao: string;
    departamento: 'staff_rateado' | 'equipe_operacional' | 'professores';
    tipo: 'pj' | 'clt' | 'mei' | 'estagiario' | 'diarista' | 'rpa';
    salario_base: number;
    data_admissao?: string | null;
    unidade_fixa?: string | null;
    is_rateado: boolean;
    email?: string | null;
    telefone?: string | null;
    cpf?: string | null;
    createOnboardingNow?: boolean;
    onboardingTemplateId?: string | null;
    onboardingDataInicio?: string | null;
    onboardingDataFimPrevista?: string | null;
    onboardingObservacoes?: string | null;
  }) => Promise<void>;
}> = ({ candidate, onboardingTemplates, onClose, onConfirm }) => {
  const [nome, setNome] = useState(candidate?.nome || '');
  const [funcao, setFuncao] = useState(candidate?.cargo_pretendido || '');
  const [departamento, setDepartamento] = useState<'staff_rateado' | 'equipe_operacional' | 'professores'>('professores');
  const [tipo, setTipo] = useState<'pj' | 'clt' | 'mei' | 'estagiario' | 'diarista' | 'rpa'>('pj');
  const [salarioBase, setSalarioBase] = useState('0');
  const [dataAdmissao, setDataAdmissao] = useState<string | undefined>(new Date().toISOString().slice(0, 10));
  const [isRateado, setIsRateado] = useState(false);
  const [unidade, setUnidade] = useState('cg');
  const [createOnboardingNow, setCreateOnboardingNow] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [onboardingInicio, setOnboardingInicio] = useState<string | undefined>(new Date().toISOString().slice(0, 10));
  const [onboardingFim, setOnboardingFim] = useState<string | undefined>(undefined);
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateOptions = useMemo(() => onboardingTemplates.map((t) => ({ value: t.id, label: t.nome })), [onboardingTemplates]);

  useEffect(() => {
    if (!candidate) return;
    setNome(candidate.nome || '');
    setFuncao(candidate.cargo_pretendido || '');
    setSalarioBase('0');
    setDataAdmissao(new Date().toISOString().slice(0, 10));
    setIsRateado(false);
    setUnidade('cg');
    setCreateOnboardingNow(true);
    setTemplateId(onboardingTemplates[0]?.id || '');
    setOnboardingInicio(new Date().toISOString().slice(0, 10));
    setOnboardingFim(undefined);
    setObservacoes('');
    setError(null);
    setSaving(false);
  }, [candidate, onboardingTemplates]);

  if (!candidate) return null;

  return (
    <Modal
      isOpen={!!candidate}
      onClose={onClose}
      title="Aprovar candidato"
      subtitle="Converta o candidato em colaborador e, se quiser, já abra o onboarding."
      className="max-w-4xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black hover:bg-surface/60 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !nome.trim() || !funcao.trim() || (createOnboardingNow && !templateId)}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onConfirm({
                  candidateId: candidate.id,
                  nome: nome.trim(),
                  funcao: funcao.trim(),
                  departamento,
                  tipo,
                  salario_base: Number(salarioBase) || 0,
                  data_admissao: dataAdmissao || null,
                  unidade_fixa: isRateado ? null : unidade,
                  is_rateado: isRateado,
                  email: candidate.email || null,
                  telefone: candidate.telefone || null,
                  cpf: candidate.cpf || null,
                  createOnboardingNow,
                  onboardingTemplateId: createOnboardingNow ? templateId : null,
                  onboardingDataInicio: onboardingInicio || null,
                  onboardingDataFimPrevista: onboardingFim || null,
                  onboardingObservacoes: observacoes.trim() || null,
                });
                onClose();
              } catch (err: any) {
                setError(err?.message || 'Não foi possível aprovar o candidato.');
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'px-8 py-3 rounded-2xl font-black text-primary transition-all flex items-center gap-2',
              saving || !nome.trim() || !funcao.trim() || (createOnboardingNow && !templateId)
                ? 'bg-surface-2 text-muted border border-line cursor-not-allowed'
                : 'bg-success hover:bg-success/80'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Aprovar e converter
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-bold text-danger">{error}</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Nome</div>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Função</div>
            <input value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Departamento</div>
            <CustomSelect value={departamento} onValueChange={(v) => setDepartamento(v as any)} options={DEPARTMENT_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Contrato</div>
            <CustomSelect value={tipo} onValueChange={(v) => setTipo(v as any)} options={CONTRACT_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Salário base</div>
            <input type="number" min="0" value={salarioBase} onChange={(e) => setSalarioBase(e.target.value)} className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Data de admissão</div>
            <DatePicker value={dataAdmissao} onChange={setDataAdmissao} />
          </div>
          <div className="flex items-center gap-3">
            <input id="rateado" type="checkbox" checked={isRateado} onChange={(e) => setIsRateado(e.target.checked)} className="accent-accent" />
            <label htmlFor="rateado" className="text-sm font-bold text-secondary">Colaborador rateado</label>
          </div>
          {!isRateado ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Unidade fixa</div>
              <CustomSelect value={unidade} onValueChange={setUnidade} options={UNIDADE_OPTIONS} />
            </div>
          ) : <div />}
        </div>

        <div className="rounded-3xl border border-line bg-bg/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <input id="create-onboarding-now" type="checkbox" checked={createOnboardingNow} onChange={(e) => setCreateOnboardingNow(e.target.checked)} className="accent-accent" />
            <label htmlFor="create-onboarding-now" className="text-sm font-black text-primary">Criar onboarding agora</label>
          </div>

          {createOnboardingNow ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Modelo de integração</div>
                <CustomSelect value={templateId} onValueChange={setTemplateId} options={templateOptions} placeholder="Selecione..." />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Início do onboarding</div>
                <DatePicker value={onboardingInicio} onChange={setOnboardingInicio} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Fim previsto</div>
                <DatePicker value={onboardingFim} onChange={setOnboardingFim} />
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Observações do onboarding</div>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                  placeholder="Observações iniciais para a jornada de entrada"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};
