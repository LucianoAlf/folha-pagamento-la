// =====================================================
// SERVICE - SISTEMA DE FÉRIAS CLT
// Data: 2026-02-07
// Descrição: Service layer para APIs de férias
// =====================================================

import {
  FeriasPeriodoAquisitivo,
  FeriasProgramacao,
  FeriasColaboradorStatus,
  FeriasAiInsight,
  FeriasAiInsightResult,
  FeriasHistoricoAcao,
  FeriasProgramacaoInput,
  FeriasValorCalculado,
  FeriasColaboradorFiltros,
  FeriasProgramacaoFiltros,
  FeriasCalcularPeriodosResponse,
  FeriasWhatsAppAlertasResponse,
} from '../types';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export const feriasService = {
  // =====================================================
  // PERÍODOS AQUISITIVOS
  // =====================================================

  /**
   * Busca todos os períodos aquisitivos de um colaborador
   */
  async fetchPeriodosAquisitivos(colaboradorId?: number): Promise<FeriasPeriodoAquisitivo[]> {
    const headers = await getAuthHeaders();
    let url = `${SUPABASE_URL}/rest/v1/ferias_periodos_aquisitivos?select=*&order=data_inicio.desc`;

    if (colaboradorId) {
      url += `&colaborador_id=eq.${colaboradorId}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Erro ao buscar períodos aquisitivos');
    return res.json();
  },

  /**
   * Busca um período aquisitivo específico por ID
   */
  async fetchPeriodoAquisitivo(id: string): Promise<FeriasPeriodoAquisitivo | null> {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ferias_periodos_aquisitivos?select=*&id=eq.${id}&limit=1`,
      { headers }
    );
    if (!res.ok) throw new Error('Erro ao buscar período aquisitivo');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  },

  /**
   * Atualiza um período aquisitivo (ex: ajustar dias_direito por faltas)
   */
  async updatePeriodoAquisitivo(
    id: string,
    patch: Partial<FeriasPeriodoAquisitivo>
  ): Promise<FeriasPeriodoAquisitivo> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ferias_periodos_aquisitivos?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error('Erro ao atualizar período aquisitivo');
    const rows = await res.json();
    return rows[0];
  },

  /**
   * Calcula períodos aquisitivos via edge function
   */
  async calcularPeriodos(colaboradorId?: number): Promise<FeriasCalcularPeriodosResponse> {
    const { data, error } = await supabase.functions.invoke('ferias-calcular-periodos', {
      body: colaboradorId ? { colaboradorId } : {},
    });

    if (error) {
      const msg = error.message || 'Erro desconhecido';
      throw new Error(`Erro ao calcular períodos: ${msg}`);
    }

    return data as FeriasCalcularPeriodosResponse;
  },

  // =====================================================
  // PROGRAMAÇÕES DE FÉRIAS
  // =====================================================

  /**
   * Busca programações de férias com filtros
   */
  async fetchProgramacoes(filtros?: FeriasProgramacaoFiltros): Promise<FeriasProgramacao[]> {
    const headers = await getAuthHeaders();
    let url = `${SUPABASE_URL}/rest/v1/ferias_programacoes?select=*&order=data_inicio.desc`;

    if (filtros) {
      if (filtros.colaborador_id) {
        url += `&colaborador_id=eq.${filtros.colaborador_id}`;
      }
      if (filtros.status) {
        if (Array.isArray(filtros.status)) {
          url += `&status=in.(${filtros.status.join(',')})`;
        } else {
          url += `&status=eq.${filtros.status}`;
        }
      }
      if (filtros.data_inicio_de) {
        url += `&data_inicio=gte.${filtros.data_inicio_de}`;
      }
      if (filtros.data_inicio_ate) {
        url += `&data_inicio=lte.${filtros.data_inicio_ate}`;
      }
      if (filtros.pagamento_pendente) {
        url += `&pagamento_efetuado=eq.false`;
      }
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Erro ao buscar programações de férias');
    return res.json();
  },

  /**
   * Busca uma programação específica por ID
   */
  async fetchProgramacao(id: string): Promise<FeriasProgramacao | null> {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ferias_programacoes?select=*&id=eq.${id}&limit=1`,
      { headers }
    );
    if (!res.ok) throw new Error('Erro ao buscar programação');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  },

  /**
   * Cria uma nova programação de férias
   */
  async createProgramacao(input: FeriasProgramacaoInput): Promise<FeriasProgramacao> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ferias_programacoes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...input,
        status: 'programado',
        pagamento_efetuado: false,
        pagamento_modalidade: input.pagamento_modalidade || 'completo',
        alerta_pagamento_enviado: false,
        alerta_inicio_enviado: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao criar programação de férias${text ? `: ${text}` : ''}`);
    }
    const rows = await res.json();
    return rows[0];
  },

  /**
   * Atualiza uma programação de férias
   */
  async updateProgramacao(
    id: string,
    patch: Partial<FeriasProgramacao>
  ): Promise<FeriasProgramacao> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ferias_programacoes?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao atualizar programação${text ? `: ${text}` : ''}`);
    }
    const rows = await res.json();
    return rows[0];
  },

  /**
   * Cancela uma programação de férias
   */
  async cancelProgramacao(id: string): Promise<FeriasProgramacao> {
    return this.updateProgramacao(id, { status: 'cancelado' });
  },

  /**
   * Aprova uma programação de férias
   */
  async aprovarProgramacao(id: string, userId: string): Promise<FeriasProgramacao> {
    return this.updateProgramacao(id, {
      status: 'aprovado',
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    });
  },

  /**
   * Registra pagamento de férias
   */
  async registrarPagamento(
    id: string,
    data: {
      data_pagamento: string;
      valor_pagamento: number;
      pagamento_modalidade?: 'completo' | 'somente_terco';
      observacoes_pagamento?: string | null;
    }
  ): Promise<FeriasProgramacao> {
    return this.updateProgramacao(id, {
      pagamento_efetuado: true,
      ...data,
    });
  },

  /**
   * Deleta uma programação
   */
  async deleteProgramacao(id: string): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ferias_programacoes?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Erro ao excluir programação');
  },

  // =====================================================
  // STATUS DE COLABORADORES
  // =====================================================

  /**
   * Busca status consolidado de férias de colaboradores CLT
   */
  async fetchColaboradoresStatus(
    filtros?: FeriasColaboradorFiltros
  ): Promise<FeriasColaboradorStatus[]> {
    const headers = await getAuthHeaders();
    let url = `${SUPABASE_URL}/rest/v1/v_ferias_colaboradores_status?select=*`;

    // Ordenação padrão
    const ordenacao = filtros?.ordenacao || 'proxima_expiracao';
    if (ordenacao === 'proxima_expiracao') {
      url += '&order=proxima_expiracao.asc.nullslast';
    } else if (ordenacao === 'nome') {
      url += '&order=nome.asc';
    } else if (ordenacao === 'admissao') {
      url += '&order=data_admissao.desc';
    }

    // Aplicar filtros
    if (filtros) {
      if (filtros.departamento) {
        url += `&departamento=eq.${filtros.departamento}`;
      }
      if (filtros.status_ferias) {
        url += `&status_ferias=eq.${filtros.status_ferias}`;
      }
      // Busca por nome/função será feita no client-side para simplificar
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Erro ao buscar status de colaboradores');
    let colaboradores: FeriasColaboradorStatus[] = await res.json();

    // Filtro de busca (client-side)
    if (filtros?.busca) {
      const busca = filtros.busca.toLowerCase();
      colaboradores = colaboradores.filter(
        (c) =>
          c.nome.toLowerCase().includes(busca) ||
          c.funcao.toLowerCase().includes(busca) ||
          c.nome_completo?.toLowerCase().includes(busca)
      );
    }

    return colaboradores;
  },

  // =====================================================
  // CÁLCULOS
  // =====================================================

  /**
   * Calcula valor de férias usando function SQL
   */
  async calcularValorFerias(
    colaboradorId: number,
    diasCorridos: number,
    diasAbono: number = 0
  ): Promise<FeriasValorCalculado> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calcular_valor_ferias`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_colaborador_id: colaboradorId,
        p_dias_corridos: diasCorridos,
        p_dias_abono: diasAbono,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao calcular valor de férias${text ? `: ${text}` : ''}`);
    }

    const rows = await res.json();
    return rows[0];
  },

  // =====================================================
  // INSIGHTS DE IA (PREMIUM)
  // =====================================================

  /**
   * Gera insights de IA sobre distribuição de férias
   */
  async gerarInsightsIA(input: {
    periodoReferencia: string;
    departamento?: string;
    unidade?: string;
    force?: boolean;
  }): Promise<FeriasAiInsightResult> {
    const { data, error } = await supabase.functions.invoke('ferias-ai-insights', {
      body: input,
    });

    if (error) {
      const msg = error.message || 'Erro desconhecido';
      throw new Error(`Erro ao gerar insights IA: ${msg}`);
    }

    return data as FeriasAiInsightResult;
  },

  /**
   * Busca insights de IA já gerados
   */
  async fetchInsightsIA(filtros?: {
    periodoReferencia?: string;
    limit?: number;
  }): Promise<FeriasAiInsight[]> {
    const headers = await getAuthHeaders();
    let url = `${SUPABASE_URL}/rest/v1/ferias_ai_insights?select=*&order=created_at.desc`;

    if (filtros) {
      if (filtros.periodoReferencia) {
        url += `&periodo_referencia=eq.${filtros.periodoReferencia}`;
      }
      if (filtros.limit) {
        url += `&limit=${filtros.limit}`;
      }
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Erro ao buscar insights de IA');
    return res.json();
  },

  // =====================================================
  // HISTÓRICO E AUDITORIA
  // =====================================================

  /**
   * Busca histórico de ações
   */
  async fetchHistorico(filtros?: {
    colaboradorId?: number;
    userId?: string;
    limit?: number;
  }): Promise<FeriasHistoricoAcao[]> {
    const headers = await getAuthHeaders();
    let url = `${SUPABASE_URL}/rest/v1/ferias_historico_acoes?select=*&order=created_at.desc`;

    if (filtros) {
      if (filtros.colaboradorId) {
        url += `&colaborador_id=eq.${filtros.colaboradorId}`;
      }
      if (filtros.userId) {
        url += `&user_id=eq.${filtros.userId}`;
      }
      if (filtros.limit) {
        url += `&limit=${filtros.limit}`;
      }
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Erro ao buscar histórico de ações');
    return res.json();
  },

  /**
   * Registra uma ação no histórico
   */
  async registrarAcao(
    userId: string,
    acao: string,
    entidadeTipo: string,
    entidadeId: string,
    detalhes?: Record<string, any>,
    colaboradorId?: number,
    observacao?: string
  ): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ferias_historico_acoes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        colaborador_id: colaboradorId || null,
        acao,
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        detalhes: detalhes || null,
        observacao: observacao || null,
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.error('Erro ao registrar ação no histórico');
      // Não throw error para não bloquear operação principal
    }
  },

  // =====================================================
  // ALERTAS
  // =====================================================

  /**
   * Trigger manual de alertas via WhatsApp
   */
  async enviarAlertasWhatsApp(): Promise<FeriasWhatsAppAlertasResponse> {
    const { data, error } = await supabase.functions.invoke('whatsapp-ferias-alertas', {
      body: {},
    });

    if (error) {
      const msg = error.message || 'Erro desconhecido';
      throw new Error(`Erro ao enviar alertas WhatsApp: ${msg}`);
    }

    return data as FeriasWhatsAppAlertasResponse;
  },
};

// Export default para compatibilidade
export default feriasService;
