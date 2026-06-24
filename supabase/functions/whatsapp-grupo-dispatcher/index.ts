import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { gerarRelatorioContasDia } from "../_shared/relatorioContasDia.ts";
import { avaliarAgendamentoGrupo, nowSaoPaulo } from "../_shared/whatsappGrupoDispatcher.ts";

// Este dispatcher le contas existentes; recorrentes do mes sao materializadas quando o time
// abre a tela de Contas a Pagar. Garantir recorrentes no servidor e pre-requisito antes de
// ligar toggles em producao.

type SupabaseClient = ReturnType<typeof createClient>;

type GrupoNotificacaoRow = {
  id: string;
  destino_id: string;
  tipo: string;
  frequencia: string;
  horario: string;
  dia_semana: number | null;
  dia_mes: number | null;
  ativo: boolean;
  ultima_execucao: string | null;
  destino?: {
    jid: string | null;
    nome: string | null;
    ativo: boolean | null;
  } | null;
};

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
      return { ok: false, response: json({ success: false, error: "cron secret invalido." }, 401) };
    }
    return { ok: true, cronSecret };
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return { ok: false, response: json({ success: false, error: "Authorization ausente." }, 401) };
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, response: json({ success: false, error: "JWT invalido." }, 401) };
  }

  const cronSecret = await getSecret(supabaseAdmin, "WHATSAPP_CRON_SECRET");
  return { ok: true, cronSecret };
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function enviarWhatsAppGrupo(input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  cronSecret: string;
  jid: string;
  mensagem: string;
}) {
  const res = await fetch(`${input.supabaseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: input.supabaseAnonKey,
      "x-cron-secret": input.cronSecret,
    },
    body: JSON.stringify({
      numero: input.jid,
      tipo: "grupo",
      mensagem: input.mensagem,
    }),
  });

  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = { raw };
  }

  if (!res.ok || parsed?.success === false) {
    throw new Error(parsed?.error || parsed?.message || `Erro whatsapp-send (${res.status})`);
  }

  return parsed;
}

async function registrarEnvio(input: {
  supabaseAdmin: SupabaseClient;
  notificacaoId: string;
  todaySP: string;
  mensagem: string;
  contaIds: string[];
}) {
  const hash = await sha256Hex(input.mensagem);

  const { error: insertError } = await input.supabaseAdmin
    .from("contas_pagar_relatorio_dia")
    .insert({
      data_referencia: input.todaySP,
      unidade: "todas",
      mensagem_texto: input.mensagem,
      gerado_por: "maria-dispatcher",
      status_envio: "enviado",
      hash_mensagem: hash,
      payload_json: { conta_ids: input.contaIds },
    });
  if (insertError) throw insertError;

  const { error: updateError } = await input.supabaseAdmin
    .from("whatsapp_grupo_notificacoes")
    .update({ ultima_execucao: new Date().toISOString() })
    .eq("id", input.notificacaoId);
  if (updateError) throw updateError;
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

    const auth = await authenticate(req, supabaseAdmin, supabaseUrl, supabaseAnonKey);
    if (!auth.ok) return auth.response;

    const payload = await req.json().catch(() => ({}));
    const dryRun = payload?.dryRun === true;
    const nowSP = nowSaoPaulo();

    const { data, error } = await supabaseAdmin
      .from("whatsapp_grupo_notificacoes")
      .select(
        [
          "id",
          "destino_id",
          "tipo",
          "frequencia",
          "horario",
          "dia_semana",
          "dia_mes",
          "ativo",
          "ultima_execucao",
          "destino:whatsapp_destinos!inner(jid,nome,ativo)",
        ].join(","),
      )
      .eq("ativo", true)
      .eq("destino.ativo", true)
      .order("horario", { ascending: true });
    if (error) throw error;

    const resultados = [];

    for (const row of (data || []) as GrupoNotificacaoRow[]) {
      const destinoNome = row.destino?.nome || "Grupo sem nome";
      const jid = String(row.destino?.jid || "").trim();
      const avaliacao = avaliarAgendamentoGrupo({ notificacao: row, nowSP });
      const base = {
        destino_nome: destinoNome,
        tipo: row.tipo,
        na_hora: avaliacao.na_hora,
        jaRodouHoje: avaliacao.jaRodouHoje,
        count: 0,
        enviado: false,
      };

      if (!avaliacao.deveDisparar) {
        resultados.push(base);
        continue;
      }

      if (row.tipo !== "contas_a_pagar_dia") {
        const motivo = `gerador ${row.tipo} nao implementado`;
        console.log("whatsapp-grupo-dispatcher:", motivo);
        resultados.push({ ...base, motivo });
        continue;
      }

      try {
        const relatorio = await gerarRelatorioContasDia(supabaseAdmin, {
          dataRef: nowSP.date,
          unidadeFiltro: "todas",
        });

        if (dryRun) {
          resultados.push({
            ...base,
            count: relatorio.count,
            enviado: false,
            dryRun: true,
            mandaria: true,
            conta_ids: relatorio.conta_ids,
            mensagem: relatorio.mensagem,
          });
          continue;
        }

        if (!jid) throw new Error("Destino sem JID.");
        await enviarWhatsAppGrupo({
          supabaseUrl,
          supabaseAnonKey,
          cronSecret: auth.cronSecret,
          jid,
          mensagem: relatorio.mensagem,
        });

        await registrarEnvio({
          supabaseAdmin,
          notificacaoId: row.id,
          todaySP: nowSP.date,
          mensagem: relatorio.mensagem,
          contaIds: relatorio.conta_ids,
        });

        resultados.push({
          ...base,
          count: relatorio.count,
          enviado: true,
          conta_ids: relatorio.conta_ids,
        });
      } catch (e: any) {
        resultados.push({
          ...base,
          enviado: false,
          erro: e?.message || "Erro inesperado.",
        });
      }
    }

    const success = resultados.every((resultado: any) => !resultado.erro);
    return json({
      success,
      now_sp: { date: nowSP.date, time: nowSP.time, dow: nowSP.dow },
      dryRun,
      resultados,
    }, success ? 200 : 500);
  } catch (e: any) {
    console.error("whatsapp-grupo-dispatcher:", e?.message || "Erro inesperado.");
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
