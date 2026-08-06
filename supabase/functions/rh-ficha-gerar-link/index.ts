import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireRhAdminContext, rhJsonResponse as json } from "../_shared/rh-auth.ts";

const UNIDADE_LA_REPORT: Record<string, string> = {
  bar: 'Barra',
  cg: 'Campo Grande',
  rec: 'Recreio',
};

async function getSecret(admin: any, name: string) {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc('get_vault_secret', { secret_name: name });
  if (error) throw error;
  const fromVault = String(data ?? '').trim();
  if (!fromVault) throw new Error(`${name} nao configurado em Secrets ou Vault.`);
  return fromVault;
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/missing authorization|invalid or expired/i.test(message)) return 401;
  if (/acesso restrito/i.test(message)) return 403;
  return 500;
}

function buildFichaLink(baseUrl: string, token: string) {
  const url = new URL(baseUrl);
  url.searchParams.set('t', token);
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);

  try {
    const { adminClient } = await requireRhAdminContext(req);
    const body = await req.json().catch(() => ({}));
    const candidatoId = String(body?.candidato_id ?? '').trim();
    if (!candidatoId) return json({ success: false, error: 'candidato_id obrigatorio.' }, 400);

    const { data: candidato, error: candidateError } = await adminClient
      .from('rh_candidatos')
      .select('id, nome, telefone, unidade, ficha_token, la_colaborador_id, ficha_link, ficha_link_gerado_em')
      .eq('id', candidatoId)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidato) return json({ success: false, error: 'candidato nao encontrado.' }, 404);

    if (candidato.ficha_token) {
      const link = candidato.ficha_link || buildFichaLink(
        await getSecret(adminClient, 'LA_REPORT_FICHA_PUBLIC_URL'),
        candidato.ficha_token,
      );
      if (!candidato.ficha_link) {
        const { error: updateError } = await adminClient
          .from('rh_candidatos')
          .update({ ficha_link: link, updated_at: new Date().toISOString() })
          .eq('id', candidato.id);
        if (updateError) throw updateError;
      }
      return json({ success: true, link, token: candidato.ficha_token, ja_existia: true });
    }

    if (candidato.la_colaborador_id) {
      return json({
        success: false,
        code: 'vinculo_legado_incompleto',
        error: 'Este candidato tem um vínculo legado incompleto. Regularize o token existente antes de gerar outro link.',
      }, 409);
    }

    const unidade = UNIDADE_LA_REPORT[String(candidato.unidade ?? '')];
    if (!unidade) return json({ success: false, error: 'Complete a unidade do candidato antes de gerar a Ficha Tecnica.' }, 400);

    const createUrl = await getSecret(adminClient, 'LA_REPORT_FICHA_CRIAR_URL');
    const secret = await getSecret(adminClient, 'LA_REPORT_FICHA_SECRET');
    const origem_sistema = 'super_folha';
    const origem_ref = candidato.id;
    if (origem_sistema !== 'super_folha' || !origem_ref) {
      return json({ success: false, error: 'Origem obrigatoria invalida.' }, 400);
    }

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-super-folha-sync-secret': secret },
      body: JSON.stringify({
        nome: candidato.nome,
        whatsapp: candidato.telefone || null,
        unidade,
        departamento: 'Atendimento',
        cargo_contexto: 'ATENDIMENTO',
        origem_sistema,
        origem_ref,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success || !payload?.token || !payload?.link || !Number.isFinite(Number(payload?.colaborador_id))) {
      throw new Error('LA Report nao conseguiu criar o vinculo da Ficha Tecnica.');
    }

    const generatedAt = new Date().toISOString();
    const { error: updateError } = await adminClient.from('rh_candidatos').update({
      ficha_token: String(payload.token),
      la_colaborador_id: Number(payload.colaborador_id),
      ficha_link: String(payload.link),
      ficha_link_gerado_em: generatedAt,
      updated_at: generatedAt,
    }).eq('id', candidato.id);
    if (updateError) throw updateError;

    return json({ success: true, link: String(payload.link), token: String(payload.token), ja_existia: Boolean(payload.ja_existia) });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Nao foi possivel gerar a Ficha Tecnica.' }, statusFor(error));
  }
});
