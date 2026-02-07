// =====================================================
// UTILS - CÁLCULOS DE FÉRIAS CLT
// Data: 2026-02-07
// Descrição: Funções de cálculo para férias CLT
// =====================================================

/**
 * Calcula dias úteis entre duas datas (exclui sábados e domingos)
 */
export function calcularDiasUteis(dataInicio: Date, dataFim: Date): number {
  let diasUteis = 0;
  const atual = new Date(dataInicio);
  const fim = new Date(dataFim);

  while (atual <= fim) {
    const diaSemana = atual.getDay();
    // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteis++;
    }
    atual.setDate(atual.getDate() + 1);
  }

  return diasUteis;
}

/**
 * Calcula dias corridos entre duas datas (inclui todos os dias)
 */
export function calcularDiasCorridos(dataInicio: Date, dataFim: Date): number {
  const diffTime = Math.abs(dataFim.getTime() - dataInicio.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // +1 para incluir o dia de início
}

/**
 * Formata período aquisitivo para exibição
 * Ex: "2023-2024 (Vence em 14/01/2025)"
 */
export function formatPeriodoAquisitivo(
  dataInicio: string,
  dataFim: string,
  concessivoFim: string
): string {
  const anoInicio = new Date(dataInicio).getFullYear();
  const anoFim = new Date(dataFim).getFullYear();
  const vencimento = new Date(concessivoFim).toLocaleDateString('pt-BR');

  return `${anoInicio}-${anoFim} (Vence em ${vencimento})`;
}

/**
 * Retorna o próximo período ideal para férias baseado na data atual
 */
export function getProximoPeriodoIdeal(hoje: Date = new Date()): {
  tipo: 'ferias_fim_ano' | 'carnaval' | 'julho';
  inicio: Date;
  fim: Date;
  descricao: string;
} {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-11

  // Férias de fim de ano (15 Dez - 5 Jan)
  const fimAnoInicio = new Date(ano, 11, 15); // 15 de dezembro
  const fimAnoFim = new Date(ano + 1, 0, 5); // 5 de janeiro do próximo ano

  // Carnaval (aproximado - segunda quinzena de fevereiro)
  const carnavalInicio = new Date(ano, 1, 15); // 15 de fevereiro
  const carnavalFim = new Date(ano, 1, 25); // 25 de fevereiro

  // Julho (segunda quinzena)
  const julhoInicio = new Date(ano, 6, 15); // 15 de julho
  const julhoFim = new Date(ano, 6, 31); // 31 de julho

  // Verificar qual período está mais próximo no futuro
  if (hoje < fimAnoInicio) {
    return {
      tipo: 'ferias_fim_ano',
      inicio: fimAnoInicio,
      fim: fimAnoFim,
      descricao: 'Férias de Fim de Ano (15/Dez - 5/Jan)',
    };
  } else if (hoje < carnavalInicio) {
    return {
      tipo: 'carnaval',
      inicio: carnavalInicio,
      fim: carnavalFim,
      descricao: 'Carnaval (15-25/Fev)',
    };
  } else if (hoje < julhoInicio) {
    return {
      tipo: 'julho',
      inicio: julhoInicio,
      fim: julhoFim,
      descricao: '2ª Quinzena de Julho',
    };
  } else {
    // Se passou de todos os períodos do ano atual, retorna fim de ano do próximo ano
    return {
      tipo: 'ferias_fim_ano',
      inicio: new Date(ano + 1, 11, 15),
      fim: new Date(ano + 2, 0, 5),
      descricao: 'Férias de Fim de Ano (15/Dez - 5/Jan)',
    };
  }
}

/**
 * Calcula dias restantes até uma data
 */
export function calcularDiasRestantes(dataLimite: Date, hoje: Date = new Date()): number {
  const diffTime = dataLimite.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Verifica se uma data está dentro de um intervalo
 */
export function dataEstaDentroIntervalo(
  data: Date,
  inicio: Date,
  fim: Date
): boolean {
  return data >= inicio && data <= fim;
}

/**
 * Calcula data limite de pagamento (2 dias antes do início)
 */
export function calcularDataLimitePagamento(dataInicio: Date): Date {
  const limite = new Date(dataInicio);
  limite.setDate(limite.getDate() - 2);
  return limite;
}

/**
 * Formata duração em dias para string amigável
 * Ex: 30 dias → "1 mês", 45 dias → "1 mês e 15 dias"
 */
export function formatDuracao(dias: number): string {
  if (dias < 30) {
    return `${dias} dia${dias !== 1 ? 's' : ''}`;
  }

  const meses = Math.floor(dias / 30);
  const diasRestantes = dias % 30;

  if (diasRestantes === 0) {
    return `${meses} mês${meses !== 1 ? 'es' : ''}`;
  }

  return `${meses} mês${meses !== 1 ? 'es' : ''} e ${diasRestantes} dia${
    diasRestantes !== 1 ? 's' : ''
  }`;
}

/**
 * Adiciona dias úteis a uma data (pula fins de semana)
 */
export function adicionarDiasUteis(data: Date, diasUteis: number): Date {
  const resultado = new Date(data);
  let diasAdicionados = 0;

  while (diasAdicionados < diasUteis) {
    resultado.setDate(resultado.getDate() + 1);
    const diaSemana = resultado.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasAdicionados++;
    }
  }

  return resultado;
}

/**
 * Converte string ISO date para Date local (evita problemas de timezone)
 */
export function parseISODate(isoString: string): Date {
  const [year, month, day] = isoString.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Converte Date para string ISO date (YYYY-MM-DD)
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
