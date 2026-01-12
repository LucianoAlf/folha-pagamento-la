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

const TZ = "America/Sao_Paulo";

function spParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    yyyy: get("year"),
    mm: get("month"),
    dd: get("day"),
    hh: get("hour"),
    min: get("minute"),
  };
}

function spDateString(date = new Date()) {
  const p = spParts(date);
  return `${p.yyyy}-${p.mm}-${p.dd}`;
}

function parseTimeToHHMM(value: any) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { hh: 8, mm: 0 };
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

function scheduledForIsoSp(dateStr: string, hh: number, mm: number) {
  const iso = `${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return new Date(iso).toISOString();
}

function withinWindow(now: Date, targetIso: string, minutesWindow = 10) {
  const target = new Date(targetIso).getTime();
  const t0 = target;
  const t1 = target + minutesWindow * 60 * 1000;
  const n = now.getTime();
  return n >= t0 && n <= t1;
}

function monthNamePt(month: number) {
  const m = Math.max(1, Math.min(12, month));
  const names = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return names[m - 1];
}

async function sendWhatsApp(
  uazapiUrl: string,
  uazapiToken: string,
  number: string,
  text: string,
) {
  const resp = await fetch(`${uazapiUrl}/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": uazapiToken,
    },
    body: JSON.stringify({ number, text }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
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
        [
          "user_id",
          "whatsapp_numero",
          "whatsapp_ativo",
          "folha_alerta_fechamento_ativo",
          "folha_alerta_fechamento_dia",
          "folha_alerta_aprovacao_pendente_ativo",
        ].join(","),
      )
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg?.whatsapp_numero) {
      return json({ success: true, message: "WhatsApp não configurado.", enviados: 0 }, 200);
    }

    const userId = (cfg as any)?.user_id ?? null;
    const numeroWhatsApp = String(cfg.whatsapp_numero).replace(/\D/g, "");

    const now = new Date();
    const dateStr = spDateString(now); // yyyy-mm-dd SP
    const sp = spParts(now);
    const diaMes = Number(sp.dd) || 0;

    // Horário fixo (premium UX: simples). Mantemos 08:00 SP como padrão operacional.
    const { hh, mm } = parseTimeToHHMM("08:00");
    const scheduledFor = scheduledForIsoSp(dateStr, hh, mm);

    if (!force && !withinWindow(now, scheduledFor, 12)) {
      return json({ success: true, message: "Fora da janela do envio.", enviados: 0 }, 200);
    }

    let enviados = 0;
    let ignorados = 0;
    let erros = 0;

    // ==============
    // 1) Fechamento
    // ==============
    const fechamentoAtivo = !!(cfg as any)?.folha_alerta_fechamento_ativo;
    const fechamentoDia = Number((cfg as any)?.folha_alerta_fechamento_dia ?? 25) || 25;

    if (fechamentoAtivo && diaMes === fechamentoDia) {
      // Pegamos a folha mais recente como contexto
      const { data: folha, error: fErr } = await supabase
        .from("folhas_mensais")
        .select("id,ano,mes,status,total_geral,updated_at")
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fErr) throw fErr;

      const label = folha
        ? `${monthNamePt(Number((folha as any).mes))} ${(folha as any).ano}`
        : "mês atual";
      const status = folha?.status ? String((folha as any).status) : "—";

      const msg =
        `🧾 *FOLHA DE PAGAMENTO*\n` +
        `📅 Hoje é dia ${fechamentoDia} — *fechamento da Folha*\n\n` +
        `• Referência: ${label}\n` +
        `• Status: ${status}\n\n` +
        `_LA Music - Folha de Pagamento_`;

      const tipo = "folha_alerta_fechamento";
      const { data: logEntry, error: logErr } = await supabase
        .from("lembretes_log")
        .insert({
          user_id: userId,
          canal: "whatsapp",
          tipo,
          scheduled_for: scheduledFor,
          destinatario: numeroWhatsApp,
          mensagem: msg,
          status: "pendente",
        })
        .select("id")
        .single();

      if (logErr) {
        if ((logErr as any)?.code === "23505") {
          ignorados++;
        } else {
          throw logErr;
        }
      } else {
        const res = await sendWhatsApp(uazapiUrl, uazapiToken, numeroWhatsApp, msg);
        if (res.ok) {
          await supabase
            .from("lembretes_log")
            .update({
              status: "enviado",
              enviado_em: new Date().toISOString(),
              provider_message_id: String((res.data as any)?.message_id || (res.data as any)?.id || ""),
            })
            .eq("id", (logEntry as any).id);
          enviados++;
        } else {
          await supabase
            .from("lembretes_log")
            .update({
              status: "falhou",
              erro: JSON.stringify({ status: res.status, data: res.data }).slice(0, 1200),
            })
            .eq("id", (logEntry as any).id);
          erros++;
        }
      }
    }

    // ==========================
    // 2) Aprovação pendente
    // ==========================
    const aprovacaoAtivo = !!(cfg as any)?.folha_alerta_aprovacao_pendente_ativo;
    if (aprovacaoAtivo) {
      const { data: pendentes, error: pErr } = await supabase
        .from("folhas_mensais")
        .select("id,ano,mes,status,total_geral")
        .eq("status", "pendente")
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(6);
      if (pErr) throw pErr;

      if ((pendentes || []).length) {
        let msg =
          `⚠️ *FOLHA PENDENTE DE APROVAÇÃO*\n\n` +
          `Encontrei ${(pendentes || []).length} mês(es) com status *pendente*:\n`;
        for (const f of (pendentes || []) as any[]) {
          msg += `• ${monthNamePt(Number(f.mes))} ${f.ano}\n`;
        }
        msg += `\n_LA Music - Folha de Pagamento_`;

        const tipo = "folha_alerta_aprovacao_pendente";
        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            canal: "whatsapp",
            tipo,
            scheduled_for: scheduledFor,
            destinatario: numeroWhatsApp,
            mensagem: msg,
            status: "pendente",
          })
          .select("id")
          .single();

        if (logErr) {
          if ((logErr as any)?.code === "23505") {
            ignorados++;
          } else {
            throw logErr;
          }
        } else {
          const res = await sendWhatsApp(uazapiUrl, uazapiToken, numeroWhatsApp, msg);
          if (res.ok) {
            await supabase
              .from("lembretes_log")
              .update({
                status: "enviado",
                enviado_em: new Date().toISOString(),
                provider_message_id: String((res.data as any)?.message_id || (res.data as any)?.id || ""),
              })
              .eq("id", (logEntry as any).id);
            enviados++;
          } else {
            await supabase
              .from("lembretes_log")
              .update({
                status: "falhou",
                erro: JSON.stringify({ status: res.status, data: res.data }).slice(0, 1200),
              })
              .eq("id", (logEntry as any).id);
            erros++;
          }
        }
      }
    }

    return json({ success: true, enviados, ignorados, erros, scheduled_for: scheduledFor }, 200);
  } catch (e: any) {
    return json(
      {
        success: false,
        error: e?.message || String(e),
        hint: "Verifique WHATSAPP_CRON_SECRET (Vault), UAZAPI_URL/UAZAPI_TOKEN e as flags da Folha em notificacao_config.",
      },
      500,
    );
  }
});

