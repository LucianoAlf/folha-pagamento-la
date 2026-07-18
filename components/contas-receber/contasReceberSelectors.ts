import type { ContaReceber, ContaReceberFilters } from '../../types/contasReceber.ts';

const money = (value: number | null | undefined) => Number(value ?? 0);

export function buildContasReceberFonteStatus(
  sourceSyncedAt: string | null | undefined,
  now = new Date(),
  staleAfterHours = 24,
) {
  if (!sourceSyncedAt) return { sourceSyncedAt: null, stale: true, ageHours: null };
  const syncedAt = new Date(sourceSyncedAt);
  if (Number.isNaN(syncedAt.getTime())) return { sourceSyncedAt, stale: true, ageHours: null };
  const ageHours = Math.max(0, Math.round((now.getTime() - syncedAt.getTime()) / 3_600_000));
  return { sourceSyncedAt, stale: ageHours > staleAfterHours, ageHours };
}

export function buildContasReceberResumo(contas: ContaReceber[]) {
  const validas = contas.filter((conta) => !conta.excluido_da_receita && conta.status !== 'cancelado');
  const recebido = validas
    .filter((conta) => conta.status === 'recebido')
    .reduce((sum, conta) => sum + money(conta.valor_pago), 0);
  const emAberto = validas
    .filter((conta) => conta.status === 'pendente')
    .reduce((sum, conta) => sum + money(conta.valor_liquido), 0);
  const emRevisao = validas
    .filter((conta) => conta.status === 'revisar')
    .reduce((sum, conta) => sum + money(conta.valor_liquido), 0);
  const totalReceita = recebido + emAberto;

  return {
    recebido: Number(recebido.toFixed(2)),
    emAberto: Number(emAberto.toFixed(2)),
    emRevisao: Number(emRevisao.toFixed(2)),
    totalReceita: Number(totalReceita.toFixed(2)),
    percentualRecebido: totalReceita > 0 ? Number(((recebido / totalReceita) * 100).toFixed(2)) : 0,
    pendentesClassificacao: contas.filter(
      (conta) => !conta.excluido_da_receita && conta.classificacao_status === 'pendente',
    ).length,
    excluidos: contas.filter((conta) => conta.excluido_da_receita).length,
  };
}

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function filterContasReceber(contas: ContaReceber[], filters: ContaReceberFilters) {
  const busca = normalize(filters.busca).trim();
  return contas.filter((conta) => {
    if (filters.unidade !== 'all' && conta.unidade !== filters.unidade) return false;
    if (filters.status !== 'all' && conta.status !== filters.status) return false;
    if (filters.classificacao !== 'all' && conta.classificacao_status !== filters.classificacao) return false;
    if (!busca) return true;
    return [conta.aluno_nome, conta.curso_nome, conta.descricao, String(conta.emusys_fatura_id)]
      .some((value) => normalize(value).includes(busca));
  });
}
