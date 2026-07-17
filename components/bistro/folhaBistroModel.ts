export type FolhaDreSnapshotRow = {
  lancamento_folha_id: number;
  colaborador_id: number;
  componente: string;
  tipo_efeito: string;
  valor_original: number | string;
  bistro_ref_ym: string | null;
};

export type LancamentoBistroSource = {
  id: number;
  colaborador_id: number;
  categoria: string;
  descontos: number;
  detalhamento?: unknown;
};

type BistroLancamentoBreakdown = {
  bistroLiquidado: number;
  outrosDescontos: number;
  bistroRefYm: string | null;
};

const toCents = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
};

const fromCents = (value: number) => value / 100;

function legacyBistroMeta(lancamento: LancamentoBistroSource) {
  const detalhe = lancamento.detalhamento;
  if (!detalhe || typeof detalhe !== 'object' || Array.isArray(detalhe)) {
    return { valorCents: 0, refYm: null as string | null };
  }

  const raw = (detalhe as Record<string, unknown>).__bistro;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valorCents: 0, refYm: null as string | null };
  }

  const meta = raw as Record<string, unknown>;
  return {
    valorCents: toCents(meta.valor),
    refYm: typeof meta.ref_ym === 'string' ? meta.ref_ym : null,
  };
}

export function buildFolhaBistroBreakdown(input: {
  lancamentos: LancamentoBistroSource[];
  snapshotRows: FolhaDreSnapshotRow[];
}) {
  const hasSnapshot = input.snapshotRows.length > 0;
  const liquidacaoByLancamento = new Map<number, { cents: number; refYm: string | null }>();

  for (const row of input.snapshotRows) {
    if (row.componente !== 'descontos' || row.tipo_efeito !== 'liquidacao') continue;
    const current = liquidacaoByLancamento.get(row.lancamento_folha_id) || { cents: 0, refYm: null };
    liquidacaoByLancamento.set(row.lancamento_folha_id, {
      cents: current.cents + toCents(row.valor_original),
      refYm: current.refYm || row.bistro_ref_ym || null,
    });
  }

  const byLancamentoId: Record<number, BistroLancamentoBreakdown> = {};
  const byCategoria: Record<string, { bistroLiquidado: number; outrosDescontos: number }> = {};
  let totalBistroCents = 0;
  let totalOutrosCents = 0;

  for (const lancamento of input.lancamentos) {
    const descontosCents = Math.max(0, toCents(lancamento.descontos));
    const snapshot = liquidacaoByLancamento.get(lancamento.id);
    const legacy = legacyBistroMeta(lancamento);
    const liquidadoCents = Math.min(
      descontosCents,
      Math.max(0, hasSnapshot ? (snapshot?.cents || 0) : legacy.valorCents),
    );
    const outrosCents = descontosCents - liquidadoCents;
    const bistroRefYm = hasSnapshot ? (snapshot?.refYm || null) : legacy.refYm;

    byLancamentoId[lancamento.id] = {
      bistroLiquidado: fromCents(liquidadoCents),
      outrosDescontos: fromCents(outrosCents),
      bistroRefYm,
    };

    const categoria = byCategoria[lancamento.categoria] || { bistroLiquidado: 0, outrosDescontos: 0 };
    byCategoria[lancamento.categoria] = {
      bistroLiquidado: fromCents(toCents(categoria.bistroLiquidado) + liquidadoCents),
      outrosDescontos: fromCents(toCents(categoria.outrosDescontos) + outrosCents),
    };
    totalBistroCents += liquidadoCents;
    totalOutrosCents += outrosCents;
  }

  return {
    byLancamentoId,
    byCategoria,
    totalBistroLiquidado: fromCents(totalBistroCents),
    totalOutrosDescontos: fromCents(totalOutrosCents),
  };
}

export function buildBistroReconciliation(input: {
  consumos: Array<{ colaborador_id: number; valor: number; valor_pago_direto?: number }>;
  colaboradores: Array<{ id: number; nome: string }>;
  snapshotRows: FolhaDreSnapshotRow[];
}) {
  const nomes = new Map(input.colaboradores.map((colaborador) => [colaborador.id, colaborador.nome]));
  const liquidadoByColaborador = new Map<number, number>();

  for (const row of input.snapshotRows) {
    if (row.componente !== 'descontos' || row.tipo_efeito !== 'liquidacao') continue;
    liquidadoByColaborador.set(
      row.colaborador_id,
      (liquidadoByColaborador.get(row.colaborador_id) || 0) + toCents(row.valor_original),
    );
  }

  let consumoBrutoCents = 0;
  const pagamentosDiretos: Array<{ colaboradorId: number; nome: string; valor: number }> = [];

  for (const consumo of input.consumos) {
    const brutoCents = Math.max(0, toCents(consumo.valor));
    const pagoDiretoCents = Math.min(brutoCents, Math.max(0, toCents(consumo.valor_pago_direto)));
    consumoBrutoCents += brutoCents;
    if (pagoDiretoCents > 0) {
      pagamentosDiretos.push({
        colaboradorId: consumo.colaborador_id,
        nome: nomes.get(consumo.colaborador_id) || `Colaborador #${consumo.colaborador_id}`,
        valor: fromCents(pagoDiretoCents),
      });
    }
  }

  const liquidadoFolhaCents = [...liquidadoByColaborador.values()].reduce((total, value) => total + value, 0);
  const pagoDiretoCents = pagamentosDiretos.reduce((total, item) => total + toCents(item.valor), 0);

  return {
    consumoBruto: fromCents(consumoBrutoCents),
    liquidadoFolha: fromCents(liquidadoFolhaCents),
    pagoDireto: fromCents(pagoDiretoCents),
    pagamentosDiretos,
  };
}
