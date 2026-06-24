import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSecretFromVault(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string,
) {
  const { data, error } = await supabaseAdmin.rpc("get_vault_secret", {
    secret_name: name,
  });
  if (error) throw error;
  return (data as any) as string | null;
}

async function getSecret(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string,
) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} nao configurado (Secrets ou Vault).`);
}

type UazapiGroup = {
  JID?: unknown;
  Name?: unknown;
};

function sanitizeGroups(groups: unknown) {
  if (!Array.isArray(groups)) return [];

  return groups
    .map((group: UazapiGroup) => ({
      jid: String(group.JID || "").trim(),
      nome: String(group.Name || "").trim(),
    }))
    .filter((group) => group.jid);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader) return json({ success: false, error: "Authorization ausente." }, 401);

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "JWT invalido." }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const uazapiUrl = await getSecret(supabaseAdmin, "UAZAPI_URL");
    const uazapiToken = await getSecret(supabaseAdmin, "UAZAPI_TOKEN");

    const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/group/list?force=true&noparticipants=true`, {
      method: "GET",
      headers: { token: uazapiToken },
    });

    const raw = await res.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return json({ success: false, error: parsed?.message || `Erro UAZAPI (${res.status})` }, 502);
    }

    const grupos = sanitizeGroups(parsed?.groups);
    console.log("whatsapp-grupos-disponiveis:", grupos.length, "grupos");
    return json({ success: true, grupos });
  } catch (e: any) {
    console.error("whatsapp-grupos-disponiveis:", e?.message || "Erro inesperado.");
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
