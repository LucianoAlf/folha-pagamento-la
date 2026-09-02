import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  escolherDisparo,
  montarResumo,
  parseTimeToHHMM,
  scheduledForIsoSp,
  type ResumoPayload,
} from "../_shared/agendaResumo.ts";

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

// parseTimeToHHMM / scheduledForIsoSp / withinWindow / escolherDisparo vivem em _shared/agendaResumo.ts (I-5).

/** Aplica a janela de silencio (07:30-21:00 SP) no banco — ponto unico. Null se a RPC devolver null. */
async function clampMomento(
  supabase: ReturnType<typeof createClient>,
  vencimentoIso: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("agenda_momento_lembrete", {
    p_vencimento: vencimentoIso, p_dia_inteiro: false, p_minutos: 0,
  });
  if (error) throw error;
  return data ? new Date(String(data)).toISOString() : null;
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
    // Ontem entra como candidato: o clamp de um horario > 21:00 SP cai em "amanha 07:30", que so
    // fica dentro da janela no dia seguinte — sem esse candidato o usuario nunca receberia (I-4).
    const ontemDate = new Date(now.getTime() - 86400000);
    const ontemStr = spDateString(ontemDate);
    const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
    const weekdayKey: Record<string, string> = { Mon: "segunda", Tue: "terca", Wed: "quarta", Thu: "quinta", Fri: "sexta", Sat: "sabado", Sun: "domingo" };
    const todayKey = weekdayKey[weekdayShort] || "segunda";
    const ontemKey = weekdayKey[new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(ontemDate)] || "segunda";
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
        // Candidatos: o clamp de hoje e o de ontem; o primeiro dentro da janela vence (I-4).
        let scheduledDaily: string | null = null;
        let clampDailyHoje: string | null = null;
        if (cfg.resumo_diario_ativo) {
          const { hh: dhh, mm: dmm } = parseTimeToHHMM(cfg.resumo_diario_hora || "08:00");
          clampDailyHoje = await clampMomento(supabase, scheduledForIsoSp(dateStr, dhh, dmm));
          const clampDailyOntem = await clampMomento(supabase, scheduledForIsoSp(ontemStr, dhh, dmm));
          scheduledDaily = escolherDisparo(now, [clampDailyHoje, clampDailyOntem]);
        }
        const sendDailyIso = force ? clampDailyHoje : scheduledDaily;

        let scheduledWeekly: string | null = null;
        let clampWeeklyHoje: string | null = null;
        if (cfg.resumo_semanal_ativo) {
          const diaSemanal = String(cfg.resumo_semanal_dia || "domingo");
          const { hh: whh, mm: wmm } = parseTimeToHHMM(cfg.resumo_semanal_hora || "20:00");
          if (force || todayKey === diaSemanal) {
            clampWeeklyHoje = await clampMomento(supabase, scheduledForIsoSp(dateStr, whh, wmm));
          }
          const clampWeeklyOntem = ontemKey === diaSemanal
            ? await clampMomento(supabase, scheduledForIsoSp(ontemStr, whh, wmm))
            : null;
          scheduledWeekly = escolherDisparo(now, [todayKey === diaSemanal ? clampWeeklyHoje : null, clampWeeklyOntem]);
        }
        const sendWeeklyIso = force ? clampWeeklyHoje : scheduledWeekly;

        if (sendDailyIso) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_diario", scheduledFor: sendDailyIso, dateStr, dias: 1, dataLabel });
          if (ok) enviados++;
        }
        if (sendWeeklyIso) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_semanal", scheduledFor: sendWeeklyIso, dateStr, dias: 7, dataLabel });
          if (ok) enviados++;
        }
        detalhes.push({ user_id: cfg.user_id, sendDaily: !!sendDailyIso, sendWeekly: !!sendWeeklyIso, scheduledDaily: sendDailyIso, scheduledWeekly: sendWeeklyIso });
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

