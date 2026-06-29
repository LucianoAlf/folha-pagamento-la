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
  plano_conta_id: string | null;
  unidade: string | null;
  valor: number;
  data_vencimento: string;
  competencia: string;
  status: "pendente" | "pago" | "cancelado" | "finalizado";
  tipo_lancamento: "unica" | "recorrente" | "parcelada" | "eventual";
  plano_conta?: { id: string; codigo: string; nome: string; tipo_custo: string | null } | null;
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

type ComparativoJson = {
  analise_executiva: string;
  insights_detalhados: Array<{
    titulo: string;
    categoria: string;
    severidade: "alta" | "media" | "baixa";
    descricao: string;
    impacto_financeiro?: number;
    chave_referencia?: string | null;
  }>;
  recomendacoes: string[];
};

function buildFallbackComparativo(
  competenciaYM: string,
  baseYM: string,
  totalPrev: number,
  totalCurr: number,
  totalDiff: number,
  totalPerc: number,
  topMudancas: Variation[],
): ComparativoJson {
  const top3 = topMudancas.slice(0, 3);
  const direction = totalDiff >= 0 ? "aumento" : "redução";
  const analise = [
    `Comparativo ${baseYM} -> ${competenciaYM}: ${direction} de ${Math.abs(totalPerc).toFixed(1)}% no total das contas.`,
    `Total base: R$ ${Math.abs(totalPrev).toFixed(2)} | Total atual: R$ ${Math.abs(totalCurr).toFixed(2)}.`,
    `Variação absoluta: ${totalDiff >= 0 ? "+" : "-"}R$ ${Math.abs(totalDiff).toFixed(2)}.`,
    `Os maiores drivers estão concentrados em ${top3.map((t) => t.categoria).filter(Boolean).slice(0, 2).join(" e ") || "grupos diversos"}.`,
  ].join(" ");

  const insights = top3.map((t) => {
    const absPerc = Math.abs(t.perc);
    const sev: "alta" | "media" | "baixa" = absPerc >= 35 ? "alta" : absPerc >= 15 ? "media" : "baixa";
    return {
      titulo: `${t.status === "NOVO" ? "Novo item" : t.status === "SAIU" ? "Item removido" : "Mudança relevante"}: ${t.descricao || t.categoria}`,
      categoria: t.status === "RECORRENTE" ? "Variação" : "Novos/Removidos",
      severidade: sev,
      descricao: `${t.categoria} em ${t.unidade}: base R$ ${t.prev.toFixed(2)} -> atual R$ ${t.curr.toFixed(2)} (${t.perc >= 0 ? "+" : ""}${t.perc.toFixed(1)}%).`,
      impacto_financeiro: t.diff,
      chave_referencia: t.key || null,
    };
  });

  return {
    analise_executiva: analise,
    insights_detalhados: insights,
    recomendacoes: [
      "Validar se as maiores variações possuem justificativa operacional registrada pela Ana.",
      "Conferir mudanças de contrato/fornecedor nos grupos do plano com maior impacto absoluto.",
      "Manter memória comparativa atualizada para reduzir falsos alertas nos próximos meses.",
    ],
  };
}

