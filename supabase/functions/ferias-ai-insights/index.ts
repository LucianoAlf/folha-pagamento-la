// =====================================================
// EDGE FUNCTION - INSIGHTS DE IA PARA FÉRIAS CLT
// Data: 2026-02-07
// Descrição: Análise inteligente de distribuição de férias
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

interface RequestBody {
  periodoReferencia?: string; // "2025-Q2" ou "2025-07"
  departamento?: string;
  unidade?: string;
  force?: boolean;
}

interface FeriasAiInsight {
  analise_executiva: string;
  situacoes_criticas: Array<{
    colaborador_id: number;
    colaborador_nome: string;
    tipo: string;
    severidade: 'critica' | 'alta' | 'media';
    descricao: string;
    dias_saldo: number;
    prazo_limite: string;
    acao_imediata: string;
  }>;
  sugestoes_distribuicao: Array<{
    colaborador_id: number;
    colaborador_nome: string;
    periodo_sugerido_inicio: string;
    periodo_sugerido_fim: string;
    dias_sugeridos: number;
    justificativa: string;
    prioridade: 'alta' | 'media' | 'baixa';
    periodo_ideal: 'ferias_fim_ano' | 'carnaval' | 'julho';
  }>;
  impacto_financeiro: {
    custo_ferias_programadas_estimado: number;
    custo_multas_potenciais: number;
    economia_planejamento: number;
    observacoes: string;
  };
  distribuicao_departamentos: Record<
    string,
    {
      total: number;
      com_ferias_pendentes: number;
      sugestao: string;
    }
  >;
  recomendacoes_operacionais: string[];
}

/**
 * Gera hash SHA256 do input para cache
 */
async function generateHash(input: any): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(input));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse JSON com fallback seguro
 */
function safeParseJson<T>(text: string, fallback: T): T {
  try {
    // Remove markdown code blocks se existirem
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Chama Gemini API
 */
async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0]?.content?.parts[0]?.text || '';
}

/**
 * Monta prompt para Gemini
 */
function buildPrompt(
  colaboradores: any[],
  programacoes: any[],
  periodoReferencia: string
): string {
  return `Você é um Especialista em Gestão de RH e CLT da LA Music Group.

# CONTEXTO DO NEGÓCIO

A LA Music é uma escola de música com 3 unidades. Os períodos ideais para férias são:
- **15 de Dezembro a 5 de Janeiro (20 dias)** — férias de fim de ano (PRIORIDADE MÁXIMA)
- **Período de Carnaval (10 dias)** — baixa demanda
- **Segunda quinzena de Julho** — alternativa para quem não tirou nas anteriores

Períodos CRÍTICOS para evitar férias (alta demanda):
- Primeira quinzena de Março e Agosto (início de semestres letivos)
- Resto do ano em geral (operação normal)

# LEGISLAÇÃO CLT

1. **Período Aquisitivo**: 12 meses trabalhados para adquirir direito a 30 dias de férias
2. **Período Concessivo**: 12 meses após aquisitivo para gozar as férias
3. **MULTA**: Férias não gozadas no período concessivo = pagamento em DOBRO
4. **Fracionamento**: Máximo 3 períodos (1º com min 14 dias, demais min 5 dias)
5. **Abono**: Pode vender até 1/3 (10 dias)
6. **Pagamento**: Até 2 dias antes do início

# TAREFA

Analise o cenário de férias dos colaboradores CLT e forneça insights estratégicos para:
1. **Evitar multas** (férias vencidas = pagamento em DOBRO)
2. **Otimizar distribuição** (equilibrar departamentos, respeitar períodos ideais)
3. **Estimar impacto financeiro**
4. **Sugerir períodos específicos** para cada colaborador com saldo

# DADOS DE ENTRADA

Período de Referência: ${periodoReferencia}

## Colaboradores CLT:
${JSON.stringify(colaboradores, null, 2)}

## Programações Existentes:
${JSON.stringify(programacoes, null, 2)}

# CONTRATO DE SAÍDA

Retorne APENAS um JSON puro (sem markdown), seguindo esta estrutura:

{
  "analise_executiva": "Resumo executivo 4-6 linhas sobre cenário geral, destacando situação crítica se houver",
  "situacoes_criticas": [
    {
      "colaborador_id": 123,
      "colaborador_nome": "Nome",
      "tipo": "ferias_vencidas|concessivo_proximo|risco_operacional",
      "severidade": "critica|alta|media",
      "descricao": "Descrição clara e objetiva",
      "dias_saldo": 30,
      "prazo_limite": "2025-06-30",
      "acao_imediata": "O que fazer AGORA (específico e prático)"
    }
  ],
  "sugestoes_distribuicao": [
    {
      "colaborador_id": 123,
      "colaborador_nome": "Nome",
      "periodo_sugerido_inicio": "2025-12-15",
      "periodo_sugerido_fim": "2026-01-05",
      "dias_sugeridos": 20,
      "justificativa": "Período de férias de fim de ano (baixa demanda). Alinha com vencimento do concessivo em mar/2026. Evita sobrecarga no departamento X.",
      "prioridade": "alta|media|baixa",
      "periodo_ideal": "ferias_fim_ano|carnaval|julho"
    }
  ],
  "impacto_financeiro": {
    "custo_ferias_programadas_estimado": 125000.50,
    "custo_multas_potenciais": 45000.00,
    "economia_planejamento": 20000.00,
    "observacoes": "Detalhes sobre cálculos e premissas"
  },
  "distribuicao_departamentos": {
    "staff_rateado": {
      "total": 5,
      "com_ferias_pendentes": 2,
      "sugestao": "Concentrar férias em dez-jan para manter cobertura nos períodos letivos"
    },
    "equipe_operacional": {
      "total": 15,
      "com_ferias_pendentes": 8,
      "sugestao": "Escalonar férias para evitar déficit de cobertura"
    },
    "professores": {
      "total": 8,
      "com_ferias_pendentes": 3,
      "sugestao": "Priorizar julho e dezembro (fora dos períodos letivos)"
    }
  },
  "recomendacoes_operacionais": [
    "Recomendação prática 1",
    "Recomendação prática 2",
    "Recomendação prática 3"
  ]
}

# REGRAS CRÍTICAS

1. SEMPRE priorize evitar multas (férias vencidas)
2. Considere sazonalidade da LA Music (dez-jan, carnaval, julho)
3. Equilibre distribuição entre departamentos (não deixar setor descoberto)
4. Seja específico nas datas sugeridas (não use "aproximadamente")
5. Justificativas devem mencionar: legislação CLT + sazonalidade LA Music + situação do colaborador
6. Prioridade ALTA = vence em < 60 dias ou já vencido
7. Prioridade MÉDIA = vence em 60-120 dias
8. Prioridade BAIXA = vence em > 120 dias
9. Sempre calcule dias úteis (seg-sex) ao sugerir períodos

Retorne APENAS o JSON, sem texto adicional.`;
}

