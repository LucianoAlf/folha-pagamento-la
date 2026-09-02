-- Rodar via MCP execute_sql. Aplica o corpo do seed DUAS VEZES dentro de rollback e confere que a 2a
-- rodada nao muda nada (idempotencia por construcao: where not exists por titulo + lista + pai).
-- Serve tanto no banco virgem (0 -> 36 -> 36) quanto no ja semeado (36 -> 36 -> 36).
-- Esperado: 'PASS: 08_seed'.
begin;

create temp table t08_contagem (fase text primary key, n int);
insert into t08_contagem values ('antes', (select count(*) from public.agenda_rotinas));

-- ================================================================ 1a aplicacao do seed (verbatim da migration)
do $guard$
begin
  if not exists (
    select 1 from public.tarefas_listas
    where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  ) then
    raise exception 'lista Financeiro nao encontrada; seed abortado.' using errcode = 'P0001';
  end if;
end $guard$;

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, descricao, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, vigencia_inicio, ordem
)
select m.titulo, m.descricao, f.id, 'financeiro', 'media', m.dia_mes::smallint, m.ultimo_dia,
       m.se_cair_fim_de_semana, time '09:00', true, 'ativa', date '2026-09-01', m.ordem
from fin f
cross join (values
  ('Conciliação de Cartões',                                                     null::text,                             30,   false, 'manter',            10),
  ('Pedir fatura ao Luciano',                                                    null,                                    1,   false, 'manter',            20),
  ('Depósito de Cheques',                                                        null,                                    6,   false, 'proximo_dia_util',  30),
  ('Repasses de Cartões – Maquininha',                                           null,                                 null,    true, 'proximo_dia_util',  40),
  ('Cashbacks do mês aplicados',                                                 null,                                    1,   false, 'proximo_dia_util',  50),
  ('Dar baixa no prolabore/poupança/distribuição de lucros – conta cheques',     null,                                    1,   false, 'proximo_dia_util',  60),
  ('Fazer relação de previsão de cheques das escolas',                           null,                                    2,   false, 'manter',            70),
  ('Listar valores repassados para Bistrô',                                      null,                                    3,   false, 'manter',            80),
  ('Relatório Mensal Financeiro (Grupo)',                                        null,                                    5,   false, 'manter',            90),
  ('Faturamento Mensal',                                                         'indispensável para gerar o SIMPLES',    8,   false, 'manter',           100)
) as m(titulo, descricao, dia_mes, ultimo_dia, se_cair_fim_de_semana, ordem)
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = m.titulo
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, vigencia_inicio, ordem, parent_rotina_id
)
select c.titulo, f.id, 'financeiro', 'media', c.dia_mes::smallint, c.ultimo_dia, c.se_cair_fim_de_semana,
       time '09:00', true, 'ativa', date '2026-09-01', c.ordem, p.id
