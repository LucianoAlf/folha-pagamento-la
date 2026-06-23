import type { ContaPagar } from '../types/contasPagar.ts';
import { competenciaFromVencimento } from '../utils/dateOnly.ts';

export function buildParcelasContaPagar(
  conta: Partial<ContaPagar>,
  valoresParcela: number[],
  createdBy?: string | null
): Partial<ContaPagar>[] {
  const parcelaInicial = conta.parcela_atual || 1;
  const totalParcelas = conta.total_parcelas || valoresParcela.length;
  const dataBase = new Date(`${conta.data_vencimento!}T00:00:00`);

  return valoresParcela.map((valor, i) => {
    const dataVenc = new Date(dataBase);
    dataVenc.setMonth(dataVenc.getMonth() + i);

    const yyyy = dataVenc.getFullYear();
    const mm = String(dataVenc.getMonth() + 1).padStart(2, '0');
    const dd = String(dataVenc.getDate()).padStart(2, '0');
    const dataVencimento = `${yyyy}-${mm}-${dd}`;

    return {
      ...conta,
      descricao: `${conta.descricao} (${parcelaInicial + i}/${totalParcelas})`,
      valor,
      data_vencimento: dataVencimento,
      competencia: competenciaFromVencimento(dataVencimento),
      parcela_atual: parcelaInicial + i,
      total_parcelas: totalParcelas,
      created_by: createdBy,
    };
  });
}
