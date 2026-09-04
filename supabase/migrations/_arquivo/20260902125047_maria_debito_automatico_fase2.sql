-- maria_debito_automatico_fase2 (02/09/2026) — lado da Maria.
-- Contrato: Docs/handoffs/2026-09-02-debito-automatico-fase2.md (fase 1 = 20260902115559 coluna + 20260902121658 sync v6).
-- Fuso: sempre (now() at time zone 'America/Sao_Paulo')::date; nunca current_date.
-- Idempotente: cada bloco pula o que ja esta aplicado; ancoras sao contadas antes de trocar.

-- 0) Backup de prosrc/acl das funcoes tocadas (tabela privada; sem anon/authenticated).
create table if not exists public.maria_debito_fase2_prosrc_bkp_20260902 as
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc, p.proacl::text as acl, now() as bkp_em
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('maria_contas_unica_criar','maria_contas_recorrente_criar','maria_contas_parcelada_criar',
                     'maria_contas_dar_baixa','maria_contas_codigo_mes_registrar','maria_contas_codigo_mes_marcar_indisponivel',
                     'maria_agenda_digest_grupo','maria_contas_situacao_mes');
revoke all on table public.maria_debito_fase2_prosrc_bkp_20260902 from public, anon, authenticated;

-- 1) A view que a Maria le ganha a flag (ultima coluna; create or replace preserva o acl).
create or replace view public.vw_maria_contas_pagar as
 select id, descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, data_pagamento,
        metodo_pagamento, tipo_lancamento, parcela_atual, total_parcelas, observacoes, fonte_tipo, credencial_id,
        recorrente_modelo_id, parcelamento_id, plano_conta_id, centro_custo_id, emusys_lancamento_id, created_at, updated_at,
        debito_automatico
   from public.contas_pagar;

-- 2) Criar ja com a flag: p_debito_automatico boolean default false no fim da assinatura das 3 RPCs de criar
--    (eventual NAO: e gasto avulso, o app forca false). Assinatura muda -> drop + create, sem overload.
do $mig$
declare r record; def text; n int; ident_new text;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as ident
             from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public'
              and p.proname in ('maria_contas_unica_criar','maria_contas_recorrente_criar','maria_contas_parcelada_criar')
  loop
    def := pg_get_functiondef(r.oid);
    if def ~ 'p_debito_automatico' then raise notice '%: ja tem p_debito_automatico, pulando', r.proname; continue; end if;
    -- (a) assinatura
    n := (select count(*) from regexp_matches(def, $re$\)\s*RETURNS jsonb$re$, 'g'));
    if n <> 1 then raise exception '%: ancora RETURNS com % ocorrencias', r.proname, n; end if;
    def := regexp_replace(def, $re$\)(\s*RETURNS jsonb)$re$, $rp$, p_debito_automatico boolean DEFAULT false)\1$rp$);
    -- (b) lista de colunas do insert em contas_pagar
    n := (select count(*) from regexp_matches(def, $re$conta_pagadora_id(\s*\)\s*values\s*\()$re$, 'g'));
    if n <> 1 then raise exception '%: ancora colunas do insert com % ocorrencias', r.proname, n; end if;
    def := regexp_replace(def, $re$conta_pagadora_id(\s*\)\s*values\s*\()$re$, $rp$conta_pagadora_id, debito_automatico\1$rp$);
    -- (c) lista de valores do insert
    n := (select count(*) from regexp_matches(def, $re$p_conta_pagadora_id(\s*\)\s*returning \* into v_after)$re$, 'g'));
    if n <> 1 then raise exception '%: ancora valores do insert com % ocorrencias', r.proname, n; end if;
    def := regexp_replace(def, $re$p_conta_pagadora_id(\s*\)\s*returning \* into v_after)$re$, $rp$p_conta_pagadora_id, coalesce(p_debito_automatico, false)\1$rp$);
    -- (d) troca sem overload + grants explicitos
    ident_new := r.ident || ', p_debito_automatico boolean';
    execute format('drop function public.%I(%s)', r.proname, r.ident);
    execute def;
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', r.proname, ident_new);
    execute format('grant execute on function public.%I(%s) to service_role, maria_operacional', r.proname, ident_new);
    if (select count(*) from pg_proc where proname = r.proname) <> 1 then raise exception '%: overload indevido', r.proname; end if;
    raise notice '%: p_debito_automatico adicionado', r.proname;
  end loop;
end $mig$;

