import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateCompetencia(value: unknown) {
  const competencia = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
    throw new Error("competencia obrigatoria no formato YYYY-MM-01");
  }
  return competencia;
}

async function getSecret(
  admin: SupabaseClient,
  name: "LA_REPORT_CONTAS_RECEBER_URL" | "LA_REPORT_CONTAS_RECEBER_SECRET",
) {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc("get_vault_secret", { secret_name: name });
  if (error) throw error;
  const fromVault = String(data ?? "").trim();
  if (!fromVault) throw new Error(`${name} nao configurado em Secrets ou Vault.`);
  return fromVault;
}

async function readLaReport(
  url: string,
  secret: string,
  competencia: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-super-folha-sync-secret": secret,
    },
    body: JSON.stringify({ competencia }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success) {
    throw new Error(body?.erro || `LA Report respondeu HTTP ${response.status}.`);
  }
  if (!body?.manifesto?.manifest_hash || !Array.isArray(body?.itens)) {
    throw new Error("LA Report retornou um contrato incompleto.");
  }
  return body as {
    success: true;
    manifesto: Record<string, unknown> & { manifest_hash: string; total_linhas?: number };
    itens: Array<Record<string, unknown>>;
  };
}

function normalizeDescription(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildPreflight(source: Awaited<ReturnType<typeof readLaReport>>) {
  const classificacao = {
    mensalidades: 0,
    matriculas_passaportes: 0,
    locacoes: 0,
    rateios_excluidos: 0,
    pendentes_manuais: 0,
  };
  for (const item of source.itens) {
    const descricao = normalizeDescription(item.descricao);
    if (/^\s*parcela/.test(descricao)) classificacao.mensalidades += 1;
    else if (/(passaporte|matricula)/.test(descricao)) classificacao.matriculas_passaportes += 1;
    else if (/locacao/.test(descricao)) classificacao.locacoes += 1;
    else if (/rateio/.test(descricao)) classificacao.rateios_excluidos += 1;
    else classificacao.pendentes_manuais += 1;
  }
  return {
    success: true,
    action: "preflight",
    manifesto: source.manifesto,
    classificacao,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ success: false, error: "metodo nao permitido" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase env vars ausentes.");

    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader) return json({ success: false, error: "Authorization ausente." }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) return json({ success: false, error: "JWT invalido." }, 401);
    const { data: canOperate, error: permissionError } = await authClient.rpc(
      "contas_receber_pode_operar",
    );
    if (permissionError) {
      throw new Error(`Falha ao validar permissao financeira: ${permissionError.message}`);
    }
    if (canOperate !== true) {
      return json({ success: false, error: "Acesso financeiro nao autorizado." }, 403);
    }

    const payload = await request.json().catch(() => ({}));
    const action = String(payload?.action ?? "preflight").toLowerCase();
    if (!['preflight', 'apply'].includes(action)) throw new Error("action deve ser preflight ou apply.");
    const competencia = validateCompetencia(payload?.competencia);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const sourceUrl = await getSecret(admin, "LA_REPORT_CONTAS_RECEBER_URL");
    const sourceSecret = await getSecret(admin, "LA_REPORT_CONTAS_RECEBER_SECRET");
    const source = await readLaReport(sourceUrl, sourceSecret, competencia);

    if (action === "preflight") return json(buildPreflight(source));

    const manifest_hash_esperado = String(payload?.manifest_hash_esperado ?? "").trim();
    if (!manifest_hash_esperado) throw new Error("manifest_hash_esperado obrigatorio para aplicar.");
    if (source.manifesto.manifest_hash !== manifest_hash_esperado) {
      return json({
        success: false,
        error: "A origem mudou depois do preflight. Revise os novos numeros antes de aplicar.",
        manifest_hash_esperado,
        manifest_hash_atual: source.manifesto.manifest_hash,
      }, 409);
    }

    const { data, error } = await admin.rpc("contas_receber_sync_aplicar", {
      p_competencia: competencia,
      p_manifest_hash: source.manifesto.manifest_hash,
      p_itens: source.itens,
      p_manifesto: source.manifesto,
      p_ator: { tipo: "sistema", ref: `web:${userData.user.id}` },
    });
    if (error) throw error;

    return json({ success: true, action: "apply", resultado: data, manifesto: source.manifesto });
  } catch (error) {
    console.error("contas-receber-sync:", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ success: false, error: message }, 500);
  }
});
