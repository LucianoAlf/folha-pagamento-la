-- Peça 2: tipo_custo (fixo/variável) no plano de contas, herdado da estrutura de blocos do Emusys.
-- Bloco 5 (DESPESAS FIXAS) -> fixo | Bloco 4 (DESPESAS/CUSTOS VARIÁVEIS) -> variavel
-- Blocos 3 (entrada), 6 (investimentos), 7 (não operacionais) -> null

alter table public.plano_contas
  add column if not exists tipo_custo text;

alter table public.plano_contas drop constraint if exists plano_contas_tipo_custo_chk;
alter table public.plano_contas
  add constraint plano_contas_tipo_custo_chk
  check (tipo_custo is null or tipo_custo in ('fixo','variavel'));

update public.plano_contas set tipo_custo = 'fixo'     where left(codigo,1) = '5';
update public.plano_contas set tipo_custo = 'variavel' where left(codigo,1) = '4';
update public.plano_contas set tipo_custo = null       where left(codigo,1) in ('3','6','7');
