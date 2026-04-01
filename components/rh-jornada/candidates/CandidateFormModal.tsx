import React, { useMemo, useState } from 'react';
import { AlertCircle, FileSearch, Loader2, Plus, Sparkles, UserPlus } from 'lucide-react';
import { CustomSelect, Modal } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhCandidateAiDraft, RhCandidateCreateInput } from '../../../types/rh';
import { cn } from '../../CollaboratorComponents';

const VINCULO_OPTIONS = [
  { value: 'clt', label: 'CLT' },
  { value: 'pj', label: 'PJ' },
  { value: 'horista', label: 'Horista' },
  { value: 'staff', label: 'Staff' },
  { value: 'professor', label: 'Professor' },
];

const ORIGEM_OPTIONS = [
  { value: 'indicacao', label: 'Indicação' },
  { value: 'site', label: 'Site / Formulário' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'interno', label: 'Banco interno' },
  { value: 'outro', label: 'Outro' },
];

export const CandidateFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    payload: RhCandidateCreateInput,
    options?: { curriculumFile?: File | null; curriculoTextoExtraido?: string | null }
  ) => Promise<void>;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargoPretendido, setCargoPretendido] = useState('');
  const [tipoVinculo, setTipoVinculo] = useState('');
  const [origem, setOrigem] = useState('');
  const [questionarioResumo, setQuestionarioResumo] = useState('');
  const [questionarioTexto, setQuestionarioTexto] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [curriculumFile, setCurriculumFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiDraft, setAiDraft] = useState<RhCandidateAiDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const missing = useMemo(() => {
    const out: string[] = [];
    if (!nome.trim()) out.push('Nome');
    if (!cargoPretendido.trim()) out.push('Cargo pretendido');
    if (!tipoVinculo) out.push('Vínculo');
    return out;
  }, [nome, cargoPretendido, tipoVinculo]);

  const canSave = missing.length === 0;

  const resetState = () => {
    setNome('');
    setEmail('');
    setTelefone('');
    setCpf('');
    setCargoPretendido('');
    setTipoVinculo('');
    setOrigem('');
    setQuestionarioResumo('');
    setQuestionarioTexto('');
    setObservacoes('');
    setCurriculumFile(null);
    setAnalyzing(false);
    setAiDraft(null);
    setSaving(false);
    setError(null);
    setTried(false);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetState();
        onClose();
      }}
      title="Novo candidato"
      subtitle="Cadastre o perfil inicial para iniciar o recrutamento estruturado."
      className="max-w-3xl"
      footer={
        <div className="flex flex-col gap-3 w-full">
          {tried && !canSave ? (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold text-rose-300">Preencha: {missing.join(', ')}</div>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-300">
              {error}
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <button
              type="button"
              onClick={() => {
                resetState();
                onClose();
              }}
              className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black hover:bg-slate-900/60 transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!canSave) {
                  setTried(true);
                  return;
                }
                setSaving(true);
                setError(null);
                try {
                  await onConfirm({
                    nome: nome.trim(),
                    email: email.trim() || null,
                    telefone: telefone.trim() || null,
                    cpf: cpf.trim() || null,
                    cargo_pretendido: cargoPretendido.trim(),
                    tipo_vinculo_pretendido: tipoVinculo,
                    origem: origem || null,
                    questionario_resumo: questionarioResumo.trim() || null,
                    questionario_respostas: questionarioTexto.trim() ? { texto_bruto: questionarioTexto.trim() } : {},
                    observacoes: observacoes.trim() || null,
                  }, {
                    curriculumFile,
                    curriculoTextoExtraido: aiDraft?.curriculo_texto_extraido || null,
                  });
                  resetState();
                  onClose();
                } catch (err: any) {
                  setError(err?.message || 'Não foi possível criar o candidato.');
                } finally {
                  setSaving(false);
                }
              }}
              className={cn(
                'px-8 py-3 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-2',
                canSave && !saving ? 'bg-violet-600 hover:bg-violet-500' : 'bg-slate-700 cursor-not-allowed opacity-60'
              )}
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar candidato
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="rounded-3xl bg-violet-500/10 border border-violet-500/20 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-200 shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-slate-200">
            Este cadastro cria a base do candidato em `rh_candidatos`. O processo de recrutamento seguirá em `rh_processos`.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Nome *</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="Nome completo do candidato"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Cargo pretendido *</label>
            <input
              value={cargoPretendido}
              onChange={(e) => setCargoPretendido(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="Ex: Professor de violão"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Tipo de vínculo *</label>
            <CustomSelect value={tipoVinculo} onValueChange={setTipoVinculo} options={VINCULO_OPTIONS} placeholder="Selecione..." />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Telefone</label>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="(21) 99999-9999"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">CPF</label>
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="000.000.000-00"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Origem</label>
            <CustomSelect value={origem} onValueChange={setOrigem} options={ORIGEM_OPTIONS} placeholder="Selecione..." />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Currículo / PDF</label>
            <div className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4">
              <input
                type="file"
                accept=".pdf,.txt,.doc,.docx,.rtf"
                onChange={(e) => setCurriculumFile(e.target.files?.[0] || null)}
                className="block w-full text-sm font-bold text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:font-black file:text-white hover:file:bg-violet-500"
              />
              <div className="mt-2 text-xs font-bold text-slate-500">
                {curriculumFile ? curriculumFile.name : 'Nenhum arquivo selecionado.'}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Resumo do questionário</label>
            <textarea
              value={questionarioResumo}
              onChange={(e) => setQuestionarioResumo(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
              placeholder="Resumo comportamental ou observações do formulário inicial"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Questionário bruto</label>
            <textarea
              value={questionarioTexto}
              onChange={(e) => setQuestionarioTexto(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
              placeholder="Cole aqui as respostas do formulário inicial para a IA resumir e sugerir pontos de atenção"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
              placeholder="Anotações iniciais sobre perfil, disponibilidade, fit cultural ou próximos passos"
            />
          </div>

          <div className="md:col-span-2 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  Assistente de IA do recrutamento
                </div>
                <div className="mt-1 text-xs font-bold text-slate-300">
                  Analisa o currículo/PDF e o questionário para sugerir preenchimento e riscos.
                </div>
              </div>
              <button
                type="button"
                disabled={analyzing || (!curriculumFile && !questionarioTexto.trim())}
                onClick={async () => {
                  setAnalyzing(true);
                  setError(null);
                  try {
                    const draft = await rhJornadaService.analyzeCandidateWithAi({
                      file: curriculumFile,
                      questionnaireText: questionarioTexto.trim() || null,
                      candidateName: nome.trim() || null,
                      cargoPretendido: cargoPretendido.trim() || null,
                      observacoes: observacoes.trim() || null,
                    });
                    setAiDraft(draft);
                    setNome((current) => current || draft.nome || '');
                    setEmail((current) => current || draft.email || '');
                    setTelefone((current) => current || draft.telefone || '');
                    setCpf((current) => current || draft.cpf || '');
                    setCargoPretendido((current) => current || draft.cargo_pretendido || '');
                    setQuestionarioResumo((current) => current || draft.questionario_resumo || draft.resumo_candidato || '');
                    setObservacoes((current) => current || draft.resumo_candidato || '');
                  } catch (err: any) {
                    setError(err?.message || 'Não foi possível analisar os dados com IA.');
                  } finally {
                    setAnalyzing(false);
                  }
                }}
                className={cn(
                  'px-5 py-3 rounded-2xl font-black text-white transition-all flex items-center gap-2',
                  analyzing || (!curriculumFile && !questionarioTexto.trim())
                    ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500'
                )}
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                Analisar com IA
              </button>
            </div>

            {aiDraft ? (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Pontos fortes</div>
                  <div className="space-y-2">
                    {aiDraft.pontos_fortes.length ? aiDraft.pontos_fortes.map((item, index) => (
                      <div key={`${item}-${index}`} className="text-sm font-bold text-slate-200">{item}</div>
                    )) : <div className="text-sm font-bold text-slate-500">Sem pontos destacados.</div>}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Alertas / riscos</div>
                  <div className="space-y-2">
                    {aiDraft.alertas.length ? aiDraft.alertas.map((item, index) => (
                      <div key={`${item}-${index}`} className="text-sm font-bold text-amber-200">{item}</div>
                    )) : <div className="text-sm font-bold text-slate-500">Nenhum alerta relevante.</div>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
};
