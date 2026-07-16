-- One-time repair for the first live backfill, whose accent map was mangled by
-- the migration transport. The guard keeps this correction specific to the
-- known folha 17 snapshot and makes it a no-op in clean environments.
do $repair$
declare
  v_before_rows integer;
  v_before_pending integer;
  v_before_hash text;
  v_after_rows integer;
  v_after_pending integer;
  v_after_sum numeric;
  v_total_geral numeric;
  v_result jsonb;
begin
  select
    count(*)::integer,
    count(*) filter (where tratamento = 'pendente')::integer,
    min(hash_origem)
  into v_before_rows, v_before_pending, v_before_hash
  from public.folha_classificacao_dre
  where folha_id = 17;

  if v_before_rows = 0 or v_before_pending = 0 then
    return;
  end if;

  if v_before_rows <> 358
     or v_before_pending <> 19
     or v_before_hash <> '8e1b8527182be9a29e4e4fd777cf12f7847e9fd5ab9ba9cf5ef38c0bbf9439fe' then
    raise exception 'snapshot da folha 17 divergiu; reparacao de normalizacao abortada.';
  end if;

  select total_geral
  into v_total_geral
  from public.folhas_mensais
  where id = 17
    and status = 'fechada'
  for update;

  if not found then
    raise exception 'folha 17 fechada nao encontrada; reparacao abortada.';
  end if;

  delete from public.folha_classificacao_dre where folha_id = 17;
  v_result := public.folha_classificar_dre(17, true);

  select
    count(*)::integer,
    count(*) filter (where tratamento = 'pendente')::integer,
    round(sum(valor_assinado), 2)
  into v_after_rows, v_after_pending, v_after_sum
  from public.folha_classificacao_dre
  where folha_id = 17;

  if v_after_rows <> 358 or v_after_pending <> 0 or v_after_sum <> v_total_geral then
    raise exception
      'reparacao da folha 17 nao reconciliou: linhas %, pendentes %, soma %, total %.',
      v_after_rows, v_after_pending, v_after_sum, v_total_geral;
  end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  )
  values (
    'Codex migration repair', 'migration:folha_dre_repair_backfill_17',
    encode(
      extensions.digest('migration:folha_dre_repair_backfill_17', 'sha256'),
      'hex'
    ),
    'n/a',
    'owner_full', 'migration', 'database', current_user,
    'folha_classificacao_dre', 'folha_dre', null,
    'REPARAR_BACKFILL_DRE_NORMALIZACAO',
    jsonb_build_object(
      'folha_id', 17,
      'linhas', v_before_rows,
      'pendentes', v_before_pending,
      'hash_origem', v_before_hash
    ),
    jsonb_build_object(
      'folha_id', 17,
      'linhas', v_after_rows,
      'pendentes', v_after_pending,
      'soma_assinada', v_after_sum,
      'resultado_classificador', v_result
    ),
    'corrige mapa de acentos corrompido no transporte da migration inicial',
    null
  );
end;
$repair$;
