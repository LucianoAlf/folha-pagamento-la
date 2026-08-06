import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Printer, X } from 'lucide-react';
import type { RhCandidate } from '../../../types/rh';
import { rhJornadaService } from '../../../services/rhJornadaService';
import {
  consumeInterviewGuideDraftForCandidate,
  groupInterviewGuideQuestions,
  type InterviewGuideDraftPayload,
} from './interviewGuideModel';

interface InterviewGuidePageProps {
  candidateId: string;
}

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const fileSafeName = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

export const InterviewGuidePage: React.FC<InterviewGuidePageProps> = ({ candidateId }) => {
  const [candidate, setCandidate] = useState<RhCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<InterviewGuideDraftPayload | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const consumedDraft = useRef(false);

  useEffect(() => {
    if (consumedDraft.current) return;
    consumedDraft.current = true;
    setDraft(consumeInterviewGuideDraftForCandidate(window.sessionStorage, candidateId));
    setDraftReady(true);
    window.opener = null;
  }, [candidateId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void rhJornadaService.fetchCandidateForInterviewGuide(candidateId)
      .then((nextCandidate) => {
        if (!active) return;
        setCandidate(nextCandidate);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este roteiro.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [candidateId]);

  const groups = useMemo(
    () => groupInterviewGuideQuestions(candidate?.perguntas_entrevista ?? []),
    [candidate?.perguntas_entrevista],
  );

  useEffect(() => {
    if (!candidate || !draft) return;
    document.title = `guia-entrevista-${fileSafeName(candidate.nome.split(/\s+/)[0] || 'candidato')}-${draft.data}`;
  }, [candidate, draft]);

  const print = () => {
    window.focus();
    window.print();
  };

  if (loading || !draftReady) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-700 gap-3"><Loader2 className="animate-spin" /> Carregando guia de entrevista...</div>;
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <section className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-8 text-slate-800 shadow-xl">
          <AlertTriangle className="text-amber-600 mb-4" />
          <h1 className="text-xl font-bold">Dados da impressão não disponíveis</h1>
          <p className="mt-3 text-slate-600">Volte à candidata e gere o guia novamente. Os dados de data, local e condutores não ficam salvos.</p>
          <button type="button" onClick={() => window.close()} className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white">Fechar guia</button>
        </section>
      </div>
    );
  }

  if (error || !candidate || !groups.length) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <section className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-8 text-slate-800 shadow-xl">
          <AlertTriangle className="text-red-600 mb-4" />
          <h1 className="text-xl font-bold">Guia indisponível</h1>
          <p className="mt-3 text-slate-600">{error || 'Este candidato ainda não tem roteiro de entrevista para imprimir.'}</p>
          <button type="button" onClick={() => window.close()} className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white">Fechar guia</button>
        </section>
      </div>
    );
  }

  const candidateInfo = `${candidate.nome} · ${candidate.cargo_pretendido || 'Vaga não informada'} · ${formatDate(draft.data)}`;
  const conductors = [...draft.condutores, '', '', ''].slice(0, 3);

  return (
    <main className="guide-shell">
      <style>{`
        .guide-shell { min-height: 100vh; background: #e8edf3; color: #33404f; font-family: Inter, Arial, sans-serif; padding: 24px; }
        .guide-toolbar { width: 210mm; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 10px; }
        .guide-toolbar button { border: 0; border-radius: 10px; background: #14181d; color: #fff; font-weight: 700; padding: 10px 14px; display: inline-flex; gap: 8px; align-items: center; cursor: pointer; }
        .guide-paper { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 18mm 17mm 16mm; box-shadow: 0 4px 24px rgba(20,24,29,.13); }
        .guide-top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2.5px solid #14181d; }
        .guide-brand { height: 15mm; width: auto; display: block; } .guide-doc { text-align: right; font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; color: #6b7a8c; font-weight: 600; padding-top: 4px; }
        .guide-paper h1 { margin: 22px 0 4px; color: #14181d; font: 700 24pt 'Space Grotesk', Inter, sans-serif; letter-spacing: -.02em; line-height: 1.1; }
        .guide-vaga { margin-bottom: 20px; font-size: 11pt; color: #33404f; } .guide-meta { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #dde4ec; border-radius: 6px; overflow: hidden; margin-bottom: 18px; }
        .guide-meta div { min-height: 49px; padding: 10px 13px; border-right: 1px solid #dde4ec; } .guide-meta div:last-child { border-right: 0; } .guide-meta dt, .guide-small-label { margin-bottom: 5px; color: #9aa8b8; font-size: 6.8pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; } .guide-meta dd { color: #14181d; font-size: 10pt; font-weight: 500; }
        .guide-conductors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 26px; } .guide-conductor { min-height: 30px; border-bottom: 1px solid #c9d4e0; color: #14181d; font-size: 9.5pt; }
        .guide-pillar { display: flex; align-items: center; gap: 11px; margin: 26px 0 16px; break-after: avoid; } .guide-pillar b { white-space: nowrap; color: #0f7d72; font: 700 9pt 'Space Grotesk', Inter, sans-serif; letter-spacing: .14em; text-transform: uppercase; } .guide-pillar i { height: 1px; flex: 1; background: #dde4ec; }
        .guide-question { margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; } .guide-question-heading { display: flex; gap: 11px; align-items: baseline; margin-bottom: 7px; } .guide-number { width: 20px; flex: none; color: #9aa8b8; font: 700 12pt 'Space Grotesk', Inter, sans-serif; } .guide-title { flex: 1; color: #14181d; font: 600 10pt 'Space Grotesk', Inter, sans-serif; letter-spacing: .02em; } .guide-question-text { margin: 0 0 11px 31px; color: #14181d; font-size: 11pt; line-height: 1.55; }
        .guide-signals { display: grid; grid-template-columns: 1fr 1fr; margin: 0 0 12px 31px; border-left: 2px solid #0f7d72; border-radius: 0 5px 5px 0; background: #f4f7fa; } .guide-signals div { padding: 9px 13px; } .guide-signals div + div { border-left: 1px solid #dde4ec; } .guide-signals dt { margin-bottom: 4px; font-size: 6.6pt; letter-spacing: .13em; text-transform: uppercase; font-weight: 700; } .guide-signals .guide-ok dt { color: #0f7d72; } .guide-signals .guide-attention dt { color: #e91451; } .guide-signals dd { font-size: 8.8pt; line-height: 1.45; }
        .guide-notes { margin-left: 31px; } .guide-line { height: 22px; border-bottom: 1px solid #c9d4e0; }
        .guide-closing { break-before: page; page-break-before: always; } .guide-closing h2 { margin: 0 0 4px; color: #14181d; font: 700 19pt 'Space Grotesk', Inter, sans-serif; } .guide-closing-subtitle { margin-bottom: 20px; font-size: 11pt; } .guide-evaluator { margin-top: 22px; break-inside: avoid; page-break-inside: avoid; } .guide-name-line { min-height: 22px; margin-bottom: 9px; border-bottom: 1px solid #c9d4e0; color: #14181d; font-size: 10pt; } .guide-box { border: 1px solid #dde4ec; border-radius: 6px; padding: 13px 15px; } .guide-decisions { display: flex; gap: 26px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #dde4ec; } .guide-choice { display: flex; gap: 7px; align-items: center; color: #14181d; font-size: 9.5pt; } .guide-choice i { width: 13px; height: 13px; border: 1.5px solid #6b7a8c; border-radius: 3px; }
        .guide-running-header { display: none; } .guide-footer { margin-top: 26px; padding-top: 11px; border-top: 1px solid #dde4ec; color: #6b7a8c; font-size: 8.5pt; }
        @page { size: A4; margin: 0; }
        @media print { .guide-shell { background: #fff; padding: 0; } .guide-toolbar { display: none; } .guide-paper { width: auto; min-height: auto; margin: 0; padding: 18mm 15mm 12mm; box-shadow: none; } .guide-running-header { display: flex; position: fixed; top: 0; left: 0; right: 0; height: 8mm; padding: 2.3mm 15mm 1.6mm; justify-content: space-between; border-bottom: 1px solid #dde4ec; color: #6b7a8c; background: #fff; font-size: 8pt; z-index: 5; } .guide-running-header b { color: #14181d; font-weight: 600; } .guide-running-page::after { content: counter(page); } }
      `}</style>
      <div className="guide-toolbar">
        <button type="button" onClick={() => void print()}><Printer size={17} /> Imprimir novamente</button>
        <button type="button" onClick={() => window.close()} aria-label="Fechar guia"><X size={17} /> Fechar</button>
      </div>
      <div className="guide-running-header"><span><b>{candidateInfo}</b></span><span>Página <span className="guide-running-page" /></span></div>
      <article className="guide-paper">
        <header className="guide-top">
          <img className="guide-brand" src="/logo-LA-light.png" alt="LA Music School" />
          <div className="guide-doc">Guia de entrevista<br />Uso interno</div>
        </header>
        <h1>{candidate.nome}</h1>
        <p className="guide-vaga">{candidate.cargo_pretendido || 'Vaga não informada'}</p>
        <dl className="guide-meta"><div><dt>Data</dt><dd>{formatDate(draft.data)}</dd></div><div><dt>Horário</dt><dd>{draft.horario || ' '}</dd></div><div><dt>Local</dt><dd>{draft.local || ' '}</dd></div></dl>
        <div className="guide-small-label">Conduzem</div>
        <div className="guide-conductors">{conductors.map((name, index) => <div className="guide-conductor" key={index}>{name}</div>)}</div>
        {groups.map((group) => <section key={group.key}><div className="guide-pillar"><b>{group.label}</b><i /></div>{group.questions.map((question) => <article className="guide-question" key={question.number}><div className="guide-question-heading"><span className="guide-number">{question.number}</span><span className="guide-title">{question.tituloCurto}</span></div><p className="guide-question-text">{question.pergunta}</p>{question.sinalConsistencia || question.sinalAtencao ? <dl className="guide-signals"><div className="guide-ok"><dt>Sinal de consistência</dt><dd>{question.sinalConsistencia || ' '}</dd></div><div className="guide-attention"><dt>Merece atenção</dt><dd>{question.sinalAtencao || ' '}</dd></div></dl> : null}<div className="guide-notes"><div className="guide-line" /><div className="guide-line" /><div className="guide-line" /></div></article>)}</section>)}
        <section className="guide-closing"><h2>Fechamento</h2><p className="guide-closing-subtitle">Preencher ainda na sala, antes de todo mundo sair.</p>{conductors.map((name, index) => <div className="guide-evaluator" key={index}><div className="guide-small-label">Entrevistador(a)</div><div className="guide-name-line">{name}</div><div className="guide-box"><div className="guide-line" /><div className="guide-line" /><div className="guide-line" /><div className="guide-decisions"><span className="guide-choice"><i />Seguir</span><span className="guide-choice"><i />Seguir com ressalva</span><span className="guide-choice"><i />Não seguir</span></div></div></div>)}<div className="guide-evaluator"><div className="guide-small-label">O que ficou combinado</div><div className="guide-box"><div className="guide-line" /><div className="guide-line" /><div className="guide-line" /></div></div></section>
        <footer className="guide-footer">Roteiro de entrevista — uso interno.</footer>
      </article>
    </main>
  );
};
