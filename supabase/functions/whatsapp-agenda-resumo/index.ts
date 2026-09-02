import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { montarResumo, type ResumoPayload } from "../_shared/agendaResumo.ts";

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

type Cfg = {
  user_id: string;
  whatsapp_numero: string | null;
  whatsapp_ativo: boolean | null;
  resumo_diario_ativo: boolean | null;
  resumo_diario_hora: string | null;
  resumo_semanal_ativo: boolean | null;
  resumo_semanal_dia: string | null;
  resumo_semanal_hora: string | null;
};

async function enviarResumo(
  supabase: ReturnType<typeof createClient>,
  uazapi: { url: string; token: string },
  args: { cfg: Cfg; numero: string; tipo: "resumo_diario" | "resumo_semanal"; scheduledFor: string; dateStr: string; dias: number; dataLabel: string },
): Promise<boolean> {
  const { data: existing, error: exErr } = await supabase
    .from("lembretes_log")
    .select("id")
    .eq("canal", "whatsapp")
    .eq("tipo", args.tipo)
    .eq("scheduled_for", args.scheduledFor)
    .eq("destinatario", args.numero)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing?.id) return false;

  const { data: payload, error: pErr } = await supabase.rpc("agenda_resumo_usuario", {
    p_user_id: args.cfg.user_id,
    p_data: args.dateStr,
    p_dias: args.dias,
  });
  if (pErr) throw pErr;

  const msg = montarResumo(payload as ResumoPayload, { tipo: args.tipo === "resumo_diario" ? "diario" : "semanal", dataLabel: args.dataLabel });

  const { data: logEntry, error: logErr } = await supabase
    .from("lembretes_log")
    .insert({
      user_id: args.cfg.user_id,
      canal: "whatsapp",
      tipo: args.tipo,
      scheduled_for: args.scheduledFor,
      destinatario: args.numero,
      mensagem: msg,
      status: "pendente",
    })
    .select("id")
    .single();
  if (logErr) {
    if ((logErr as any).code === "23505") return false;   // race: outro run ja pegou
    throw logErr;
  }

  const res = await fetch(`${uazapi.url.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: uazapi.token },
    body: JSON.stringify({ number: args.numero, text: msg }),
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
    return true;
  }
  await supabase.from("lembretes_log").update({
    status: "falhou",
    erro: parsed?.message || `Erro UAZAPI (${res.status})`,
  }).eq("id", logEntry.id);
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const cronSecret = await getSecret(supabase, "WHATSAPP_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (!headerSecret || headerSecret !== cronSecret) {
      return json({ success: false, error: "Não autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;

    const uazapi = { url: await getSecret(supabase, "UAZAPI_URL"), token: await getSecret(supabase, "UAZAPI_TOKEN") };

    // Multiusuario: todas as configs ativas (service_role ve todas). Sem config = opt-out normal.
    const { data: cfgs, error: cfgErr } = await supabase
      .from("notificacao_config")
      .select("user_id, whatsapp_numero, whatsapp_ativo, resumo_diario_ativo, resumo_diario_hora, resumo_semanal_ativo, resumo_semanal_dia, resumo_semanal_hora")
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .not("user_id", "is", null);
    if (cfgErr) throw cfgErr;

    const now = new Date();
    const dateStr = spDateString(now);
    const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
    const weekdayKey: Record<string, string> = { Mon: "segunda", Tue: "terca", Wed: "quarta", Thu: "quinta", Fri: "sexta", Sat: "sabado", Sun: "domingo" };
    const todayKey = weekdayKey[weekdayShort] || "segunda";
    const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(now);
    const dataFormatada = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "long" }).format(now);
    const dataLabel = `${diaSemana}, ${dataFormatada}`;

    let enviados = 0;
    let erros = 0;
    let skipped = 0;
    const detalhes: Array<Record<string, unknown>> = [];

    for (const cfg of (cfgs || []) as Cfg[]) {
      try {
        const numero = String(cfg.whatsapp_numero || "").replace(/\D/g, "");
        if (!numero) { skipped++; continue; }

        // Janela de silencio (07:30-21:00 SP) aplicada ao horario configurado — ponto unico no banco.
        const { hh: dhh, mm: dmm } = parseTimeToHHMM(cfg.resumo_diario_hora || "08:00");
        const { data: schedDaily, error: e1 } = await supabase.rpc("agenda_momento_lembrete", {
          p_vencimento: scheduledForIsoSp(dateStr, dhh, dmm), p_dia_inteiro: false, p_minutos: 0,
        });
        if (e1) throw e1;
        const { hh: whh, mm: wmm } = parseTimeToHHMM(cfg.resumo_semanal_hora || "20:00");
        const { data: schedWeekly, error: e2 } = await supabase.rpc("agenda_momento_lembrete", {
          p_vencimento: scheduledForIsoSp(dateStr, whh, wmm), p_dia_inteiro: false, p_minutos: 0,
        });
        if (e2) throw e2;

        const scheduledDaily = new Date(String(schedDaily)).toISOString();
        const scheduledWeekly = new Date(String(schedWeekly)).toISOString();
        const sendDaily = !!cfg.resumo_diario_ativo && (force || withinWindow(now, scheduledDaily, 12));
        const sendWeekly = !!cfg.resumo_semanal_ativo && (force || (todayKey === String(cfg.resumo_semanal_dia || "domingo") && withinWindow(now, scheduledWeekly, 12)));

        if (sendDaily) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_diario", scheduledFor: scheduledDaily, dateStr, dias: 1, dataLabel });
          if (ok) enviados++;
        }
        if (sendWeekly) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_semanal", scheduledFor: scheduledWeekly, dateStr, dias: 7, dataLabel });
          if (ok) enviados++;
        }
        detalhes.push({ user_id: cfg.user_id, sendDaily, sendWeekly, scheduledDaily, scheduledWeekly });
      } catch (e: any) {
        console.error("whatsapp-agenda-resumo: usuario", cfg.user_id, e?.message || e);
        erros++;
      }
    }

    return json({ success: true, enviados, erros, skipped, usuarios: (cfgs || []).length, detalhes }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-resumo:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});

