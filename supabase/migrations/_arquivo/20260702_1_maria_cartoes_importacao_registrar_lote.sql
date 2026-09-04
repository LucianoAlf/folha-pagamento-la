-- Fase 4 / Fatia A: Maria registra lote normalizado de transacoes de cartao.
-- Backend puro: sem parser, sem WhatsApp e sem fechamento/pagamento automatico.

alter table public.financeiro_cartao_importacoes
  drop constraint if exists financeiro_cartao_importacoes_origem_check;

alter table public.financeiro_cartao_importacoes
  add constraint financeiro_cartao_importacoes_origem_check
  check (origem in ('upload','whatsapp','openfinance','manual','maria'));

alter table public.financeiro_cartao_importacoes
  add column if not exists linhas_duplicadas int not null default 0;

create or replace function public.financeiro_cartoes_resolve_ator(ator jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_created_by uuid;
begin
  v_role := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text);

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_created_by := auth.uid();
    v_ator_ref := coalesce(v_created_by::text, 'authenticated');
  elsif v_role = 'service_role' then
    v_ator_tipo := coalesce(nullif(ator->>'tipo', ''), 'sistema');
    if v_ator_tipo not in ('maria','openfinance','sistema') then
      raise exception 'ator.tipo nao permitido para service_role.';
    end if;
    v_ator_ref := nullif(ator->>'ref', '');
  elsif v_role = 'maria_operacional' then
    v_ator_tipo := coalesce(nullif(ator->>'tipo', ''), 'maria');
    if v_ator_tipo <> 'maria' then
      raise exception 'ator.tipo nao permitido para maria_operacional.' using errcode = '42501';
    end if;
    v_ator_ref := nullif(ator->>'ref', '');
    if v_ator_ref is null then
      raise exception 'ator.ref obrigatorio para maria_operacional.' using errcode = '42501';
    end if;
  else
    raise exception 'papel nao autorizado para RPC de cartoes: %', v_role using errcode = '42501';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'ator_tipo', v_ator_tipo,
    'ator_ref', v_ator_ref,
    'created_by', v_created_by
  );
end;
$$;

