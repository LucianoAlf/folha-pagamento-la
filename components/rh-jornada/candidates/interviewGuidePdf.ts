import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { InterviewGuideGroup } from './interviewGuideModel';

export interface InterviewGuidePdfInput {
  candidateName: string;
  role: string;
  date: string;
  time: string;
  location: string;
  conductors: string[];
  groups: InterviewGuideGroup[];
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 18;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);
const PAGE_BOTTOM = PAGE_HEIGHT - 16;

const COLORS = {
  ink: [20, 24, 29] as const,
  text: [51, 64, 79] as const,
  muted: [107, 122, 140] as const,
  faint: [221, 228, 236] as const,
  pale: [244, 247, 250] as const,
  teal: [15, 125, 114] as const,
  pink: [233, 20, 81] as const,
};

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

export const buildInterviewGuidePdfFileName = (candidateName: string, date: string) =>
  `guia-entrevista-${fileSafeName(candidateName.split(/\s+/)[0] || 'candidato')}-${date}.pdf`;

const loadLogo = async (): Promise<string | null> => {
  try {
    const response = await fetch('/logo-LA-light.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const setTextColor = (doc: JsPdfDocument, color: readonly [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const drawRunningHeader = (
  doc: JsPdfDocument,
  candidateName: string,
  role: string,
  date: string,
) => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, COLORS.muted);
  doc.text(`${candidateName} · ${role} · ${formatDate(date)}`, MARGIN_X, 10.5);
  doc.text(`Página ${doc.getNumberOfPages()}`, PAGE_WIDTH - MARGIN_X, 10.5, { align: 'right' });
  doc.setDrawColor(...COLORS.faint);
  doc.setLineWidth(0.35);
  doc.line(MARGIN_X, 14.5, PAGE_WIDTH - MARGIN_X, 14.5);
};