from fin f
cross join (values
  ('Conciliação de Cartões',          'Cartão 2270 EMLA',      12,   false, 'manter',           11),
  ('Conciliação de Cartões',          'Cartão 8516 Barra',     12,   false, 'manter',           12),
  ('Conciliação de Cartões',          'Cartão 8641 Recreio',   17,   false, 'manter',           13),
  ('Conciliação de Cartões',          'Cartão 8434 Kids CG',   25,   false, 'manter',           14),
  ('Conciliação de Cartões',          'Cartão 1074 Kids CG',   25,   false, 'manter',           15),
  ('Conciliação de Cartões',          'Mercado Pago Barra',    27,   false, 'manter',           16),

  ('Pedir fatura ao Luciano',         'Recreio 8641',           3,   false, 'manter',           21),
  ('Pedir fatura ao Luciano',         'Kids CG 1074',          14,   false, 'manter',           22),
  ('Pedir fatura ao Luciano',         'Kids CG 8434',          14,   false, 'manter',           23),
  ('Pedir fatura ao Luciano',         'Mercado Pago 4425',     20,   false, 'manter',           24),
  ('Pedir fatura ao Luciano',         'Barra 8516',            29,   false, 'manter',           25),
  ('Pedir fatura ao Luciano',         'EMLA CG 2270',          29,   false, 'manter',           26),

  ('Depósito de Cheques',             'Venc 05 → prazo 06',     6,   false, 'proximo_dia_util', 31),
  ('Depósito de Cheques',             'Venc 08 → prazo 09',     9,   false, 'proximo_dia_util', 32),
  ('Depósito de Cheques',             'Venc 10 → prazo 11',    11,   false, 'proximo_dia_util', 33),
  ('Depósito de Cheques',             'Venc 20 → prazo 21',    21,   false, 'proximo_dia_util', 34),

  ('Repasses de Cartões – Maquininha','Repasse Recreio',     null,    true, 'proximo_dia_util', 41),
  ('Repasses de Cartões – Maquininha','Repasse Barra',       null,    true, 'proximo_dia_util', 42),
  ('Repasses de Cartões – Maquininha','Repasse CG',          null,    true, 'proximo_dia_util', 43),

  ('Cashbacks do mês aplicados',      'Cashback Barra',         3,   false, 'proximo_dia_util', 51),
  ('Cashbacks do mês aplicados',      'Cashback CG',            3,   false, 'proximo_dia_util', 52),
  ('Cashbacks do mês aplicados',      'Cashback Recreio',       3,   false, 'proximo_dia_util', 53)
) as c(pai, titulo, dia_mes, ultimo_dia, se_cair_fim_de_semana, ordem)
join public.agenda_rotinas p
  on p.lista_id = f.id and p.parent_rotina_id is null and p.titulo = c.pai
where not exists (
  select 1 from public.agenda_rotinas r
  where r.parent_rotina_id = p.id and r.titulo = c.titulo
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Conciliação Bancária mês anterior', f.id, 'financeiro', 'media', 1::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 110,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Conciliação Bancária mês anterior'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Enviar faturamento pro Geraldo/contador', f.id, 'financeiro', 'media', 5::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 120,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Enviar faturamento pro Geraldo/contador'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Planilha do financeiro por unidade', f.id, 'financeiro', 'media', 5::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 130,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Planilha do financeiro por unidade'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Conferir débito automático Light (Recreio)', f.id, 'financeiro', 'media', 1::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 140,
       'Rose 01/09: pode sair — Light passou a débito automático.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Conferir débito automático Light (Recreio)'
);

insert into t08_contagem values ('apos_1a', (select count(*) from public.agenda_rotinas));

-- ================================================================ 2a aplicacao (replay verbatim): tem que ser no-op
do $guard$
begin
  if not exists (
    select 1 from public.tarefas_listas
    where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  ) then
    raise exception 'lista Financeiro nao encontrada; seed abortado.' using errcode = 'P0001';
  end if;
end $guard$;

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, descricao, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, vigencia_inicio, ordem
)
select m.titulo, m.descricao, f.id, 'financeiro', 'media', m.dia_mes::smallint, m.ultimo_dia,
       m.se_cair_fim_de_semana, time '09:00', true, 'ativa', date '2026-09-01', m.ordem
from fin f
cross join (values
  ('Conciliação de Cartões',                                                     null::text,                             30,   false, 'manter',            10),
  ('Pedir fatura ao Luciano',                                                    null,                                    1,   false, 'manter',            20),
  ('Depósito de Cheques',                                                        null,                                    6,   false, 'proximo_dia_util',  30),
  ('Repasses de Cartões – Maquininha',                                           null,                                 null,    true, 'proximo_dia_util',  40),
  ('Cashbacks do mês aplicados',                                                 null,                                    1,   false, 'proximo_dia_util',  50),
  ('Dar baixa no prolabore/poupança/distribuição de lucros – conta cheques',     null,                                    1,   false, 'proximo_dia_util',  60),
  ('Fazer relação de previsão de cheques das escolas',                           null,                                    2,   false, 'manter',            70),
  ('Listar valores repassados para Bistrô',                                      null,                                    3,   false, 'manter',            80),
  ('Relatório Mensal Financeiro (Grupo)',                                        null,                                    5,   false, 'manter',            90),
  ('Faturamento Mensal',                                                         'indispensável para gerar o SIMPLES',    8,   false, 'manter',           100)
) as m(titulo, descricao, dia_mes, ultimo_dia, se_cair_fim_de_semana, ordem)
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = m.titulo
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, vigencia_inicio, ordem, parent_rotina_id
)
select c.titulo, f.id, 'financeiro', 'media', c.dia_mes::smallint, c.ultimo_dia, c.se_cair_fim_de_semana,
       time '09:00', true, 'ativa', date '2026-09-01', c.ordem, p.id
