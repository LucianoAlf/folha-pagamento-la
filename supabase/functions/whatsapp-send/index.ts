import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  throw new Error(`${name} não configurado (Secrets ou Vault).`);
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

    // Auth manual (verify_jwt=false no gateway)
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader) return json({ success: false, error: "Authorization ausente." }, 401);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "JWT inválido." }, 401);
    }

    const { numero, mensagem } = await req.json().catch(() => ({}));
    if (!numero || !mensagem) {
      return json({ success: false, error: "numero e mensagem são obrigatórios." }, 400);
    }

    const uazapiUrl = await getSecret(supabaseAdmin, "UAZAPI_URL");
    const uazapiToken = await getSecret(supabaseAdmin, "UAZAPI_TOKEN");

    const numeroLimpo = String(numero).replace(/\D/g, "");
    if (!numeroLimpo) return json({ success: false, error: "Número inválido." }, 400);

    const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: uazapiToken,
      },
      body: JSON.stringify({ number: numeroLimpo, text: String(mensagem) }),
    });

    const raw = await res.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = { raw };
    }

    if (!res.ok) {
      console.error("❌ UAZAPI error:", parsed);
      return json({ success: false, error: parsed?.message || `Erro UAZAPI (${res.status})`, details: parsed }, 502);
    }

    return json({
      success: true,
      message_id: parsed?.message_id || parsed?.id || null,
      result: parsed,
    });
  } catch (e: any) {
    console.error("❌ whatsapp-send:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});

