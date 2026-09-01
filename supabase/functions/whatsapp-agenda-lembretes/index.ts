import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { planejarEnvios, type LinhaDevida } from "../_shared/agendaLembretes.ts";

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const cronSecret = await getSecret(supabase, "WHATSAPP_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (!headerSecret || headerSecret !== cronSecret) {
      return json({ success: false, error: "Não autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;

    const uazapiUrl = await getSecret(supabase, "UAZAPI_URL");
    const uazapiToken = await getSecret(supabase, "UAZAPI_TOKEN");

    // Multiusuario: uma linha por (tarefa com hora, destinatario). Cascata e janela de silencio
    // vivem no banco (agenda_destinatarios / agenda_momento_lembrete) — aqui so entrega.
    const agora = new Date();
    const horizonMs = force ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const ate = new Date(agora.getTime() + horizonMs).toISOString();

    const { data: linhas, error: linhasErr } = await supabase.rpc("agenda_lembretes_devidos", { p_ate: ate });
    if (linhasErr) throw linhasErr;

    const { envios, skipped: skippedPlano } = planejarEnvios((linhas || []) as LinhaDevida[], agora, force);

    let enviados = 0;
    let erros = 0;
    let skipped = skippedPlano;

    for (const envio of envios) {
      try {
        // log + idempotencia por (canal, tipo, tarefa, scheduled_for, destinatario)
        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: envio.user_id,
            tarefa_id: envio.tarefa_id,
            canal: "whatsapp",
            tipo: "lembrete",
            scheduled_for: envio.scheduled_for,
            destinatario: envio.numero,
            mensagem: envio.mensagem,
            status: "pendente",
          })
          .select("id")
          .single();

        if (logErr) {
          if ((logErr as any).code === "23505") { skipped++; continue; }   // ja enviado a este destinatario
          throw logErr;
        }

        const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: uazapiToken },
          body: JSON.stringify({ number: envio.numero, text: envio.mensagem }),
        });
        const raw = await res.text();
        let parsed: any = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }

        if (res.ok) {
          await supabase.from("lembretes_log").update({
            status: "enviado",
            enviado_em: new Date().toISOString(),
            provider_message_id: parsed?.message_id || parsed?.id || null,
          }).eq("id", logEntry.id);
          enviados++;
        } else {
          await supabase.from("lembretes_log").update({
            status: "falhou",
            erro: parsed?.message || `Erro UAZAPI (${res.status})`,
          }).eq("id", logEntry.id);
          erros++;
        }
      } catch (e: any) {
        console.error("whatsapp-agenda-lembretes: envio", envio.tarefa_id, envio.user_id, e?.message || e);
        erros++;
      }
    }

    return json({ success: true, enviados, erros, skipped, candidatos: (linhas || []).length }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-lembretes:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});

