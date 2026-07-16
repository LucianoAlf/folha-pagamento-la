export type FolhaAlertSummaryInput = {
  count: number;
  notedCount: number;
  scopeLabel?: string;
};

export function buildFolhaAlertSummary({
  count,
  notedCount,
  scopeLabel,
}: FolhaAlertSummaryInput): { title: string; subtitle: string } {
  const title = `${count} ${count === 1 ? 'alerta aguardando confirmacao' : 'alertas aguardando confirmacao'}`;

  if (scopeLabel) {
    return { title, subtitle: `Alertas da unidade ${scopeLabel}` };
  }

  if (notedCount > 0) {
    return {
      title,
      subtitle: notedCount === 1
        ? 'Motivo registrado. Confirme a revisao para concluir.'
        : `${notedCount} motivos registrados. Confirme as revisoes para concluir.`,
    };
  }

  return { title, subtitle: 'Revise antes de aprovar a folha' };
}
