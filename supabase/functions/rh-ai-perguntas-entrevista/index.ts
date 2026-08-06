import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireRhAdminContext, rhJsonResponse as json } from "../_shared/rh-auth.ts";
import { callGeminiWithFallback, getGeminiApiKey, safeParseJsonFromText } from "../_shared/gemini.ts";
import { INTERVIEW_QUESTION_RESPONSE_SCHEMA } from "../_shared/interview-question-schema.mjs";

const PILARES = new Set(['comportamental', 'cultura', 'tecnica']);
const MAX_SIGNAL_LENGTH = 90;
const MAX_TITLE_LENGTH = 72;
const normalizarPilar = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '');
const normalizarTexto = (value: unknown, maxLength?: number) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return maxLength ? text.slice(0, maxLength).trim() : text;
};

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/missing authorization|invalid or expired/i.test(message)) return 401;
  if (/acesso restrito/i.test(message)) return 403;
  return 500;
}

function validarPerguntas(value: unknown) {
  if (!value || typeof value !== 'object' || !Array.isArray((value as any).perguntas)) return null;
  const perguntas = (value as any).perguntas;
  if (perguntas.length < 6 || perguntas.length > 9) return null;
  const normalizadas = perguntas.map((pergunta: any) => ({
    pilar: normalizarPilar(pergunta?.pilar),
    pergunta: normalizarTexto(pergunta?.pergunta),
    ancora: normalizarTexto(pergunta?.ancora),
    titulo_curto: normalizarTexto(pergunta?.titulo_curto, MAX_TITLE_LENGTH),
    sinal_consistencia: normalizarTexto(pergunta?.sinal_consistencia, MAX_SIGNAL_LENGTH),
    sinal_atencao: normalizarTexto(pergunta?.sinal_atencao, MAX_SIGNAL_LENGTH),
  }));
  if (normalizadas.some((pergunta) => !PILARES.has(pergunta.pilar) || !pergunta.pergunta || pergunta.pergunta.length > 600 || !pergunta.ancora || pergunta.ancora.length > 500 || !pergunta.titulo_curto || !pergunta.sinal_consistencia || !pergunta.sinal_atencao)) return null;
  return normalizadas;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);
  try {
    const { adminClient } = await requireRhAdminContext(req);
    const body = await req.json().catch(() => ({}));
    const candidatoId = String(body?.candidato_id ?? '').trim();
    if (!candidatoId) return json({ success: false, error: 'candidato_id obrigatorio.' }, 400);

    const { data: candidato, error } = await adminClient.from('rh_candidatos')
      .select('id, nome, cargo_pretendido, observacoes, questionario_respostas, ficha_snapshot_hash')
      .eq('id', candidatoId).maybeSingle();
    if (error) throw error;
    if (!candidato) return json({ success: false, error: 'candidato nao encontrado.' }, 404);
    const ficha = candidato.questionario_respostas as Record<string, unknown>;
    if (!ficha?.respondeu || !candidato.ficha_snapshot_hash) return json({ success: false, error: 'Importe uma Ficha Tecnica respondida antes de gerar o roteiro.' }, 400);

    const prompt = [
      'Voce prepara um roteiro de entrevista para RH, em portugues do Brasil.',
      'Retorne somente JSON valido no formato {"perguntas":[{"pilar":"comportamental|cultura|tecnica","pergunta":"...","ancora":"trecho ou tensao da ficha que motivou a pergunta","titulo_curto":"3 a 5 palavras","sinal_consistencia":"ate 90 caracteres","sinal_atencao":"ate 90 caracteres"}]}.',
      'Gere de 6 a 9 perguntas: comportamental, cultura e 1 ou 2 tecnicas somente se o cargo permitir.',
      'Cada pergunta deve investigar uma tensao entre uma declaracao da pessoa e o contexto do cargo; use perguntas abertas sobre situacoes vividas.',
      'A ancora deve apontar o dado da ficha que motivou a pergunta, sem inventar fatos.',
      'Titulo curto tem de 3 a 5 palavras e descreve somente o tema da pergunta, sem julgar a pessoa.',
      'Os sinais sao observaveis e neutros: descrevem contexto, acao e resultado esperados, sem diagnostico ou conclusao.',
      'Nunca escreva codinome, perfil, temperamento, linguagem de reconhecimento, valores pessoais ou rotulo comportamental nos sinais.',
      'Nunca atribua nota, score, fit, diagnostico, veredito, recomendacao de aprovacao ou rotulo clinico/comportamental.',
      `Candidato: ${candidato.nome}. Cargo pretendido: ${candidato.cargo_pretendido ?? 'nao informado'}. Observacoes: ${candidato.observacoes ?? 'nenhuma'}.`,
      `Ficha tecnica: ${JSON.stringify(ficha)}`,
    ].join('\n');
    const key = await getGeminiApiKey(adminClient);
    const result = await callGeminiWithFallback(prompt, key, {
      timeoutMs: 20_000,
      generationConfig: {
        maxOutputTokens: 4096,
        thinkingLevel: 'low',
        responseMimeType: 'application/json',
        responseJsonSchema: INTERVIEW_QUESTION_RESPONSE_SCHEMA,
      },
    });
    const respostaIa = safeParseJsonFromText(result.text);
    const perguntas = validarPerguntas(respostaIa);
    if (!perguntas) {
      const itens = respostaIa && typeof respostaIa === 'object' && Array.isArray((respostaIa as any).perguntas)
        ? (respostaIa as any).perguntas
        : null;
      const diagnostico = {
        resposta_json: Boolean(respostaIa),
        total_perguntas: itens?.length ?? null,
        pilares: itens?.map((item: any) => String(item?.pilar ?? '')).slice(0, 9) ?? [],
      };
      console.warn('rh-ai-perguntas-entrevista: roteiro fora do contrato', diagnostico);
      return json({ success: false, error: 'A IA nao devolveu um roteiro valido. Tente gerar novamente.' }, 502);
    }
    const geradasEm = new Date().toISOString();
    const { error: updateError } = await adminClient.from('rh_candidatos').update({
      perguntas_entrevista: perguntas,
      perguntas_geradas_em: geradasEm,
      perguntas_desatualizadas: false,
      updated_at: geradasEm,
    }).eq('id', candidatoId);
    if (updateError) throw updateError;
    return json({ success: true, perguntas, geradas_em: geradasEm, modelo: result.modelUsed });
  } catch (error) {
    console.error('rh-ai-perguntas-entrevista:', error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, statusFor(error));
  }
});
