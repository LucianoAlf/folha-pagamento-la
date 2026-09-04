-- Maria / Super Folha — hardening comprovantes contas a pagar
-- Fase 1.1: bloquear delete/truncate, fechar transição de status e criar RPC auditada de rejeição.

begin;

-- Comprovante financeiro é evidência. Escrita/correção deve passar por RPC auditada.
revoke delete, truncate on table public.financeiro_documentos from service_role;
revoke delete, truncate on table public.financeiro_documentos from authenticated;
revoke delete, truncate on table public.financeiro_documentos from anon;
revoke delete, truncate on table public.financeiro_documentos from public;
revoke delete, truncate on table public.financeiro_documentos from maria_operacional;

create or replace function public.financeiro_documentos_guard_immutability()
returns trigger
language plpgsql
as $function$
begin
  -- Comprovante/documento financeiro não deve ser apagado diretamente.
  -- Correção operacional: rejeitar por RPC auditada e anexar novo registro.
  if tg_op = 'DELETE' then
    raise exception 'financeiro_documento_delete_bloqueado';
  end if;

  -- Rejeitado é estado terminal: não pode ser reativado, repontado, nem trocar evidência.
  if old.status_documento = 'rejeitado' then
    if new.status_documento is distinct from old.status_documento
       or new.vinculo_id is distinct from old.vinculo_id
       or new.vinculo_tipo is distinct from old.vinculo_tipo
       or new.storage_ref is distinct from old.storage_ref
       or new.hash is distinct from old.hash then
      raise exception 'financeiro_documento_rejeitado_imutavel';
    end if;
  end if;

  -- Não permitir downgrade ativo -> pendente_vinculo para burlar imutabilidade e repontar depois.
  if old.status_documento = 'ativo' and new.status_documento = 'pendente_vinculo' then
    raise exception 'financeiro_documento_status_retrocesso_bloqueado';
  end if;

  -- Documento já vinculado e não pendente não deve ser repontado silenciosamente.
  if old.vinculo_id is not null and old.status_documento <> 'pendente_vinculo' then
    if new.vinculo_id is distinct from old.vinculo_id
       or new.vinculo_tipo is distinct from old.vinculo_tipo then
      raise exception 'financeiro_documento_vinculo_imutavel';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_financeiro_documentos_guard_immutability on public.financeiro_documentos;
create trigger trg_financeiro_documentos_guard_immutability
before update or delete on public.financeiro_documentos
for each row execute function public.financeiro_documentos_guard_immutability();

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
         )),
         updated_at = now()
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