-- 3) Baixa: conta flagada sem metodo assume 'Débito Automático'; grafia sem acento vira a canonica.
do $mig$
declare def text; n int;
  a text := $a$  if v_metodo is null then
    raise exception 'metodo_pagamento obrigatorio para baixa.';
  end if;$a$;
  b text := $b$  -- fase 2 debito automatico (02/09/2026): conta flagada dispensa o metodo — assume o canonico.
  if v_metodo is null and exists (select 1 from public.contas_pagar c where c.id = p_conta_id and c.debito_automatico) then
    v_metodo := 'Débito Automático';
  end if;
  if v_metodo is null then
    raise exception 'metodo_pagamento obrigatorio para baixa.';
  end if;
  if lower(v_metodo) in (lower('Débito Automático'), lower('Debito Automatico')) then
    v_metodo := 'Débito Automático';
  end if;$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_contas_dar_baixa';
  if def like '%fase 2 debito automatico%' then raise notice 'dar_baixa: ja aplicado'; return; end if;
  n := (length(def) - length(replace(def, a, ''))) / length(a);
  if n <> 1 then raise exception 'dar_baixa: ancora com % ocorrencias', n; end if;
  execute replace(def, a, b);
  raise notice 'dar_baixa: fallback Débito Automático aplicado';
end $mig$;

-- 4) Codigo do mes: conta flagada nao tem codigo para coletar (nem marcar indisponivel).
do $mig$
declare def text; n int;
  a1 text := $a$  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  v_codigo_barras := nullif(trim(p_codigo_barras), '');$a$;
  b1 text := $b$  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  -- fase 2 debito automatico (02/09/2026)
  if v_conta.debito_automatico then
    raise exception 'conta em débito automático: não há código do mês para coletar.' using errcode = 'P0001';
  end if;

  v_codigo_barras := nullif(trim(p_codigo_barras), '');$b$;
  a2 text := $a$if not exists (select 1 from public.contas_pagar where id=p_conta_pagar_id) then raise exception 'conta_pagar nao encontrada.'; end if;$a$;
  b2 text := $b$if not exists (select 1 from public.contas_pagar where id=p_conta_pagar_id) then raise exception 'conta_pagar nao encontrada.'; end if;
  -- fase 2 debito automatico (02/09/2026)
  if exists (select 1 from public.contas_pagar where id=p_conta_pagar_id and debito_automatico) then raise exception 'conta em débito automático: não há código do mês para coletar.' using errcode = 'P0001'; end if;$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_contas_codigo_mes_registrar';
  if def like '%fase 2 debito automatico%' then raise notice 'codigo_mes_registrar: ja aplicado';
  else
    n := (length(def) - length(replace(def, a1, ''))) / length(a1);
    if n <> 1 then raise exception 'codigo_mes_registrar: ancora com % ocorrencias', n; end if;
    execute replace(def, a1, b1);
    raise notice 'codigo_mes_registrar: recusa em debito automatico aplicada';
  end if;
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_contas_codigo_mes_marcar_indisponivel';
  if def like '%fase 2 debito automatico%' then raise notice 'codigo_mes_marcar_indisponivel: ja aplicado';
  else
    n := (length(def) - length(replace(def, a2, ''))) / length(a2);
    if n <> 1 then raise exception 'codigo_mes_marcar_indisponivel: ancora com % ocorrencias', n; end if;
    execute replace(def, a2, b2);
    raise notice 'codigo_mes_marcar_indisponivel: recusa em debito automatico aplicada';
  end if;
end $mig$;

