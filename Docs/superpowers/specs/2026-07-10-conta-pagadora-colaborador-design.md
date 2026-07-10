# Conta Pagadora no Colaborador - Design

## Objetivo

Registrar uma unica conta pagadora padrao por colaborador para permitir que uma futura operacao de fechamento da folha gere obrigacoes separadas para Kids CG, EMLA CG, Recreio e Barra, sem confundir caixa pagador com rateio de custo.

## Arquitetura

- `colaboradores.conta_pagadora_id` referencia `financeiro_contas_bancarias.id` e permanece nullable nesta fatia.
- A conta pagadora e a fonte da verdade; empresa e centro operacional continuam derivados da conta.
- Nenhum colaborador recebe valor automaticamente. A Rose faz o preenchimento humano.
- A folha continua calculando DRE por `unidade` exatamente como hoje.
- O fechamento da folha e a criacao de contas a pagar permanecem fora desta entrega.

## Interface

- O cadastro mobile e desktop do colaborador recebe o campo `Empresa / conta pagadora`.
- As opcoes exibem empresa, banco, agencia e final da conta para continuarem distinguiveis quando uma empresa tiver mais de uma conta.
- A aba Colaboradores exibe a quantidade de colaboradores ativos sem conta pagadora.
- Um filtro `Todos | Sem conta pagadora` permite a Rose encontrar os cadastros pendentes.
- Como a tela atual nao possui selecao multipla, a edicao em lote fica registrada como Fatia 0B.

## Seguranca e integridade

- A migration e estritamente aditiva: coluna nullable, FK e indice.
- Nao ha `UPDATE`, seed nem backfill.
- O dropdown lista apenas contas e empresas ativas.
- O frontend grava somente `conta_pagadora_id`; nao duplica empresa ou centro no colaborador.

## Validacao

- Teste estatico da migration prova coluna, FK, indice e ausencia de backfill.
- Testes dos seletores provam contagem, filtro e rotulos das contas.
- Typecheck, build, suite completa e `git diff --check` devem permanecer verdes.
- O Agent Browser valida desktop e mobile sem salvar atribuicoes reais.
