// =====================================================
// UTILS - VALIDAÇÕES CLT
// Data: 2026-02-07
// Descrição: Validações da legislação CLT para férias
// =====================================================

import type { FeriasPeriodoAquisitivo } from '../types';

/**
 * Valida dias mínimos para férias
 * CLT: 1º período deve ter no mínimo 14 dias corridos (se fracionado)
 * Demais períodos: mínimo 5 dias corridos
 */
export function validarDiasMinimos(
  diasCorridos: number,
  isPrimeiroPeriodo: boolean,
  ehPeriodoUnico: boolean
): { valido: boolean; erro?: string } {
  // Se for período único, pode ser qualquer quantidade até 30 dias
  if (ehPeriodoUnico) {
    if (diasCorridos < 1 || diasCorridos > 30) {
      return {
        valido: false,
        erro: 'Período único deve ter entre 1 e 30 dias',
      };
    }
    return { valido: true };
  }

  // Se for o primeiro período fracionado, mínimo 14 dias corridos
  if (isPrimeiroPeriodo) {
    if (diasCorridos < 14) {
      return {
        valido: false,
        erro: 'Primeiro período de férias fracionadas deve ter no mínimo 14 dias corridos',
      };
    }
    return { valido: true };
  }

  // Demais períodos: mínimo 5 dias corridos
  if (diasCorridos < 5) {
    return {
      valido: false,
      erro: 'Períodos adicionais devem ter no mínimo 5 dias corridos',
    };
  }

  return { valido: true };
}

/**
 * Máximo de dias de abono pecuniário.
 * CLT Art. 143: até 1/3 do DIREITO do período (30 → 10 dias). O teto NÃO
 * depende do tamanho da fração — um colaborador com 30 dias de direito pode
 * vender até 10 dias mesmo gozando as férias em frações. A disponibilidade de
 * saldo (dias_corridos + dias_abono ≤ dias_saldo) é validada à parte por
 * validarSaldo; aqui retornamos apenas o teto legal.
 *
 * O 2º parâmetro (diasCorridos) é mantido por compatibilidade de assinatura,
 * mas NÃO limita o teto (limitá-lo à fração seria incorreto pela CLT).
 */
export function maxAbonoDias(diasDireito: number = 30, _diasCorridos: number = 0): number {
  return Math.max(0, Math.floor((diasDireito || 30) / 3));
}

/**
 * Valida abono pecuniário (venda de dias)
 * CLT: Máximo 1/3 do direito do período (10 dias de 30)
 */
export function validarAbono(
  diasAbono: number,
  diasCorridos: number,
  diasDireito: number = 30
): { valido: boolean; erro?: string } {
  if (diasAbono < 0) {
    return { valido: false, erro: 'Dias de abono não pode ser negativo' };
  }

  if (diasAbono === 0) {
    return { valido: true };
  }

  const maxAbono = maxAbonoDias(diasDireito, diasCorridos);

  if (diasAbono > maxAbono) {
    return {
      valido: false,
      erro: `Abono pecuniário não pode exceder ${maxAbono} dias (1/3 do direito do período)`,
    };
  }

  return { valido: true };
}

/**
 * Valida se as datas de férias estão dentro do período concessivo
 */
export function validarDentroConcessivo(
  dataInicio: Date,
  dataFim: Date,
  periodo: FeriasPeriodoAquisitivo
): { valido: boolean; erro?: string } {
  const concessivoInicio = new Date(periodo.concessivo_inicio);
  const concessivoFim = new Date(periodo.concessivo_fim);

  if (dataInicio < concessivoInicio) {
    return {
      valido: false,
      erro: `Férias devem iniciar após ${concessivoInicio.toLocaleDateString(
        'pt-BR'
      )} (início do período concessivo)`,
    };
  }

  if (dataFim > concessivoFim) {
    return {
      valido: false,
      erro: `Férias devem terminar antes de ${concessivoFim.toLocaleDateString(
        'pt-BR'
      )} (fim do período concessivo)`,
    };
  }

  return { valido: true };
}

/**
 * Valida se há saldo suficiente no período (em dias corridos)
 */
export function validarSaldo(
  diasCorridos: number,
  diasAbono: number,
  periodo: FeriasPeriodoAquisitivo
): { valido: boolean; erro?: string } {
  const totalNecessario = diasCorridos + diasAbono;

  if (totalNecessario > periodo.dias_saldo) {
    return {
      valido: false,
      erro: `Saldo insuficiente. Disponível: ${periodo.dias_saldo} dias, Necessário: ${totalNecessario} dias`,
    };
  }

  return { valido: true };
}

