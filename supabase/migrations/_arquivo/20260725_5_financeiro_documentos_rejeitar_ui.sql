-- Super Folha — rejeição de comprovantes pela UI
-- Permite Rose/Ana rejeitarem um comprovante errado sem delete/repoint, com auditoria.

begin;

create or replace function public.financeiro_documento_rejeitar_ui(
  p_documento_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_profile public.user_profiles%rowtype;
  v_before public.financeiro_documentos%rowtype;
  v_after public.financeiro_documentos%rowtype;
  v_motivo text;
  v_audit_id uuid;
  v_invoker_role text;
  v_ator_numero text;
  v_ator_hash text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'usuario autenticado obrigatorio para rejeitar comprovante.' using errcode = '42501';
  end if;

  v_motivo := nullif(trim(p_motivo), '');
  if v_motivo is null then
    raise exception 'motivo obrigatorio para rejeitar comprovante.';
  end if;

  select * into v_profile
    from public.user_profiles
   where id = v_uid;

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

  update public.financeiro_documentos
     set status_documento = 'rejeitado',
         rejeitado_em = now(),
         rejeitado_por = coalesce(nullif(v_profile.nome, ''), v_uid::text),
         rejeitado_motivo = public.maria_contas_observacao_sanitizada(v_motivo),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'rejeitado_por_user_id', v_uid,
           'rejeitado_por_nome', nullif(v_profile.nome, ''),
           'canal_rejeicao', 'super_folha_ui',
           'pagamento_executado_pela_maria', false
         ))
   where id = p_documento_id
   returning * into v_after;

  v_invoker_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  v_ator_numero := 'auth:' || v_uid::text;
  v_ator_hash := encode(extensions.digest(v_ator_numero, 'sha256'), 'hex');

  insert into public.maria_audit_log (
    ator_nome,
    ator_numero,
    ator_numero_hash,
    ator_numero_last4,
    papel,
    origem,
    canal,
    invoker_role,
    tabela,
    entidade_tipo,
    entidade_id,
    operacao,
    antes,
    depois,
    motivo,
    texto_original
  ) values (
    coalesce(nullif(v_profile.nome, ''), v_uid::text),
    v_ator_numero,
    v_ator_hash,
    right(v_uid::text, 4),
    'super_folha_ui',
    'super_folha',
    'web',
    v_invoker_role,
    'financeiro_documentos',
    'financeiro_documento',
    v_after.id,
    'rejeitar_comprovante_ui',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_motivo,
    null
  ) returning id into v_audit_id;

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

revoke all on function public.financeiro_documento_rejeitar_ui(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.financeiro_documento_rejeitar_ui(uuid, text) to authenticated, service_role;

comment on function public.financeiro_documento_rejeitar_ui(uuid, text) is
  'Rejeita comprovante financeiro pela UI autenticada, preservando evidência e registrando auditoria.';

commit;
