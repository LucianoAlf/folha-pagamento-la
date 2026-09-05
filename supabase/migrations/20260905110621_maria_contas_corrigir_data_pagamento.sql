-- 05/09/2026 — 04/09 a Rose corrigiu a Maria: "Verisure foi paga em 01/09, não 04/09, só enviei o
-- comprovante hoje". A Maria fez a coisa certa — tentou, não conseguiu e NÃO fingiu: disse
-- "não vou fingir que ajustei" e escalou. Faltava ferramenta, não comportamento.
-- A baixa recusa rebaixa (por desenho, é proteção), e não existia RPC para corrigir só a data.
--
-- Esta corrige APENAS data_pagamento de uma conta já paga. Não mexe em valor, plano, pagadora nem
-- status. Motivo é obrigatório: correção sem justificativa é indistinguível de erro.
create or replace function public.maria_contas_corrigir_data_pagamento(
  p_conta_id            uuid,
  p_data_pagamento      date,
  p_motivo              text,
  p_confirmado_por_nome text,
  p_ator_numero         text,
  p_papel               text,
  p_canal               text default null,
  p_texto_original      text default null,
  p_mensagem_origem_id  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor  public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after  public.contas_pagar%rowtype;
  v_audit_id uuid;
  v_antiga date;
  v_canal text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'motivo obrigatorio: correcao de data sem justificativa e indistinguivel de erro.';
  end if;

  if p_data_pagamento is null then
    raise exception 'data_pagamento obrigatoria.';
  end if;

  if p_data_pagamento > ((now() at time zone 'America/Sao_Paulo')::date + 1) then
    raise exception 'data_pagamento futura nao permitida.';
  end if;

  -- 180 dias pega o erro de digitacao classico (ano trocado) sem atrapalhar correcao de verdade.
  if p_data_pagamento < ((now() at time zone 'America/Sao_Paulo')::date - 180) then
    raise exception 'data_pagamento anterior a 180 dias: confira o ano antes de corrigir.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id;
  if not found then
    raise exception 'conta % nao encontrada', p_conta_id;
  end if;

  if v_before.status is distinct from 'pago' then
    raise exception 'so corrijo data de conta ja paga (status atual: %). Para baixar, use a baixa.',
      coalesce(v_before.status, 'sem status');
  end if;

  v_antiga := (v_before.data_pagamento at time zone 'America/Sao_Paulo')::date;

  if v_antiga is not distinct from p_data_pagamento then
    return jsonb_build_object(
      'ok', true, 'success', true, 'sem_mudanca', true,
      'conta_id', p_conta_id, 'descricao', v_before.descricao,
      'data_pagamento', p_data_pagamento,
      'observacao', 'a data ja era essa; nada foi alterado'
    );
  end if;

  v_canal := coalesce(nullif(btrim(p_canal), ''), 'whatsapp');

  update public.contas_pagar
     set data_pagamento = p_data_pagamento::timestamptz,
         observacoes = concat_ws(chr(10), observacoes,
           public.maria_contas_observacao_sanitizada(
             format('05/09/2026+: data de pagamento corrigida de %s para %s por %s. Motivo: %s',
                    to_char(v_antiga, 'DD/MM/YYYY'), to_char(p_data_pagamento, 'DD/MM/YYYY'),
                    coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado'),
                    btrim(p_motivo)))),
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, v_canal,
    'contas_pagar', 'conta_pagar', p_conta_id,
    'corrigir_data_pagamento_conta_pagar',
    to_jsonb(v_before), to_jsonb(v_after),
    p_motivo, p_texto_original
  );

  return jsonb_build_object(
    'ok', true, 'success', true,
    'audit_id', v_audit_id,
    'conta_id', v_after.id,
    'descricao', v_after.descricao,
    'unidade', v_after.unidade,
    'valor', v_after.valor,
    'status', v_after.status,
    'data_pagamento_anterior', v_antiga,
    'data_pagamento', p_data_pagamento,
    'corrigido_por', coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado'),
    'motivo', btrim(p_motivo),
    'mensagem_origem_id', nullif(btrim(p_mensagem_origem_id), ''),
    'somente_data', true,
    'pagamento_executado_pela_maria', false
  );
end;
$function$;

revoke all on function public.maria_contas_corrigir_data_pagamento(uuid, date, text, text, text, text, text, text, text) from public;
grant execute on function public.maria_contas_corrigir_data_pagamento(uuid, date, text, text, text, text, text, text, text) to maria_operacional;
