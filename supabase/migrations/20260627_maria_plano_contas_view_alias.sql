-- View canônica/alias para Maria consultar plano de contas por SELECT seguro.
-- Evita falhas quando a Maria tenta achar o plano por vw_maria_* em vez da tool específica.

create or replace view public.vw_maria_plano_contas as
select * from public.maria_plano_contas_arvore(true, null);

comment on view public.vw_maria_plano_contas
is 'View sanitizada do plano de contas para Maria/Rose/Ana: código contábil, nome, hierarquia e emusys_id, sem dados financeiros sensíveis.';

-- Aliases tolerantes para nomes que a Maria tentou usar em runtime.
create or replace view public.vw_maria_plano_de_contas as
select * from public.vw_maria_plano_contas;

create or replace view public.vw_maria_planos_de_contas as
select * from public.vw_maria_plano_contas;

create or replace view public.vw_maria_planos_conta as
select * from public.vw_maria_plano_contas;

create or replace view public.vw_maria_plano_contas_lookup as
select * from public.vw_maria_plano_contas;

revoke all on public.vw_maria_plano_contas from public, anon, authenticated;
revoke all on public.vw_maria_plano_de_contas from public, anon, authenticated;
revoke all on public.vw_maria_planos_de_contas from public, anon, authenticated;
revoke all on public.vw_maria_planos_conta from public, anon, authenticated;
revoke all on public.vw_maria_plano_contas_lookup from public, anon, authenticated;

grant select on public.vw_maria_plano_contas to maria_leitura, maria_operacional, service_role;
grant select on public.vw_maria_plano_de_contas to maria_leitura, maria_operacional, service_role;
grant select on public.vw_maria_planos_de_contas to maria_leitura, maria_operacional, service_role;
grant select on public.vw_maria_planos_conta to maria_leitura, maria_operacional, service_role;
grant select on public.vw_maria_plano_contas_lookup to maria_leitura, maria_operacional, service_role;
