-- Maria / Super Folha — fix RPC rejeição de comprovante
-- Remove updated_at: financeiro_documentos não possui essa coluna.

begin;

create or replace function public.maria_financeiro_documento_rejeitar(
  p_documento_id uuid,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_motivo text,
  p_texto_original text default null,
  p_mensagem_origem_id text default null,
  p_canal_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.financeiro_documentos%rowtype;
  v_after public.financeiro_documentos%rowtype;
  v_audit_id uuid;
  v_motivo text;
  v_confirmado_por_nome text;
  v_canal_origem text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_motivo := nullif(trim(p_motivo), '');
  if v_motivo is null then
    raise exception 'motivo obrigatorio para rejeitar comprovante.';
  end if;

  select * into v_before
    from public.financeiro_documentos
   where id = p_documento_id
   for update;

  if not found then
    raise exception 'financeiro_documento nao encontrado para rejeicao.';
  end if;

  if v_before.status_documento = 'rejeitado' then
    return jsonb_build_object(
      'ok', true,
      'success', true,
      'duplicate', true,
      'documento_id', v_before.id,
      'status_documento', v_before.status_documento,
      'message', 'comprovante_ja_estava_rejeitado'
    );
  end if;

  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal_origem := coalesce(nullif(trim(p_canal_origem), ''), nullif(trim(p_canal), ''), 'whatsapp');

  update public.financeiro_documentos
     set status_documento = 'rejeitado',
         rejeitado_em = now(),
         rejeitado_por = v_confirmado_por_nome,
         rejeitado_motivo = public.maria_contas_observacao_sanitizada(v_motivo),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'rejeitado_por_ator', v_actor.nome,
           'rejeitado_por_numero', p_ator_numero,
           'mensagem_rejeicao_id', nullif(trim(p_mensagem_origem_id), ''),
           'canal_rejeicao', v_canal_origem,
           'pagamento_executado_pela_maria', false
         ))
   where id = p_documento_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal_origem,
    'financeiro_documentos',
    'financeiro_documento',
    v_after.id,
    'rejeitar_comprovante',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'documento_id', v_after.id,
    'status_documento', v_after.status_documento,
    'vinculo_tipo', v_after.vinculo_tipo,
    'vinculo_id', v_after.vinculo_id,
    'rejeitado_em', v_after.rejeitado_em,
    'rejeitado_por', v_after.rejeitado_por,
    'audit_id', v_audit_id,
    'pagamento_executado_pela_maria', false
  );
end;
$function$;

revoke all on function public.maria_financeiro_documento_rejeitar(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.maria_financeiro_documento_rejeitar(uuid,text,text,text,text,text,text,text,text) to service_role, maria_operacional;

commit;
