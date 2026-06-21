import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { adminClient } = await requireRhAdminContext(req);

    const payload = await req.json().catch(() => ({}));
    const credencialId = String(payload?.credencial_id || "").trim();
    const senha = String(payload?.senha || "");

    if (!credencialId) {
      return jsonResponse({ error: "credencial_id is required" }, 400);
    }
    if (!senha) {
      return jsonResponse({ error: "senha is required" }, 400);
    }

    const { data: credencial, error: credErr } = await adminClient
      .from("contas_credenciais")
      .select("id")
      .eq("id", credencialId)
      .maybeSingle();

    if (credErr) {
      return jsonResponse({ error: credErr.message }, 500);
    }
    if (!credencial) {
      return jsonResponse({ error: "Credencial não encontrada" }, 404);
    }

    const secretName = `contas_credenciais/${credencialId}`;
    const { error: vaultErr } = await adminClient.rpc("set_vault_secret", {
      secret_name: secretName,
      secret_value: senha,
    });

    if (vaultErr) {
      return jsonResponse({ error: vaultErr.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    const status = message.includes("Authorization") || message.includes("token") || message.includes("Acesso restrito")
      ? 403
      : 500;
    return jsonResponse({ error: message }, status);
  }
});
