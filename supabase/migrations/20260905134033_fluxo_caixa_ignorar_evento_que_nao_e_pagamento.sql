-- 05/09/2026 — terceira ferramenta que faltava no mesmo dia, mesmo padrao: a Rose respondeu
-- que dois lancamentos do livro caixa NAO eram pagamento (um print de aviso de cobranca a
-- vencer, um print de carrinho de compras), e a Maria nao tinha como registrar isso. O status
-- 'ignorado' ja existe e ja e usado por 123 eventos — faltava a porta.
--
-- Quando o humano responde e o registro continua errado, o que falta e ferramenta de escrita.
create or replace function public.maria_fluxo_caixa_ignorar_evento(
  p_evento_id uuid,
  p_motivo text,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text default null,
  p_texto_original text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor  public.maria_whatsapp_atores%rowtype;
  v_before public.maria_fluxo_caixa_eventos%rowtype;
  v_after  public.maria_fluxo_caixa_eventos%rowtype;
  v_audit_id uuid;
  v_motivo text;
  v_canal text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  -- Tirar um lancamento do caixa sem dizer por que e indistinguivel de apagar prova.
  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo !~ '[A-Za-zÀ-ÿ]{4,}' then
    raise exception 'motivo obrigatorio: diga por que este evento nao e pagamento (ex.: print de aviso de cobranca).';
  end if;

  select * into v_before from public.maria_fluxo_caixa_eventos where id = p_evento_id;
  if not found then
    raise exception 'evento % nao encontrado', p_evento_id;
  end if;

  if v_before.status = 'ignorado' then
    raise exception 'evento ja esta ignorado.';
  end if;

  -- Se o evento ja foi casado com uma conta a pagar, ele descreve dinheiro que saiu de
  -- verdade. Ignorar aqui deixaria a conta orfa e o caixa mentindo.
  if v_before.conta_pagar_id is not null then
    raise exception 'evento esta vinculado a uma conta a pagar — desfaca o vinculo antes de ignorar.';
  end if;

  v_canal := coalesce(nullif(btrim(p_canal), ''), 'whatsapp');

  update public.maria_fluxo_caixa_eventos
     set status = 'ignorado',
         observacoes = concat_ws(chr(10), observacoes,
           format('%s: marcado como NAO e pagamento por %s. Status anterior: %s. Motivo: %s',
                  to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
                  coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado'),
                  coalesce(v_before.status, 'sem status'),
                  v_motivo)),
         updated_at = now()
   where id = p_evento_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, v_canal,
    'maria_fluxo_caixa_eventos', 'fluxo_caixa_evento', p_evento_id,
    'ignorar_evento_fluxo_caixa',
    to_jsonb(v_before), to_jsonb(v_after),
    v_motivo, p_texto_original
  );

  return jsonb_build_object(
    'ok', true, 'success', true,
    'audit_id', v_audit_id,
    'evento_id', v_after.id,
    'data_operacional', v_after.data_operacional,
    'valor', round(v_after.valor_centavos / 100.0, 2),
    'unidade', v_after.unidade,
    'descricao', v_after.descricao,
    'status_anterior', v_before.status,
    'status', v_after.status,
    'informado_por', coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado')
  );
end;
$function$;

revoke all on function public.maria_fluxo_caixa_ignorar_evento(uuid, text, text, text, text, text, text) from public;
grant execute on function public.maria_fluxo_caixa_ignorar_evento(uuid, text, text, text, text, text, text) to maria_operacional;
