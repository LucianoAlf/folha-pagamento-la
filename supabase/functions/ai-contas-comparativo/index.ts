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
  let s = (input || "").trim();
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

  try {
    return JSON.parse(cleaned);
  } catch {
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
        temperature: 0.2,
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

type ContaRow = {
  id: string;
  descricao: string;
  categoria_id: string | null;
  unidade: string | null;
  valor: number;
  data_vencimento: string;
  competencia: string;
  status: "pendente" | "pago" | "cancelado" | "finalizado";
  tipo_lancamento: "unica" | "recorrente" | "parcelada";
  categoria?: { id: string; nome: string; icone: string; tipo_custo: string | null } | null;
};

type Variation = {
  key: string;
  unidade: string;
  categoria: string;
  descricao: string;
  prev: number;
  curr: number;
  diff: number;
  perc: number;
  status: "NOVO" | "SAIU" | "RECORRENTE";
};

function buildKey(c: ContaRow) {
  const unidade = (c.unidade || "todas") as string;
  const cat = c.categoria_id || "sem_categoria";
  const desc = normalizeKey(c.descricao || "");
  return `${unidade}|${cat}|${desc}`;
}

function sumByKey(rows: ContaRow[]) {
  const map = new Map<string, { total: number; sample: ContaRow }>();
  for (const c of rows) {
    const k = buildKey(c);
    const v = Number(c.valor) || 0;
    const prev = map.get(k);
    if (prev) prev.total += v;
    else map.set(k, { total: v, sample: c });
  }
  return map;
}

function byCategoria(rows: ContaRow[]) {
  const m = new Map<string, { categoria_id: string; nome: string; icone: string; total: number }>();
  for (const c of rows) {
    const id = c.categoria_id || "sem_categoria";
    const nome = c.categoria?.nome || "Sem categoria";
    const icone = c.categoria?.icone || "📌";
    const prev = m.get(id) || { categoria_id: id, nome, icone, total: 0 };
    prev.total += Number(c.valor) || 0;
    m.set(id, prev);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 10);
}

function validateYM(ym: string) {
  return !!ym && /^\d{4}-\d{2}$/.test(ym);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    // 1) valida usuário
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);

    // 2) client admin (bypass RLS) para queries/cache
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const competenciaYM = String(payload?.competenciaYM || "");
    const baseYM = String(payload?.baseYM || payload?.competenciaComparar || "");
    const unidade = String(payload?.unidade || "todas");
    const categoriaId = payload?.categoriaId ? String(payload.categoriaId) : "all";
    const comportamento = payload?.comportamento ? String(payload.comportamento) : "all";
    const tipo = payload?.tipo ? String(payload.tipo) : "all";
    const force = !!payload?.force;

    if (!validateYM(competenciaYM)) return jsonResponse({ error: "competenciaYM is required (YYYY-MM)" }, 400);
    if (!validateYM(baseYM)) return jsonResponse({ error: "baseYM is required (YYYY-MM)" }, 400);

    const model = "gemini-3-flash-preview";
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    const [cy, cm] = competenciaYM.split("-").map(Number);
    const [by, bm] = baseYM.split("-").map(Number);

    const { data: notasAtual } = await supabase
      .from("folhas_mensais")
      .select("contas_comparativo_notas_rh")
      .eq("ano", cy)
      .eq("mes", cm)
      .maybeSingle();

    const { data: notasBase } = await supabase
      .from("folhas_mensais")
      .select("contas_comparativo_notas_rh")
      .eq("ano", by)
      .eq("mes", bm)
      .maybeSingle();

    // Contas dos dois meses (mesmo recorte dos filtros de unidade: inclui "todas" como shared)
    const competenciaDate = `${competenciaYM}-01`;
    const baseDate = `${baseYM}-01`;

    const mkQuery = (competencia: string) => {
      let q = supabase
        .from("contas_pagar")
        .select(
          "id,descricao,categoria_id,unidade,valor,data_vencimento,competencia,status,tipo_lancamento,categoria:categorias_despesa(id,nome,icone,tipo_custo)",
        )
        .neq("status", "cancelado")
        .neq("status", "finalizado")
        .eq("competencia", competencia);

      if (unidade !== "todas") q = q.in("unidade", [unidade, "todas"]);
      if (categoriaId !== "all") q = q.eq("categoria_id", categoriaId);
      if (tipo !== "all") q = q.eq("tipo_lancamento", tipo);
      return q;
    };

    const [{ data: baseRowsRaw, error: baseErr }, { data: currRowsRaw, error: currErr }] = await Promise.all([
      mkQuery(baseDate),
      mkQuery(competenciaDate),
    ]);
    if (baseErr) return jsonResponse({ error: baseErr.message }, 400);
    if (currErr) return jsonResponse({ error: currErr.message }, 400);

    let baseRows = (baseRowsRaw || []) as unknown as ContaRow[];
    let currRows = (currRowsRaw || []) as unknown as ContaRow[];

    // comportamento (fixo/variavel) depende do join de categoria.tipo_custo
    if (comportamento !== "all") {
      baseRows = baseRows.filter((c) => (c.categoria?.tipo_custo || null) === comportamento);
      currRows = currRows.filter((c) => (c.categoria?.tipo_custo || null) === comportamento);
    }

    const baseMap = sumByKey(baseRows);
    const currMap = sumByKey(currRows);
    const keys = new Set<string>([...Array.from(baseMap.keys()), ...Array.from(currMap.keys())]);

    const variations: Variation[] = Array.from(keys).map((k) => {
      const prev = baseMap.get(k)?.total || 0;
      const curr = currMap.get(k)?.total || 0;
      const sample = currMap.get(k)?.sample || baseMap.get(k)?.sample;
      const diff = curr - prev;
      const perc = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
      const status = prev === 0 && curr > 0 ? "NOVO" : curr === 0 && prev > 0 ? "SAIU" : "RECORRENTE";
      return {
        key: k,
        unidade: (sample?.unidade || "todas") as string,
        categoria: sample?.categoria?.nome || "Sem categoria",
        descricao: sample?.descricao || "",
        prev,
        curr,
        diff,
        perc,
        status,
      };
    });

    const totalPrev = variations.reduce((s, v) => s + v.prev, 0);
    const totalCurr = variations.reduce((s, v) => s + v.curr, 0);
    const totalDiff = totalCurr - totalPrev;
    const totalPerc = totalPrev > 0 ? (totalDiff / totalPrev) * 100 : totalCurr > 0 ? 100 : 0;

    const topMudancas = [...variations]
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 20);

    const topAlertas = [...variations]
      .filter((v) => v.status === "RECORRENTE" && v.prev > 0 && v.curr > 0)
      .sort((a, b) => Math.abs(b.perc) - Math.abs(a.perc))
      .slice(0, 20);

    const inputObject = {
      v: ANALYSIS_VERSION,
      competenciaYM,
      baseYM,
      unidade,
      filtros: { categoriaId, comportamento, tipo },
      macro: {
        totalPrev,
        totalCurr,
        totalDiff,
        totalPerc,
        countPrev: baseRows.length,
        countCurr: currRows.length,
      },
      distribuicao: {
        base: byCategoria(baseRows),
        atual: byCategoria(currRows),
      },
      top_mudancas: topMudancas.map((x) => ({
        key: x.key,
        unidade: x.unidade,
        categoria: x.categoria,
        descricao: x.descricao,
        prev: x.prev,
        curr: x.curr,
        diff: x.diff,
        perc: x.perc,
        status: x.status,
      })),
      top_alertas: topAlertas.map((x) => ({
        key: x.key,
        unidade: x.unidade,
        categoria: x.categoria,
        descricao: x.descricao,
        prev: x.prev,
        curr: x.curr,
        diff: x.diff,
        perc: x.perc,
      })),
      memoria: {
        notas_mes_atual: notasAtual?.contas_comparativo_notas_rh || "",
        notas_mes_base: notasBase?.contas_comparativo_notas_rh || "",
      },
    };

    const inputHash = await sha256Hex(JSON.stringify(inputObject));

    if (!force) {
      const { data: existing } = await supabase
        .from("contas_comparativo_ai_insights")
        .select("*")
        .eq("input_hash", inputHash)
        .limit(1);
      if (existing?.length) return jsonResponse({ cached: true, ...existing[0] });
    }

    const contractHint =
      `CONTRATO DE SAÍDA (JSON): deve conter as chaves: ` +
      `"analise_executiva" (string), "insights_detalhados" (array), "recomendacoes" (array de strings).`;

    const prompt = `Você é um Analista Financeiro Sênior da LA Music Group.

Sua tarefa é EXPLICAR a variação entre dois meses de Contas a Pagar: BASE=${baseYM} vs ATUAL=${competenciaYM}.

IMPORTANTE:
- Isso é um COMPARATIVO (mês contra mês). NÃO faça auditoria de integridade do mês (isso existe na aba Auditoria).
- Foque em: por que mudou, o que isso significa, e o que a Ana deve checar/registrar.
- Use a memória (notas do mês) para evitar recomendações redundantes.

DADOS (JSON):
${JSON.stringify(inputObject)}

Responda APENAS JSON puro neste formato:
{
  "analise_executiva": "Texto curto (4-8 linhas) explicando a variação e os drivers principais.",
  "insights_detalhados": [
    {
      "titulo": "Título curto",
      "categoria": "Variação|Novos/Removidos|Categoria|Unidade|Recorrentes|Pagamentos",
      "severidade": "alta|media|baixa",
      "descricao": "Descrição clara e prática para a Ana (sem jargão).",
      "impacto_financeiro": 123.45,
      "chave_referencia": "key de top_mudancas/top_alertas (se aplicável) ou null"
    }
  ],
  "recomendacoes": ["ação 1", "ação 2"]
}`;

    const rawText = await callGemini(model, apiKey, prompt);
    let parsed = safeParseJsonFromText(rawText);
    if (!parsed || !parsed.analise_executiva) {
      const repairedText = await repairToStrictJson(model, apiKey, rawText, contractHint);
      parsed = safeParseJsonFromText(repairedText);
      if (!parsed || !parsed.analise_executiva) {
        throw new Error("Falha ao processar resposta estruturada da IA (Comparativo)");
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("contas_comparativo_ai_insights")
      .insert({
        competencia_ym: competenciaYM,
        base_ym: baseYM,
        unidade,
        filtros: { categoriaId, comportamento, tipo },
        model,
        input_hash: inputHash,
        summary: parsed.analise_executiva || null,
        response_json: parsed,
      })
      .select("*")
      .single();

    if (insErr) throw new Error(insErr.message);
    return jsonResponse(inserted);
  } catch (error: any) {
    console.error("❌ Erro na função ai-contas-comparativo:", error?.message || error);
    return jsonResponse({ error: error?.message || "Erro interno" }, 500);
  }
});