-- 5) Digest do grupo: conta flagada nao tem espelho "Pagar:" (sync v6) — entra direto da conta, em bloco proprio.
do $mig$
declare def text; n int;
  a1 text := $a$v_c_hoje jsonb; v_c_atr jsonb; v_c_prox jsonb;$a$;
  b1 text := $b$v_c_hoje jsonb; v_c_atr jsonb; v_c_prox jsonb; v_c_deb jsonb;$b$;
  a2 text := $a$  return jsonb_build_object(
    'success', true, 'data', v_data, 'horizonte_dias', v_h,$a$;
  b2 text := $b$  -- fase 2 debito automatico (02/09/2026): sem espelho na agenda, a conta flagada entra aqui direto de contas_pagar.
  select jsonb_build_object(
      'n', count(*) filter (where c.data_vencimento between v_data and v_data + v_h),
      'total', coalesce(sum(c.valor) filter (where c.data_vencimento between v_data and v_data + v_h), 0),
      'itens', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.descricao, 'valor', c.valor, 'unidade', c.unidade,
                        'data_local', to_char(c.data_vencimento, 'YYYY-MM-DD')) order by c.data_vencimento, c.valor desc)
                        filter (where c.data_vencimento between v_data and v_data + v_h), '[]'::jsonb),
      'sem_baixa', jsonb_build_object(
        'n', count(*) filter (where c.data_vencimento < v_data),
        'total', coalesce(sum(c.valor) filter (where c.data_vencimento < v_data), 0),
        'itens', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.descricao, 'valor', c.valor, 'unidade', c.unidade,
                          'data_local', to_char(c.data_vencimento, 'YYYY-MM-DD')) order by c.data_vencimento)
                          filter (where c.data_vencimento < v_data), '[]'::jsonb)))
    into v_c_deb
    from public.contas_pagar c
   where c.debito_automatico and c.status = 'pendente' and c.data_vencimento <= v_data + v_h;

  return jsonb_build_object(
    'success', true, 'data', v_data, 'horizonte_dias', v_h,$b$;
  a3 text := $a$'contas_hoje', v_c_hoje, 'contas_atrasadas', v_c_atr, 'contas_proximas', v_c_prox,$a$;
  b3 text := $b$'contas_hoje', v_c_hoje, 'contas_atrasadas', v_c_atr, 'contas_proximas', v_c_prox, 'contas_debito_automatico', v_c_deb,$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_agenda_digest_grupo';
  if def like '%fase 2 debito automatico%' then raise notice 'digest: ja aplicado'; return; end if;
  n := (length(def) - length(replace(def, a1, ''))) / length(a1); if n <> 1 then raise exception 'digest: ancora declare com % ocorrencias', n; end if;
  n := (length(def) - length(replace(def, a2, ''))) / length(a2); if n <> 1 then raise exception 'digest: ancora return com % ocorrencias', n; end if;
  n := (length(def) - length(replace(def, a3, ''))) / length(a3); if n <> 1 then raise exception 'digest: ancora saida com % ocorrencias', n; end if;
  execute replace(replace(replace(def, a1, b1), a2, b2), a3, b3);
  raise notice 'digest: contas_debito_automatico adicionado';
end $mig$;

-- 6) Situacao do mes: cada item diz se e debito automatico (a view ja tem a coluna; funcao SQL revalida na criacao).
do $mig$
declare def text; n int;
  a text := $a$'metodo', metodo_pagamento, 'parcela', parcela_atual,$a$;
  b text := $b$'metodo', metodo_pagamento, 'debito_automatico', debito_automatico, 'parcela', parcela_atual,$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_contas_situacao_mes';
  if def like '%''debito_automatico'', debito_automatico%' then raise notice 'situacao_mes: ja aplicado'; return; end if;
  n := (length(def) - length(replace(def, a, ''))) / length(a);
  if n <> 1 then raise exception 'situacao_mes: ancora com % ocorrencias', n; end if;
  execute replace(def, a, b);
  raise notice 'situacao_mes: debito_automatico no item';
end $mig$;