create or replace function public.maria_cartoes_importacao_registrar_lote(
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_cartao_id uuid,
  p_competencia date,
  p_documento jsonb,
  p_linhas jsonb,
  p_limiar_confianca numeric default 0.80,
  p_texto_original text default null,
  p_mensagem_origem_id text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_ator_numero text;
  v_cartao public.financeiro_cartoes%rowtype;
  v_cartao_ator jsonb;
  v_open jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_documento public.financeiro_documentos%rowtype;
  v_documento_tipo text;
  v_documento_origem text;
  v_documento_hash text;
  v_importacao public.financeiro_cartao_importacoes%rowtype;
  v_importacao_existente public.financeiro_cartao_importacoes%rowtype;
  v_total int;
  v_importadas int := 0;
  v_duplicadas int := 0;
  v_sugeridas int := 0;
  v_pendentes int := 0;
  v_linhas_erro int := 0;
  v_linhas_resultado jsonb := '[]'::jsonb;
  v_linha jsonb;
  v_linha_idx int;
  v_linha_numero int;
  v_linha_data date;
  v_linha_descricao text;
  v_linha_estabelecimento text;
  v_linha_valor numeric;
  v_linha_tipo_transacao text;
  v_linha_parcela_atual int;
  v_linha_total_parcelas int;
  v_confianca numeric;
  v_classificacao jsonb;
  v_linha_plano_conta_id uuid;
  v_linha_empresa_id uuid;
  v_linha_centro_custo_id uuid;
  v_linha_classificacao_status text;
  v_triade_valida boolean;
  v_id_externo_base text;
  v_id_externo text;
  v_fingerprint text;
  v_duplicada_id uuid;
  v_transacao_payload jsonb;
  v_transacao_result jsonb;
  v_transacao_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_ator_numero := public.maria_normalizar_numero(p_ator_numero);
  v_cartao_ator := jsonb_build_object('tipo', 'maria', 'ref', v_ator_numero);

  if p_limiar_confianca is null or p_limiar_confianca < 0 or p_limiar_confianca > 1 then
    raise exception 'p_limiar_confianca deve estar entre 0 e 1.';
  end if;

  if p_documento is null or jsonb_typeof(p_documento) <> 'object' then
    raise exception 'p_documento deve ser um objeto json.';
  end if;

  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'p_linhas deve ser um array json.';
  end if;

  v_total := jsonb_array_length(p_linhas);
  if v_total = 0 then
    raise exception 'p_linhas deve conter ao menos uma linha.';
  end if;

  v_documento_hash := nullif(trim(p_documento->>'hash'), '');
  if v_documento_hash is null then
    raise exception 'p_documento.hash obrigatorio para dedupe de importacao.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = p_cartao_id
     and ativo = true;

  if not found then
    raise exception 'cartao nao encontrado ou inativo.';
  end if;

  v_open := public.financeiro_cartao_fatura_abrir(
    jsonb_build_object(
      'cartao_id', p_cartao_id,
      'competencia', date_trunc('month', p_competencia)::date,
      'motivo', p_motivo
    ),
    v_cartao_ator
  );

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = (v_open->>'fatura_id')::uuid
   for update;

  if not found then
    raise exception 'fatura alvo da importacao nao encontrada.';
  end if;

  if v_fatura.status <> 'aberta' then
    raise exception 'fatura nao esta aberta; reabra para importar.';
  end if;

  select * into v_documento
    from public.financeiro_documentos d
   where d.hash = v_documento_hash
   order by d.created_at
   limit 1;

  if found then
    select * into v_importacao_existente
      from public.financeiro_cartao_importacoes i
     where i.documento_id = v_documento.id
       and i.fatura_id = v_fatura.id
       and i.status = 'concluida'
     order by i.created_at desc
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'ja_importado', true,
        'importacao_id', v_importacao_existente.id,
        'fatura_id', v_fatura.id,
        'total', v_importacao_existente.total_linhas,
        'importadas', 0,
        'duplicadas', v_importacao_existente.linhas_duplicadas,
        'com_sugestao', v_importacao_existente.linhas_classificadas,
        'pendentes', v_importacao_existente.linhas_pendentes,
        'erros', v_importacao_existente.linhas_erro,
        'linhas', '[]'::jsonb
      );
    end if;
  else
    v_documento_tipo := coalesce(nullif(trim(p_documento->>'tipo'), ''), 'fatura');
    if v_documento_tipo not in ('comprovante','fatura','nota','boleto','outro') then
      raise exception 'p_documento.tipo invalido.';
    end if;

    v_documento_origem := coalesce(nullif(trim(p_documento->>'origem'), ''), 'whatsapp');
    if v_documento_origem not in ('whatsapp','upload','email','manual','asaas') then
      raise exception 'p_documento.origem invalida.';
    end if;

    insert into public.financeiro_documentos (
      tipo,
      storage_ref,
      origem,
      vinculo_tipo,
      vinculo_id,
      hash,
      observacoes
    )
    values (
      v_documento_tipo,
      nullif(trim(p_documento->>'storage_ref'), ''),
      v_documento_origem,
      'cartao_fatura',
      v_fatura.id,
      v_documento_hash,
      nullif(trim(p_documento->>'observacao'), '')
    )
    returning * into v_documento;
  end if;

  insert into public.financeiro_cartao_importacoes (
    documento_id,
    cartao_id,
    fatura_id,
    origem,
    status,
    total_linhas,
    linhas_importadas,
    linhas_classificadas,
    linhas_pendentes,
    linhas_erro,
    linhas_duplicadas,
    ator_tipo,
    ator_ref,
    created_by,
    mensagem_erro
  )
  values (
    v_documento.id,
    p_cartao_id,
    v_fatura.id,
    'maria',
    'processando',
    v_total,
    0,
    0,
    0,
    0,
    0,
    'maria',
    v_ator_numero,
    null,
    null
  )
  returning * into v_importacao;

  for v_linha, v_linha_idx in
    select value, ordinality::int
      from jsonb_array_elements(p_linhas) with ordinality
  loop
    begin
      v_linha_numero := null;
      v_linha_data := null;
      v_linha_descricao := null;
      v_linha_estabelecimento := null;
      v_linha_valor := null;
      v_linha_tipo_transacao := null;
      v_linha_parcela_atual := null;
      v_linha_total_parcelas := null;
      v_confianca := null;
      v_linha_plano_conta_id := null;
      v_linha_empresa_id := null;
      v_linha_centro_custo_id := null;
      v_linha_classificacao_status := 'pendente';
      v_triade_valida := false;
      v_duplicada_id := null;
      v_transacao_id := null;

      v_linha_numero := coalesce(nullif(v_linha->>'numero_linha', '')::int, v_linha_idx);
      if v_linha_numero <= 0 then
        raise exception 'numero_linha invalido.';
      end if;

      v_linha_data := nullif(v_linha->>'data_compra', '')::date;
      if v_linha_data is null then
        raise exception 'data_compra obrigatoria.';
      end if;

      v_linha_descricao := nullif(trim(v_linha->>'descricao'), '');
      if v_linha_descricao is null then
        raise exception 'descricao obrigatoria.';
      end if;

      v_linha_estabelecimento := nullif(trim(v_linha->>'estabelecimento'), '');
      v_linha_valor := nullif(v_linha->>'valor', '')::numeric;
      if v_linha_valor is null or v_linha_valor = 0 then
        raise exception 'valor obrigatorio e diferente de zero.';
      end if;

      v_linha_tipo_transacao := coalesce(nullif(trim(v_linha->>'tipo_transacao'), ''), 'compra');
      if v_linha_tipo_transacao not in ('compra','estorno','tarifa','anuidade','ajuste') then
        raise exception 'tipo_transacao invalido.';
      end if;

      if v_linha_tipo_transacao = 'estorno' then
        v_linha_valor := -abs(v_linha_valor);
      elsif v_linha_tipo_transacao in ('compra','tarifa','anuidade','ajuste') then
        v_linha_valor := abs(v_linha_valor);
      end if;

      v_linha_parcela_atual := nullif(v_linha->>'parcela_atual', '')::int;
      v_linha_total_parcelas := nullif(v_linha->>'total_parcelas', '')::int;
      if (v_linha_parcela_atual is null) <> (v_linha_total_parcelas is null) then
        raise exception 'parcela_atual e total_parcelas devem vir juntos.';
      end if;
      if v_linha_parcela_atual is not null and (
        v_linha_parcela_atual <= 0
        or v_linha_total_parcelas <= 0
        or v_linha_parcela_atual > v_linha_total_parcelas
      ) then
        raise exception 'parcelamento invalido.';
      end if;

      v_confianca := coalesce(nullif(v_linha->>'confianca', '')::numeric, 0);
      if v_confianca < 0 or v_confianca > 1 then
        raise exception 'confianca deve estar entre 0 e 1.';
      end if;

      v_linha_plano_conta_id := null;
      v_linha_empresa_id := null;
      v_linha_centro_custo_id := null;
      v_linha_classificacao_status := 'pendente';
      v_triade_valida := false;
      v_classificacao := v_linha->'classificacao_sugerida';

      if v_classificacao is not null and jsonb_typeof(v_classificacao) = 'object' and v_confianca >= p_limiar_confianca then
        if coalesce(v_classificacao->>'plano_conta_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_linha_plano_conta_id := (v_classificacao->>'plano_conta_id')::uuid;
        end if;
        if coalesce(v_classificacao->>'empresa_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_linha_empresa_id := (v_classificacao->>'empresa_id')::uuid;
        end if;
        if coalesce(v_classificacao->>'centro_custo_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_linha_centro_custo_id := (v_classificacao->>'centro_custo_id')::uuid;
        end if;

        if v_linha_plano_conta_id is not null
           and v_linha_empresa_id is not null
           and v_linha_centro_custo_id is not null then
          select exists (
            select 1
              from public.plano_contas p
              join public.financeiro_empresas e on e.id = v_linha_empresa_id
             where p.id = v_linha_plano_conta_id
               and p.nivel = 3
               and p.natureza = 'saida'
               and p.ativo = true
               and e.ativo = true
               and e.unidade_id = v_linha_centro_custo_id
          ) into v_triade_valida;
        end if;

        if v_triade_valida then
          v_linha_classificacao_status := 'sugerida';
        else
          v_linha_plano_conta_id := null;
          v_linha_empresa_id := null;
          v_linha_centro_custo_id := null;
          v_linha_classificacao_status := 'pendente';
        end if;
      end if;

      v_id_externo_base := coalesce(nullif(trim(p_mensagem_origem_id), ''), v_documento_hash, v_fatura.id::text);
      v_id_externo := coalesce(
        nullif(trim(v_linha->>'id_externo'), ''),
        concat(v_id_externo_base, ':', v_fatura.id::text, ':', v_linha_numero)
      );

      v_fingerprint := encode(extensions.digest(
        concat_ws('|',
          v_fatura.cartao_id::text,
          v_fatura.competencia::text,
          v_linha_numero::text,
          v_linha_data::text,
          round(v_linha_valor, 2)::text,
          lower(regexp_replace(v_linha_descricao, '\s+', ' ', 'g'))
        ),
        'sha256'
      ), 'hex');

      select t.id into v_duplicada_id
        from public.financeiro_cartao_transacoes t
       where t.fatura_id = v_fatura.id
         and t.fingerprint = v_fingerprint
       limit 1;

      if v_duplicada_id is null then
        select t.id into v_duplicada_id
          from public.financeiro_cartao_transacoes t
         where t.fatura_id = v_fatura.id
           and t.id_externo = v_id_externo
         limit 1;
      end if;

      if v_duplicada_id is not null then
        v_duplicadas := v_duplicadas + 1;
        v_linhas_resultado := v_linhas_resultado || jsonb_build_array(jsonb_build_object(
          'numero_linha', v_linha_numero,
          'status', 'duplicada',
          'transacao_id', v_duplicada_id
        ));
        continue;
      end if;

      v_transacao_payload := jsonb_strip_nulls(jsonb_build_object(
        'fatura_id', v_fatura.id,
        'importacao_id', v_importacao.id,
        'numero_linha', v_linha_numero,
        'data_compra', v_linha_data,
        'descricao', v_linha_descricao,
        'estabelecimento', v_linha_estabelecimento,
        'valor', v_linha_valor,
        'tipo_transacao', v_linha_tipo_transacao,
        'plano_conta_id', v_linha_plano_conta_id,
        'centro_custo_id', v_linha_centro_custo_id,
        'empresa_id', v_linha_empresa_id,
        'classificacao_status', v_linha_classificacao_status,
        'parcela_atual', v_linha_parcela_atual,
        'total_parcelas', v_linha_total_parcelas,
        'id_externo', v_id_externo,
        'fonte_tipo', 'maria',
        'observacoes', nullif(trim(v_linha->>'observacoes'), ''),
        'motivo', p_motivo
      ));

      v_transacao_result := public.financeiro_cartao_transacao_registrar(v_transacao_payload, v_cartao_ator);
      v_transacao_id := nullif(v_transacao_result->>'transacao_id', '')::uuid;

      if coalesce((v_transacao_result->>'idempotent')::boolean, false) then
        v_duplicadas := v_duplicadas + 1;
        v_linhas_resultado := v_linhas_resultado || jsonb_build_array(jsonb_build_object(
          'numero_linha', v_linha_numero,
          'status', 'duplicada',
          'transacao_id', v_transacao_id
        ));
      else
        v_importadas := v_importadas + 1;
        if v_linha_classificacao_status = 'sugerida' then
          v_sugeridas := v_sugeridas + 1;
        else
          v_pendentes := v_pendentes + 1;
        end if;

        v_linhas_resultado := v_linhas_resultado || jsonb_build_array(jsonb_build_object(
          'numero_linha', v_linha_numero,
          'status', v_linha_classificacao_status,
          'transacao_id', v_transacao_id
        ));
      end if;
    exception when others then
      v_linhas_erro := v_linhas_erro + 1;
      v_linhas_resultado := v_linhas_resultado || jsonb_build_array(jsonb_build_object(
        'numero_linha', coalesce(v_linha_numero, v_linha_idx),
        'status', 'erro',
        'motivo', sqlerrm
      ));
    end;
  end loop;

  update public.financeiro_cartao_importacoes
     set linhas_importadas = v_importadas,
         linhas_classificadas = v_sugeridas,
         linhas_pendentes = v_pendentes,
         linhas_erro = v_linhas_erro,
         linhas_duplicadas = v_duplicadas,
         status = 'concluida',
         mensagem_erro = case when v_linhas_erro > 0 then concat(v_linhas_erro, ' linha(s) com erro.') else null end,
         updated_at = now()
   where id = v_importacao.id
   returning * into v_importacao;

  perform public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    p_canal,
    'financeiro_cartao_importacoes',
    'importacao',
    v_importacao.id,
    'registrar_lote',
    null,
    jsonb_build_object(
      'id', v_importacao.id,
      'cartao_id', v_importacao.cartao_id,
      'fatura_id', v_importacao.fatura_id,
      'documento_id', v_importacao.documento_id,
      'total_linhas', v_importacao.total_linhas,
      'linhas_importadas', v_importacao.linhas_importadas,
      'linhas_classificadas', v_importacao.linhas_classificadas,
      'linhas_pendentes', v_importacao.linhas_pendentes,
      'linhas_erro', v_importacao.linhas_erro,
      'linhas_duplicadas', v_importacao.linhas_duplicadas,
      'status', v_importacao.status
    ),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'success', true,
    'importacao_id', v_importacao.id,
    'fatura_id', v_fatura.id,
    'total', v_total,
    'importadas', v_importadas,
    'duplicadas', v_duplicadas,
    'com_sugestao', v_sugeridas,
    'pendentes', v_pendentes,
    'erros', v_linhas_erro,
    'linhas', v_linhas_resultado
  );
end;
$$;

revoke all on function public.maria_cartoes_importacao_registrar_lote(
  text, text, text, uuid, date, jsonb, jsonb, numeric, text, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_importacao_registrar_lote(
  text, text, text, uuid, date, jsonb, jsonb, numeric, text, text, text
) to maria_operacional;

comment on function public.maria_cartoes_importacao_registrar_lote(
  text, text, text, uuid, date, jsonb, jsonb, numeric, text, text, text
) is 'Maria operational RPC: registra lote normalizado de transacoes de cartao em fatura aberta, com dedupe, sugestoes fiscais e audit log sanitizado.';
