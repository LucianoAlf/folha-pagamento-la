
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callGeminiWithFallback, getGeminiApiKey } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANALYSIS_VERSION = 1;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripCodeFences(input: string): string {
  let s = input.trim();
  s = s.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();
  return s;
}

function extractFirstJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(text);
  const start = cleaned.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return null;
}

function safeParseJsonFromText(text: string): any {
  if (!text || !text.trim()) return null;

  const cleaned = stripCodeFences(text);

  // 1) tentativa direta
  try {
    return JSON.parse(cleaned);
  } catch {
    // 2) extração por chaves balanceadas
    const extracted = extractFirstJsonObject(cleaned);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeKey(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function prevYM(ym: string): string | null {
  const [yStr, mStr] = (ym || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

type ContaRow = {
  id: string;
  descricao: string;
  plano_conta_id: string | null;
  unidade: string | null;
  valor: number;
  data_vencimento: string;
  competencia: string;
  status: "pendente" | "pago" | "cancelado" | "finalizado";
  data_pagamento: string | null;
  tipo_lancamento: "unica" | "recorrente" | "parcelada" | "eventual" | "fatura_cartao";
  parcela_atual: number | null;
  total_parcelas: number | null;
  plano_conta?: { id: string; codigo: string; nome: string; tipo_custo: string | null } | null;
};

type AuditCandidate = {
  key: string;
  tipo: string;
  titulo_base: string;
  descricao_base: string;
  impacto_financeiro: number;
  conta_id: string | null;
  meta?: any;
};

type AuditMacro = {
  totalPeriodo: number;
  totalPago: number;
  totalPendente: number;
  count: number;
  countPago: number;
  countPendente: number;
  prevYM: string | null;
};

function isPlanoAggregationConta(c: ContaRow): boolean {
  return c.tipo_lancamento !== "fatura_cartao";
}

function formatMoneyBR(value: number): string {
  return `R$ ${(Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function severityFromImpact(value: number): "alta" | "media" | "baixa" {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 2000) return "alta";
  if (abs >= 500) return "media";
  return "baixa";
}

function labelTipo(tipo: string): string {
  switch (tipo) {
    case "duplicidade":
      return "possiveis duplicidades";
    case "classificacao":
      return "contas sem plano de contas";
    case "recorrente_variacao":
      return "recorrentes com variacao relevante";
    case "atraso":
      return "contas vencidas relevantes";
    default:
      return tipo || "pontos de atencao";
  }
}

function actionForTipo(tipo: string): string {
  switch (tipo) {
    case "duplicidade":
      return "Conferir os lancamentos semelhantes e cancelar ou remover duplicidades se confirmado.";
    case "classificacao":
      return "Classificar a conta no plano correto e validar o centro de custo.";
    case "recorrente_variacao":
      return "Validar a variacao contra contrato, reajuste ou consumo do periodo.";
    case "atraso":
      return "Priorizar regularizacao ou registrar justificativa operacional para o atraso.";
    default:
      return "Revisar o lancamento e registrar a conclusao para manter a memoria operacional.";
  }
}

function buildFallbackAuditoria(competenciaYM: string, macro: AuditMacro, topCandidates: AuditCandidate[]) {
  const countsByTipo = new Map<string, number>();
  for (const candidate of topCandidates) {
    countsByTipo.set(candidate.tipo, (countsByTipo.get(candidate.tipo) || 0) + 1);
  }

  const pontosDeAtencao = Array.from(countsByTipo.entries()).map(
    ([tipo, count]) => `${count} ocorrencia(s) de ${labelTipo(tipo)}.`
  );

  if (!pontosDeAtencao.length) {
    pontosDeAtencao.push("Nenhum ponto de atencao deterministico encontrado para os filtros atuais.");
  }

  return {
    resumo_executivo:
      `Auditoria de ${competenciaYM}: ${macro.count} lancamento(s), total ${formatMoneyBR(macro.totalPeriodo)}. ` +
      `Pago ${formatMoneyBR(macro.totalPago)}, pendente ${formatMoneyBR(macro.totalPendente)}. ` +
      `${topCandidates.length} ponto(s) de atencao.`,
    pontos_de_atencao: pontosDeAtencao,
    anomalias: topCandidates.slice(0, 8).map((candidate) => ({
      key: candidate.key,
      severidade: severityFromImpact(candidate.impacto_financeiro),
      titulo: candidate.titulo_base,
      descricao: candidate.descricao_base,
      impacto_financeiro: candidate.impacto_financeiro,
      conta_id: candidate.conta_id,
      acao_sugerida: actionForTipo(candidate.tipo),
      pergunta_para_ana: "",
    })),
    recomendacoes_operacionais: [
      "Revisar os pontos de atencao em ordem de impacto financeiro.",
      "Registrar uma nota da Ana nos casos ja justificados para manter memoria operacional.",
      "Conferir duplicidades, atrasos e contas sem plano diretamente nos lancamentos de origem.",
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    // 1) Validar o usuário com o token recebido (evita endpoint público quando verify_jwt=false)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // 2) Cliente ADMIN (bypass RLS) para queries internas da função
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("✅ ai-contas-auditoria booted", { user_id: user.id });

    const payload = await req.json().catch(() => ({}));
    const competenciaYM = String(payload?.competenciaYM || "");
    const unidade = String(payload?.unidade || "todas");
    const grupoPlano = payload?.grupoPlano ? String(payload.grupoPlano) : "all";
    const comportamento = payload?.comportamento ? String(payload.comportamento) : "all";
    const tipo = payload?.tipo ? String(payload.tipo) : "all";
    const force = !!payload?.force;

    if (!competenciaYM || !/^\d{4}-\d{2}$/.test(competenciaYM)) {
      return jsonResponse({ error: "competenciaYM is required (YYYY-MM)" }, 400);
    }

    const competenciaDate = `${competenciaYM}-01`;
    const prev = prevYM(competenciaYM);
    const prevDate = prev ? `${prev}-01` : null;

    const { data: gruposRaw, error: gruposErr } = await supabase
      .from("plano_contas")
      .select("codigo,nome")
      .eq("nivel", 2);
    if (gruposErr) return jsonResponse({ error: gruposErr.message }, 400);

    const grupoNome = new Map((gruposRaw || []).map((g: any) => [g.codigo, g.nome]));
    const grupoDe = (codigo?: string | null) => {
      if (!codigo) return { cod: "sem_plano", nome: "Sem plano de contas" };
      const cod = codigo.split(".").slice(0, 2).join(".");
      return { cod, nome: grupoNome.get(cod) || cod };
    };

  // 1) Notas gerais do mês (memória)
  const [year, month] = competenciaYM.split("-").map(Number);
  const { data: folhaNotas } = await supabase
    .from("folhas_mensais")
    .select("contas_notas_rh")
    .eq("ano", year)
    .eq("mes", month)
    .maybeSingle();

  // 2) Notas por anomalia (memória)
  const { data: notasAnomalias } = await supabase
    .from("contas_anomalia_notas")
    .select("anomaly_key, nota, status, conta_id")
    .eq("competencia_ym", competenciaYM)
    .eq("unidade", unidade)
    .order("updated_at", { ascending: false });

  // 3) Contas do mês (respeita filtros principais)
  let q = supabase
    .from("contas_pagar")
    .select("id,descricao,plano_conta_id,unidade,valor,data_vencimento,competencia,status,data_pagamento,tipo_lancamento,parcela_atual,total_parcelas,plano_conta:plano_contas(id,codigo,nome,tipo_custo)")
    .neq("status", "cancelado")
    .neq("status", "finalizado")
    .eq("competencia", competenciaDate);

  if (unidade !== "todas") q = q.in("unidade", [unidade, "todas"]);
  if (tipo !== "all") q = q.eq("tipo_lancamento", tipo);

  const { data: contasRaw, error: contasErr } = await q;
  if (contasErr) return jsonResponse({ error: contasErr.message }, 400);

  let contas = (contasRaw || []) as unknown as ContaRow[];
  if (grupoPlano !== "all") {
    contas = contas.filter((c) => c.plano_conta?.codigo?.startsWith(`${grupoPlano}.`));
  }
  if (comportamento !== "all") {
    contas = contas.filter((c) => (c.plano_conta?.tipo_custo || null) === comportamento);
  }

  // 4) Contas do mês anterior (baseline leve para recorrentes)
  let prevContas: ContaRow[] = [];
  if (prevDate) {
    let pq = supabase
      .from("contas_pagar")
      .select("id,descricao,plano_conta_id,unidade,valor,data_vencimento,competencia,status,data_pagamento,tipo_lancamento,parcela_atual,total_parcelas,plano_conta:plano_contas(id,codigo,nome,tipo_custo)")
      .neq("status", "cancelado")
      .neq("status", "finalizado")
      .eq("competencia", prevDate);
    if (unidade !== "todas") pq = pq.in("unidade", [unidade, "todas"]);
    if (tipo !== "all") pq = pq.eq("tipo_lancamento", tipo);
    const { data: prevRaw } = await pq;
    prevContas = (prevRaw || []) as unknown as ContaRow[];
    if (grupoPlano !== "all") {
      prevContas = prevContas.filter((c) => c.plano_conta?.codigo?.startsWith(`${grupoPlano}.`));
    }
    if (comportamento !== "all") {
      prevContas = prevContas.filter((c) => (c.plano_conta?.tipo_custo || null) === comportamento);
    }
  }

  // 5) Macro métricas
  const totalPeriodo = contas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const pagas = contas.filter((c) => c.status === "pago");
  const pendentes = contas.filter((c) => c.status === "pendente");
  const totalPago = pagas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const totalPendente = pendentes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

  // 6) Distribuição por grupo do plano de contas (top 8)
  const contasPlano = contas.filter(isPlanoAggregationConta);
  const byCat = new Map<string, { nome: string; icone: null; total: number; count: number }>();
  for (const c of contasPlano) {
    const grupo = grupoDe(c.plano_conta?.codigo);
    const k = grupo.cod;
    const nome = grupo.nome;
    const icone = null;
    const prev = byCat.get(k) || { nome, icone, total: 0, count: 0 };
    prev.total += Number(c.valor) || 0;
    prev.count += 1;
    byCat.set(k, prev);
  }
  const topCategorias = Array.from(byCat.entries())
    .map(([id, v]) => ({ grupo_plano: id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // 7) Anomalias candidatas (heurísticas determinísticas + chave estável)
  const candidates: AuditCandidate[] = [];

  // 7.1) Sem plano de contas
  for (const c of contas.filter(isPlanoAggregationConta)) {
    if (!c.plano_conta_id) {
      candidates.push({
        key: `sem_plano:${c.id}`,
        tipo: "classificacao",
        titulo_base: "Conta sem plano de contas",
        descricao_base: `A conta \"${c.descricao}\" está sem plano de contas, o que pode distorcer relatórios por plano.`,
        impacto_financeiro: Number(c.valor) || 0,
        conta_id: c.id,
      });
    }
  }

  // 7.2) Possível duplicidade (mesmo desc+valor+venc+unidade)
  const dupMap = new Map<string, ContaRow[]>();
  for (const c of contas) {
    const k = `${normalizeKey(c.descricao)}|${Number(c.valor) || 0}|${c.data_vencimento}|${c.unidade || "todas"}`;
    const arr = dupMap.get(k) || [];
    arr.push(c);
    dupMap.set(k, arr);
  }
  dupMap.forEach((arr, k) => {
    if (arr.length > 1) {
      const total = arr.reduce((s, c) => s + (Number(c.valor) || 0), 0);
      candidates.push({
        key: `duplicidade:${k}`,
        tipo: "duplicidade",
        titulo_base: "Possível duplicidade",
        descricao_base: `Foram encontrados ${arr.length} lançamentos muito semelhantes (descrição/valor/vencimento). Verificar se não há duplicidade.`,
        impacto_financeiro: total,
        conta_id: arr[0]?.id || null,
        meta: { ids: arr.map((x) => x.id) },
      });
    }
  });

  // 7.3) Recorrente variou demais vs mês anterior (baseline)
  const prevRecMap = new Map<string, number>();
  for (const c of prevContas) {
    if (c.tipo_lancamento !== "recorrente") continue;
    const k = `${normalizeKey(c.descricao)}|${c.plano_conta_id || "sem_plano"}|${c.unidade || "todas"}`;
    prevRecMap.set(k, (prevRecMap.get(k) || 0) + (Number(c.valor) || 0));
  }
  for (const c of contas) {
    if (c.tipo_lancamento !== "recorrente") continue;
    const k = `${normalizeKey(c.descricao)}|${c.plano_conta_id || "sem_plano"}|${c.unidade || "todas"}`;
    const prevVal = prevRecMap.get(k) || 0;
    const currVal = Number(c.valor) || 0;
    if (prevVal > 0) {
      const diff = currVal - prevVal;
      const perc = (diff / prevVal) * 100;
      if (Math.abs(perc) >= 20) {
        candidates.push({
          key: `recorrente_variacao:${k}`,
          tipo: "recorrente_variacao",
          titulo_base: "Recorrente com variação relevante",
          descricao_base: `A recorrente \"${c.descricao}\" variou ${perc.toFixed(1)}% vs o mês anterior (baseline).`,
          impacto_financeiro: Math.abs(diff),
          conta_id: c.id,
          meta: { prev: prevVal, curr: currVal, perc },
        });
      }
    }
  }

  // 7.4) Vencida há muitos dias e valor relevante
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (const c of pendentes) {
    const venc = new Date(`${c.data_vencimento}T00:00:00`);
    venc.setHours(0, 0, 0, 0);
    const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    const valor = Number(c.valor) || 0;
    if (diffDias < -7 && valor >= 300) {
      candidates.push({
        key: `vencida_relevante:${c.id}`,
        tipo: "atraso",
        titulo_base: "Conta vencida há muitos dias",
        descricao_base: `A conta \"${c.descricao}\" está vencida há ${Math.abs(diffDias)} dias.`,
        impacto_financeiro: valor,
        conta_id: c.id,
        meta: { diffDias },
      });
    }
  }

  const topCandidates = candidates
    .sort((a, b) => b.impacto_financeiro - a.impacto_financeiro)
    .slice(0, 25);

  const inputObject = {
    v: ANALYSIS_VERSION,
    competenciaYM,
    unidade,
    filtros: { grupoPlano, comportamento, tipo },
    macro: {
      totalPeriodo,
      totalPago,
      totalPendente,
      count: contas.length,
      countPago: pagas.length,
      countPendente: pendentes.length,
      prevYM: prev,
    },
    topCategorias,
    anomalias_candidatas: topCandidates,
    memoria: {
      notas_rh_auditoria: folhaNotas?.contas_notas_rh || "",
      notas_anomalias: notasAnomalias || [],
    },
  };

  const inputHash = await sha256Hex(JSON.stringify(inputObject));

  if (!force) {
    const { data: existing } = await supabase
      .from("contas_ai_insights")
      .select("*")
      .eq("input_hash", inputHash)
      .limit(1);
    if (existing?.length) return jsonResponse({ cached: true, ...existing[0] });
  }

  const prompt = `Você é um Controller Financeiro da LA Music Group.\n\nSua tarefa é AUDITAR o mês ${competenciaYM} (Contas a Pagar) e apontar ANOMALIAS e INCONSISTÊNCIAS dentro do mês.\n\nIMPORTANTE: NÃO faça um comparativo \"mês contra mês\" como relatório principal. Você pode usar o mês anterior apenas como BASELINE de normalidade para recorrentes.\n\nDADOS (JSON):\n${JSON.stringify(inputObject)}\n\nINSTRUÇÕES:\n- Produza uma análise profissional, objetiva e prática para a Ana.\n- Use as anomalias_candidatas (com key estável) para escolher o que merece atenção.\n- Evite redundância: foque em qualidade do mês (duplicidades, falta de plano de contas, recorrentes fora do padrão, vencidas relevantes, etc.).\n- Se uma anomalia já tem nota na memória, considere isso na explicação.\n\nCONTRATO DE SAÍDA (Responda APENAS JSON puro):\n{\n  \"resumo_executivo\": \"Texto curto e direto (3-6 linhas) sobre o mês.\",\n  \"pontos_de_atencao\": [\"bullet 1\", \"bullet 2\"],\n  \"anomalias\": [\n    {\n      \"key\": \"uma key existente em anomalias_candidatas\",\n      \"severidade\": \"alta|media|baixa\",\n      \"titulo\": \"Título curto\",\n      \"descricao\": \"Descrição clara e concreta (o que é, por que importa)\",\n      \"impacto_financeiro\": 123.45,\n      \"conta_id\": \"uuid ou null\",\n      \"acao_sugerida\": \"O que a Ana deve fazer\",\n      \"pergunta_para_ana\": \"Pergunta para confirmar contexto (se necessário)\"\n    }\n  ],\n  \"recomendacoes_operacionais\": [\"ação 1\", \"ação 2\"]\n}`;

  let parsed: any = null;
  let modelUsed = "fallback-heuristic";

  try {
    const apiKey = await getGeminiApiKey(supabase);
    const { text: rawText, modelUsed: geminiModel } = await callGeminiWithFallback(prompt, apiKey, {
      timeoutMs: 8_000,
      generationConfig: { temperature: 0.15, maxOutputTokens: 1200 },
    });
    modelUsed = geminiModel;
    const rawPreview = String(rawText || "").slice(0, 1200);
    console.log("Resposta raw do Gemini (primeiros 500 chars):", rawPreview.slice(0, 500));

    parsed = safeParseJsonFromText(rawText);
    console.log("Parsed result:", parsed ? "OK" : "FALHOU");
  } catch (geminiError: any) {
    console.warn("Gemini indisponivel ou lento; usando fallback deterministico", geminiError?.message || geminiError);
    parsed = null;
  }

  if (!parsed || !parsed.resumo_executivo) {
    modelUsed = "fallback-heuristic";
    parsed = buildFallbackAuditoria(
      competenciaYM,
      {
        totalPeriodo,
        totalPago,
        totalPendente,
        count: contas.length,
        countPago: pagas.length,
        countPendente: pendentes.length,
        prevYM: prev,
      },
      topCandidates
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("contas_ai_insights")
    .upsert(
      {
        competencia_ym: competenciaYM,
        unidade,
        filtros: { grupoPlano, comportamento, tipo },
        model: modelUsed,
        input_hash: inputHash,
        summary: parsed.resumo_executivo || null,
        response_json: parsed,
      },
      { onConflict: "input_hash" },
    )
    .select("*")
    .single();

    if (insErr) throw new Error(insErr.message);
    return jsonResponse(inserted);
  } catch (error: any) {
    console.error("❌ Erro na função ai-contas-auditoria:", error?.message || error);
    return jsonResponse(
      {
        error: error?.message || "Erro interno",
        stack: error?.stack || null,
        // Fallback cobre falhas do Gemini; erros aqui tendem a ser query/upsert/configuracao.
        hint:
          "Se o erro persistir, verifique os logs da Edge Function para falhas de query, auth ou upsert.",
      },
      500
    );
  }
});

