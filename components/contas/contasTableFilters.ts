import type { ContaPagar } from '../../types/contasPagar.ts';
import { matchesContaPlanoCentroSearch } from './planoContasSelectors.ts';

export type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30' | 'data';

export type ContasTableFilterInput = {
  filtro: FiltroTab;
  busca?: string;
  dataInicio?: string;
  dataFim?: string;
  hojeISO?: string;
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function dateOnly(value?: string | null): string {
  return String(value || '').slice(0, 10);
}

function isWithinDateFilter(date: string, dataInicio?: string, dataFim?: string): boolean {
  const current = dateOnly(date);
  const start = dateOnly(dataInicio);
  const end = dateOnly(dataFim);
  if (!start && !end) return true;
  if (start && !end) return current === start;
  if (!start && end) return current <= end;
  const min = start <= end ? start : end;
  const max = start <= end ? end : start;
  return current >= min && current <= max;
}

function getStatusVisualForTable(conta: ContaPagar, hoje: string): 'vencida' | 'urgente' | 'hoje' | 'pendente' | 'pago' {
  if (conta.status === 'pago') return 'pago';

  const hojeDate = new Date(`${hoje}T00:00:00`);
  const venc = new Date(`${conta.data_vencimento}T00:00:00`);
  const diffDias = Math.ceil((venc.getTime() - hojeDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return 'vencida';
  if (diffDias === 0) return 'hoje';
  if (diffDias <= 7) return 'urgente';
  return 'pendente';
}

function extractConfirmadoPor(observacoes: string): string {
  const match = observacoes.match(/confirm(?:a[cç][aã]o|acao)\s+de\s+([^\n.]+?)(?:\s+em|\.)/i);
  return match?.[1]?.trim() || 'confirmacao humana';
}

export function getMariaContaActionInfo(conta: Pick<ContaPagar, 'observacoes'>): { tooltip: string } | null {
  const observacoes = String(conta.observacoes || '');
  if (/baixa registrada pela maria/i.test(observacoes)) {
    return {
      tooltip: `Baixa registrada pela Maria via WhatsApp, confirmada por ${extractConfirmadoPor(observacoes)}.`,
    };
  }

  if (/conta eventual registrada pela maria/i.test(observacoes)) {
    return {
      tooltip: `Lançamento registrado pela Maria via WhatsApp, confirmado por ${extractConfirmadoPor(observacoes)}.`,
    };
  }

  return null;
}

export function filterContasForTable(contas: ContaPagar[], input: ContasTableFilterInput): ContaPagar[] {
  const q = (input.busca || '').trim();
  const hoje = input.hojeISO || todayISO();

  return contas.filter((c) => {
    if (q && !matchesContaPlanoCentroSearch(c, q)) return false;

    if (input.filtro === 'data') {
      return isWithinDateFilter(c.data_vencimento, input.dataInicio, input.dataFim);
    }

    const statusVisual = getStatusVisualForTable(c, hoje);
    const hojeDate = new Date(`${hoje}T00:00:00`);
    const venc = new Date(`${c.data_vencimento}T00:00:00`);
    const diffDias = Math.ceil((venc.getTime() - hojeDate.getTime()) / (1000 * 60 * 60 * 24));

    if (input.filtro === 'hoje') return c.data_vencimento === hoje && c.status === 'pendente';
    if (input.filtro === 'vencidas') return statusVisual === 'vencida' && c.data_vencimento !== hoje;
    if (input.filtro === 'prox7') return diffDias > 0 && diffDias <= 7 && c.status === 'pendente';
    if (input.filtro === 'prox30') return diffDias > 0 && diffDias <= 30 && c.status === 'pendente';
    return true;
  });
}
