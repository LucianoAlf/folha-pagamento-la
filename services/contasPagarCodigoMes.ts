import type { CodigoMesBadge, ContaPagar, ContaPagarCodigoMes, StatusVisual } from '../types/contasPagar.ts';

const CODIGO_BARRAS_CHARS_RE = /^[\d\s.\-]+$/;
const CODIGO_BARRAS_DIGIT_LENGTHS = new Set([44, 47, 48]);

export function normalizarCodigoBarras(valor?: string | null): string | null {
  const codigo = valor?.trim();
  if (!codigo) return null;
  return codigo;
}

function extrairPrefixoLinhaDigitavel(linha: string): string {
  return linha.replace(/\s+[-–—]\s+.*$/, '').trim();
}

function isLinhaDigitavelValida(linha: string): boolean {
  const codigo = extrairPrefixoLinhaDigitavel(linha);
  if (!codigo) return false;
  if (!CODIGO_BARRAS_CHARS_RE.test(codigo)) return false;

  const digitos = codigo.replace(/\D/g, '');
  return CODIGO_BARRAS_DIGIT_LENGTHS.has(digitos.length);
}

export function isCodigoBarrasValido(valor?: string | null): boolean {
  const codigo = normalizarCodigoBarras(valor);
  if (!codigo) return false;
  return codigo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .every(isLinhaDigitavelValida);
}

export function assertCodigoBarrasValido(valor?: string | null): string | null {
  const codigo = normalizarCodigoBarras(valor);
  if (!codigo) return null;
  if (!isCodigoBarrasValido(codigo)) {
    throw new Error('Código de barras inválido. Cole apenas a linha digitável/código de barras, sem texto livre.');
  }
  return codigo;
}

export function hasCodigoPagamento(
  conta: Pick<ContaPagar, 'pix_chave_fixa'>,
  codigo?: Pick<ContaPagarCodigoMes, 'codigo_barras' | 'chave_pix' | 'qr_pix_payload'> | null
): boolean {
  return Boolean(
    isCodigoBarrasValido(codigo?.codigo_barras) ||
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
  if (hasCodigoPagamento(conta, codigo)) return 'coletado';
  if (codigo?.status_coleta === 'indisponivel') return 'indisponivel';
  if (conta.status === 'pendente' && statusVisual && ['vencida', 'hoje', 'urgente'].includes(statusVisual)) {
    return 'atualizar';
  }
  return 'sem_codigo';
}
