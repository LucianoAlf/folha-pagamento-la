type SourceItem = Record<string, unknown>;

function normalizeDescription(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mappedStatus(item: SourceItem) {
  if (item.source_missing === true) return 'revisar';
  switch (String(item.status_origem ?? '').trim().toLowerCase()) {
    case 'paga':
    case 'pago':
      return 'recebido';
    case 'aberta':
    case 'pendente':
      return 'pendente';
    case 'cancelada':
    case 'cancelado':
      return 'cancelado';
    default:
      return 'revisar';
  }
}

export function buildContasReceberPreflightBuckets(itens: SourceItem[]) {
  const classificacao = {
    mensalidades: 0,
    matriculas_passaportes: 0,
    locacoes: 0,
    vendas_avulsas: 0,
    receitas_operacionais: 0,
    rateios_excluidos: 0,
    pendentes_manuais: 0,
  };
  const resumo = {
    recebido: 0,
    em_aberto: 0,
    em_revisao: 0,
    excluido_rateio: 0,
    cancelado: 0,
  };

  for (const item of itens) {
    const descricao = normalizeDescription(item.descricao);
    const rateio = /\brateio\b/.test(descricao);
    if (rateio) classificacao.rateios_excluidos += 1;
    else if (/^\s*parcela\b/.test(descricao)) classificacao.mensalidades += 1;
    else if (/\b(passaporte|matricula)\b/.test(descricao)) classificacao.matriculas_passaportes += 1;
    else if (/\blocacao\b/.test(descricao)) classificacao.locacoes += 1;
    else if (/venda no controle de estoque|\bproduto\s*:/.test(descricao)) classificacao.vendas_avulsas += 1;
    else if (/\bservico particular\b|\bestorno cartao\b/.test(descricao)) classificacao.receitas_operacionais += 1;
    else classificacao.pendentes_manuais += 1;

    if (rateio) {
      resumo.excluido_rateio += money(item.valor_liquido);
      continue;
    }
    switch (mappedStatus(item)) {
      case 'recebido':
        resumo.recebido += money(item.valor_pago);
        break;
      case 'pendente':
        resumo.em_aberto += money(item.valor_liquido);
        break;
      case 'cancelado':
        resumo.cancelado += money(item.valor_liquido);
        break;
      default:
        resumo.em_revisao += money(item.valor_liquido);
    }
  }

  for (const key of Object.keys(resumo) as Array<keyof typeof resumo>) {
    resumo[key] = Number(resumo[key].toFixed(2));
  }

  return { classificacao, resumo };
}
