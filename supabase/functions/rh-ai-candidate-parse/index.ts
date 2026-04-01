import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RH_CORS_HEADERS, requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

const stripCodeFences = (input: string) =>
  (input || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();

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
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function safeParseJsonFromText(text: string) {
  if (!text?.trim()) return null;
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

async function callGemini(apiKey: string, prompt: string, filePart?: { mimeType: string; data: string }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...(filePart ? [{ inlineData: { mimeType: filePart.mimeType, data: filePart.data } }] : []),
          ],
        },
      ],
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

function buildFallback(questionnaireText: string, candidateName: string | null, cargoPretendido: string | null) {
  const email = questionnaireText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  const telefone = questionnaireText.match(/(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}/)?.[0] || null;
  const cpf = questionnaireText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)?.[0] || null;

  return {
    nome: candidateName,
    email,
    telefone,
    cpf,
    cargo_pretendido: cargoPretendido,
    tipo_vinculo_pretendido: null,
    resumo_candidato: questionnaireText ? questionnaireText.slice(0, 500) : null,
    questionario_resumo: questionnaireText ? `Resumo preliminar gerado localmente a partir do texto informado.` : null,
    curriculo_texto_extraido: null,
    pontos_fortes: questionnaireText ? ["Questionário anexado para triagem inicial."] : [],
    alertas: [],
    status_sugerido: questionnaireText ? "questionario_recebido" : "novo",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: RH_CORS_HEADERS });

  try {
    await requireRhAdminContext(req);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    const payload = await req.json().catch(() => ({}));
    const fileBase64 = payload?.fileBase64 ? String(payload.fileBase64) : "";
    const mimeType = payload?.mimeType ? String(payload.mimeType) : "application/octet-stream";
    const questionnaireText = payload?.questionnaireText ? String(payload.questionnaireText) : "";
    const candidateName = payload?.candidateName ? String(payload.candidateName) : null;
    const cargoPretendido = payload?.cargoPretendido ? String(payload.cargoPretendido) : null;
    const observacoes = payload?.observacoes ? String(payload.observacoes) : null;

    const prompt = [
      "Você é um assistente de RH da escola LA Music.",
      "Analise o currículo/anexo e o questionário do candidato e retorne SOMENTE JSON válido.",
      "Objetivo: sugerir pré-preenchimento do cadastro, resumir o perfil e apontar riscos de contratação.",
      "",
      "Campos esperados:",
      "{",
      '  "nome": string | null,',
      '  "email": string | null,',
      '  "telefone": string | null,',
      '  "cpf": string | null,',
      '  "cargo_pretendido": string | null,',
      '  "tipo_vinculo_pretendido": string | null,',
      '  "resumo_candidato": string | null,',
      '  "questionario_resumo": string | null,',
      '  "curriculo_texto_extraido": string | null,',
      '  "pontos_fortes": string[],',
      '  "alertas": string[],',
      '  "status_sugerido": "novo" | "questionario_pendente" | "questionario_recebido" | "entrevista" | "aula_teste" | "aprovado" | "reprovado" | "arquivado" | null',
      "}",
      "",
      `Contexto informado manualmente: nome=${candidateName || "n/d"} cargo=${cargoPretendido || "n/d"} observacoes=${observacoes || "n/d"}`,
      `Questionário bruto: ${questionnaireText || "não informado"}`,
      "Se algum campo não puder ser inferido, retorne null.",
      "No campo curriculo_texto_extraido, extraia o texto de forma resumida e útil para RH.",
    ].join("\n");

    let output = "";
    try {
      output = await callGemini(apiKey, prompt, fileBase64 ? { mimeType, data: fileBase64 } : undefined);
    } catch {
      return jsonResponse(buildFallback(questionnaireText, candidateName, cargoPretendido));
    }

    const parsed = safeParseJsonFromText(output);
    if (!parsed) return jsonResponse(buildFallback(questionnaireText, candidateName, cargoPretendido));

    return jsonResponse({
      nome: parsed.nome || candidateName || null,
      email: parsed.email || null,
      telefone: parsed.telefone || null,
      cpf: parsed.cpf || null,
      cargo_pretendido: parsed.cargo_pretendido || cargoPretendido || null,
      tipo_vinculo_pretendido: parsed.tipo_vinculo_pretendido || null,
      resumo_candidato: parsed.resumo_candidato || null,
      questionario_resumo: parsed.questionario_resumo || null,
      curriculo_texto_extraido: parsed.curriculo_texto_extraido || null,
      pontos_fortes: Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes.slice(0, 6) : [],
      alertas: Array.isArray(parsed.alertas) ? parsed.alertas.slice(0, 6) : [],
      status_sugerido: parsed.status_sugerido || null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