/**
 * Valida se data de início é posterior à data de fim
 */
export function validarOrdemDatas(
  dataInicio: Date,
  dataFim: Date
): { valido: boolean; erro?: string } {
  if (dataFim < dataInicio) {
    return {
      valido: false,
      erro: 'Data de fim deve ser posterior à data de início',
    };
  }

  return { valido: true };
}

/**
 * Valida se as férias não estão no passado
 */
export function validarDataFutura(
  dataInicio: Date,
  hoje: Date = new Date()
): { valido: boolean; aviso?: string } {
  // Permite programar até 7 dias no passado (tolerância)
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  if (dataInicio < seteDiasAtras) {
    return {
      valido: false,
      aviso: 'Data de início está muito no passado. Verifique se a data está correta.',
    };
  }

  return { valido: true };
}

/**
 * Valida programação completa de férias
 */
export function validarProgramacaoFerias(input: {
  periodo: FeriasPeriodoAquisitivo;
  dataInicio: Date;
  dataFim: Date;
  diasCorridos: number;
  diasAbono: number;
  isPrimeiroPeriodo: boolean;
  ehPeriodoUnico: boolean;
}): { valido: boolean; erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. Validar ordem das datas
  const validOrdem = validarOrdemDatas(input.dataInicio, input.dataFim);
  if (!validOrdem.valido) erros.push(validOrdem.erro!);

  // 2. Validar dias mínimos (CLT usa dias corridos)
  const validDias = validarDiasMinimos(
    input.diasCorridos,
    input.isPrimeiroPeriodo,
    input.ehPeriodoUnico
  );
  if (!validDias.valido) erros.push(validDias.erro!);

  // 3. Validar abono
  const validAbono = validarAbono(input.diasAbono, input.diasCorridos, input.periodo.dias_direito);
  if (!validAbono.valido) erros.push(validAbono.erro!);

  // 4. Validar dentro do concessivo (aviso, não bloqueante)
  const validConcessivo = validarDentroConcessivo(
    input.dataInicio,
    input.dataFim,
    input.periodo
  );
  if (!validConcessivo.valido) {
    avisos.push(`${validConcessivo.erro!} — período concessivo ultrapassado, férias podem ser devidas em dobro.`);
  }

  // 5. Validar saldo (em dias corridos)
  const validSaldo = validarSaldo(input.diasCorridos, input.diasAbono, input.periodo);
  if (!validSaldo.valido) erros.push(validSaldo.erro!);

  // 6. Validar data futura (apenas aviso)
  const validFutura = validarDataFutura(input.dataInicio);
  if (!validFutura.valido && validFutura.aviso) avisos.push(validFutura.aviso);

  // 7. Avisos adicionais
  if (input.periodo.esta_vencido) {
    avisos.push(
      '⚠️ ATENÇÃO: Período concessivo vencido! Férias devem ser pagas em DOBRO.'
    );
  }

  const diasAteVencimento = Math.ceil(
    (new Date(input.periodo.concessivo_fim).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (diasAteVencimento > 0 && diasAteVencimento <= 30) {
    avisos.push(
      `⏰ Período concessivo vence em ${diasAteVencimento} dias. Programe com urgência!`
    );
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

/**
 * Verifica se colaborador pode fracionar férias em 3 períodos
 * CLT: Máximo 3 períodos (1º com 14 dias mínimo, demais com 5 dias mínimo)
 */
export function podeFracionarEmTresPeriodos(
  periodo: FeriasPeriodoAquisitivo,
  periodosJaProgramados: number
): { pode: boolean; motivo?: string } {
  if (periodosJaProgramados >= 3) {
    return {
      pode: false,
      motivo: 'Já foram programados 3 períodos de férias (máximo permitido pela CLT)',
    };
  }

  const saldoDisponivel = periodo.dias_saldo;

  // Para fracionar em 3, precisa ter pelo menos 14 + 5 + 5 = 24 dias
  if (periodosJaProgramados === 0 && saldoDisponivel < 24) {
    return {
      pode: false,
      motivo: 'Saldo insuficiente para fracionar em 3 períodos (mínimo 24 dias necessário)',
    };
  }

  return { pode: true };
}
