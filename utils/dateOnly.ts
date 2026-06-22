/** Extrai yyyy-mm-dd de ISO date ou datetime (evita bugs de timezone). */
export function toDateOnly(value?: string | null): string {
  if (!value) return '';
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** Competência = 1º dia do mês do vencimento (regra operacional Rose/Ana). */
export function competenciaFromVencimento(vencimento: string): string {
  const d = toDateOnly(vencimento);
  if (!d) return '';
  const [yyyy, mm] = d.split('-');
  return yyyy && mm ? `${yyyy}-${mm}-01` : '';
}

export function formatDateBR(iso?: string | null): string {
  const d = toDateOnly(iso || '');
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function formatCompetenciaLabel(vencimentoOrCompetencia: string): string {
  const d = toDateOnly(vencimentoOrCompetencia);
  if (!d) return '—';
  const [y, m] = d.split('-').map(Number);
  if (!y || !m) return '—';
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
