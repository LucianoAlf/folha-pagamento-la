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

function spParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    yyyy: get("year"),
    mm: get("month"),
    dd: get("day"),
    hh: get("hour"),
    min: get("minute"),
  };
}

function spDateString(now = new Date()) {
  const p = spParts(now);
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

function formatMoneyBRL(value: number) {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
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
        "user_id, whatsapp_numero, whatsapp_ativo, resumo_diario_ativo, resumo_diario_hora, resumo_semanal_ativo, resumo_semanal_dia, resumo_semanal_hora",
      )
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg?.whatsapp_numero) {
      return json({ success: true, message: "Nenhum resumo configurado.", enviados: 0 }, 200);
    }
    const numeroWhatsApp = String(cfg.whatsapp_numero).replace(/\D/g, "");
    const userId = cfg.user_id || null;

    const now = new Date();
    const dateStr = spDateString(now); // yyyy-mm-dd SP
    const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
    const weekdayKey: Record<string, string> = {
      Mon: "segunda",
      Tue: "terca",
      Wed: "quarta",
      Thu: "quinta",
      Fri: "sexta",
      Sat: "sabado",
      Sun: "domingo",
    };
    const todayKey = weekdayKey[weekdayShort] || "segunda";

    const dailyActive = !!(cfg as any)?.resumo_diario_ativo;
    const { hh: dhh, mm: dmm } = parseTimeToHHMM((cfg as any)?.resumo_diario_hora || "08:00");
    const scheduledDaily = scheduledForIsoSp(dateStr, dhh, dmm);

    const weeklyActive = !!(cfg as any)?.resumo_semanal_ativo;
    const weeklyDay = String((cfg as any)?.resumo_semanal_dia || "domingo");
    const { hh: whh, mm: wmm } = parseTimeToHHMM((cfg as any)?.resumo_semanal_hora || "20:00");
    const scheduledWeekly = scheduledForIsoSp(dateStr, whh, wmm);

    const shouldSendDaily = dailyActive && (force || withinWindow(now, scheduledDaily, 12));
    const shouldSendWeekly =
      weeklyActive && (force || (todayKey === weeklyDay && withinWindow(now, scheduledWeekly, 12)));

    if (!shouldSendDaily && !shouldSendWeekly) {
      return json({ success: true, message: "Fora da janela do envio.", enviados: 0 }, 200);
    }

    // Range do dia SP (00:00 -03 até 00:00 do dia seguinte)
    const startIso = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
    const next = new Date(`${dateStr}T00:00:00-03:00`);
    next.setDate(next.getDate() + 1);
    const endIso = next.toISOString();

    const diaSemana = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      weekday: "long",
    }).format(now);
    const dataFormatada = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      day: "2-digit",
      month: "long",
    }).format(now);

    let enviados = 0;

    // ===== Resumo diário =====
    if (shouldSendDaily) {
      const msgType = "resumo_diario";
      const { data: existing, error: exErr } = await supabase
        .from("lembretes_log")
        .select("id")
        .eq("canal", "whatsapp")
        .eq("tipo", msgType)
        .eq("scheduled_for", scheduledDaily)
        .eq("destinatario", numeroWhatsApp)
        .maybeSingle();
      if (exErr) throw exErr;

      if (!existing?.id) {
        const { data: tarefasHoje, error: thErr } = await supabase
          .from("tarefas")
          .select("id,titulo,prioridade,vencimento_em,status")
          .gte("vencimento_em", startIso)
          .lt("vencimento_em", endIso)
          .in("status", ["pendente", "em_andamento"])
          .order("vencimento_em", { ascending: true });
        if (thErr) throw thErr;

        const { data: atrasadas, error: atErr } = await supabase
          .from("tarefas")
          .select("id,titulo,prioridade,vencimento_em,status")
          .lt("vencimento_em", startIso)
          .in("status", ["pendente", "em_andamento"]);
        if (atErr) throw atErr;

        const { data: contasHoje, error: cErr } = await supabase
          .from("contas_pagar")
          .select("id,valor,status,data_vencimento")
          .eq("data_vencimento", dateStr)
          .eq("status", "pendente");
        const contas = cErr ? [] : (contasHoje || []);

        const totalContas = (contas as any[]).reduce(
          (sum, c) => sum + (Number((c as any)?.valor) || 0),
          0,
        );

        let msg = `☀️ *BOM DIA, ANA!*\n`;
        msg += `📅 ${diaSemana}, ${dataFormatada}\n\n`;
        msg += `📊 *SEU DIA:*\n`;
        msg += `• ${(tarefasHoje || []).length} tarefas para hoje\n`;
        msg += `• ${(atrasadas || []).length} atrasadas\n`;
        msg += `• ${(contas as any[]).length} contas vencendo\n\n`;

        if ((tarefasHoje || []).length) {
          msg += `📋 *TAREFAS (HOJE):*\n`;
          for (const t of (tarefasHoje || []).slice(0, 5)) {
            const hora = t.vencimento_em
              ? new Date(t.vencimento_em).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
              : "";
            const icon = t.prioridade === "urgente"
              ? "🔴"
              : t.prioridade === "alta"
              ? "⚠️"
              : "•";
            msg += `${icon} ${hora ? `${hora} - ` : ""}${t.titulo}\n`;
          }
          if ((tarefasHoje || []).length > 5) {
            msg += `_... e mais ${(tarefasHoje || []).length - 5}_\n`;
          }
          msg += `\n`;
        }

        if ((atrasadas || []).length) {
          msg += `⚠️ *ATRASADAS:*\n`;
          for (const t of (atrasadas || []).slice(0, 3)) {
            msg += `• ${t.titulo}\n`;
          }
          msg += `\n`;
        }

        if ((contas as any[]).length) {
          msg += `💰 *CONTAS HOJE:* ${formatMoneyBRL(totalContas)}\n\n`;
        }

        msg += `_LA Music - Agenda_`;

        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            canal: "whatsapp",
            tipo: msgType,
            scheduled_for: scheduledDaily,
            destinatario: numeroWhatsApp,
            mensagem: msg,
            status: "pendente",
          })
          .select("id")
          .single();
        if (logErr) {
          if ((logErr as any).code === "23505") {
            // race: alguém enviou
          } else {
            throw logErr;
          }
        } else {
          const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: uazapiToken },
            body: JSON.stringify({ number: numeroWhatsApp, text: msg }),
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
          }
        }
      }
    }

    // ===== Resumo semanal =====
    if (shouldSendWeekly) {
      const msgType = "resumo_semanal";
      const { data: existing, error: exErr } = await supabase
        .from("lembretes_log")
        .select("id")
        .eq("canal", "whatsapp")
        .eq("tipo", msgType)
        .eq("scheduled_for", scheduledWeekly)
        .eq("destinatario", numeroWhatsApp)
        .maybeSingle();
      if (exErr) throw exErr;

      if (!existing?.id) {
        const endDate = new Date(`${dateStr}T00:00:00-03:00`);
        endDate.setDate(endDate.getDate() + 7);
        const endStr = spDateString(endDate);
        const start7Iso = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
        const end7Iso = new Date(`${endStr}T00:00:00-03:00`).toISOString();

        const { data: tarefasSemana, error: tsErr } = await supabase
          .from("tarefas")
          .select("id,titulo,prioridade,vencimento_em,status")
          .gte("vencimento_em", start7Iso)
          .lt("vencimento_em", end7Iso)
          .in("status", ["pendente", "em_andamento"])
          .order("vencimento_em", { ascending: true });
        if (tsErr) throw tsErr;

        const { data: atrasadas, error: atErr } = await supabase
          .from("tarefas")
          .select("id,titulo,prioridade,vencimento_em,status")
          .lt("vencimento_em", startIso)
          .in("status", ["pendente", "em_andamento"]);
        if (atErr) throw atErr;

        const { data: contasSemana, error: cErr } = await supabase
          .from("contas_pagar")
          .select("id,valor,status,data_vencimento")
          .eq("status", "pendente")
          .gte("data_vencimento", dateStr)
          .lte("data_vencimento", endStr);
        const contas = cErr ? [] : (contasSemana || []);
        const totalContas = (contas as any[]).reduce(
          (sum, c) => sum + (Number((c as any)?.valor) || 0),
          0,
        );

        let msg = `📊 *RESUMO SEMANAL — AGENDA*\n`;
        msg += `📅 ${diaSemana}, ${dataFormatada}\n\n`;
        msg += `• ${(tarefasSemana || []).length} tarefas (7 dias)\n`;
        msg += `• ${(atrasadas || []).length} atrasadas\n`;
        msg += `• ${(contas as any[]).length} contas vencendo — ${formatMoneyBRL(totalContas)}\n\n`;

        if ((tarefasSemana || []).length) {
          msg += `📋 *PRÓXIMAS TAREFAS:*\n`;
          for (const t of (tarefasSemana || []).slice(0, 8)) {
            const dt = t.vencimento_em
              ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(new Date(t.vencimento_em))
              : "";
            const icon = t.prioridade === "urgente"
              ? "🔴"
              : t.prioridade === "alta"
              ? "⚠️"
              : "•";
            msg += `${icon} ${dt ? `${dt} - ` : ""}${t.titulo}\n`;
          }
          if ((tarefasSemana || []).length > 8) {
            msg += `_... e mais ${(tarefasSemana || []).length - 8}_\n`;
          }
          msg += `\n`;
        }

        msg += `_LA Music - Agenda_`;

        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: userId,
            canal: "whatsapp",
            tipo: msgType,
            scheduled_for: scheduledWeekly,
            destinatario: numeroWhatsApp,
            mensagem: msg,
            status: "pendente",
          })
          .select("id")
          .single();
        if (logErr) {
          if ((logErr as any).code === "23505") {
            // race
          } else {
            throw logErr;
          }
        } else {
          const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: uazapiToken },
            body: JSON.stringify({ number: numeroWhatsApp, text: msg }),
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
          }
        }
      }
    }

    return json({ success: true, enviados, scheduled_daily: scheduledDaily, scheduled_weekly: scheduledWeekly }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-resumo:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});

