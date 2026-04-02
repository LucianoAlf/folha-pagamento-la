import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sanitizePhoneNumber = (value?: string | null) => String(value || "").replace(/\D/g, "");

const applyTemplate = (template: string, replacements: Record<string, string>) =>
  Object.entries(replacements).reduce((content, [key, value]) => content.replaceAll(`{${key}}`, value), template);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: "Supabase env ausente." }, 500);
    if (!authHeader) return json({ error: "Authorization ausente." }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "JWT inválido." }, 401);

    const payload = await req.json().catch(() => ({}));
    const stageId = String(payload?.stageId || "");
    if (!stageId) return json({ error: "stageId é obrigatório." }, 400);

    const { data: canManage, error: permissionError } = await userClient.rpc("rh_can_manage_stage", { p_etapa_id: stageId });
    if (permissionError) return json({ error: permissionError.message }, 400);
    if (!canManage) return json({ error: "Sem permissão para notificar esta etapa." }, 403);

    const { data: stage, error: stageError } = await adminClient.from("rh_processo_etapas").select("*").eq("id", stageId).maybeSingle();
    if (stageError) return json({ error: stageError.message }, 400);
    if (!stage) return json({ error: "Etapa não encontrada." }, 404);

    const { data: process, error: processError } = await adminClient.from("rh_processos").select("*").eq("id", stage.processo_id).maybeSingle();
    if (processError) return json({ error: processError.message }, 400);
    if (!process) return json({ error: "Processo não encontrado." }, 404);

    const [responsiblesRes, profilesRes, notificationRes, candidateRes, collaboratorRes] = await Promise.all([
      adminClient.from("rh_etapa_responsaveis").select("*").eq("etapa_id", stageId),
      adminClient.from("user_profiles").select("id,nome").in("id", [process.owner_user_id, process.mentor_user_id].filter(Boolean)),
      adminClient.from("notificacao_config").select("user_id,whatsapp_numero,whatsapp_ativo"),
      process.candidato_id ? adminClient.from("rh_candidatos").select("id,nome,telefone").eq("id", process.candidato_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
      process.colaborador_id ? adminClient.from("colaboradores").select("id,nome,telefone").eq("id", process.colaborador_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (responsiblesRes.error) return json({ error: responsiblesRes.error.message }, 400);
    if (profilesRes.error) return json({ error: profilesRes.error.message }, 400);
    if (notificationRes.error) return json({ error: notificationRes.error.message }, 400);
    if (candidateRes.error) return json({ error: candidateRes.error.message }, 400);
    if (collaboratorRes.error) return json({ error: collaboratorRes.error.message }, 400);

    const responsibles = responsiblesRes.data || [];
    const responsibleUserIds = Array.from(new Set(responsibles.map((item) => item.user_id)));
    const { data: responsibleUsers, error: responsibleUsersError } = responsibleUserIds.length > 0
      ? await adminClient.from("user_profiles").select("id,nome").in("id", responsibleUserIds)
      : { data: [], error: null as any };
    if (responsibleUsersError) return json({ error: responsibleUsersError.message }, 400);

    const usersById = new Map([...(profilesRes.data || []), ...(responsibleUsers || [])].map((item: any) => [item.id, item]));
    const notificationByUserId = new Map((notificationRes.data || []).map((item: any) => [item.user_id, item]));

    const collaborator = collaboratorRes.data || candidateRes.data || null;
    const collaboratorName = collaborator?.nome || "Colaborador";
    const mentorName = process.mentor_user_id ? usersById.get(process.mentor_user_id)?.nome || "Mentor" : "Mentor não definido";
    const responsavelNames = responsibles.map((item) => usersById.get(item.user_id)?.nome).filter(Boolean).join(", ") || "Responsáveis não definidos";
    const dateTimeLabel = stage.agendado_em ? new Date(stage.agendado_em).toLocaleString("pt-BR") : stage.data_limite ? new Date(`${stage.data_limite}T09:00:00`).toLocaleString("pt-BR") : "Data não definida";
    const defaultMessage = [
      `Etapa: ${stage.titulo}`,
      `Processo: ${process.titulo}`,
      `Colaborador: ${collaboratorName}`,
      `Mentor: ${mentorName}`,
      `Responsáveis: ${responsavelNames}`,
      `Data/hora: ${dateTimeLabel}`,
      stage.link_reuniao ? `Reunião: ${stage.link_reuniao}` : null,
      stage.link_referencia ? `Referência: ${stage.link_referencia}` : null,
      stage.instrucoes ? `Instruções: ${stage.instrucoes}` : null,
    ].filter(Boolean).join("\n");

    const message = applyTemplate(stage.modelo_mensagem || defaultMessage, {
      etapa: stage.titulo,
      processo: process.titulo,
      colaborador: collaboratorName,
      mentor: mentorName,
      responsaveis: responsavelNames,
      data_hora: dateTimeLabel,
      link_reuniao: stage.link_reuniao || "",
      link_referencia: stage.link_referencia || "",
      instrucoes: stage.instrucoes || "",
    });

    const sent: Array<{ numero: string; destinatario: string; tipo: string }> = [];
    const skipped: Array<{ destinatario: string; motivo: string }> = [];
    const whatsappUrl = `${supabaseUrl}/functions/v1/whatsapp-send`;

    if (stage.notificar_responsaveis) {
      for (const responsible of responsibles) {
        const config = notificationByUserId.get(responsible.user_id);
        const numero = sanitizePhoneNumber(config?.whatsapp_numero);
        const destinatario = usersById.get(responsible.user_id)?.nome || responsible.user_id;
        if (!config?.whatsapp_ativo || !numero) {
          skipped.push({ destinatario, motivo: "Responsável sem WhatsApp ativo/configurado." });
          continue;
        }
        const res = await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ numero, mensagem: message }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || result?.success === false) {
          skipped.push({ destinatario, motivo: result?.error || `Falha ao enviar (${res.status}).` });
          continue;
        }
        sent.push({ numero, destinatario, tipo: "responsavel" });
      }
    }

    if (stage.notificar_colaborador) {
      const numero = sanitizePhoneNumber(collaborator?.telefone);
      if (!numero) {
        skipped.push({ destinatario: collaboratorName, motivo: "Colaborador/candidato sem telefone cadastrado." });
      } else {
        const res = await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ numero, mensagem: message }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || result?.success === false) skipped.push({ destinatario: collaboratorName, motivo: result?.error || `Falha ao enviar (${res.status}).` });
        else sent.push({ numero, destinatario: collaboratorName, tipo: "colaborador" });
      }
    }

    const timestamp = new Date().toISOString();
    await adminClient.from("rh_processo_etapas").update({ ultimo_aviso_whatsapp_em: timestamp }).eq("id", stageId);
    await adminClient.from("rh_historico_eventos").insert([
      {
        processo_id: process.id,
        entidade_tipo: "rh_processo_etapas",
        entidade_id: stageId,
        acao: "etapa_whatsapp_disparado",
        comentario: `WhatsApp disparado para ${sent.length} destinatário(s).`,
        para_json: { enviados: sent.length, ignorados: skipped.length },
        actor_user_id: authData.user.id,
      },
    ]);

    return json({ success: true, enviados: sent, ignorados: skipped });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
