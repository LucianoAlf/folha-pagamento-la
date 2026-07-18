import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SecretName =
  | "LA_REPORT_CONTAS_RECEBER_URL"
  | "LA_REPORT_CONTAS_RECEBER_REFRESH_URL"
  | "LA_REPORT_CONTAS_RECEBER_SECRET";

type SourceItem = Record<string, unknown>;

type SourceResponse = {
  success: true;
  manifesto: Record<string, unknown> & {
    manifest_hash: string;
    sync_run_id: string;
    latest_complete_sync_run_id?: string;
    snapshot_complete: boolean;
    total_linhas?: number;
  };
  itens: SourceItem[];
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

async function getSecret(admin: SupabaseClient, name: SecretName) {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc("get_vault_secret", { secret_name: name });
  if (error) throw error;
  const fromVault = String(data ?? "").trim();
  if (!fromVault) throw new Error(`${name} nao configurado em Secrets ou Vault.`);
  return fromVault;
}

async function postLaReport(url: string, secret: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-super-folha-sync-secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success) {
    throw new Error(body?.erro || body?.error || `LA Report respondeu HTTP ${response.status}.`);
  }
  return body;
}

async function refreshLaReport(
  url: string,
  secret: string,
  competencia: string,
) {
  const body = await postLaReport(url, secret, { competencia, origem: "super_folha_preflight" });
  const syncRunId = String(body?.sync_run_id ?? "").trim();
  if (!syncRunId || body?.snapshot_complete !== true) {
    throw new Error("LA Report nao concluiu um snapshot completo para a competencia.");
  }
  return { sync_run_id: syncRunId, snapshot_complete: true as const };
}

async function readLaReport(
  url: string,
  secret: string,
  competencia: string,
  syncRunId?: string,
  requireLatest = false,
) {
  const body = await postLaReport(url, secret, {
    competencia,
    sync_run_id: syncRunId,
    require_latest: requireLatest,
  });
  if (!body?.manifesto?.manifest_hash || !Array.isArray(body?.itens)) {
    throw new Error("LA Report retornou um contrato incompleto.");
  }
  if (!body.manifesto.sync_run_id || body.manifesto.snapshot_complete !== true) {
    throw new Error("LA Report retornou um snapshot sem prova de completude.");
  }
  if (Number(body.manifesto.total_linhas) !== body.itens.length) {
    throw new Error("Quantidade de itens diverge do manifesto.");
  }
  if (syncRunId && body.manifesto.sync_run_id !== syncRunId) {
    throw new Error("LA Report exportou um sync_run diferente do solicitado.");
  }
  if (requireLatest) {
    if (!body.manifesto.latest_complete_sync_run_id) {
      throw new Error("latest_complete_sync_run_id obrigatorio para validar frescor.");
    }
    if (body.manifesto.latest_complete_sync_run_id !== body.manifesto.sync_run_id) {
      throw new Error("Um snapshot mais novo foi publicado. Execute uma nova conferencia.");
    }
  }
  return body as SourceResponse;
}

