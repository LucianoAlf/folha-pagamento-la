# Bistrô alimentar a folha automaticamente

## Objetivo

Substituir a copia manual do consumo do Bistrô para a folha por sugestao e aplicacao
auditadas, pessoa por pessoa, e tornar a duplicacao mensal atomica e consciente da
parcela de Bistrô e do rateio por conta pagadora.

## Entregas

1. Migration `20260716_5_bistro_folha_automatica.sql`:
   - `bistro_consumos.valor_pago_direto` com validacao;
   - marcacao auditada de pagamento direto;
   - sugestao e aplicacao/remocao atomica de desconto do Bistrô;
   - preflight e execucao atomica da duplicacao mensal;
   - autoria web/service-role, menor privilegio e audit log.
2. Frontend:
   - edicao explicita do valor pago diretamente ao Bistrô;
   - fila de revisao pessoa por pessoa no lugar do lote silencioso;
   - duplicacao por uma unica RPC, inclusive para as tres unidades.
3. Verificacao:
   - testes estaticos e de modelo;
   - typecheck, build e diff check;
   - migration no projeto `ubdvtjbitozhkuvvqkxj`;
   - smokes transacionais com rollback;
   - Agent Browser em desktop/mobile e light/dark.

## Limites

- Nao migrar toda edicao de folha para RPC nesta fatia.
- Nao reclassificar folhas fechadas.
- Nao fazer commit, push ou merge antes da auditoria do Claude no banco vivo.
