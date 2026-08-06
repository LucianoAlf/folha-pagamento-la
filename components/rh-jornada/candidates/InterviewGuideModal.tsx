import React, { useEffect, useState } from 'react';
import { AlertTriangle, Printer } from 'lucide-react';
import { DatePicker, Modal, TimeSelect } from '../../UI';
import { buildInterviewGuideDraft } from './interviewGuideModel';

interface InterviewGuideModalProps {
  isOpen: boolean;
  candidateId: string;
  candidateName: string;
  perguntasDesatualizadas?: boolean;
  onClose: () => void;
}

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const InterviewGuideModal: React.FC<InterviewGuideModalProps> = ({
  isOpen,
  candidateId,
  candidateName,
  perguntasDesatualizadas = false,
  onClose,
}) => {
  const [data, setData] = useState(localToday());
  const [horario, setHorario] = useState('');
  const [local, setLocal] = useState('');
  const [condutores, setCondutores] = useState(['', '', '']);
  const [confirmedStale, setConfirmedStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setData(localToday());
    setHorario('');
    setLocal('');
    setCondutores(['', '', '']);
    setConfirmedStale(false);
    setError(null);
  }, [isOpen, candidateId]);

  const openGuide = () => {
    if (perguntasDesatualizadas && !confirmedStale) {
      setConfirmedStale(true);
      return;
    }
    const draft = buildInterviewGuideDraft({ candidateId, data, horario, local, condutores });
    window.sessionStorage.setItem(draft.storageKey, JSON.stringify(draft.payload));
    const guide = window.open(`/rh/candidatos/${encodeURIComponent(candidateId)}/guia`, '_blank');
    window.sessionStorage.removeItem(draft.storageKey);
    if (!guide) {
      setError('O navegador bloqueou a nova aba. Libere pop-ups e tente novamente.');
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Gerar guia de entrevista"
      subtitle={`Prepare a versão impressa para ${candidateName}. Os dados abaixo não ficam salvos.`}
      className="max-w-xl"
      footer={
        <div className="w-full space-y-3">
          {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">{error}</div> : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-line bg-surface/40 px-4 py-2.5 text-sm font-black text-secondary">Cancelar</button>
            <button type="button" onClick={openGuide} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-white inline-flex items-center gap-2"><Printer size={16} />{perguntasDesatualizadas && confirmedStale ? 'Imprimir mesmo assim' : 'Abrir guia para impressão'}</button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {perguntasDesatualizadas ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            <div className="flex gap-2 font-black"><AlertTriangle size={18} />A ficha mudou desde a geração do roteiro.</div>
            <p className="mt-2 font-medium">Gere de novo para atualizar as perguntas. Se esta entrevista já vai acontecer, confirme abaixo para imprimir o roteiro preservado.</p>
            {confirmedStale ? <label className="mt-3 flex items-center gap-2 font-bold"><input type="checkbox" checked={confirmedStale} onChange={(event) => setConfirmedStale(event.target.checked)} /> Confirmo que quero imprimir o roteiro anterior.</label> : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm font-black text-secondary">
            Data da entrevista
            <DatePicker value={data} onChange={(next) => setData(next || localToday())} className="mt-2" />
          </label>
          <div className="text-sm font-black text-secondary">
            Horário <span className="text-muted font-medium">(opcional)</span>
            <TimeSelect value={horario || null} onValueChange={setHorario} stepMinutes={15} allowEmpty placeholder="Sem horário" className="mt-2" />
          </div>
        </div>
        <label className="block text-sm font-black text-secondary">Local <span className="text-muted font-medium">(opcional)</span><input type="text" value={local} onChange={(event) => setLocal(event.target.value)} placeholder="Ex.: Sala 2" className="mt-2 w-full rounded-xl border border-line bg-bg px-4 py-3 text-primary" /></label>
        <div><div className="text-sm font-black text-secondary">Quem conduz <span className="text-muted font-medium">(até três pessoas, opcional)</span></div><div className="mt-2 grid gap-3">{condutores.map((name, index) => <input key={index} type="text" value={name} onChange={(event) => setCondutores((current) => current.map((item, position) => position === index ? event.target.value : item))} placeholder={`Entrevistador(a) ${index + 1}`} className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-primary" />)}</div></div>
      </div>
    </Modal>
  );
};