from fin f
cross join (values
  ('Conciliação de Cartões',          'Cartão 2270 EMLA',      12,   false, 'manter',           11),
  ('Conciliação de Cartões',          'Cartão 8516 Barra',     12,   false, 'manter',           12),
  ('Conciliação de Cartões',          'Cartão 8641 Recreio',   17,   false, 'manter',           13),
  ('Conciliação de Cartões',          'Cartão 8434 Kids CG',   25,   false, 'manter',           14),
  ('Conciliação de Cartões',          'Cartão 1074 Kids CG',   25,   false, 'manter',           15),
  ('Conciliação de Cartões',          'Mercado Pago Barra',    27,   false, 'manter',           16),

  ('Pedir fatura ao Luciano',         'Recreio 8641',           3,   false, 'manter',           21),
  ('Pedir fatura ao Luciano',         'Kids CG 1074',          14,   false, 'manter',           22),
  ('Pedir fatura ao Luciano',         'Kids CG 8434',          14,   false, 'manter',           23),
  ('Pedir fatura ao Luciano',         'Mercado Pago 4425',     20,   false, 'manter',           24),
  ('Pedir fatura ao Luciano',         'Barra 8516',            29,   false, 'manter',           25),
  ('Pedir fatura ao Luciano',         'EMLA CG 2270',          29,   false, 'manter',           26),

  ('Depósito de Cheques',             'Venc 05 → prazo 06',     6,   false, 'proximo_dia_util', 31),
  ('Depósito de Cheques',             'Venc 08 → prazo 09',     9,   false, 'proximo_dia_util', 32),
  ('Depósito de Cheques',             'Venc 10 → prazo 11',    11,   false, 'proximo_dia_util', 33),
  ('Depósito de Cheques',             'Venc 20 → prazo 21',    21,   false, 'proximo_dia_util', 34),

  ('Repasses de Cartões – Maquininha','Repasse Recreio',     null,    true, 'proximo_dia_util', 41),
  ('Repasses de Cartões – Maquininha','Repasse Barra',       null,    true, 'proximo_dia_util', 42),
  ('Repasses de Cartões – Maquininha','Repasse CG',          null,    true, 'proximo_dia_util', 43),

  ('Cashbacks do mês aplicados',      'Cashback Barra',         3,   false, 'proximo_dia_util', 51),
  ('Cashbacks do mês aplicados',      'Cashback CG',            3,   false, 'proximo_dia_util', 52),
  ('Cashbacks do mês aplicados',      'Cashback Recreio',       3,   false, 'proximo_dia_util', 53)
) as c(pai, titulo, dia_mes, ultimo_dia, se_cair_fim_de_semana, ordem)
join public.agenda_rotinas p
  on p.lista_id = f.id and p.parent_rotina_id is null and p.titulo = c.pai
where not exists (
  select 1 from public.agenda_rotinas r
  where r.parent_rotina_id = p.id and r.titulo = c.titulo
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Conciliação Bancária mês anterior', f.id, 'financeiro', 'media', 1::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 110,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Conciliação Bancária mês anterior'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Enviar faturamento pro Geraldo/contador', f.id, 'financeiro', 'media', 5::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 120,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Enviar faturamento pro Geraldo/contador'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Planilha do financeiro por unidade', f.id, 'financeiro', 'media', 5::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 130,
       'Encerrada no LA Organizer; nao migrada.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Planilha do financeiro por unidade'
);

with fin as (
  select id
  from public.tarefas_listas
  where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  order by ordem
  limit 1
)
insert into public.agenda_rotinas (
  titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
  hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao
)
select 'Conferir débito automático Light (Recreio)', f.id, 'financeiro', 'media', 1::smallint, false, 'manter',
       time '09:00', true, 'encerrada', now(), date '2026-09-01', 140,
       'Rose 01/09: pode sair — Light passou a débito automático.'
