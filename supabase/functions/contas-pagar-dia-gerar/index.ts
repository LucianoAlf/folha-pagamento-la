import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { gerarRelatorioContasDia } from "../_shared/relatorioContasDia.ts";

// Este gerador le contas existentes; recorrentes do mes sao materializadas quando o time
// abre a tela de Contas a Pagar. Materializar no servidor fica para um passo futuro.

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
  throw new Error(`${name} nao configurado (Secrets ou Vault).`);
}

function hojeSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeDataRef(value: unknown) {
  const dataRef = String(value || hojeSaoPaulo()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
    throw new Error("dataRef invalida. Use YYYY-MM-DD.");
  }
  return dataRef;
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

    const cronSecretHeader = (req.headers.get("x-cron-secret") || "").trim();
    let chamadaServico = false;
    if (cronSecretHeader) {
      const cronSecret = await getSecret(supabaseAdmin, "WHATSAPP_CRON_SECRET");
      if (cronSecretHeader !== cronSecret) {
        return json({ success: false, error: "cron secret invalido." }, 401);
      }
      chamadaServico = true;
    }

    if (!chamadaServico) {
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
    }

    const payload = await req.json().catch(() => ({}));
    const dataRef = normalizeDataRef(payload?.dataRef);
    const unidadeFiltro = payload?.unidadeFiltro ? String(payload.unidadeFiltro) : "todas";

    const result = await gerarRelatorioContasDia(supabaseAdmin, {
      dataRef,
      unidadeFiltro,
    });

    return json({
      success: true,
      data_referencia: dataRef,
      count: result.count,
      conta_ids: result.conta_ids,
      mensagem: result.mensagem,
    });
  } catch (e: any) {
    console.error("contas-pagar-dia-gerar:", e?.message || "Erro inesperado.");
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
