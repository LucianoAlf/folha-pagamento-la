import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireRhAdminContext, rhJsonResponse as json } from "../_shared/rh-auth.ts";
import { decideFichaRefresh, hashFichaSnapshot } from "../_shared/ficha-snapshot.mjs";

async function getSecret(admin: any, name: string) {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc('get_vault_secret', { secret_name: name });
  if (error) throw error;
  const fromVault = String(data ?? '').trim();
  if (!fromVault) throw new Error(`${name} nao configurado em Secrets ou Vault.`);
  return fromVault;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);

  try {
    const { adminClient } = await requireRhAdminContext(req);
    const body = await req.json().catch(() => ({}));
    const candidatoId = String(body?.candidato_id ?? '').trim();
    if (!candidatoId) return json({ success: false, error: 'candidato_id obrigatorio.' }, 400);

    const { data: candidato, error: candErro } = await adminClient
      .from('rh_candidatos')
      .select('id, ficha_token, la_colaborador_id, ficha_snapshot_hash, perguntas_entrevista')
      .eq('id', candidatoId)
      .maybeSingle();
    if (candErro) throw candErro;
    if (!candidato) return json({ success: false, error: 'candidato nao encontrado.' }, 404);

    const tokenInformado = String(body?.token ?? '').trim();
    const token = String(candidato.ficha_token ?? tokenInformado).trim();
    const colaboradorId = candidato.la_colaborador_id ?? null;
    if (!token && !colaboradorId) return json({ success: false, error: 'Informe o token da Ficha Tecnica para fazer o primeiro vinculo.' }, 400);

    const url = await getSecret(adminClient, 'LA_REPORT_FICHA_URL');
    const secret = await getSecret(adminClient, 'LA_REPORT_FICHA_SECRET');
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-super-folha-sync-secret': secret },
      body: JSON.stringify(colaboradorId ? { colaborador_id: colaboradorId } : { token }),
    });
    const payload = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !payload?.success) throw new Error(payload?.error || `LA Report respondeu HTTP ${resposta.status}.`);
    const ficha = payload.ficha;
    const vinculo = {
      ficha_token: token || candidato.ficha_token,
      la_colaborador_id: ficha?.pessoa?.colaborador_id ?? colaboradorId,
      updated_at: new Date().toISOString(),
    };

    if (!ficha?.respondeu) {
      const { error } = await adminClient.from('rh_candidatos').update(vinculo).eq('id', candidatoId);
      if (error) throw error;
      return json({ success: true, respondeu: false, mensagem: 'A pessoa ainda nao respondeu a Ficha Tecnica.' });
    }

    const snapshotHash = await hashFichaSnapshot(ficha);
    const refresh = decideFichaRefresh({
      previousHash: candidato.ficha_snapshot_hash,
      nextHash: snapshotHash,
      hasInterviewQuestions: Array.isArray(candidato.perguntas_entrevista) && candidato.perguntas_entrevista.length > 0,
    });
    const { error: updErro } = await adminClient.from('rh_candidatos').update({
      ...vinculo,
      questionario_respostas: ficha,
      ficha_snapshot_hash: snapshotHash,
      ficha_importada_em: new Date().toISOString(),
      perguntas_desatualizadas: refresh.perguntasDesatualizadas,
    }).eq('id', candidatoId);
    if (updErro) throw updErro;
    return json({ success: true, respondeu: true, ficha, snapshot_alterado: refresh.changed, perguntas_desatualizadas: refresh.perguntasDesatualizadas });
  } catch (error) {
    console.error('rh-ficha-importar:', error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
