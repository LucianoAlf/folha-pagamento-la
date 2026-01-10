import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANALYSIS_VERSION = 6; // Incrementado para invalidar cache e forçar nova análise robusta

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripCodeFences(input: string): string {
  let s = input.trim();
  // Remove markdown code blocks
  s = s.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();
  return s;
}

function safeParseJsonFromText(text: string): any {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
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
        temperature: 0.1,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

  const payload = await req.json();
  if (!payload?.folhaId) return jsonResponse({ error: "folhaId is required" }, 400);

  const model = "gemini-3-flash-preview";
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;

  // 1. Buscar Contexto de Folhas
  const { data: folhas } = await supabase
    .from("folhas_mensais")
    .select("*")
    .order("ano", { ascending: false })
    .order("mes", { ascending: false });

  const idx = (folhas || []).findIndex((f) => f.id === payload.folhaId);
  const folhaAtual = folhas?.[idx];
  const folhaAnterior = folhas?.[idx + 1];

  if (!folhaAtual || !folhaAnterior) return jsonResponse({ error: "Meses para comparação não encontrados" }, 400);

  // 2. Buscar Comparativo Agregado por Colaborador
  const { data: compColab } = await supabase.rpc("compare_folhas_colaborador", {
    p_folha_id: folhaAtual.id,
    p_prev_folha_id: folhaAnterior.id,
  });

  // 3. Buscar Notas da Ana (Memória)
  const { data: notasAna } = await supabase
    .from("colaborador_variacao_notas")
    .select("colaborador_id, nota")
    .eq("folha_id", folhaAtual.id);

  const inputObject = {
    v: ANALYSIS_VERSION,
    folhaAtual,
    folhaAnterior,
    variacoes: (compColab || []).filter(v => Math.abs(v.perc) > 5 || v.status),
    notasAna: notasAna || [],
    historicoNotasGerais: (folhas || []).filter(f => f.notas_rh).map(f => ({ periodo: `${f.mes}/${f.ano}`, nota: f.notas_rh }))
  };

  const inputHash = await sha256Hex(JSON.stringify(inputObject));
  
  if (!payload.force) {
    const { data: existing } = await supabase
      .from("folha_ai_insights")
      .select("*")
      .eq("input_hash", inputHash)
      .limit(1);
    if (existing?.length) return jsonResponse({ cached: true, ...existing[0] });
  }

  const prompt = `Você é um Controller Financeiro e Especialista em RH da LA Music Group. 
Sua tarefa é analisar as variações da folha de pagamento entre ${folhaAnterior.mes}/${folhaAnterior.ano} e ${folhaAtual.mes}/${folhaAtual.ano}.

DADOS MACRO (Folha Atual):
- Total Geral: R$ ${folhaAtual.total_geral}
- Campo Grande: R$ ${folhaAtual.total_cg}
- Recreio: R$ ${folhaAtual.total_rec}
- Barra: R$ ${folhaAtual.total_bar}

VARIAÇÕES DETALHADAS:
${JSON.stringify(inputObject.variacoes)}

MEMÓRIA DA ANA (Notas para este mês):
${JSON.stringify(inputObject.notasAna)}

CONTEXTO HISTÓRICO:
${JSON.stringify(inputObject.historicoNotasGerais)}

INSTRUÇÕES:
1. Analise o impacto financeiro por unidade e categoria.
2. Identifique anomalias (ex: aumento de comissão sem nota explicativa).
3. Use as notas da Ana para confirmar sazonalidades (ex: férias, bonificações).
4. Seja elegante, profissional e direto.

CONTRATO DE SAÍDA (Responda APENAS JSON puro):
{
  "analise_executiva": "Texto fluido e profissional resumindo o mês para a Ana...",
  "insights_detalhados": [
    { 
      "tipo": "turnover | sazonalidade | comercial | remuneracao", 
      "titulo": "Título Curto", 
      "descricao": "Descrição detalhada com impacto financeiro.", 
      "impacto_financeiro": 1234.56 
    }
  ],
  "recomendacoes": [
    "Sugestão de ação baseada na análise..."
  ]
}`;

  const rawText = await callGemini(model, apiKey, prompt);
  const parsed = safeParseJsonFromText(rawText);

  if (!parsed || !parsed.analise_executiva) {
    throw new Error("Falha ao processar resposta estruturada da IA");
  }

  const { data: inserted } = await supabase
    .from("folha_ai_insights")
    .insert({
      folha_id: folhaAtual.id,
      prev_folha_id: folhaAnterior.id,
      model,
      input_hash: inputHash,
      summary: parsed.analise_executiva, // Salvando apenas a string limpa no summary
      response_json: parsed,
    })
    .select("*")
    .single();

  return jsonResponse(inserted);
});
