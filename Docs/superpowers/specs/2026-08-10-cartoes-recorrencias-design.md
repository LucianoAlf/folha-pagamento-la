# Compras recorrentes nas faturas de cartão

## Objetivo

Permitir que a Rose registre uma compra de cartão como recorrente dentro da própria fatura. A regra deve criar uma previsão mensal nas faturas futuras, oferecer controle operacional e manter o extrato real como a única confirmação da cobrança.

## Decisões aprovadas

- A recorrência é criada no formulário **Adicionar transação manual**, como uma opção distinta de compra parcelada.
- O lançamento da fatura atual continua sendo uma transação normal. A recorrência cria previsões somente para os meses futuros.
- A regra não tem prazo: permanece ativa até a Rose pausar ou encerrar.
- Uma previsão não é uma cobrança confirmada e não pode aumentar o total oficial da fatura, a conta a pagar gerada pela fatura, o DRE ou a conciliação.
- Quando chegar uma transação do extrato que pareça corresponder à previsão, o sistema só sugere o vínculo. A Rose confirma ou mantém as duas linhas separadas.
- A funcionalidade pertence ao Financeiro; o responsável operacional exibido é Rose, nunca Ana.

## Modelo de domínio

### Regra de recorrência

Criar uma entidade própria, `financeiro_cartao_recorrencias`, em vez de representar recorrência como parcelamento sem fim. A regra guarda, no mínimo:

- cartão, descrição e estabelecimento de referência;
- valor mensal e data-base da compra;
- classificação econômica opcional que deve ser copiada apenas para novas previsões;
- situação `ativa`, `pausada` ou `encerrada`;
- vínculo de origem com a transação que criou a regra;
- autoria, datas e motivo de pausa/encerramento para auditoria.

Uma recorrência é exclusivamente do tipo `compra`. Estorno, tarifa, anuidade e ajuste continuam sem recorrência neste escopo.

### Previsão mensal

Cada previsão precisa ficar vinculada à regra e à competência da fatura. O banco deve impedir uma segunda previsão da mesma regra no mesmo cartão e competência, inclusive sob clique duplo, retry ou criação concorrente de fatura.

A previsão tem estado próprio: `prevista`, `confirmada` ou `dispensada`. Ela permanece no histórico da fatura, mas só a transação real confirmada participa dos totais financeiros. Ao encerrar ou pausar, nenhuma previsão futura é criada; o passado permanece preservado.

### Confirmação pelo extrato

O extrato continua inserindo sua transação real pelos fluxos atuais. Uma ação específica liga essa transação a uma previsão candidata, sem apagar nem alterar silenciosamente nenhuma das duas linhas. Depois de confirmada:

- a transação do extrato é a que vale nos totais;
- a previsão fica marcada como cumprida e aponta para a transação real;
- o vínculo, ator e data ficam auditáveis.

Nenhum algoritmo, IA ou importador pode confirmar esse vínculo sozinho. A sugestão pode considerar cartão, competência, valor e descrição/estabelecimento normalizados, mas a decisão é humana.

## Fluxo operacional

1. Rose abre uma fatura e usa **Adicionar transação manual**.
2. Em uma compra, escolhe **Repetir todo mês**, informa o valor e salva.
3. A compra atual é registrada normalmente; a regra nasce ativa.
4. O sistema gera uma previsão na próxima fatura aplicável. Ao abrir uma fatura nova, gera de forma idempotente as previsões ativas que faltarem para aquele cartão e competência.
5. Na fatura, o bloco **Recorrências ativas** permite editar dados para os próximos meses, pausar ou encerrar. Alterações não reescrevem meses históricos nem faturas fechadas.
6. Ao importar o extrato, uma possível correspondência é exibida. Rose escolhe **Confirmar como mesma cobrança** ou **Manter separadas**.

## Interface

- O seletor de parcelamento permanece com `À vista` e `Parcelado`; recorrência aparece como um toggle independente e disponível apenas para `Compra`.
- Ao ativá-lo, o formulário explica que o valor será previsto nas próximas faturas e oferece data-base e classificação opcional. Parcelamento e recorrência não podem estar ativos juntos.
- A lista da fatura identifica previsões com selo visual `PREVISÃO`; as transações importadas/confirmadas mantêm sua aparência atual.
- O bloco compacto **Recorrências ativas** da fatura mostra descrição, valor, próxima competência e ações `Editar`, `Pausar` e `Encerrar`.
- A sugestão de vínculo do extrato mostra os dois lados e requer uma ação explícita. Não haverá opção de confirmação automática.

## Integração com o backend atual

As novas operações devem seguir o padrão dos RPCs financeiros existentes: função `security definer`, `search_path` explícito, validação do ator, privilégios mínimos e auditoria. A geração da previsão deve se integrar à abertura de fatura e às rotinas de lançamento sem alterar o contrato de parcelamento existente (`compra_parcelada_id`, `parcela_atual`, `total_parcelas`).

O cálculo de total de `financeiro_cartao_faturas` precisa ignorar linhas previstas. A conta a pagar e o DRE continuam refletindo apenas a cobrança efetivamente confirmada na fatura.

## Tratamento de falhas e limites

- Regra sem cartão, descrição ou valor válido não é criada.
- Fatura fechada, paga ou cancelada não recebe novas previsões retroativamente.
- Pausa/encerramento não deleta transações nem vínculos já confirmados.
- Se o valor ou o estabelecimento mudar, Rose edita a regra para os meses seguintes; previsões antigas não são alteradas em lote.
- A criação e a geração mensal são idempotentes por chave da regra e competência.

## Testes e critérios de aceite

1. Criar uma recorrência registra a compra atual e gera exatamente uma previsão futura.
2. Abrir a mesma fatura, repetir a ação ou sofrer retry não cria uma segunda previsão.
3. Previsões não alteram total oficial da fatura, conta a pagar nem DRE até confirmação.
4. Pausar e encerrar interrompem apenas meses futuros; o histórico permanece legível.
5. Editar valor/data/classificação afeta apenas previsões futuras abertas.
6. Uma transação importada semelhante apenas sugere vínculo; confirmar transfere a validade financeira para a transação real, enquanto manter separadas preserva ambas.
7. Compras parceladas, estornos e as faturas fechadas atuais continuam com o comportamento já publicado.
8. Testes de RPC cobrem autorização, idempotência, isolamento por cartão e auditoria; o E2E do navegador cobre criação, pausa, edição e confirmação manual.

## Fora de escopo

- Recorrência para contas a pagar, débito em conta ou outras fontes financeiras.
- Confirmação automática pelo extrato ou por IA.
- Rateio econômico/financeiro novo.
- Reabertura automática de fatura fechada.
- Migração das compras históricas para recorrências sem decisão humana.
