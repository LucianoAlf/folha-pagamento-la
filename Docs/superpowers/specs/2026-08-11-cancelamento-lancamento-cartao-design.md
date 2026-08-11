# Cancelamento de lançamento de cartão

## Objetivo

Permitir que Rose cancele um lançamento de cartão diretamente no detalhe de uma fatura aberta, com auditoria, motivo obrigatório e escolha explícita entre cancelar somente a parcela exibida ou o grupo inteiro de parcelas.

## Decisões

- A operação se chama **Cancelar lançamento**, não excluir, porque a RPC existente audita o estado anterior e a ação não deve parecer uma remoção silenciosa.
- O frontend usa `financeiro_cartao_transacao_cancelar` por meio de um serviço dedicado.
- Para uma compra parcelada, a confirmação oferece o lançamento atual ou o grupo de parcelas. O backend continua impedindo o grupo quando alguma parcela está em fatura não aberta.
- A origem de uma recorrência não pode ser cancelada fisicamente. A tela deve indicar que a regra deve ser encerrada e eventual ajuste/estorno registrado separadamente.
- Depois do sucesso, a fatura é recarregada para atualizar total, classificação e quantidade de lançamentos.
- Nenhuma ação automática, dado sintético ou alteração de produção entra nos testes de UI.

## Fluxo visual

Cada lançamento em `FaturasCartaoPage` recebe uma ação discreta `Cancelar lançamento` quando a fatura está aberta. O modal informa descrição, valor, data e parcela, exige motivo e, para parcelamentos, mostra os dois escopos. A confirmação fica desabilitada sem motivo. Erros do backend permanecem no modal e não limpam a seleção.

## Segurança e integridade

A RPC existente valida autenticação, trava os registros, exige fatura aberta, grava auditoria e recalcula por triggers. O serviço não aceita `service_role` no navegador e envia o ator vazio para a resolução autenticada já usada pelo módulo.

## Testes e gates

- Teste de contrato do serviço garante payload, RPC e propagação de erro.
- Teste de componente/contrato garante que a ação aparece apenas em fatura aberta, que o motivo é obrigatório e que o escopo do parcelamento é preservado.
- Rodar todos os testes de cartões, `npm run typecheck` e build Node/Vite.
- Smoke no navegador autenticado abre o detalhe, mostra o modal e cancela antes de salvar; nenhum lançamento real será excluído durante a validação.