/**
 * Handler principal
 */
serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, apikey, x-client-info',
      },
    });
  }

  try {
    // Parse body
    const body: RequestBody = await req.json().catch(() => ({}));
    const { periodoReferencia, departamento, unidade, force } = body;

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Buscar colaboradores CLT
    let query = supabase
      .from('v_ferias_colaboradores_status')
      .select('*')
      .eq('user_id', user.id);

    if (departamento) {
      query = query.eq('departamento', departamento);
    }

    if (unidade) {
      query = query.eq('unidade', unidade);
    }

    const { data: colaboradores, error: colabError } = await query;

    if (colabError) {
      throw new Error(`Erro ao buscar colaboradores: ${colabError.message}`);
    }

    // Buscar programações
    const { data: programacoes, error: progError } = await supabase
      .from('ferias_programacoes')
      .select('*, colaboradores(nome, departamento)')
      .eq('user_id', user.id)
      .in('status', ['programado', 'aprovado', 'em_gozo']);

    if (progError) {
      throw new Error(`Erro ao buscar programações: ${progError.message}`);
    }

    // Gerar hash para cache
    const cacheInput = {
      periodoReferencia: periodoReferencia || new Date().toISOString().slice(0, 7),
      departamento,
      unidade,
      colaboradores: colaboradores?.map((c) => c.colaborador_id).sort(),
      programacoes: programacoes?.map((p) => p.id).sort(),
    };
    const cacheHash = await generateHash(cacheInput);

    // Verificar cache (se não forçar)
    if (!force) {
      const { data: cached } = await supabase
        .from('ferias_ai_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('cache_hash', cacheHash)
        .gte(
          'created_at',
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        ) // 24h
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        return new Response(
          JSON.stringify({
            success: true,
            cached: true,
            data: cached.insights_json,
            generatedAt: cached.created_at,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    // Chamar Gemini
    const periodo = periodoReferencia || new Date().toISOString().slice(0, 7);
    const prompt = buildPrompt(colaboradores || [], programacoes || [], periodo);
    const geminiResponse = await callGemini(prompt);

    // Parse resposta
    const insights: FeriasAiInsight = safeParseJson(geminiResponse, {
      analise_executiva: 'Erro ao processar análise',
      situacoes_criticas: [],
      sugestoes_distribuicao: [],
      impacto_financeiro: {
        custo_ferias_programadas_estimado: 0,
        custo_multas_potenciais: 0,
        economia_planejamento: 0,
        observacoes: '',
      },
      distribuicao_departamentos: {},
      recomendacoes_operacionais: [],
    });

    // Salvar no cache
    const { error: insertError } = await supabase.from('ferias_ai_insights').insert({
      user_id: user.id,
      periodo_referencia: periodo,
      departamento: departamento || null,
      unidade: unidade || null,
      cache_hash: cacheHash,
      insights_json: insights,
      modelo_ia: 'gemini-2.0-flash-exp',
    });

    if (insertError) {
      console.error('Erro ao salvar insights:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        data: insights,
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error: any) {
    console.error('Erro no handler:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Erro interno',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
