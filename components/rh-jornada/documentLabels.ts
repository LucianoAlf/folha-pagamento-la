const RH_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  aviso_previo: 'Aviso prévio',
  checklist_documental: 'Checklist documental',
  codigo_conduta: 'Código de conduta',
  comprovante_bancario: 'Comprovante bancário',
  comprovante_residencia: 'Comprovante de residência',
  cpf: 'CPF',
  ctps: 'CTPS',
  documentos_rescisorios: 'Documentos rescisórios',
  exame_admissional: 'Exame admissional',
  ficha_registro: 'Ficha de registro',
  la_culture: 'LA Culture',
  pis_pasep: 'PIS/PASEP',
  rg: 'RG',
  titulo_eleitor: 'Título de eleitor',
};

const RH_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  em_analise: 'Em análise',
  conferido: 'Conferido',
  rejeitado: 'Rejeitado',
};

const ACRONYM_LABELS = new Set(['aso', 'cnh', 'cpf', 'rg', 'ctps', 'la']);

function humanizeStoredCode(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word, index) => {
      const normalizedWord = word.toLocaleLowerCase('pt-BR');
      if (ACRONYM_LABELS.has(normalizedWord)) return normalizedWord.toUpperCase();
      if (index === 0) return normalizedWord.charAt(0).toLocaleUpperCase('pt-BR') + normalizedWord.slice(1);
      return normalizedWord;
    })
    .join(' ');
}

export function formatRhDocumentTypeLabel(value?: string | null): string {
  const storedValue = String(value || '').trim();
  if (!storedValue) return 'Documento';

  const knownLabel = RH_DOCUMENT_TYPE_LABELS[storedValue.toLocaleLowerCase('pt-BR')];
  if (knownLabel) return knownLabel;

  // Preserve custom labels already written for humans; only normalize codes.
  return /[_-]/.test(storedValue) ? humanizeStoredCode(storedValue) : storedValue;
}

export function formatRhDocumentStatusLabel(value?: string | null): string {
  const storedValue = String(value || '').trim();
  if (!storedValue) return 'Status não informado';
  return RH_DOCUMENT_STATUS_LABELS[storedValue.toLocaleLowerCase('pt-BR')] || humanizeStoredCode(storedValue);
}