from fin f
where not exists (
  select 1 from public.agenda_rotinas r
  where r.lista_id = f.id and r.parent_rotina_id is null and r.titulo = 'Conferir débito automático Light (Recreio)'
);

insert into t08_contagem values ('apos_2a', (select count(*) from public.agenda_rotinas));

-- ================================================================ conferencia
do $t$
declare v_1a int; v_2a int; v_fin uuid;
begin
  select n into v_1a from t08_contagem where fase = 'apos_1a';
  select n into v_2a from t08_contagem where fase = 'apos_2a';
  assert v_2a = v_1a, 'seed reaplicado duplicou: ' || v_1a || ' -> ' || v_2a;

  select id into v_fin from public.tarefas_listas
   where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;

  assert (select count(*) from public.agenda_rotinas where parent_rotina_id is null and status = 'ativa') = 10,
    'pais ativos <> 10';
  assert (select count(*) from public.agenda_rotinas where parent_rotina_id is not null) = 22, 'filhas <> 22';
  assert (select count(*) from public.agenda_rotinas where status = 'encerrada') = 4, 'encerradas <> 4';
  assert (select count(*) from public.agenda_rotinas where lista_id = v_fin) = 36, 'total no Financeiro <> 36';
  assert (select count(*) from public.tarefas where rotina_id is not null) = 0, 'seed nao pode criar instancias';

  -- Light entra como registro encerrado, nao como rotina viva.
  assert (select count(*) from public.agenda_rotinas
           where titulo like 'Conferir débito automático Light%' and status = 'encerrada') = 1, 'Light <> 1 encerrada';
  assert (select observacao from public.agenda_rotinas
           where titulo like 'Conferir débito automático Light%') like 'Rose 01/09: pode sair%', 'observacao da Light';

  -- FDS por natureza: Deposito 1+4, Repasses 1+3, Cashbacks 1+3, Prolabore 1 = 14.
  assert (select count(*) from public.agenda_rotinas where se_cair_fim_de_semana = 'proximo_dia_util') = 14,
    'proximo_dia_util <> 14';
  assert (select count(*) from public.agenda_rotinas where se_cair_fim_de_semana = 'manter') = 22, 'manter <> 22';

  -- vigencia literal e sem profundidade 2.
  assert (select count(*) from public.agenda_rotinas where vigencia_inicio <> date '2026-09-01') = 0, 'vigencia_inicio';
  assert not exists (
    select 1 from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
    where p.parent_rotina_id is not null), 'profundidade > 1';
  -- filha sempre na lista do pai.
  assert not exists (
    select 1 from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
    where p.lista_id <> f.lista_id), 'filha fora da lista do pai';

  -- filhas por pai
  assert (select count(*) from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
           where p.titulo = 'Conciliação de Cartões') = 6, 'Conciliação de Cartões <> 6 filhas';
  assert (select count(*) from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
           where p.titulo = 'Pedir fatura ao Luciano') = 6, 'Pedir fatura ao Luciano <> 6 filhas';
  assert (select count(*) from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
           where p.titulo = 'Depósito de Cheques') = 4, 'Depósito de Cheques <> 4 filhas';
  assert (select count(*) from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
           where p.titulo = 'Repasses de Cartões – Maquininha') = 3, 'Repasses <> 3 filhas';
  assert (select count(*) from public.agenda_rotinas f join public.agenda_rotinas p on p.id = f.parent_rotina_id
           where p.titulo = 'Cashbacks do mês aplicados') = 3, 'Cashbacks <> 3 filhas';

  -- ultimo_dia so nos Repasses (pai + 3 filhas)
  assert (select count(*) from public.agenda_rotinas where ultimo_dia) = 4, 'ultimo_dia <> 4';
  assert (select count(*) from public.agenda_rotinas where dia_mes is null and not ultimo_dia) = 0, 'dia_mes nulo sem ultimo_dia';
end $t$;

rollback;
select 'PASS: 08_seed' as resultado;
