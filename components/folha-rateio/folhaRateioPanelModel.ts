import type { Lancamento } from '../../types.ts';
import type { FolhaRateioPreflight } from '../../types/folhaRateio.ts';
import type { FolhaRateioPessoa } from './folhaRateioSelectors.ts';

export type FolhaRateioFiltro = 'todos' | 'pendentes';

export type FolhaRateioPanelDiagnostic = {
  key: 'fatias_sem_conta' | 'incoerencias_fiscais' | 'conflitos_chave';
  label: string;
  value: number;
};

export type FolhaRateioProgress = {
  total: number;
  pending: number;
  reconciled: number;
  percent: number;
  diagnostics: FolhaRateioPanelDiagnostic[];
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function selectFolhaLancamentos(
  lancamentos: Lancamento[],
  folhaId: number,
): Lancamento[] {
  return lancamentos.filter((lancamento) => lancamento.folha_id === folhaId);
}

export function filterFolhaRateioPessoas(
  pessoas: FolhaRateioPessoa[],
  search: string,
  filtro: FolhaRateioFiltro,
): FolhaRateioPessoa[] {
  const query = normalizeSearch(search);

  return pessoas.filter((pessoa) => {
    const pending = pessoa.status === 'a_conciliar' || pessoa.status === 'parcial';
    if (filtro === 'pendentes' && !pending) return false;
    if (!query) return true;
    return normalizeSearch(`${pessoa.nome} ${pessoa.funcao}`).includes(query);
  });
}

export function deriveFolhaRateioProgress(
  preflight: FolhaRateioPreflight,
): FolhaRateioProgress {
  const total = Math.max(0, preflight.pessoas_total);
  const pending = Math.max(0, preflight.pessoas_pendentes);
  const reconciled = Math.max(0, total - pending);
  const percent = total === 0
    ? 0
    : Math.min(100, Math.max(0, (reconciled / total) * 100));
  const allDiagnostics: FolhaRateioPanelDiagnostic[] = [
    { key: 'fatias_sem_conta', label: 'Fatias sem conta', value: preflight.fatias_sem_conta },
    { key: 'incoerencias_fiscais', label: 'Incoerencias fiscais', value: preflight.incoerencias_fiscais },
    { key: 'conflitos_chave', label: 'Divisoes duplicadas', value: preflight.conflitos_chave },
  ];
  const diagnostics = allDiagnostics.filter((item) => item.value > 0);

  return { total, pending, reconciled, percent, diagnostics };
}
