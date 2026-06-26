-- Maria baixa contas a pagar: registra pagamento já realizado pela equipe.
-- Não executa pagamento, PIX, transferência ou boleto. Apenas marca como pago com auditoria.

create or replace function public.maria_contas_dar_baixa(
  p_conta_id uuid,
  p_data_pagamento date,
  p_metodo_pagamento text,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null,
  p_mensagem_origem_id text default null,
  p_canal_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
  v_metodo text;
  v_confirmado_por_nome text;
  v_canal_origem text;
  v_obs text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_data_pagamento is null then
    raise exception 'data_pagamento obrigatoria para baixa.';
  end if;

  if p_data_pagamento > ((now() at time zone 'America/Sao_Paulo')::date + 1) then
    raise exception 'data_pagamento futura nao permitida para baixa operacional.';
  end if;

  v_metodo := nullif(trim(p_metodo_pagamento), '');
  if v_metodo is null then
    raise exception 'metodo_pagamento obrigatorio para baixa.';
  end if;

  if lower(v_metodo) not in (
    lower('PIX'),
    lower('Transferência Bancária'),
    lower('Transferencia Bancaria'),
    lower('Cartão de Crédito'),
    lower('Cartao de Credito'),
    lower('Cartão de Débito'),
    lower('Cartao de Debito'),
    lower('Débito Automático'),
    lower('Debito Automatico'),
    lower('Boleto'),
    lower('Dinheiro'),
    lower('Comprovante')
  ) then
    raise exception 'metodo_pagamento nao permitido para baixa operacional.';
  end if;

  select * into v_before
    from public.contas_pagar
   where id = p_conta_id
   for update;

  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  if v_before.status = 'pago' then
    raise exception 'conta ja esta paga; confirmacao explicita de rebaixa/substituicao exige fluxo separado.';
  end if;

  if v_before.status not in ('pendente', 'finalizado') then
    raise exception 'status atual nao permite baixa operacional: %', v_before.status;
  end if;

  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal_origem := coalesce(nullif(trim(p_canal_origem), ''), nullif(trim(p_canal), ''), 'whatsapp');
  v_obs := concat_ws(E'\n',
    nullif(v_before.observacoes, ''),
    concat('Baixa registrada pela Maria após confirmação de ', v_confirmado_por_nome, ' em ', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '. Sem pagamento real executado pela Maria.'),
    public.maria_contas_observacao_sanitizada(p_motivo)
  );

  update public.contas_pagar
     set status = 'pago',
         data_pagamento = p_data_pagamento::timestamptz,
         metodo_pagamento = v_metodo,
         observacoes = v_obs,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal_origem,
    'contas_pagar',
    'conta_pagar',
    p_conta_id,
    'dar_baixa_conta_pagar',
    to_jsonb(v_before),
    to_jsonb(v_after),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'audit_id', v_audit_id,
    'conta_id', v_after.id,
    'descricao', v_after.descricao,
    'unidade', v_after.unidade,
    'valor', v_after.valor,
    'vencimento', v_after.data_vencimento,
    'status', 'pago',
    'data_pagamento', p_data_pagamento,
    'metodo_pagamento', v_metodo,
    'registrado_por', 'Maria',
    'confirmado_por', v_confirmado_por_nome,
    'canal', v_canal_origem,
    'mensagem_origem_id', nullif(trim(p_mensagem_origem_id), ''),
    'pagamento_executado_pela_maria', false
  );
end;
$$;

revoke all on function public.maria_contas_dar_baixa(
  uuid, date, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_contas_dar_baixa(
  uuid, date, text, text, text, text, text, text, text, text, text
) to maria_operacional, service_role;

comment on function public.maria_contas_dar_baixa(
  uuid, date, text, text, text, text, text, text, text, text, text
) is 'Maria operational RPC: dá baixa em conta a pagar já paga pela equipe, com confirmação humana e auditoria; não executa pagamento real.';