-- 7) Ligar/desligar numa conta existente (mesmo molde: assert_actor, for update, audit, {success,...}).
create or replace function public.maria_contas_definir_debito_automatico(
  p_conta_id uuid, p_debito_automatico boolean, p_ator_numero text, p_papel text, p_canal text,
  p_texto_original text default null, p_motivo text default null, p_aplicar_futuros boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_modelo_id uuid;
  v_prop uuid[] := '{}'::uuid[];
  v_audit_id uuid;
  v_flag boolean := coalesce(p_debito_automatico, false);
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then raise exception 'conta_pagar nao encontrada.'; end if;
  if v_before.status = 'cancelado' then
    raise exception 'conta cancelada nao se altera.' using errcode = 'P0001';
  end if;
  if v_flag and v_before.tipo_lancamento = 'eventual' then
    raise exception 'conta eventual nao aceita debito automatico: eventual e gasto avulso; a flag e para conta recorrente, unica ou parcelada.' using errcode = 'P0001';
  end if;

  update public.contas_pagar set debito_automatico = v_flag, updated_at = now() where id = p_conta_id returning * into v_after;

  if coalesce(p_aplicar_futuros, true) then
    if v_before.tipo_lancamento = 'recorrente' then
      -- modelo = a propria conta (recorrente_modelo_id nulo) ou o modelo dela; instancias pendentes desta competencia em diante.
      v_modelo_id := coalesce(v_before.recorrente_modelo_id, v_before.id);
      with u as (
        update public.contas_pagar c set debito_automatico = v_flag, updated_at = now()
         where c.id <> p_conta_id and c.debito_automatico is distinct from v_flag
           and (c.id = v_modelo_id
                or (c.recorrente_modelo_id = v_modelo_id and c.status = 'pendente' and c.competencia >= v_before.competencia))
        returning c.id)
      select coalesce(array_agg(u.id), '{}'::uuid[]) into v_prop from u;
    elsif v_before.tipo_lancamento = 'parcelada' and v_before.parcelamento_id is not null then
      with u as (
        update public.contas_pagar c set debito_automatico = v_flag, updated_at = now()
         where c.id <> p_conta_id and c.parcelamento_id = v_before.parcelamento_id and c.status = 'pendente'
           and c.data_vencimento >= v_before.data_vencimento and c.debito_automatico is distinct from v_flag
        returning c.id)
      select coalesce(array_agg(u.id), '{}'::uuid[]) into v_prop from u;
    end if;
  end if;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, coalesce(nullif(trim(p_canal), ''), 'whatsapp'), 'contas_pagar', 'conta_pagar', p_conta_id,
    case when v_flag then 'ligar_debito_automatico' else 'desligar_debito_automatico' end,
    jsonb_build_object('conta', to_jsonb(v_before)),
    jsonb_build_object('conta', to_jsonb(v_after), 'propagadas', to_jsonb(v_prop)),
    p_motivo, p_texto_original);

  return jsonb_build_object(
    'ok', true, 'success', true, 'audit_id', v_audit_id,
    'conta_id', v_after.id, 'descricao', v_after.descricao, 'tipo_lancamento', v_after.tipo_lancamento,
    'antes', v_before.debito_automatico, 'debito_automatico', v_after.debito_automatico,
    'mudou', (v_before.debito_automatico is distinct from v_after.debito_automatico),
    'propagadas', coalesce(array_length(v_prop, 1), 0), 'propagadas_ids', to_jsonb(v_prop),
    'resumo', format('Débito automático %s em "%s"%s.%s',
       case when v_flag then 'ligado' else 'desligado' end, v_after.descricao,
       case when coalesce(array_length(v_prop, 1), 0) > 0 then format(' e em %s conta(s) da mesma série', array_length(v_prop, 1)) else '' end,
       case when v_flag then ' O espelho "Pagar:" da agenda sai sozinho em até 10 min; a conta segue na lista do dia marcada como débito automático.'
            else ' O espelho "Pagar:" volta pra agenda em até 10 min.' end),
    'registrado_por', 'Maria', 'pagamento_executado_pela_maria', false);
end $$;
revoke all on function public.maria_contas_definir_debito_automatico(uuid, boolean, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.maria_contas_definir_debito_automatico(uuid, boolean, text, text, text, text, text, boolean) to service_role, maria_operacional;

-- 8) Grants explicitos nas funcoes recriadas (create or replace preserva acl; aqui fica declarado) + checagens.
do $mig$
declare r record; leitura text[] := array['maria_agenda_digest_grupo','maria_contas_situacao_mes'];
  nomes text[] := array['maria_contas_unica_criar','maria_contas_recorrente_criar','maria_contas_parcelada_criar',
                        'maria_contas_dar_baixa','maria_contas_codigo_mes_registrar','maria_contas_codigo_mes_marcar_indisponivel',
                        'maria_agenda_digest_grupo','maria_contas_situacao_mes','maria_contas_definir_debito_automatico'];
begin
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) as ident
             from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.proname = any(nomes)
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', r.proname, r.ident);
    execute format('grant execute on function public.%I(%s) to service_role, maria_operacional', r.proname, r.ident);
    if r.proname = any(leitura) then execute format('grant execute on function public.%I(%s) to maria_leitura', r.proname, r.ident); end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vw_maria_contas_pagar' and column_name = 'debito_automatico') then
    raise exception 'vw_maria_contas_pagar sem debito_automatico';
  end if;
  -- uma autoria por assinatura: nenhuma das funcoes tocadas pode ficar com overload
  -- (maria_ml_identificar_compra ja tem overload pre-existente, fora deste contrato — nao e checado aqui).
  if exists (select proname from pg_proc where proname = any(nomes) group by proname having count(*) > 1) then
    raise exception 'overload nas funcoes tocadas: %', (select string_agg(proname, ', ') from (select proname from pg_proc where proname = any(nomes) group by proname having count(*) > 1) x);
  end if;
  if (select count(*) from pg_proc where proname = any(nomes)) <> 9 then
    raise exception 'esperava 9 funcoes, achou %', (select count(*) from pg_proc where proname = any(nomes));
  end if;
end $mig$;