function buildKey(c: ContaRow) {
  const unidade = (c.unidade || "todas") as string;
  const cat = c.plano_conta_id || "sem_plano";
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

function byCategoria(rows: ContaRow[], grupoDe: (codigo?: string | null) => { cod: string; nome: string }) {
  const m = new Map<string, { grupo_plano: string; nome: string; icone: null; total: number }>();
  for (const c of rows) {
    const grupo = grupoDe(c.plano_conta?.codigo);
    const id = grupo.cod;
    const nome = grupo.nome;
    const icone = null;
    const prev = m.get(id) || { grupo_plano: id, nome, icone, total: 0 };
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
    const grupoPlano = payload?.grupoPlano ? String(payload.grupoPlano) : "all";
    const comportamento = payload?.comportamento ? String(payload.comportamento) : "all";
    const tipo = payload?.tipo ? String(payload.tipo) : "all";
    const force = !!payload?.force;

    if (!validateYM(competenciaYM)) return jsonResponse({ error: "competenciaYM is required (YYYY-MM)" }, 400);
    if (!validateYM(baseYM)) return jsonResponse({ error: "baseYM is required (YYYY-MM)" }, 400);

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

    const mkQuery = (competencia: string) => {
      let q = supabase
        .from("contas_pagar")
        .select(
          "id,descricao,plano_conta_id,unidade,valor,data_vencimento,competencia,status,tipo_lancamento,plano_conta:plano_contas(id,codigo,nome,tipo_custo)",
        )
        .neq("status", "cancelado")
        .neq("status", "finalizado")
        .eq("competencia", competencia);

      if (unidade !== "todas") q = q.in("unidade", [unidade, "todas"]);
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

    if (grupoPlano !== "all") {
      baseRows = baseRows.filter((c) => c.plano_conta?.codigo?.startsWith(`${grupoPlano}.`));
      currRows = currRows.filter((c) => c.plano_conta?.codigo?.startsWith(`${grupoPlano}.`));
    }

    // comportamento (fixo/variavel) depende do join de plano_conta.tipo_custo
    if (comportamento !== "all") {
      baseRows = baseRows.filter((c) => (c.plano_conta?.tipo_custo || null) === comportamento);
      currRows = currRows.filter((c) => (c.plano_conta?.tipo_custo || null) === comportamento);
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
        categoria: grupoDe(sample?.plano_conta?.codigo).nome,
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
      .slice(0, 6);

    const topAlertas = [...variations]
      .filter((v) => v.status === "RECORRENTE" && v.prev > 0 && v.curr > 0)
      .sort((a, b) => Math.abs(b.perc) - Math.abs(a.perc))
      .slice(0, 6);

    const inputObject = {
      v: ANALYSIS_VERSION,
      competenciaYM,
      baseYM,
      unidade,
      filtros: { grupoPlano, comportamento, tipo },
      macro: {
        totalPrev,
        totalCurr,
        totalDiff,
        totalPerc,
        countPrev: baseRows.length,
        countCurr: currRows.length,
      },
      distribuicao: {
        base: byCategoria(baseRows, grupoDe),
        atual: byCategoria(currRows, grupoDe),
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

    const apiKey = await getGeminiApiKey(supabase);

    const prompt = `Analise comparativo de contas BASE=${baseYM} vs ATUAL=${competenciaYM}.
Retorne APENAS JSON válido com:
{
  "analise_executiva": string,
  "insights_detalhados": [{"titulo":string,"categoria":string,"severidade":"alta|media|baixa","descricao":string,"impacto_financeiro":number,"chave_referencia":string|null}],
  "recomendacoes": string[]
}
Sem markdown, sem texto extra.
Dados:
${JSON.stringify(inputObject)}`;

    let parsed: any = null;
    let modelUsed = "fallback-heuristic";
    try {
      const { text: rawText, modelUsed: geminiModel } = await callGeminiWithFallback(prompt, apiKey, {
        timeoutMs: 8_000,
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      });
      modelUsed = geminiModel;
      parsed = safeParseJsonFromText(rawText);
    } catch {
      parsed = null;
    }
    if (!parsed || !parsed.analise_executiva) {
      parsed = buildFallbackComparativo(
        competenciaYM,
        baseYM,
        totalPrev,
        totalCurr,
        totalDiff,
        totalPerc,
        topMudancas,
      );
    }

    const { data: inserted, error: insErr } = await supabase
      .from("contas_comparativo_ai_insights")
      .upsert(
        {
          competencia_ym: competenciaYM,
          base_ym: baseYM,
          unidade,
          filtros: { grupoPlano, comportamento, tipo },
          model: modelUsed,
          input_hash: inputHash,
          summary: parsed.analise_executiva || null,
          response_json: parsed,
        },
        { onConflict: "input_hash" },
      )
      .select("*")
      .single();

    if (insErr) throw new Error(insErr.message);
    return jsonResponse(inserted);
  } catch (error: any) {
    console.error("❌ Erro na função ai-contas-comparativo:", error?.message || error);
    return jsonResponse({ error: error?.message || "Erro interno" }, 500);
  }
});

