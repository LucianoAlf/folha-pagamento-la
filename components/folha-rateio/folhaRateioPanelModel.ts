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

export type FolhaRateioPanelSelection = {
  folhaId: number;
  selectedPessoa: FolhaRateioPessoa | null;
  pendingRefreshPessoaId: number | null;
  refreshingPessoaId: number | null;
};

export type FolhaRateioPanelSelectionAction =
  | { type: 'select'; pessoa: FolhaRateioPessoa }
  | { type: 'close_selection' }
  | { type: 'refresh_failed'; folhaId: number; colaboradorId: number }
  | { type: 'retry_refresh'; folhaId: number; colaboradorId: number }
  | { type: 'refresh_succeeded'; folhaId: number }
  | { type: 'clear_pending_refresh'; folhaId: number }
  | { type: 'folha_changed'; folhaId: number };

export function createFolhaRateioPanelSelection(
  folhaId: number,
): FolhaRateioPanelSelection {
  return {
    folhaId,
    selectedPessoa: null,
    pendingRefreshPessoaId: null,
    refreshingPessoaId: null,
  };
}

export function folhaRateioPanelSelectionReducer(
  state: FolhaRateioPanelSelection,
  action: FolhaRateioPanelSelectionAction,
): FolhaRateioPanelSelection {
  switch (action.type) {
    case 'select':
      return { ...state, selectedPessoa: action.pessoa };
    case 'close_selection':
      return state.selectedPessoa === null ? state : { ...state, selectedPessoa: null };
    case 'refresh_failed':
      if (action.folhaId !== state.folhaId) return state;
      return {
        ...state,
        pendingRefreshPessoaId: action.colaboradorId,
        refreshingPessoaId: null,
      };
    case 'retry_refresh':
      if (
        action.folhaId !== state.folhaId
        || state.pendingRefreshPessoaId !== action.colaboradorId
        || state.refreshingPessoaId !== null
      ) return state;
      return { ...state, refreshingPessoaId: action.colaboradorId };
    case 'refresh_succeeded':
      if (action.folhaId !== state.folhaId) return state;
      return createFolhaRateioPanelSelection(state.folhaId);
    case 'clear_pending_refresh':
      if (action.folhaId !== state.folhaId) return state;
      if (state.pendingRefreshPessoaId === null && state.refreshingPessoaId === null) return state;
      return {
        ...state,
        pendingRefreshPessoaId: null,
        refreshingPessoaId: null,
      };
    case 'folha_changed':
      return action.folhaId === state.folhaId
        ? state
        : createFolhaRateioPanelSelection(action.folhaId);
    default:
      return state;
  }
}

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
    { key: 'fatias_sem_conta', label: 'Lancamentos sem conta pagadora', value: preflight.fatias_sem_conta },
    { key: 'incoerencias_fiscais', label: 'Incoerencias fiscais', value: preflight.incoerencias_fiscais },
    { key: 'conflitos_chave', label: 'Divisoes duplicadas', value: preflight.conflitos_chave },
  ];
  const diagnostics = allDiagnostics.filter((item) => item.value > 0);

  return { total, pending, reconciled, percent, diagnostics };
}
