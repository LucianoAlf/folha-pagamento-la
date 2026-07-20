-- Endurece a fronteira: service_role usa as portas publicas, nao os helpers internos.

revoke all on public.folha_alocacao_dre_confirmacoes from service_role;
revoke all on public.folha_alocacao_dre_fatias from service_role;
revoke all on public.folha_alocacao_dre_confirmacoes from maria_operacional, maria_leitura;
revoke all on public.folha_alocacao_dre_fatias from maria_operacional, maria_leitura;

revoke all on function public.folha_alocacao_dre_resolve_ator(jsonb)
  from service_role;
revoke all on function public.folha_alocacao_dre_source_hash(integer, integer)
  from service_role;
revoke all on function public.folha_alocacao_dre_allocation_hash(jsonb)
  from service_role;
revoke all on function public.folha_alocacao_dre_gravar(integer, integer, jsonb, text, text, text, text, jsonb)
  from service_role;
revoke all on function public.folha_alocacao_dre_confirmacao_guard()
  from service_role;
revoke all on function public.folha_alocacao_dre_fatia_guard()
  from service_role;

revoke all on function public.folha_alocacao_dre_resolve_ator(jsonb)
  from maria_operacional, maria_leitura;
revoke all on function public.folha_alocacao_dre_source_hash(integer, integer)
  from maria_operacional, maria_leitura;
revoke all on function public.folha_alocacao_dre_allocation_hash(jsonb)
  from maria_operacional, maria_leitura;
revoke all on function public.folha_alocacao_dre_gravar(integer, integer, jsonb, text, text, text, text, jsonb)
  from maria_operacional, maria_leitura;
revoke all on function public.folha_alocacao_dre_confirmacao_guard()
  from maria_operacional, maria_leitura;
revoke all on function public.folha_alocacao_dre_fatia_guard()
  from maria_operacional, maria_leitura;
