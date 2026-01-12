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
  // time columns may come as "08:00:00"
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { hh: 8, mm: 0 };
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

function scheduledForIsoSp(dateStr: string, hh: number, mm: number) {
  // SP sem DST atualmente; usamos offset -03:00
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

function addDaysSp(dateStr: string, days: number) {
  const base = new Date(`${dateStr}T00:00:00-03:00`);
  base.setDate(base.getDate() + days);
  return spDateString(base);
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = String(dateStr || "").split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

function formatMoneyBRL(value: number) {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

function spWeekdayKey(date = new Date()): string {
  // Using fixed mapping to our keys
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(date);
  const map: Record<string, string> = {
    Mon: "segunda",
    Tue: "terca",
    Wed: "quarta",
    Thu: "quinta",
    Fri: "sexta",
    Sat: "sabado",
    Sun: "domingo",
  };
  return map[short] || "segunda";
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
          "contas_alerta_3d",
          "contas_alerta_1d",
          "contas_alerta_no_dia",
          "contas_alerta_hora",
          "contas_resumo_semanal_ativo",
          "contas_resumo_semanal_dia",
          "contas_resumo_semanal_hora",
        ].join(","),
      )
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg?.whatsapp_numero) {
      return json({ success: true, message: "Nenhuma configuração ativa.", enviados: 0 }, 200);
    }

    const numeroWhatsApp = String(cfg.whatsapp_numero).replace(/\D/g, "");
    const userId = (cfg as any)?.user_id ?? null;

    const now = new Date();
    const today = spDateString(now);
    const weekday = spWeekdayKey(now);

    let enviados = 0;
    let ignorados = 0;
    let erros = 0;

    // ============================================
    // ALERTAS (3d / 1d / no dia)
    // ============================================
    const { hh: alertHh, mm: alertMm } = parseTimeToHHMM((cfg as any)?.contas_alerta_hora || "08:00");
    const scheduledAlerts = scheduledForIsoSp(today, alertHh, alertMm);

    const shouldRunAlerts =
      force || withinWindow(now, scheduledAlerts, 12);

    if (shouldRunAlerts) {
      const d0 = today;
      const d1 = addDaysSp(today, 1);
      const d3 = addDaysSp(today, 3);
      const dueDates = [d0, d1, d3];

      const { data: contas, error: contasErr } = await supabase
        .from("contas_pagar")
        .select("id,descricao,valor,unidade,data_vencimento,status")
        .eq("status", "pendente")
        .in("data_vencimento", dueDates)
        .order("data_vencimento", { ascending: true });
      if (contasErr) throw contasErr;

      const ids = (contas || []).map((c: any) => c.id).filter(Boolean);

      const overridesByConta: Record<string, any> = {};
      if (ids.length && userId) {
        const { data: ov, error: ovErr } = await supabase
          .from("contas_pagar_notificacoes")
          .select("conta_pagar_id,alerta_3d,alerta_1d,alerta_no_dia")
          .eq("user_id", userId)
          .in("conta_pagar_id", ids);
        if (ovErr) throw ovErr;
        (ov || []).forEach((r: any) => {
          if (r?.conta_pagar_id) overridesByConta[String(r.conta_pagar_id)] = r;
        });
      }

      for (const c of (contas || []) as any[]) {
        const contaId = String(c.id);
        const venc = String(c.data_vencimento);
        const is0 = venc === d0;
        const is1 = venc === d1;
        const is3 = venc === d3;

        const tipo = is3
          ? "contas_alerta_3d"
          : is1
          ? "contas_alerta_1d"
          : is0
          ? "contas_alerta_no_dia"
          : null;
        if (!tipo) continue;

        const override = overridesByConta[contaId] || null;
        const enabled =
          tipo === "contas_alerta_3d"
            ? (override?.alerta_3d ?? (cfg as any)?.contas_alerta_3d)
            : tipo === "contas_alerta_1d"
            ? (override?.alerta_1d ?? (cfg as any)?.contas_alerta_1d)
            : (override?.alerta_no_dia ?? (cfg as any)?.contas_alerta_no_dia);

        if (!enabled) {
          ignorados++;
          continue;
        }

        const valor = Number(c.valor) || 0;
        const unidade = String(c.unidade || "").toUpperCase();
        const whenLabel = tipo === "contas_alerta_3d"
          ? "Faltam 3 dias"
          : tipo === "contas_alerta_1d"
          ? "Falta 1 dia"
          : "Vence hoje";

        const msg =
          `🔔 *CONTA A PAGAR*\n` +
          `⏳ ${whenLabel}\n\n` +
          `• ${String(c.descricao || "").trim()}\n` +
          `• Valor: ${formatMoneyBRL(valor)}\n` +
          `• Vencimento: ${formatDateBR(venc)}\n` +
          (unidade ? `• Unidade: ${unidade}\n` : "") +
          `\n_LA Music - Contas a Pagar_`;

        // Log primeiro (idempotência)
        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            canal: "whatsapp",
            tipo,
            scheduled_for: scheduledAlerts,
            destinatario: numeroWhatsApp,
            mensagem: msg,
            status: "pendente",
            conta_pagar_id: contaId,
          })
          .select("id")
          .single();

        if (logErr) {
          // Unique violation => já enviado
          if ((logErr as any)?.code === "23505") {
            ignorados++;
            continue;
          }
          throw logErr;
        }

        const sendRes = await sendWhatsApp(uazapiUrl, uazapiToken, numeroWhatsApp, msg);
        if (sendRes.ok) {
          await supabase
            .from("lembretes_log")
            .update({
              status: "enviado",
              enviado_em: new Date().toISOString(),
              provider_message_id: String((sendRes.data as any)?.message_id || (sendRes.data as any)?.id || ""),
            })
            .eq("id", (logEntry as any).id);
          enviados++;
        } else {
          await supabase
            .from("lembretes_log")
            .update({
              status: "falhou",
              erro: JSON.stringify({ status: sendRes.status, data: sendRes.data }).slice(0, 1200),
            })
            .eq("id", (logEntry as any).id);
          erros++;
        }
      }
    }

    // ============================================
    // RESUMO SEMANAL
    // ============================================
    const weeklyActive = !!(cfg as any)?.contas_resumo_semanal_ativo;
    const weeklyDay = String((cfg as any)?.contas_resumo_semanal_dia || "segunda");
    const { hh: wHh, mm: wMm } = parseTimeToHHMM((cfg as any)?.contas_resumo_semanal_hora || "08:00");
    const scheduledWeekly = scheduledForIsoSp(today, wHh, wMm);

    const shouldRunWeekly =
      weeklyActive && (force || (weekday === weeklyDay && withinWindow(now, scheduledWeekly, 12)));

    if (shouldRunWeekly) {
      // Idempotência
      const { data: existing, error: exErr } = await supabase
        .from("lembretes_log")
        .select("id")
        .eq("canal", "whatsapp")
        .eq("tipo", "contas_resumo_semanal")
        .eq("scheduled_for", scheduledWeekly)
        .eq("destinatario", numeroWhatsApp)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing?.id) {
        const start = today;
        const end = addDaysSp(today, 7);

        const { data: pendentesSemana, error: psErr } = await supabase
          .from("contas_pagar")
          .select("id,descricao,valor,unidade,data_vencimento,status")
          .eq("status", "pendente")
          .gte("data_vencimento", start)
          .lte("data_vencimento", end)
          .order("data_vencimento", { ascending: true });
        if (psErr) throw psErr;

        const { data: vencidas, error: vErr } = await supabase
          .from("contas_pagar")
          .select("id,descricao,valor,unidade,data_vencimento,status")
          .eq("status", "pendente")
          .lt("data_vencimento", start)
          .order("data_vencimento", { ascending: true });
        if (vErr) throw vErr;

        const totalSemana = (pendentesSemana || []).reduce((s: number, c: any) => s + (Number(c?.valor) || 0), 0);
        const totalVencidas = (vencidas || []).reduce((s: number, c: any) => s + (Number(c?.valor) || 0), 0);

        let msg =
          `📊 *RESUMO SEMANAL — CONTAS A PAGAR*\n` +
          `📅 ${formatDateBR(start)} → ${formatDateBR(end)}\n\n` +
          `• Pendentes (7 dias): ${(pendentesSemana || []).length} — ${formatMoneyBRL(totalSemana)}\n` +
          `• Vencidas: ${(vencidas || []).length} — ${formatMoneyBRL(totalVencidas)}\n\n`;

        if ((pendentesSemana || []).length) {
          msg += `🔎 *Próximas:*\n`;
          for (const c of (pendentesSemana || []).slice(0, 6) as any[]) {
            msg += `• ${formatDateBR(String(c.data_vencimento))} — ${String(c.descricao || "").trim()} (${formatMoneyBRL(Number(c.valor) || 0)})\n`;
          }
          if ((pendentesSemana || []).length > 6) {
            msg += `_… e mais ${(pendentesSemana || []).length - 6}_\n`;
          }
          msg += `\n`;
        }

        if ((vencidas || []).length) {
          msg += `⚠️ *Vencidas (top 3):*\n`;
          for (const c of (vencidas || []).slice(0, 3) as any[]) {
            msg += `• ${formatDateBR(String(c.data_vencimento))} — ${String(c.descricao || "").trim()} (${formatMoneyBRL(Number(c.valor) || 0)})\n`;
          }
          msg += `\n`;
        }

        msg += `_LA Music - Contas a Pagar_`;

        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            canal: "whatsapp",
            tipo: "contas_resumo_semanal",
            scheduled_for: scheduledWeekly,
            destinatario: numeroWhatsApp,
            mensagem: msg,
            status: "pendente",
          })
          .select("id")
          .single();

        if (logErr) {
          if ((logErr as any)?.code === "23505") {
            // outro worker/cron enviou
          } else {
            throw logErr;
          }
        } else {
          const sendRes = await sendWhatsApp(uazapiUrl, uazapiToken, numeroWhatsApp, msg);
          if (sendRes.ok) {
            await supabase
              .from("lembretes_log")
              .update({
                status: "enviado",
                enviado_em: new Date().toISOString(),
                provider_message_id: String((sendRes.data as any)?.message_id || (sendRes.data as any)?.id || ""),
              })
              .eq("id", (logEntry as any).id);
            enviados++;
          } else {
            await supabase
              .from("lembretes_log")
              .update({
                status: "falhou",
                erro: JSON.stringify({ status: sendRes.status, data: sendRes.data }).slice(0, 1200),
              })
              .eq("id", (logEntry as any).id);
            erros++;
          }
        }
      }
    }

    return json({
      success: true,
      enviados,
      ignorados,
      erros,
      scheduledAlerts,
      scheduledWeekly,
    }, 200);
  } catch (e: any) {
    return json(
      {
        success: false,
        error: e?.message || String(e),
        hint: "Verifique WHATSAPP_CRON_SECRET (Vault), UAZAPI_URL/UAZAPI_TOKEN e as configurações em notificacao_config.",
      },
      500,
    );
  }
});

