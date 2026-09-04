-- Maria / Super Folha — comprovantes de contas a pagar via WhatsApp
-- Fase 1: storage privado + financeiro_documentos + RPCs auditadas.

begin;

-- Bucket privado para documentos financeiros. Upload/leitura via service-role/RPC/URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro-documentos',
  'financeiro-documentos',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.financeiro_documentos
  add column if not exists status_documento text not null default 'ativo',
  add column if not exists nome_arquivo text,
  add column if not exists mime_type text,
  add column if not exists tamanho_bytes bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists rejeitado_em timestamptz,
  add column if not exists rejeitado_por text,
  add column if not exists rejeitado_motivo text;

alter table public.financeiro_documentos
  drop constraint if exists financeiro_documentos_status_documento_check;

alter table public.financeiro_documentos
  add constraint financeiro_documentos_status_documento_check
  check (status_documento = any (array['pendente_vinculo'::text, 'ativo'::text, 'rejeitado'::text]));

alter table public.financeiro_documentos
  drop constraint if exists financeiro_documentos_tamanho_bytes_check;

alter table public.financeiro_documentos
  add constraint financeiro_documentos_tamanho_bytes_check
  check (tamanho_bytes is null or tamanho_bytes >= 0);

create index if not exists idx_financeiro_documentos_hash
  on public.financeiro_documentos (hash)
  where hash is not null;

create index if not exists idx_financeiro_documentos_conta_pagar
  on public.financeiro_documentos (vinculo_id, created_at desc)
  where vinculo_tipo = 'conta_pagar';

create index if not exists idx_financeiro_documentos_status
  on public.financeiro_documentos (status_documento, created_at desc);

create or replace function public.financeiro_documentos_guard_immutability()
returns trigger
language plpgsql
as $function$
begin
  -- Comprovante/documento já vinculado não deve ser repontado silenciosamente.
  -- Correção operacional: rejeitar o registro antigo e anexar novo comprovante.
  if old.vinculo_id is not null and old.status_documento <> 'pendente_vinculo' then
    if new.vinculo_id is distinct from old.vinculo_id
       or new.vinculo_tipo is distinct from old.vinculo_tipo then
      raise exception 'financeiro_documento_vinculo_imutavel';
    end if;
  end if;

  if old.status_documento = 'rejeitado' then
    if new.status_documento is distinct from old.status_documento
       or new.vinculo_id is distinct from old.vinculo_id
       or new.vinculo_tipo is distinct from old.vinculo_tipo
       or new.storage_ref is distinct from old.storage_ref
       or new.hash is distinct from old.hash then
      raise exception 'financeiro_documento_rejeitado_imutavel';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_financeiro_documentos_guard_immutability on public.financeiro_documentos;
create trigger trg_financeiro_documentos_guard_immutability
before update on public.financeiro_documentos
for each row execute function public.financeiro_documentos_guard_immutability();

create or replace function public.maria_contas_anexar_comprovante(
  p_conta_id uuid,
  p_storage_ref text,
  p_hash text,
  p_nome_arquivo text,
  p_mime_type text,
  p_tamanho_bytes bigint,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null,
  p_mensagem_origem_id text default null,
  p_canal_origem text default null,
  p_chat_id text default null,
  p_enviado_por text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_conta public.contas_pagar%rowtype;
  v_existing public.financeiro_documentos%rowtype;
  v_doc public.financeiro_documentos%rowtype;
  v_audit_id uuid;
  v_storage_ref text;
  v_hash text;
  v_confirmado_por_nome text;
  v_canal_origem text;
  v_status text;
  v_metadata jsonb;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_storage_ref := nullif(trim(p_storage_ref), '');
  if v_storage_ref is null then
    raise exception 'storage_ref obrigatorio para anexar comprovante.';
  end if;

  v_hash := nullif(trim(p_hash), '');
  if v_hash is null then
    raise exception 'hash obrigatorio para anexar comprovante.';
  end if;

  if p_tamanho_bytes is not null and p_tamanho_bytes < 0 then
    raise exception 'tamanho_bytes invalido.';
  end if;

  if p_conta_id is not null then
    select * into v_conta
      from public.contas_pagar
     where id = p_conta_id
     for update;

    if not found then
      raise exception 'conta_pagar nao encontrada para anexar comprovante.';
    end if;

    v_status := 'ativo';
  else
    v_status := 'pendente_vinculo';
  end if;

  select * into v_existing
    from public.financeiro_documentos
   where hash = v_hash
     and status_documento <> 'rejeitado'
   order by created_at asc
   limit 1;

  if found then
    if p_conta_id is not null
       and v_existing.vinculo_tipo = 'conta_pagar'
       and v_existing.vinculo_id = p_conta_id then
      return jsonb_build_object(
        'ok', true,
        'success', true,
        'duplicate', true,
        'documento_id', v_existing.id,
        'conta_id', p_conta_id,
        'descricao', v_conta.descricao,
        'message', 'comprovante_ja_estava_anexado_a_esta_conta'
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'success', false,
      'duplicate', true,
      'needs_human', true,
      'reason', 'mesmo_hash_ja_existe_em_outro_documento',
      'documento_existente_id', v_existing.id,
      'vinculo_tipo_existente', v_existing.vinculo_tipo,
      'vinculo_id_existente', v_existing.vinculo_id,
      'status_documento_existente', v_existing.status_documento
    );
  end if;

  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal_origem := coalesce(nullif(trim(p_canal_origem), ''), nullif(trim(p_canal), ''), 'whatsapp');
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'mensagem_origem_id', nullif(trim(p_mensagem_origem_id), ''),
    'canal_origem', v_canal_origem,
    'chat_id', nullif(trim(p_chat_id), ''),
    'enviado_por', nullif(trim(p_enviado_por), ''),
    'confirmado_por', v_confirmado_por_nome,
    'registrado_por', 'Maria',
    'pagamento_executado_pela_maria', false
  ));

  insert into public.financeiro_documentos (
    tipo,
    storage_ref,
    origem,
    vinculo_tipo,
    vinculo_id,
    hash,
    observacoes,
    status_documento,
    nome_arquivo,
    mime_type,
    tamanho_bytes,
    metadata
  ) values (
    'comprovante',
    v_storage_ref,
    'whatsapp',
    case when p_conta_id is null then null else 'conta_pagar' end,
    p_conta_id,
    v_hash,
    public.maria_contas_observacao_sanitizada(p_motivo),
    v_status,
    nullif(trim(p_nome_arquivo), ''),
    nullif(trim(p_mime_type), ''),
    p_tamanho_bytes,
    v_metadata
  ) returning * into v_doc;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal_origem,
    'financeiro_documentos',
    'financeiro_documento',
    v_doc.id,
    case when p_conta_id is null then 'registrar_comprovante_pendente' else 'anexar_comprovante_conta_pagar' end,
    null,
    to_jsonb(v_doc),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'documento_id', v_doc.id,
    'status_documento', v_doc.status_documento,
    'conta_id', p_conta_id,
    'descricao', case when p_conta_id is null then null else v_conta.descricao end,
    'unidade', case when p_conta_id is null then null else v_conta.unidade end,
    'valor', case when p_conta_id is null then null else v_conta.valor end,
    'vencimento', case when p_conta_id is null then null else v_conta.data_vencimento end,
    'storage_ref', v_doc.storage_ref,
    'hash', v_doc.hash,
    'audit_id', v_audit_id,
    'pagamento_executado_pela_maria', false
  );
