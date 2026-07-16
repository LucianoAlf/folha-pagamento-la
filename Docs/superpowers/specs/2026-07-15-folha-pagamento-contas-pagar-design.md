# Folha de pagamento em Contas a Pagar

## Objetivo

Tratar as obrigações geradas pelo fechamento da folha como instrumentos de pagamento mensais, sem transformá-las em recorrências comuns e sem duplicar o DRE detalhado na própria folha.

## Regras aprovadas

- `folha_pagamento` é um tipo fixo e não pode ser convertido em `unica`, `recorrente` ou `parcelada` pelo modal.
- Plano de contas não é exigido; o detalhamento fiscal permanece em `lancamentos_folha`.
- Valor, competência, empresa, centro, conta pagadora e vínculo de origem permanecem imutáveis em Contas a Pagar.
- Vencimento, observações, código/PIX do mês e lembretes continuam operáveis.
- Listas e modais exibem `Folha de pagamento`, nunca `Sem plano`.
- Dashboard, Auditoria e Comparativo excluem `folha_pagamento` das agregações por plano, mas a obrigação continua no fluxo de caixa e no relatório do dia.
- Novos fechamentos geram vencimento no dia 10 da competência. A data de lançamento continua sendo a data do fechamento.
- As quatro contas já geradas para julho não são alteradas automaticamente por esta mudança.

## Segurança e integridade

O frontend envia, para uma obrigação de folha, somente os campos operacionais permitidos. A migration redefine apenas `public.folha_fechar`; não altera tabelas, dados existentes, grants ou a lógica de reconciliação/idempotência já auditada.

## Verificação

- Testes dos seletores, modal, tabela, agregações e migration.
- `npm run typecheck` e `npm run build`.
- Smoke autenticado em Contas a Pagar, nos temas claro e escuro, confirmando tipo fixo, ausência de plano obrigatório e valor bloqueado.
- Smoke SQL com rollback para provar vencimento no dia 10 sem persistir contas de teste.
