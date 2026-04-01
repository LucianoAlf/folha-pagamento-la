import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RH_CORS_HEADERS, requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

const safeParseJson = (text: string) => {
  try {
    return JSON.parse((text || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim());
  } catch {
    return null;
  }
};

async function callGemini(apiKey: string, prompt: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 1000,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function buildFallback(kpis: any, alerts: any[], docs: any[], processes: any[]) {
  return {
    resumo_executivo: `Hoje o RH tem ${kpis?.recrutamentos_ativos || 0} recrutamentos, ${kpis?.onboardings_ativos || 0} onboardings, ${kpis?.desligamentos_ativos || 0} desligamentos e ${kpis?.documentos_pendentes || 0} documentos pendentes.`,
    prioridades: [
      alerts[0] ? `Atacar primeiro a etapa crítica "${alerts[0].etapa_titulo}".` : "Sem alertas críticos imediatos.",
      docs[0] ? `Regularizar o documento "${docs[0].tipo_documento}" do processo "${docs[0].processo_titulo}".` : "Sem pendências documentais relevantes.",
    ],
    riscos: (alerts || []).slice(0, 3).map((item) => `Prazo crítico em ${item.processo_titulo}: ${item.etapa_titulo}.`),
    recomendacoes: [
      processes[0] ? `Acompanhar o processo "${processes[0].titulo}" para destravar a próxima etapa.` : "Sem processos recentes para recomendar.",
      "Usar a agenda espelhada para acompanhar os próximos vencimentos de etapa.",
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: RH_CORS_HEADERS });

  try {
    const { adminClient: supabase } = await requireRhAdminContext(req);
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    const [{ data: kpis }, { data: alerts }, { data: docs }, { data: processes }, { data: events }] = await Promise.all([
      supabase.from("v_rh_dashboard_kpis").select("*").maybeSingle(),
      supabase.from("v_rh_alertas_criticos").select("*").order("data_limite", { ascending: true }).limit(6),
      supabase.from("v_rh_documentos_pendentes").select("*").order("updated_at", { ascending: false }).limit(6),
      supabase.from("v_rh_processos_resumo").select("*").order("data_inicio", { ascending: false }).limit(6),
      supabase.from("rh_historico_eventos").select("acao,comentario,created_at").order("created_at", { ascending: false }).limit(8),
    ]);

    const prompt = [
      "Você é um copiloto executivo de RH da escola LA Music.",
      "Analise os dados operacionais abaixo e retorne SOMENTE JSON válido no formato:",
      "{",
      '  "resumo_executivo": string,',
      '  "prioridades": string[],',
      '  "riscos": string[],',
      '  "recomendacoes": string[]',
      "}",
      "",
      `KPIs: ${JSON.stringify(kpis || {})}`,
      `Alertas: ${JSON.stringify(alerts || [])}`,
      `Pendências documentais: ${JSON.stringify(docs || [])}`,
      `Processos recentes: ${JSON.stringify(processes || [])}`,
      `Eventos recentes: ${JSON.stringify(events || [])}`,
    ].join("\n");

    let parsed = null;
    try {
      parsed = safeParseJson(await callGemini(apiKey, prompt));
    } catch {
      parsed = null;
    }

    if (!parsed) return jsonResponse(buildFallback(kpis || {}, alerts || [], docs || [], processes || []));
    return jsonResponse({
      resumo_executivo: parsed.resumo_executivo || buildFallback(kpis || {}, alerts || [], docs || [], processes || []).resumo_executivo,
      prioridades: Array.isArray(parsed.prioridades) ? parsed.prioridades : [],
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos : [],
      recomendacoes: Array.isArray(parsed.recomendacoes) ? parsed.recomendacoes : [],
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
