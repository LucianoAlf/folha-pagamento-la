import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureRecorrentesInstancias } from "../_shared/recorrentesMes.ts";
import { nowSaoPaulo } from "../_shared/whatsappGrupoDispatcher.ts";

type SupabaseClient = ReturnType<typeof createClient>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSecretFromVault(
  supabaseAdmin: SupabaseClient,
  name: string,
) {
  const { data, error } = await supabaseAdmin.rpc("get_vault_secret", {
    secret_name: name,
  });
  if (error) throw error;
  return (data as any) as string | null;
}

async function getSecret(
  supabaseAdmin: SupabaseClient,
  name: string,
) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} nao configurado (Secrets ou Vault).`);
}

async function authenticate(
  req: Request,
  supabaseAdmin: SupabaseClient,
  supabaseUrl: string,
  supabaseAnonKey: string,
) {
  const cronSecretHeader = (req.headers.get("x-cron-secret") || "").trim();
  if (cronSecretHeader) {
    const cronSecret = await getSecret(supabaseAdmin, "WHATSAPP_CRON_SECRET");
    if (cronSecretHeader !== cronSecret) {
      return json({ success: false, error: "cron secret invalido." }, 401);
    }
    return null;
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
  return null;
}

function normalizeCompetencia(value: unknown): string {
  const fallback = nowSaoPaulo().date.slice(0, 7);
  const raw = String(value || fallback).trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) throw new Error("competencia invalida. Use YYYY-MM ou YYYY-MM-DD.");
  return `${match[1]}-${match[2]}`;
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const authResponse = await authenticate(req, supabaseAdmin, supabaseUrl, supabaseAnonKey);
    if (authResponse) return authResponse;

    const payload = await req.json().catch(() => ({}));
    const competencia = normalizeCompetencia(payload?.competencia);
    const result = await ensureRecorrentesInstancias(supabaseAdmin, competencia);

    return json({
      success: true,
      competencia,
      criadas: result.criadas,
    });
  } catch (e: any) {
    console.error("recorrentes-materializar-mes:", e?.message || "Erro inesperado.");
    const message = e?.message || "Erro inesperado.";
    const status = message.includes("competencia invalida") ? 400 : 500;
    return json({ success: false, error: message }, status);
  }
});
