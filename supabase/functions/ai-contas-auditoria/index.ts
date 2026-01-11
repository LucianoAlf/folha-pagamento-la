
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

async function callGemini(model: string, apiKey: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function repairToStrictJson(model: string, apiKey: string, rawText: string, contractHint: string) {
  const prompt = `Você devolveu uma resposta que NÃO é JSON válido.

Tarefa: reescreva a saída como JSON ESTRITAMENTE válido, sem markdown, sem comentários, sem texto extra.

${contractHint}

ENTRADA (texto original):
${rawText}

SAÍDA: APENAS JSON válido.`;

  return await callGemini(model, apiKey, prompt);
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
  categoria_id: string | null;
  unidade: string | null;
  valor: number;
  data_vencimento: string;
  competencia: string;
  status: "pendente" | "pago" | "cancelado";
  data_pagamento: string | null;
  tipo_lancamento: "unica" | "recorrente" | "parcelada";
  parcela_atual: number | null;
  total_parcelas: number | null;
  categoria?: { id: string; nome: string; icone: string; tipo_custo: string | null } | null;
};

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
    const categoriaId = payload?.categoriaId ? String(payload.categoriaId) : "all";
    const comportamento = payload?.comportamento ? String(payload.comportamento) : "all";
    const tipo = payload?.tipo ? String(payload.tipo) : "all";
    const force = !!payload?.force;

    if (!competenciaYM || !/^\d{4}-\d{2}$/.test(competenciaYM)) {
      return jsonResponse({ error: "competenciaYM is required (YYYY-MM)" }, 400);
    }

    const competenciaDate = `${competenciaYM}-01`;
    const prev = prevYM(competenciaYM);
    const prevDate = prev ? `${prev}-01` : null;

    // Voltar ao modelo original (conforme solicitado)
    const model = "gemini-3-flash-preview";
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    console.log("🔑 GEMINI_API_KEY presente:", !!apiKey, "tamanho:", apiKey?.length || 0);
    if (!apiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);
    }

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
    .select("id,descricao,categoria_id,unidade,valor,data_vencimento,competencia,status,data_pagamento,tipo_lancamento,parcela_atual,total_parcelas,categoria:categorias_despesa(id,nome,icone,tipo_custo)")
    .neq("status", "cancelado")
    .eq("competencia", competenciaDate);

  if (unidade !== "todas") q = q.in("unidade", [unidade, "todas"]);
  if (categoriaId !== "all") q = q.eq("categoria_id", categoriaId);
  if (tipo !== "all") q = q.eq("tipo_lancamento", tipo);

  const { data: contasRaw, error: contasErr } = await q;
  if (contasErr) return jsonResponse({ error: contasErr.message }, 400);

  let contas = (contasRaw || []) as unknown as ContaRow[];
  if (comportamento !== "all") {
    contas = contas.filter((c) => (c.categoria?.tipo_custo || null) === comportamento);
  }

  // 4) Contas do mês anterior (baseline leve para recorrentes)
  let prevContas: ContaRow[] = [];
  if (prevDate) {
    let pq = supabase
      .from("contas_pagar")
      .select("id,descricao,categoria_id,unidade,valor,data_vencimento,competencia,status,data_pagamento,tipo_lancamento,parcela_atual,total_parcelas,categoria:categorias_despesa(id,nome,icone,tipo_custo)")
      .neq("status", "cancelado")
      .eq("competencia", prevDate);
    if (unidade !== "todas") pq = pq.in("unidade", [unidade, "todas"]);
    if (categoriaId !== "all") pq = pq.eq("categoria_id", categoriaId);
    if (tipo !== "all") pq = pq.eq("tipo_lancamento", tipo);
    const { data: prevRaw } = await pq;
    prevContas = (prevRaw || []) as unknown as ContaRow[];
    if (comportamento !== "all") {
      prevContas = prevContas.filter((c) => (c.categoria?.tipo_custo || null) === comportamento);
    }
  }

  // 5) Macro métricas
  const totalPeriodo = contas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const pagas = contas.filter((c) => c.status === "pago");
  const pendentes = contas.filter((c) => c.status === "pendente");
  const totalPago = pagas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const totalPendente = pendentes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

  // 6) Distribuição por categoria (top 8)
  const byCat = new Map<string, { nome: string; icone: string; total: number; count: number }>();
  for (const c of contas) {
    const k = c.categoria_id || "sem_categoria";
    const nome = c.categoria?.nome || "Sem categoria";
    const icone = c.categoria?.icone || "📌";
    const prev = byCat.get(k) || { nome, icone, total: 0, count: 0 };
    prev.total += Number(c.valor) || 0;
    prev.count += 1;
    byCat.set(k, prev);
  }
  const topCategorias = Array.from(byCat.entries())
    .map(([id, v]) => ({ categoria_id: id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // 7) Anomalias candidatas (heurísticas determinísticas + chave estável)
  type Candidate = {
    key: string;
    tipo: string;
    titulo_base: string;
    descricao_base: string;
    impacto_financeiro: number;
    conta_id: string | null;
    meta?: any;
  };
  const candidates: Candidate[] = [];

  // 7.1) Sem categoria
  for (const c of contas) {
    if (!c.categoria_id) {
      candidates.push({
        key: `sem_categoria:${c.id}`,
        tipo: "classificacao",
        titulo_base: "Conta sem categoria",
        descricao_base: `A conta \"${c.descricao}\" está sem categoria, o que pode distorcer relatórios por categoria.`,
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
    const k = `${normalizeKey(c.descricao)}|${c.categoria_id || "sem_categoria"}|${c.unidade || "todas"}`;
    prevRecMap.set(k, (prevRecMap.get(k) || 0) + (Number(c.valor) || 0));
  }
  for (const c of contas) {
    if (c.tipo_lancamento !== "recorrente") continue;
    const k = `${normalizeKey(c.descricao)}|${c.categoria_id || "sem_categoria"}|${c.unidade || "todas"}`;
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
    filtros: { categoriaId, comportamento, tipo },
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

  const prompt = `Você é um Controller Financeiro da LA Music Group.\n\nSua tarefa é AUDITAR o mês ${competenciaYM} (Contas a Pagar) e apontar ANOMALIAS e INCONSISTÊNCIAS dentro do mês.\n\nIMPORTANTE: NÃO faça um comparativo \"mês contra mês\" como relatório principal. Você pode usar o mês anterior apenas como BASELINE de normalidade para recorrentes.\n\nDADOS (JSON):\n${JSON.stringify(inputObject)}\n\nINSTRUÇÕES:\n- Produza uma análise profissional, objetiva e prática para a Ana.\n- Use as anomalias_candidatas (com key estável) para escolher o que merece atenção.\n- Evite redundância: foque em qualidade do mês (duplicidades, falta de categoria, recorrentes fora do padrão, vencidas relevantes, etc.).\n- Se uma anomalia já tem nota na memória, considere isso na explicação.\n\nCONTRATO DE SAÍDA (Responda APENAS JSON puro):\n{\n  \"resumo_executivo\": \"Texto curto e direto (3-6 linhas) sobre o mês.\",\n  \"pontos_de_atencao\": [\"bullet 1\", \"bullet 2\"],\n  \"anomalias\": [\n    {\n      \"key\": \"uma key existente em anomalias_candidatas\",\n      \"severidade\": \"alta|media|baixa\",\n      \"titulo\": \"Título curto\",\n      \"descricao\": \"Descrição clara e concreta (o que é, por que importa)\",\n      \"impacto_financeiro\": 123.45,\n      \"conta_id\": \"uuid ou null\",\n      \"acao_sugerida\": \"O que a Ana deve fazer\",\n      \"pergunta_para_ana\": \"Pergunta para confirmar contexto (se necessário)\"\n    }\n  ],\n  \"recomendacoes_operacionais\": [\"ação 1\", \"ação 2\"]\n}`;

  const rawText = await callGemini(model, apiKey, prompt);
  const rawPreview = String(rawText || "").slice(0, 1200);
  console.log("📝 Resposta raw do Gemini (primeiros 500 chars):", rawPreview.slice(0, 500));

  let parsed = safeParseJsonFromText(rawText);
  console.log("📊 Parsed result (primeira tentativa):", parsed ? "OK" : "FALHOU");

  // Repair step (mesma estratégia que garante estabilidade quando o LLM escapa do contrato)
  if (!parsed || !parsed.resumo_executivo) {
    const contractHint =
      `CONTRATO DE SAÍDA (JSON): deve conter as chaves: "resumo_executivo" (string), "pontos_de_atencao" (array de strings), "anomalias" (array), "recomendacoes_operacionais" (array de strings).`;
    const repairedText = await repairToStrictJson(model, apiKey, rawText, contractHint);
    const repairedPreview = String(repairedText || "").slice(0, 1200);
    console.log("🛠️ Repair raw (primeiros 500 chars):", repairedPreview.slice(0, 500));

    parsed = safeParseJsonFromText(repairedText);
    console.log("📊 Parsed result (repair):", parsed ? "OK" : "FALHOU");

    if (!parsed || !parsed.resumo_executivo) {
      console.error("❌ Resposta inválida mesmo após repair (raw preview):", rawPreview);
      throw new Error(`Falha ao processar resposta estruturada da IA | raw_preview=${rawPreview.slice(0, 250)}`);
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("contas_ai_insights")
    .insert({
      competencia_ym: competenciaYM,
      unidade,
      filtros: { categoriaId, comportamento, tipo },
      model,
      input_hash: inputHash,
      summary: parsed.resumo_executivo,
      response_json: parsed,
    })
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
        // Ajuda debug no frontend quando o problema é o LLM não respeitar JSON
        hint:
          "Se o erro envolver 'Falha ao processar resposta estruturada', verifique o campo raw_preview no message e/ou logs '📝 Resposta raw do Gemini'.",
      },
      500
    );
  }
});

