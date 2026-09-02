-- Seed das rotinas do grupo Financeiro (catalogo do LA Organizer, spec §8). IDEMPOTENTE: where not exists
-- por (titulo, lista, pai) — replay em branch/restore nao duplica. NUNCA instancias (o cron materializa).
--
-- Nota de implementacao: plpgsql nao tem funcao/procedure local dentro de `do`, e o seed nao precisa de
-- estado entre linhas (a `ordem` e literal, o pai e resolvido por titulo). Entao ele e escrito em SQL puro
-- — `insert … select … where not exists` — em vez de helpers em pg_temp: cada statement e auto-suficiente,
-- re-executavel e legivel na revisao. Todas as rotinas: categoria 'financeiro', prioridade 'media',
-- hora 09:00, dia_inteiro true, vigencia_inicio date '2026-09-01' (data literal, sem funcao de "hoje": o
-- fuso do projeto e America/Sao_Paulo e o seed nao pode depender do fuso do servidor).

-- Guarda: sem a lista Financeiro o seed aborta inteiro (nada pela metade).
do $guard$
begin
  if not exists (
    select 1 from public.tarefas_listas
    where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false
  ) then
    raise exception 'lista Financeiro nao encontrada; seed abortado.' using errcode = 'P0001';
  end if;
end $guard$;

-- ---------------------------------------------------------------- 10 moldes pais ativos
-- FDS por natureza (proposta do chat da Maria, 01/09): conciliacao/relatorio = 'manter' (data contabil),
-- dinheiro saindo/entrando = 'proximo_dia_util' (so acontece em dia util).
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
  -- pacotes (ganham filhas logo abaixo)
  ('Conciliação de Cartões',                                                     null::text,                             30,   false, 'manter',            10),
  ('Pedir fatura ao Luciano',                                                    null,                                    1,   false, 'manter',            20),
  ('Depósito de Cheques',                                                        null,                                    6,   false, 'proximo_dia_util',  30),
  ('Repasses de Cartões – Maquininha',                                           null,                                 null,    true, 'proximo_dia_util',  40),
  ('Cashbacks do mês aplicados',                                                 null,                                    1,   false, 'proximo_dia_util',  50),
  -- simples (sem filhas)
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

-- ---------------------------------------------------------------- 22 filhas (depth 1, mesma lista do pai)
-- Cada filha tem dia proprio; o vencimento do pai e o max das filhas (materializador).
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

-- ---------------------------------------------------------------- 4 registros encerrados
-- Nao materializam (o materializador so olha 'ativa'); ficam como registro pra ninguem recriar por engano.
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
