import type { FolhaMensal } from '../../types.ts';
import type { FolhaRateioPreflight } from '../../types/folhaRateio.ts';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function canCloseFolha(
  status: FolhaMensal['status'],
  preflight: FolhaRateioPreflight,
): boolean {
  return status === 'aprovada'
    && preflight.pronto
    && preflight.pessoas_pendentes === 0
    && preflight.fatias_sem_conta === 0;
}

export function buildFolhaCloseConfirmation(preflight: FolhaRateioPreflight): string {
  const accountCount = preflight.totais_por_conta.filter((item) => item.valor > 0).length;
  const accountLabel = accountCount === 1 ? 'conta a pagar' : 'contas a pagar';
  return `Isso vai gerar ${accountCount} ${accountLabel} totalizando ${brlFormatter.format(preflight.total_folha)}. Confirma?`;
}
