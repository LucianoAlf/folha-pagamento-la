import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RH_CORS_HEADERS, requireRhAdminContext, rhJsonResponse as jsonResponse } from "../_shared/rh-auth.ts";

function stripAccents(input: string) {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDate(date: string | null | undefined) {
  if (!date) return "Nao informado";
  const [year, month, day] = date.slice(0, 10).split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function wrapLine(line: string, max = 90) {
  const words = stripAccents(line).split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) output.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) output.push(current);
  return output;
}

function escapePdfText(input: string) {
  return stripAccents(input).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines: string[]) {
  const expanded = lines.flatMap((line) => wrapLine(line));
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...expanded.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");

  const encoder = new TextEncoder();
  const contentLength = encoder.encode(content).length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += object;
  }
  const xrefStart = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return encoder.encode(pdf);
}

function buildDocumentLines(payload: {
  tipoDocumento: string;
  collaboratorName: string;
  collaboratorRole: string;
  processTitle: string;
  motivoTipo: string;
  avisoTipo: string;
  avisoInicio?: string | null;
  avisoFim?: string | null;
  reducao?: string | null;
  observacoes?: string | null;
}) {
  if (payload.tipoDocumento === "checklist_documental") {
    return [
      "CHECKLIST DOCUMENTAL DE DESLIGAMENTO",
      "",
      `Processo: ${payload.processTitle}`,
      `Colaborador: ${payload.collaboratorName}`,
      `Cargo: ${payload.collaboratorRole}`,
      "",
      "Itens minimos para conferencia:",
      "1. Aviso previo assinado ou registrado.",
      "2. Checklist de devolucao de acessos e materiais.",
      "3. Documentos rescisorios separados.",
      "4. Validacao financeira do desligamento.",
      "",
      `Observacoes: ${payload.observacoes || "Sem observacoes adicionais."}`,
    ];
  }

  return [
    "AVISO PREVIO",
    "",
    `Processo: ${payload.processTitle}`,
    `Colaborador: ${payload.collaboratorName}`,
    `Cargo: ${payload.collaboratorRole}`,
    `Motivo: ${payload.motivoTipo}`,
    `Tipo de aviso: ${payload.avisoTipo}`,
    `Inicio do aviso: ${formatDate(payload.avisoInicio)}`,
    `Fim do aviso: ${formatDate(payload.avisoFim)}`,
    `Reducao ou liberacao: ${payload.reducao || "Nao se aplica"}`,
    "",
    "Declaramos para fins internos de RH que o aviso previo referente ao colaborador acima foi registrado no sistema e deve seguir o fluxo operacional definido pela escola.",
    "",
    `Observacoes: ${payload.observacoes || "Sem observacoes adicionais."}`,
    "",
    "Assinatura RH: ____________________________________________",
    "Assinatura colaborador: __________________________________",
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: RH_CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { adminClient, userId: actorUserId } = await requireRhAdminContext(req);

    const body = await req.json();
    const processId = String(body?.process_id || "");
    const tipoDocumento = String(body?.tipo_documento || "aviso_previo");
    if (!processId) return jsonResponse({ error: "process_id is required" }, 400);

    const { data: process, error: processError } = await adminClient
      .from("rh_processos")
      .select("id,titulo,colaborador_id,cargo,owner_user_id,template_id")
      .eq("id", processId)
      .single();
    if (processError || !process) return jsonResponse({ error: "Process not found" }, 404);

    const { data: offboarding } = await adminClient
      .from("rh_desligamentos")
      .select("motivo_tipo,aviso_previo_tipo,aviso_previo_inicio,aviso_previo_fim,opcao_reducao_jornada,observacoes,motivo_detalhado")
      .eq("processo_id", processId)
      .maybeSingle();

    const { data: collaborator } = process.colaborador_id
      ? await adminClient.from("colaboradores").select("nome,funcao").eq("id", process.colaborador_id).maybeSingle()
      : { data: null };

    const { data: template } = process.template_id
      ? await adminClient.from("rh_templates").select("id,versao").eq("id", process.template_id).maybeSingle()
      : { data: null };

    const templateSlug = tipoDocumento === "checklist_documental" ? "rh_checklist_documental_v1" : "rh_aviso_previo_v1";

    const lines = buildDocumentLines({
      tipoDocumento,
      collaboratorName: collaborator?.nome || "Colaborador",
      collaboratorRole: collaborator?.funcao || process.cargo || "Nao informado",
      processTitle: process.titulo || "Processo RH",
      motivoTipo: offboarding?.motivo_tipo || "Nao informado",
      avisoTipo: offboarding?.aviso_previo_tipo || "Nao informado",
      avisoInicio: offboarding?.aviso_previo_inicio || null,
      avisoFim: offboarding?.aviso_previo_fim || null,
      reducao: offboarding?.opcao_reducao_jornada || null,
      observacoes: offboarding?.observacoes || offboarding?.motivo_detalhado || null,
    });

    const pdfBytes = buildPdf(lines);
    const fileName = `${tipoDocumento}-${Date.now()}.pdf`;
    const storagePath = `processos/${processId}/gerados/${fileName}`;

    const { error: uploadError } = await adminClient.storage
      .from("rh-documentos")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) return jsonResponse({ error: uploadError.message }, 500);

    const { data: generatedDoc, error: insertError } = await adminClient
      .from("rh_documentos_gerados")
      .insert([
        {
          processo_id: processId,
          tipo_documento: tipoDocumento,
          template_slug: templateSlug,
          template_id: template?.id || process.template_id || null,
          template_versao: template?.versao || null,
          storage_path: storagePath,
          gerado_por: actorUserId,
          gerado_em: new Date().toISOString(),
        },
      ])
      .select("id,storage_path")
      .single();
    if (insertError) return jsonResponse({ error: insertError.message }, 500);

    await adminClient.from("rh_historico_eventos").insert([
      {
        processo_id: processId,
        entidade_tipo: "rh_documentos_gerados",
        entidade_id: generatedDoc.id,
        acao: "documento_oficial_gerado",
        comentario: `Documento ${tipoDocumento} gerado e salvo no storage.`,
        actor_user_id: actorUserId,
      },
    ]);

    return jsonResponse({
      documento_gerado_id: generatedDoc.id,
      storage_path: generatedDoc.storage_path,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
