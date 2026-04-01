import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RH_CORS_HEADERS, requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

const stripCodeFences = (input: string) =>
  (input || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();

const safeParseJson = (text: string) => {
  try {
    return JSON.parse(stripCodeFences(text));
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
      generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 1200 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function buildFallback(snapshot: any) {
  const lateCheckpoints = (snapshot.checkpoints || []).filter((item: any) => item.status === "atrasado").length;
  const completedObjectives = (snapshot.objectives || []).filter((item: any) => item.status === "concluido").length;
  const totalObjectives = (snapshot.objectives || []).length;
  return {
    resumo_executivo: `${snapshot.colaborador?.nome || "Colaborador"} está com ${snapshot.plan?.titulo || "plano ativo"} em ${Math.round(snapshot.plan?.score_progresso || 0)}% e ${completedObjectives}/${totalObjectives} objetivos concluídos.`,
    destaques: [
      snapshot.jornada?.score_jornada ? `Score atual da jornada: ${Math.round(snapshot.jornada.score_jornada)} pontos.` : "Jornada ainda sem score consolidado.",
      snapshot.competences?.length ? `${snapshot.competences.length} competências mapeadas neste ciclo.` : "Plano ainda sem competências mapeadas.",
    ],
    riscos: lateCheckpoints > 0 ? [`Há ${lateCheckpoints} checkpoint(s) atrasado(s) no plano atual.`] : [],
    recomendacoes: [
      lateCheckpoints > 0 ? "Priorizar o próximo checkpoint atrasado e registrar feedback executivo." : "Manter cadência de checkpoint e feedback do gestor.",
      "Usar evidências e feedbacks recentes para apoiar promoção ou mudança de nível.",
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: RH_CORS_HEADERS });

  try {
    const { adminClient: supabase } = await requireRhAdminContext(req);
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    const payload = await req.json().catch(() => ({}));
    const collaboratorId = Number(payload?.colaboradorId || 0);
    const planId = typeof payload?.planId === "string" ? payload.planId : null;
    if (!collaboratorId) return jsonResponse({ error: "colaboradorId é obrigatório." }, 400);

    const [{ data: colaborador }, { data: jornada }, { data: conquistas }, { data: movimentos }, { data: plans }] = await Promise.all([
      supabase.from("colaboradores").select("id,nome,funcao,tipo").eq("id", collaboratorId).maybeSingle(),
      supabase.from("rh_colaborador_jornadas").select("*").eq("colaborador_id", collaboratorId).in("status", ["ativa", "pausada"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("rh_colaborador_conquistas").select("titulo,score_impacto,concedida_em").eq("colaborador_id", collaboratorId).order("concedida_em", { ascending: false }).limit(6),
      supabase.from("rh_carreira_movimentacoes").select("titulo,motivo,efetivado_em").eq("colaborador_id", collaboratorId).order("efetivado_em", { ascending: false }).limit(6),
      supabase.from("rh_pdi_planos").select("*").eq("colaborador_id", collaboratorId).order("data_inicio", { ascending: false }).limit(4),
    ]);

    const plan = planId
      ? (plans || []).find((item: any) => item.id === planId) || plans?.[0]
      : plans?.[0];

    const [competencesRes, objectivesRes, checkpointsRes, feedbacksRes, evidencesRes] = plan
      ? await Promise.all([
          supabase.from("rh_pdi_competencias").select("*").eq("plano_id", plan.id).order("ordem", { ascending: true }),
          supabase.from("rh_pdi_objetivos").select("*").eq("plano_id", plan.id).order("ordem", { ascending: true }),
          supabase.from("rh_pdi_checkpoints").select("*").eq("plano_id", plan.id).order("data_prevista", { ascending: true }),
          supabase.from("rh_pdi_feedbacks").select("tipo,resumo,pontos_fortes,pontos_desenvolver,created_at").eq("plano_id", plan.id).order("created_at", { ascending: false }).limit(8),
          supabase.from("rh_pdi_evidencias").select("tipo,titulo,descricao,created_at").eq("plano_id", plan.id).order("created_at", { ascending: false }).limit(8),
        ])
      : [
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
        ];

    const snapshot = {
      colaborador: colaborador || null,
      jornada: jornada || null,
      plan: plan || null,
      competences: competencesRes.data || [],
      objectives: objectivesRes.data || [],
      checkpoints: checkpointsRes.data || [],
      feedbacks: feedbacksRes.data || [],
      evidences: evidencesRes.data || [],
      conquistas: conquistas || [],
      movimentos: movimentos || [],
    };

    const prompt = [
      "Você é um copiloto executivo de RH da escola LA Music.",
      "Analise a jornada e o PDI do colaborador e retorne SOMENTE JSON válido no formato:",
      "{",
      '  "resumo_executivo": string,',
      '  "destaques": string[],',
      '  "riscos": string[],',
      '  "recomendacoes": string[]',
      "}",
      "",
      JSON.stringify(snapshot),
    ].join("\n");

    let parsed = null;
    try {
      parsed = safeParseJson(await callGemini(apiKey, prompt));
    } catch {
      parsed = null;
    }

    const fallback = buildFallback(snapshot);
    if (!parsed) return jsonResponse(fallback);

    return jsonResponse({
      resumo_executivo: parsed.resumo_executivo || fallback.resumo_executivo,
      destaques: Array.isArray(parsed.destaques) ? parsed.destaques : fallback.destaques,
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos : fallback.riscos,
      recomendacoes: Array.isArray(parsed.recomendacoes) ? parsed.recomendacoes : fallback.recomendacoes,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
