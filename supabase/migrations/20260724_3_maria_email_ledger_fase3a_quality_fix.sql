-- Maria Email Ledger — Fase 3A quality fix
-- Exige dedupe_group_quality recalculada junto com dedupe_group_key no versionamento.
-- Motivo: evitar chave nova forte/media ficando com qualidade antiga fraca herdada,
-- o que deixaria o indice unico parcial de segunda via inerte silenciosamente.

create or replace function public.maria_email_payable_versionar(
  p_ator_numero text,
  p_papel text,
  p_payable_antigo_id uuid,
  p_payload_novo jsonb,
  p_motivo text default null,
  p_texto_original text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_old public.maria_email_extracted_payables%rowtype;
  v_old_after public.maria_email_extracted_payables%rowtype;
  v_new_payload jsonb;
  v_new_id uuid;
  v_new public.maria_email_extracted_payables%rowtype;
  v_result jsonb;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  if p_payable_antigo_id is null then
    raise exception 'p_payable_antigo_id obrigatorio' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_payload_novo), '') <> 'object' then
    raise exception 'p_payload_novo deve ser objeto jsonb' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('maria_email_payable_versionar'), hashtext(p_payable_antigo_id::text));

  select * into v_old
    from public.maria_email_extracted_payables
   where id = p_payable_antigo_id
   for update;

  if not found then
    raise exception 'payable antigo nao encontrado' using errcode = '22023';
  end if;

  if v_old.status = 'substituido' then
    raise exception 'payable antigo ja esta substituido' using errcode = '22023';
  end if;

  if not (p_payload_novo ? 'dedupe_group_key') then
    raise exception 'versionamento exige dedupe_group_key recalculada no runtime' using errcode = '22023';
  end if;

  if not (p_payload_novo ? 'dedupe_group_quality') then
    raise exception 'versionamento exige dedupe_group_quality recalculada no runtime' using errcode = '22023';
  end if;

  if public.maria_email_payload_text(p_payload_novo, 'dedupe_group_quality', 20) not in ('forte', 'media', 'fraca') then
    raise exception 'dedupe_group_quality invalida no versionamento' using errcode = '22023';
  end if;

  v_new_payload := jsonb_build_object(
    'message_id', v_old.message_id,
    'processing_run_id', v_old.processing_run_id,
    'financeiro_documento_id', v_old.financeiro_documento_id,
    'document_kind', v_old.document_kind,
    'fornecedor_nome', v_old.fornecedor_nome,
    'fornecedor_documento_hash', v_old.fornecedor_documento_hash,
    'payer_name_masked', v_old.payer_name_masked,
    'payer_name_hash', v_old.payer_name_hash,
    'document_number', v_old.document_number,
    'competencia', v_old.competencia,
    'emissao', v_old.emissao,
    'vencimento', v_old.vencimento,
    'valor_centavos', v_old.valor_centavos,
    'moeda', v_old.moeda,
    'centro_custo_id', v_old.centro_custo_id,
    'unidade_snapshot', v_old.unidade_snapshot,
    'plano_conta_id', v_old.plano_conta_id,
    'plano_snapshot', v_old.plano_snapshot,
    'empresa_id', v_old.empresa_id,
    'extraction_method', v_old.extraction_method,
    'confidence', v_old.confidence,
    'status', 'pendente_conferencia',
    'review_reason', coalesce(nullif(trim(p_motivo), ''), 'versionamento_payable'),
    'barcode_hash', v_old.barcode_hash,
    'pix_payload_hash', v_old.pix_payload_hash,
    'payment_link_domain', v_old.payment_link_domain,
    'payment_link_hash', v_old.payment_link_hash,
    'dedupe_group_key', v_old.dedupe_group_key,
    'dedupe_group_quality', v_old.dedupe_group_quality,
    'supersedes_payable_id', v_old.id,
    'person_data_redaction_status', v_old.person_data_redaction_status,
    'raw_extraction_sanitized', v_old.raw_extraction_sanitized
  ) || p_payload_novo || jsonb_build_object(
    'message_id', v_old.message_id,
    'processing_run_id', v_old.processing_run_id,
    'status', 'pendente_conferencia',
    'supersedes_payable_id', v_old.id
  );

  perform set_config('app.maria_email_rpc', 'on', true);

  update public.maria_email_extracted_payables
     set status = 'substituido',
         review_reason = coalesce(nullif(trim(p_motivo), ''), review_reason)
   where id = v_old.id
   returning * into v_old_after;

  perform set_config('app.maria_email_rpc', '', true);

  v_result := public.maria_email_payable_registrar(v_new_payload);
  v_new_id := (v_result->>'payable_id')::uuid;

  select * into v_new
    from public.maria_email_extracted_payables
   where id = v_new_id;

  perform public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    'whatsapp',
    'maria_email_extracted_payables',
    'maria_email_payable',
    v_old.id,
    'versionar_payable_email',
    to_jsonb(v_old),
    jsonb_build_object('antigo', to_jsonb(v_old_after), 'novo', to_jsonb(v_new)),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'success', true,
    'payable_antigo_id', v_old.id,
    'payable_novo_id', v_new.id,
    'status_antigo', v_old_after.status,
    'dedupe_group_key_novo', v_new.dedupe_group_key,
    'dedupe_group_quality_novo', v_new.dedupe_group_quality
  );
end;
$$;

revoke all on function public.maria_email_payable_versionar(text, text, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

grant execute on function public.maria_email_payable_versionar(text, text, uuid, jsonb, text, text)
  to service_role;

comment on function public.maria_email_payable_versionar(text, text, uuid, jsonb, text, text)
is 'Versiona um payable do Maria Email Ledger em uma transacao: substitui o antigo e cria o novo com supersedes_payable_id, auditado via Maria.';