end;
$function$;

create or replace function public.maria_contas_dar_baixa_com_comprovante(
  p_conta_id uuid,
  p_data_pagamento date,
  p_metodo_pagamento text,
  p_storage_ref text,
  p_hash text,
  p_nome_arquivo text,
  p_mime_type text,
  p_tamanho_bytes bigint,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null,
  p_mensagem_origem_id text default null,
  p_canal_origem text default null,
  p_chat_id text default null,
  p_enviado_por text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_existing public.financeiro_documentos%rowtype;
  v_baixa jsonb;
  v_doc jsonb;
  v_canal_origem text;
begin
  -- Asserção antecipada para evitar baixa se o comprovante já conflita.
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if nullif(trim(p_hash), '') is null then
    raise exception 'hash obrigatorio para baixa com comprovante.';
  end if;

  select * into v_existing
    from public.financeiro_documentos
   where hash = nullif(trim(p_hash), '')
     and status_documento <> 'rejeitado'
   order by created_at asc
   limit 1;

  if found then
    if v_existing.vinculo_tipo = 'conta_pagar'
       and v_existing.vinculo_id = p_conta_id then
      raise exception 'comprovante_ja_anexado_a_esta_conta; baixa_com_anexo_exige_fluxo_de_revisao';
    end if;
    raise exception 'mesmo_comprovante_ja_existe_em_outro_documento; revisar_antes_de_baixar';
  end if;

  v_canal_origem := coalesce(nullif(trim(p_canal_origem), ''), nullif(trim(p_canal), ''), 'whatsapp');

  -- Se qualquer passo abaixo falhar, a transação inteira da função é revertida.
  v_baixa := public.maria_contas_dar_baixa(
    p_conta_id,
    p_data_pagamento,
    p_metodo_pagamento,
    p_confirmado_por_nome,
    p_ator_numero,
    p_papel,
    p_canal,
    p_texto_original,
    p_motivo,
    p_mensagem_origem_id,
    v_canal_origem
  );

  v_doc := public.maria_contas_anexar_comprovante(
    p_conta_id,
    p_storage_ref,
    p_hash,
    p_nome_arquivo,
    p_mime_type,
    p_tamanho_bytes,
    p_confirmado_por_nome,
    p_ator_numero,
    p_papel,
    p_canal,
    p_texto_original,
    p_motivo,
    p_mensagem_origem_id,
    v_canal_origem,
    p_chat_id,
    p_enviado_por
  );

  if coalesce((v_doc->>'ok')::boolean, false) is not true then
    raise exception 'falha_ao_anexar_comprovante: %', v_doc::text;
  end if;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'baixa', v_baixa,
    'documento', v_doc,
    'pagamento_executado_pela_maria', false,
    'atomic', true
  );
end;
$function$;

revoke all on function public.maria_contas_anexar_comprovante(uuid,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.maria_contas_dar_baixa_com_comprovante(uuid,date,text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text) from public;

grant execute on function public.maria_contas_anexar_comprovante(uuid,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text) to service_role, maria_operacional;
grant execute on function public.maria_contas_dar_baixa_com_comprovante(uuid,date,text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text) to service_role, maria_operacional;

commit;
