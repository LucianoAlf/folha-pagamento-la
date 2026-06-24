import type { CodigoMesBadge, ContaPagar, ContaPagarCodigoMes, StatusVisual } from '../types/contasPagar.ts';

export function hasCodigoPagamento(
  conta: Pick<ContaPagar, 'pix_chave_fixa'>,
  codigo?: Pick<ContaPagarCodigoMes, 'codigo_barras' | 'chave_pix' | 'qr_pix_payload'> | null
): boolean {
  return Boolean(
    codigo?.codigo_barras?.trim() ||
      codigo?.qr_pix_payload?.trim() ||
      codigo?.chave_pix?.trim() ||
      conta.pix_chave_fixa?.trim()
  );
}

export function resolveCodigoMesBadge(
  conta: Pick<ContaPagar, 'status' | 'pix_chave_fixa'>,
  codigo?: Pick<ContaPagarCodigoMes, 'codigo_barras' | 'chave_pix' | 'qr_pix_payload' | 'status_coleta'> | null,
  statusVisual?: StatusVisual
): CodigoMesBadge {
  if (hasCodigoPagamento(conta, codigo) || codigo?.status_coleta === 'coletado') return 'coletado';
  if (codigo?.status_coleta === 'indisponivel') return 'indisponivel';
  if (conta.status === 'pendente' && statusVisual && ['vencida', 'hoje', 'urgente'].includes(statusVisual)) {
    return 'atualizar';
  }
  return 'sem_codigo';
}
