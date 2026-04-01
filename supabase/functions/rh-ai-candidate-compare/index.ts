import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RH_CORS_HEADERS, requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

const stripCodeFences = (input: string) =>
  (input || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();

const safeParseJsonFromText = (text: string) => {
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
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 1200,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function buildFallback(candidates: any[]) {
  const ranking = candidates
    .map((candidate) => {
      const score = Math.min(
        100,
        (candidate.questionario_resumo ? 20 : 0) +
          (candidate.curriculo_texto_extraido ? 25 : 0) +
          Math.round((candidate.media_nota || 0) * 5) +
          (candidate.avaliacoes_count > 0 ? 15 : 0) +
          (candidate.cargo_pretendido ? 10 : 0)
      );
      return {
        candidate_id: candidate.id,
        nome: candidate.nome,
        score,
        motivo: `Score calculado por completude do cadastro e média das avaliações (${candidate.media_nota || 0}).`,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    resumo_executivo: "Comparativo gerado em fallback local com base nas avaliações registradas e completude cadastral.",
    recomendacao_final: ranking[0] ? `Priorizar ${ranking[0].nome} para a próxima decisão do pipeline.` : "Sem candidatos suficientes para comparar.",
    ranking,
    criterios: [
      { titulo: "Completude cadastral", detalhe: "Currículo, resumo de questionário e dados base preenchidos." },
      { titulo: "Avaliações", detalhe: "Quantidade e média das avaliações disponíveis no processo." },
    ],
    riscos: [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: RH_CORS_HEADERS });

  try {
    const { adminClient: supabase } = await requireRhAdminContext(req);
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    const payload = await req.json().catch(() => ({}));
    const candidateIds = Array.isArray(payload?.candidateIds) ? payload.candidateIds.map(String).slice(0, 5) : [];
    if (candidateIds.length < 2) return jsonResponse({ error: "Informe ao menos 2 candidatos." }, 400);

    const { data: candidates, error: candidatesError } = await supabase
      .from("rh_candidatos")
      .select("*")
      .in("id", candidateIds);
    if (candidatesError) throw candidatesError;

    const snapshots = [];
    for (const candidate of candidates || []) {
      const { data: process } = await supabase
        .from("rh_processos")
        .select("id,status")
        .eq("tipo", "recrutamento")
        .eq("candidato_id", candidate.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: evaluations } = process?.id
        ? await supabase.from("rh_avaliacoes").select("tipo,nota,decisao,resumo").eq("processo_id", process.id)
        : { data: [] as any[] };

      const notas = (evaluations || []).map((item: any) => Number(item.nota)).filter((value) => Number.isFinite(value));
      const media_nota = notas.length ? notas.reduce((sum, value) => sum + value, 0) / notas.length : 0;

      snapshots.push({
        id: candidate.id,
        nome: candidate.nome,
        status: candidate.status,
        cargo_pretendido: candidate.cargo_pretendido,
        questionario_resumo: candidate.questionario_resumo,
        curriculo_texto_extraido: candidate.curriculo_texto_extraido,
        observacoes: candidate.observacoes,
        processo_status: process?.status || null,
        avaliacoes_count: (evaluations || []).length,
        media_nota,
        avaliacoes: evaluations || [],
      });
    }

    const prompt = [
      "Você é um assistente de RH comparando candidatos da escola LA Music.",
      "Analise os candidatos abaixo e retorne SOMENTE JSON válido no formato:",
      "{",
      '  "resumo_executivo": string,',
      '  "recomendacao_final": string,',
      '  "ranking": [{ "candidate_id": string, "nome": string, "score": number, "motivo": string }],',
      '  "criterios": [{ "titulo": string, "detalhe": string }],',
      '  "riscos": string[]',
      "}",
      "",
      JSON.stringify(snapshots),
    ].join("\n");

    let parsed = null;
    try {
      parsed = safeParseJsonFromText(await callGemini(apiKey, prompt));
    } catch {
      parsed = null;
    }

    if (!parsed) return jsonResponse(buildFallback(snapshots));
    return jsonResponse({
      resumo_executivo: parsed.resumo_executivo || buildFallback(snapshots).resumo_executivo,
      recomendacao_final: parsed.recomendacao_final || buildFallback(snapshots).recomendacao_final,
      ranking: Array.isArray(parsed.ranking) ? parsed.ranking : buildFallback(snapshots).ranking,
      criterios: Array.isArray(parsed.criterios) ? parsed.criterios : buildFallback(snapshots).criterios,
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos : [],
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