function normalizeDescription(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mappedStatus(item: SourceItem) {
  if (item.source_missing === true) return "revisar";
  switch (String(item.status_origem ?? "").trim().toLowerCase()) {
    case "paga":
    case "pago":
      return "recebido";
    case "aberta":
    case "pendente":
      return "pendente";
    case "cancelada":
    case "cancelado":
      return "cancelado";
    default:
      return "revisar";
  }
}

function buildPreflight(
  source: SourceResponse,
  options: {
    preflightId: string | null;
    refreshOk: boolean;
    refreshError?: string | null;
  },
) {
  const classificacao = {
    mensalidades: 0,
    matriculas_passaportes: 0,
    locacoes: 0,
    rateios_excluidos: 0,
    pendentes_manuais: 0,
  };
  const resumo = {
    recebido: 0,
    em_aberto: 0,
    em_revisao: 0,
    excluido_rateio: 0,
    cancelado: 0,
  };

  for (const item of source.itens) {
    const descricao = normalizeDescription(item.descricao);
    const rateio = /rateio/.test(descricao);
    if (/^\s*parcela/.test(descricao)) classificacao.mensalidades += 1;
    else if (/(passaporte|matricula)/.test(descricao)) classificacao.matriculas_passaportes += 1;
    else if (/locacao/.test(descricao)) classificacao.locacoes += 1;
    else if (rateio) classificacao.rateios_excluidos += 1;
    else classificacao.pendentes_manuais += 1;

    if (rateio) {
      resumo.excluido_rateio += money(item.valor_liquido);
      continue;
    }
    switch (mappedStatus(item)) {
      case "recebido":
        resumo.recebido += money(item.valor_pago);
        break;
      case "pendente":
        resumo.em_aberto += money(item.valor_liquido);
        break;
      case "cancelado":
        resumo.cancelado += money(item.valor_liquido);
        break;
      default:
        resumo.em_revisao += money(item.valor_liquido);
    }
  }

  for (const key of Object.keys(resumo) as Array<keyof typeof resumo>) {
    resumo[key] = Number(resumo[key].toFixed(2));
  }

  return {
    success: true,
    action: "preflight",
    preflight_id: options.preflightId,
    apply_allowed: options.refreshOk && Boolean(options.preflightId),
    refresh_ok: options.refreshOk,
    refresh_error: options.refreshError ?? null,
    manifesto: source.manifesto,
    classificacao,
    resumo,
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
    if (!["preflight", "apply"].includes(action)) {
      throw new Error("action deve ser preflight ou apply.");
    }
    const competencia = validateCompetencia(payload?.competencia);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const sourceUrl = await getSecret(admin, "LA_REPORT_CONTAS_RECEBER_URL");
    const sourceSecret = await getSecret(admin, "LA_REPORT_CONTAS_RECEBER_SECRET");

    if (action === "preflight") {
      const refreshUrl = await getSecret(admin, "LA_REPORT_CONTAS_RECEBER_REFRESH_URL");
      try {
        const refresh = await refreshLaReport(refreshUrl, sourceSecret, competencia);
        const source = await readLaReport(
          sourceUrl,
          sourceSecret,
          competencia,
          refresh.sync_run_id,
          true,
        );
        const { data: proof, error: proofError } = await admin.rpc(
          "contas_receber_preflight_registrar",
          {
            p_user_id: userData.user.id,
            p_competencia: competencia,
            p_sync_run_id: refresh.sync_run_id,
            p_manifest_hash: source.manifesto.manifest_hash,
          },
        );
        if (proofError) throw proofError;
        const preflightId = String(proof?.id ?? "").trim();
        if (!preflightId) throw new Error("Nao foi possivel persistir a prova do preflight.");
        return json(buildPreflight(source, { preflightId, refreshOk: true }));
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
        const fallback = await readLaReport(sourceUrl, sourceSecret, competencia);
        return json(buildPreflight(fallback, {
          preflightId: null,
          refreshOk: false,
          refreshError: message,
        }));
      }
    }

    const preflight_id_esperado = String(payload?.preflight_id_esperado ?? "").trim();
    if (!preflight_id_esperado) {
      throw new Error("preflight_id_esperado obrigatorio para aplicar.");
    }
    const { data: proof, error: proofError } = await admin.rpc(
      "contas_receber_preflight_obter",
      { p_preflight_id: preflight_id_esperado, p_user_id: userData.user.id },
    );
    if (proofError) throw proofError;
    if (!proof?.sync_run_id || !proof?.manifest_hash) {
      throw new Error("Prova de preflight invalida ou expirada.");
    }
    if (proof.competencia !== competencia) {
      throw new Error("Prova de preflight pertence a outra competencia.");
    }
    if (proof?.consumed_result) {
      return json({
        success: true,
        action: "apply",
        resultado: { ...proof.consumed_result, idempotent_retry: true },
        idempotent_retry: true,
      });
    }

    const source = await readLaReport(
      sourceUrl,
      sourceSecret,
      competencia,
      proof.sync_run_id,
      true,
    );
    if (source.manifesto.manifest_hash !== proof.manifest_hash) {
      return json({
        success: false,
        error: "A origem mudou depois do preflight. Revise os novos numeros antes de aplicar.",
      }, 409);
    }

    const { data, error } = await admin.rpc("contas_receber_sync_aplicar", {
      p_preflight_id: preflight_id_esperado,
      p_user_id: userData.user.id,
      p_competencia: competencia,
      p_sync_run_id: proof.sync_run_id,
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