const drawFirstPageHeader = async (doc: JsPdfDocument, input: InterviewGuidePdfInput) => {
  const logo = await loadLogo();
  if (logo) {
    doc.addImage(logo, 'PNG', MARGIN_X, 14, 14, 14, undefined, 'FAST');
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    setTextColor(doc, COLORS.pink);
    doc.text('LA', MARGIN_X, 25);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setTextColor(doc, COLORS.muted);
  doc.text('GUIA DE ENTREVISTA', PAGE_WIDTH - MARGIN_X, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('USO INTERNO', PAGE_WIDTH - MARGIN_X, 24, { align: 'right' });
  doc.setDrawColor(...COLORS.ink);
  doc.setLineWidth(0.7);
  doc.line(MARGIN_X, 35, PAGE_WIDTH - MARGIN_X, 35);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  setTextColor(doc, COLORS.ink);
  doc.text(input.candidateName, MARGIN_X, 47);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setTextColor(doc, COLORS.text);
  doc.text(input.role, MARGIN_X, 54);

  const metaY = 62;
  const metaHeight = 17;
  const metaWidth = CONTENT_WIDTH / 3;
  doc.setDrawColor(...COLORS.faint);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN_X, metaY, CONTENT_WIDTH, metaHeight, 1.5, 1.5, 'S');
  doc.line(MARGIN_X + metaWidth, metaY, MARGIN_X + metaWidth, metaY + metaHeight);
  doc.line(MARGIN_X + (metaWidth * 2), metaY, MARGIN_X + (metaWidth * 2), metaY + metaHeight);
  const meta = [
    ['DATA', formatDate(input.date)],
    ['HORÁRIO', input.time || ' '],
    ['LOCAL', input.location || ' '],
  ];
  meta.forEach(([label, value], index) => {
    const x = MARGIN_X + (metaWidth * index) + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setTextColor(doc, COLORS.muted);
    doc.text(label, x, metaY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setTextColor(doc, COLORS.ink);
    doc.text(value, x, metaY + 12.5);
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setTextColor(doc, COLORS.muted);
  doc.text('CONDUZEM', MARGIN_X, 87);
  const conductors = [...input.conductors, '', '', ''].slice(0, 3);
  const conductorWidth = (CONTENT_WIDTH - 6) / 3;
  conductors.forEach((name, index) => {
    const x = MARGIN_X + (index * (conductorWidth + 3));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTextColor(doc, COLORS.ink);
    doc.text(name, x, 94);
    doc.setDrawColor(...COLORS.faint);
    doc.line(x, 98, x + conductorWidth, 98);
  });
};

export async function generateInterviewGuidePdf(input: InterviewGuidePdfInput): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const fileName = buildInterviewGuidePdfFileName(input.candidateName, input.date);
  doc.setProperties({
    title: fileName.replace(/\.pdf$/, ''),
    subject: 'Guia de entrevista - uso interno',
    creator: 'Super Folha System',
  });

  await drawFirstPageHeader(doc, input);
  let y = 107;

  const addPage = () => {
    doc.addPage('a4', 'portrait');
    drawRunningHeader(doc, input.candidateName, input.role, input.date);
    y = 23;
  };

  const ensureSpace = (height: number) => {
    if (y + height > PAGE_BOTTOM) addPage();
  };

  const measureQuestionHeight = (question: InterviewGuideGroup['questions'][number]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(question.pergunta, CONTENT_WIDTH - 12) as string[];
    const hasSignals = Boolean(question.sinalConsistencia || question.sinalAtencao);
    return 9 + (lines.length * 5.2) + (hasSignals ? 21 : 0) + 21;
  };

  for (const group of input.groups) {
    ensureSpace(9 + measureQuestionHeight(group.questions[0]));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor(doc, COLORS.teal);
    doc.text(group.label.toUpperCase(), MARGIN_X, y);
    const labelWidth = doc.getTextWidth(group.label.toUpperCase());
    doc.setDrawColor(...COLORS.faint);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X + labelWidth + 5, y - 1, PAGE_WIDTH - MARGIN_X, y - 1);
    y += 9;

    for (const question of group.questions) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      const questionLines = doc.splitTextToSize(question.pergunta, CONTENT_WIDTH - 12) as string[];
      const hasSignals = Boolean(question.sinalConsistencia || question.sinalAtencao);
      const questionHeight = measureQuestionHeight(question);
      ensureSpace(questionHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      setTextColor(doc, COLORS.muted);
      doc.text(String(question.number), MARGIN_X, y);
      doc.setFontSize(9.5);
      setTextColor(doc, COLORS.ink);
      doc.text(question.tituloCurto, MARGIN_X + 9, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      setTextColor(doc, COLORS.ink);
      doc.text(questionLines, MARGIN_X + 9, y, { lineHeightFactor: 1.32 });
      y += questionLines.length * 5.2;

      if (hasSignals) {
        y += 2;
        const boxX = MARGIN_X + 9;
        const boxWidth = CONTENT_WIDTH - 9;
        const half = boxWidth / 2;
        doc.setFillColor(...COLORS.pale);
        doc.setDrawColor(...COLORS.faint);
        doc.roundedRect(boxX, y, boxWidth, 17, 1.2, 1.2, 'FD');
        doc.line(boxX + half, y, boxX + half, y + 17);

        const signals = [
          ['SINAL DE CONSISTÊNCIA', question.sinalConsistencia || ' ', COLORS.teal],
          ['MERECE ATENÇÃO', question.sinalAtencao || ' ', COLORS.pink],
        ] as const;
        signals.forEach(([label, value, color], index) => {
          const x = boxX + (half * index) + 4;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.3);
          setTextColor(doc, color);
          doc.text(label, x, y + 5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.1);
          setTextColor(doc, COLORS.text);
          const lines = doc.splitTextToSize(value, half - 8) as string[];
          doc.text(lines.slice(0, 2), x, y + 10, { lineHeightFactor: 1.22 });
        });
        y += 20;
      } else {
        y += 2;
      }

      doc.setDrawColor(201, 212, 224);
      doc.setLineWidth(0.25);
      for (let line = 0; line < 3; line += 1) {
        y += 6;
        doc.line(MARGIN_X + 9, y, PAGE_WIDTH - MARGIN_X, y);
      }
      y += 7;
    }
  }

  addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setTextColor(doc, COLORS.ink);
  doc.text('Fechamento', MARGIN_X, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setTextColor(doc, COLORS.text);
  doc.text('Preencher ainda na sala, antes de todo mundo sair.', MARGIN_X, y);
  y += 9;

  const conductors = [...input.conductors, '', '', ''].slice(0, 3);
  for (const conductor of conductors) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setTextColor(doc, COLORS.muted);
    doc.text('ENTREVISTADOR(A)', MARGIN_X, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setTextColor(doc, COLORS.ink);
    doc.text(conductor, MARGIN_X, y);
    doc.setDrawColor(...COLORS.faint);
    doc.line(MARGIN_X, y + 2, PAGE_WIDTH - MARGIN_X, y + 2);
    y += 7;
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 34, 1.5, 1.5, 'S');
    for (let line = 0; line < 3; line += 1) {
      doc.line(MARGIN_X + 4, y + 7 + (line * 6), PAGE_WIDTH - MARGIN_X - 4, y + 7 + (line * 6));
    }
    doc.line(MARGIN_X, y + 25, PAGE_WIDTH - MARGIN_X, y + 25);
    const choices = ['Seguir', 'Seguir com ressalva', 'Não seguir'];
    choices.forEach((choice, index) => {
      const x = MARGIN_X + 5 + (index * 55);
      doc.rect(x, y + 28, 3.5, 3.5);
      doc.setFontSize(8.5);
      doc.text(choice, x + 6, y + 31.2);
    });
    y += 41;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setTextColor(doc, COLORS.muted);
  doc.text('O QUE FICOU COMBINADO', MARGIN_X, y);
  y += 4;
  doc.setDrawColor(...COLORS.faint);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 28, 1.5, 1.5, 'S');
  for (let line = 0; line < 3; line += 1) {
    doc.line(MARGIN_X + 4, y + 7 + (line * 6), PAGE_WIDTH - MARGIN_X - 4, y + 7 + (line * 6));
  }

  doc.save(fileName);
  return fileName;
}
