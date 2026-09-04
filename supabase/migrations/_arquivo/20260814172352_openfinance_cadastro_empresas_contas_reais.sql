-- Cadastro real das 4 unidades, empresas e contas bancárias (Santander, ag. 1534),
-- confirmadas via Open Finance (Pluggy) em 14/08/2026. Recreio e Barra confirmados por
-- saldo exato batendo com o relatório manual da Rose do mesmo dia; EMLA CG e Kids CG
-- confirmados pelo Alf por nome da razão social (EMLA = Escola de Música LA; LAMK = LA
-- Music Kids). Pré-requisito para Open Finance popular o rodapé "SALDO EM CONTAS" do
-- relatório diário de contas a pagar (ver _shared/relatorioContasDia.ts).
--
-- NOTA: no banco de produção, financeiro_empresas / financeiro_contas_bancarias / centros_custo
-- já existiam desde o seed do módulo de Cartões (28/06/2026); os inserts abaixo são idempotentes
-- (on conflict do nothing / where not exists) e foram no-op lá. Mantidos para reprodutibilidade
-- num banco limpo.

insert into public.centros_custo (nome, tipo, ativo, codigo)
select v.nome, 'unidade', true, v.codigo
from (values
  ('Recreio', 'REC'),
  ('Barra', 'BAR'),
  ('Kids CG', 'KIDSCG'),
  ('EMLA CG', 'EMLACG')
) as v(nome, codigo)
where not exists (select 1 from public.centros_custo cc where cc.nome = v.nome);

insert into public.financeiro_empresas (razao_social, nome_fantasia, label_operacional, cnpj, unidade_id, ativo)
select v.razao_social, v.label, v.label, v.cnpj, cc.id, true
from (values
  ('Escola de Musica LA Kids', 'Recreio', '32134891000165'),
  ('Music School LA', 'Barra', '42681170000129'),
  ('Escola de Musica LA', 'EMLA CG', '19672908000170'),
  ('LA Music Kids (LAMK)', 'Kids CG', '26707112000170')
) as v(razao_social, label, cnpj)
join public.centros_custo cc on cc.nome = v.label
on conflict (cnpj) do nothing;

insert into public.financeiro_contas_bancarias (empresa_id, banco, banco_codigo, agencia, conta, tipo, apelido, ativo)
select fe.id, 'Santander', '033', '1534', v.conta, 'corrente', v.apelido, true
from public.financeiro_empresas fe
join (values
  ('32134891000165', '13002361-9', 'Conta Recreio'),
  ('42681170000129', '13002358-5', 'Conta Barra'),
  ('19672908000170', '13002359-2', 'Conta EMLA CG'),
  ('26707112000170', '13002360-2', 'Conta Kids CG')
) as v(cnpj, conta, apelido) on v.cnpj = fe.cnpj
on conflict (banco, agencia, conta) do nothing;
