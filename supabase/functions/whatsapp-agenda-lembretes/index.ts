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

const prioridadeEmoji: Record<string, string> = {
  baixa: "⬇️",
  media: "➡️",
  alta: "⚠️",
  urgente: "🔴",
};

const categoriaEmoji: Record<string, string> = {
  financeiro: "💰",
  rh: "👩‍💼",
  administrativo: "📋",
  pessoal: "🏠",
  geral: "📌",
};

function formatHoraPtBR(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatLembrete(tarefa: any) {
  const p = String(tarefa?.prioridade || "media");
  const c = String(tarefa?.categoria || "geral");
  const emoji = prioridadeEmoji[p] || "📋";
  const cat = categoriaEmoji[c] || "📌";
  const hora = tarefa?.vencimento_em ? formatHoraPtBR(tarefa.vencimento_em) : "";

  let msg = `🔔 *LEMBRETE*\n\n${emoji} *${tarefa?.titulo || "Tarefa"}*\n\n`;
  msg += `${cat} ${(c || "geral").toUpperCase()}\n`;
  msg += `⏰ ${hora ? `Vence às ${hora}` : "Hoje"}\n`;
  if (tarefa?.descricao) msg += `\n📝 ${tarefa.descricao}\n`;
  msg += `\n_LA Music - Agenda_`;
  return msg;
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

    // Somente Ana (primeira config ativa)
    const { data: cfg, error: cfgErr } = await supabase
      .from("notificacao_config")
      .select(
        "user_id, whatsapp_numero, whatsapp_ativo, lembrete_padrao_minutos, agenda_lembrete_tarefas_ativo",
      )
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg?.whatsapp_numero) {
      return json({ success: true, message: "WhatsApp não configurado.", enviados: 0, erros: 0 }, 200);
    }
    if ((cfg as any)?.agenda_lembrete_tarefas_ativo === false) {
      return json({ success: true, message: "Lembretes da Agenda desativados.", enviados: 0, erros: 0 }, 200);
    }
    const numeroWhatsApp = String(cfg.whatsapp_numero).replace(/\D/g, "");
    const userId = cfg.user_id || null;
    const defaultMin = Number(cfg.lembrete_padrao_minutos ?? 30) || 30;

    const agora = new Date();
    const agoraISO = agora.toISOString();
    const horizonMs = force ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const limiteISO = new Date(agora.getTime() + horizonMs).toISOString();

    const { data: tarefas, error: tarefasErr } = await supabase
      .from("tarefas")
      .select("id,titulo,descricao,prioridade,categoria,vencimento_em,lembrete_minutos,status")
      .not("vencimento_em", "is", null)
      .in("status", ["pendente", "em_andamento"])
      .gte("vencimento_em", agoraISO)
      .lte("vencimento_em", limiteISO)
      .order("vencimento_em", { ascending: true });
    if (tarefasErr) throw tarefasErr;

    let enviados = 0;
    let erros = 0;
    let skipped = 0;

    for (const tarefa of tarefas || []) {
      try {
        const venc = new Date(tarefa.vencimento_em);
        const mins = Array.isArray(tarefa.lembrete_minutos) && tarefa.lembrete_minutos.length
          ? Number(tarefa.lembrete_minutos[0]) || defaultMin
          : defaultMin;
        const momento = new Date(venc.getTime() - mins * 60 * 1000);
        if (!force && agora < momento) {
          skipped++;
          continue;
        }

        const scheduledFor = momento.toISOString();
        const mensagem = formatLembrete(tarefa);

        // log + idempotência
        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            tarefa_id: tarefa.id,
            canal: "whatsapp",
            tipo: "lembrete",
            scheduled_for: scheduledFor,
            destinatario: numeroWhatsApp,
            mensagem,
            status: "pendente",
          })
          .select("id")
          .single();

        if (logErr) {
          // 23505: unique violation (já enviado/agendado)
          if ((logErr as any).code === "23505") {
            skipped++;
            continue;
          }
          throw logErr;
        }

        const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: uazapiToken,
          },
          body: JSON.stringify({ number: numeroWhatsApp, text: mensagem }),
        });

        const raw = await res.text();
        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = { raw };
        }

        if (res.ok) {
          await supabase
            .from("lembretes_log")
            .update({
              status: "enviado",
              enviado_em: new Date().toISOString(),
              provider_message_id: parsed?.message_id || parsed?.id || null,
            })
            .eq("id", logEntry.id);
          enviados++;
        } else {
          await supabase
            .from("lembretes_log")
            .update({
              status: "falhou",
              erro: parsed?.message || `Erro UAZAPI (${res.status})`,
            })
            .eq("id", logEntry.id);
          erros++;
        }
      } catch (e: any) {
        erros++;
      }
    }

    return json({ success: true, enviados, erros, skipped, total: (tarefas || []).length }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-lembretes:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});

