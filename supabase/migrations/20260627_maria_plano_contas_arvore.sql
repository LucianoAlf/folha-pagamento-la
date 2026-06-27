-- Expor árvore sanitizada do plano de contas para Maria/Rose/Ana
-- Motivo: evitar que a Maria mostre apenas plano_conta_id UUID e permitir resposta com código contábil/hierarquia compatível com Emusys.

create or replace function public.maria_plano_contas_arvore(
  p_ativo boolean default true,
  p_busca text default null
)
returns table (
  id uuid,
  codigo text,
  nome text,
  nome_completo text,
  parent_id uuid,
  parent_codigo text,
  parent_nome text,
  nivel integer,
  grupo_plano text,
  natureza text,
  emusys_id text,
  ordem integer,
  ativo boolean,
  linha_formatada text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.codigo,
    pc.nome,
    pc.nome_completo,
    pc.parent_id,
    pai.codigo as parent_codigo,
    pai.nome as parent_nome,
    pc.nivel,
    pc.grupo_plano,
    pc.natureza,
    pc.emusys_id,
    pc.ordem,
    pc.ativo,
    concat(repeat('  ', greatest(coalesce(pc.nivel, 1) - 1, 0)), pc.codigo, ' — ', pc.nome) as linha_formatada
  from public.plano_contas pc
  left join public.plano_contas pai on pai.id = pc.parent_id
  where (p_ativo is null or pc.ativo = p_ativo)
    and (
      nullif(trim(p_busca), '') is null
      or pc.codigo ilike '%' || trim(p_busca) || '%'
      or pc.nome ilike '%' || trim(p_busca) || '%'
      or pc.nome_completo ilike '%' || trim(p_busca) || '%'
      or pc.emusys_id ilike '%' || trim(p_busca) || '%'
    )
  order by
    string_to_array(pc.codigo, '.')::int[],
    pc.nome;
$$;

comment on function public.maria_plano_contas_arvore(boolean, text)
is 'Árvore sanitizada do plano de contas para Maria. Retorna código, nome, hierarquia e emusys_id; não expõe dados financeiros sensíveis.';

revoke all on function public.maria_plano_contas_arvore(boolean, text) from public;
revoke all on function public.maria_plano_contas_arvore(boolean, text) from anon;
revoke all on function public.maria_plano_contas_arvore(boolean, text) from authenticated;

grant execute on function public.maria_plano_contas_arvore(boolean, text) to maria_leitura;
grant execute on function public.maria_plano_contas_arvore(boolean, text) to maria_operacional;
grant execute on function public.maria_plano_contas_arvore(boolean, text) to service_role;
