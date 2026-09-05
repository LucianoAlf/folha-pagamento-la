-- 05/09/2026 — 2ª habilidade que faltou hoje. A Maria perguntou à Rose o que eram os lançamentos do
-- livro caixa com descrição ilegível (OCR não leu). A Rose respondeu um por um — e a Maria não tinha
-- como gravar a resposta: não existe RPC para completar a descrição de um evento do fluxo de caixa.
-- Mesmo padrão da correção de data: a pessoa responde e o registro continua errado.
--
-- Guardas: evento tem que existir e estar confirmado; descrição nova precisa NOMEAR algo (>= 1 token de
-- 4+ letras — a mesma regra que a governança usa para dizer que a descrição é lixo, agora do lado de
-- quem conserta); a descrição antiga é preservada na observação; motivo obrigatório; auditoria.
create or replace function public.maria_fluxo_caixa_descrever_evento(
  p_evento_id           uuid,
  p_descricao           text,
  p_confirmado_por_nome text,
  p_ator_numero         text,
  p_papel               text,
  p_canal               text default null,
  p_texto_original      text default null,
  p_motivo              text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor  public.maria_whatsapp_atores%rowtype;
  v_before public.maria_fluxo_caixa_eventos%rowtype;
  v_after  public.maria_fluxo_caixa_eventos%rowtype;
  v_audit_id uuid;
  v_nova text;
  v_canal text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_nova := btrim(coalesce(p_descricao, ''));
  if v_nova = '' then
    raise exception 'descricao obrigatoria.';
  end if;

  -- Mesma regra que a governanca usa para chamar a descricao de ilegivel: se a nova tambem nao nomeia
  -- nada, o evento continuaria suspeito e a correcao seria so barulho.
  if v_nova !~ '[A-Za-zÀ-ÿ]{4,}' then
    raise exception 'descricao precisa nomear o pagamento (pelo menos uma palavra de 4+ letras): "%"', v_nova;
  end if;

  select * into v_before from public.maria_fluxo_caixa_eventos where id = p_evento_id;
  if not found then
    raise exception 'evento % nao encontrado', p_evento_id;
  end if;

  if v_before.status is distinct from 'confirmado' then
    raise exception 'so descrevo evento confirmado (status atual: %).', coalesce(v_before.status, 'sem status');
  end if;

  v_canal := coalesce(nullif(btrim(p_canal), ''), 'whatsapp');

  update public.maria_fluxo_caixa_eventos
     set descricao = v_nova,
         observacoes = concat_ws(chr(10), observacoes,
           format('05/09/2026+: descricao completada por %s. Antes: "%s". Motivo: %s',
                  coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado'),
                  coalesce(nullif(btrim(v_before.descricao), ''), '(vazia)'),
                  coalesce(nullif(btrim(p_motivo), ''), 'OCR nao leu a descricao original'))),
         updated_at = now()
   where id = p_evento_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, v_canal,
    'maria_fluxo_caixa_eventos', 'fluxo_caixa_evento', p_evento_id,
    'descrever_evento_fluxo_caixa',
    to_jsonb(v_before), to_jsonb(v_after),
    p_motivo, p_texto_original
  );

  return jsonb_build_object(
    'ok', true, 'success', true,
    'audit_id', v_audit_id,
    'evento_id', v_after.id,
    'data_operacional', v_after.data_operacional,
    'valor', round(v_after.valor_centavos / 100.0, 2),
    'unidade', v_after.unidade,
    'descricao_anterior', v_before.descricao,
    'descricao', v_after.descricao,
    'informado_por', coalesce(nullif(btrim(p_confirmado_por_nome), ''), 'nao informado'),
    'somente_descricao', true
  );
end;
$function$;

revoke all on function public.maria_fluxo_caixa_descrever_evento(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.maria_fluxo_caixa_descrever_evento(uuid, text, text, text, text, text, text, text) to maria_operacional;
