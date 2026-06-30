-- Fase 2: marco de migration para a mudanca code-only de anti-dupla-contagem.
-- As Edge Functions e o frontend passam a excluir contas_pagar.tipo_lancamento='fatura_cartao'
-- das agregacoes por plano/DRE, mantendo essas contas no fluxo de caixa.
do $$
begin
  null;
end
$$;
