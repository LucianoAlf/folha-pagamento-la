# Cartões: acesso administrativo e correções operacionais

## Objetivo

Remover os bloqueios encontrados pela Rose no fluxo de cartões sem exigir atalhos, recadastros ou intervenção técnica. A Rose passa a ser reconhecida como administradora do sistema e pode editar faturas com a mesma autonomia administrativa do proprietário.

## Evidência atual

- `user_profiles` registra Rose como `role = 'user'`, embora ela seja responsável pelo Financeiro e tenha autorização administrativa.
- `financeiro_cartao_faturas` tem RLS ativo, política somente de leitura para `authenticated` e nenhum `UPDATE` para administradores.
- A baixa da conta da fatura Barra falha porque o gatilho de sincronização tenta atualizar `financeiro_cartao_faturas` sob uma sessão sem permissão de escrita.
- A tela repassa `savingPrevisaoId !== null` como bloqueio para todas as linhas da fatura. Uma decisão de previsão pode, portanto, desabilitar classificação, reabertura e cancelamento de lançamentos não relacionados.
- O fluxo recorrente atual cobre apenas a criação de uma nova compra manual. Não existe porta para tornar recorrente uma compra real já existente.

## Decisões aprovadas

### Rose como administradora

O perfil da Rose será alterado de `user` para `admin`. A autorização do usuário é explícita: Rose possui a mesma responsabilidade administrativa e as mesmas permissões do proprietário.

As operações de edição de faturas serão liberadas para perfis `admin`. A aplicação não concederá `UPDATE` irrestrito a todo usuário autenticado: o papel `authenticated` continua sendo apenas a identidade técnica do JWT, enquanto `user_profiles.role = 'admin'` define quem possui a capacidade administrativa.

Essa decisão implica que Rose também passa a acessar as demais capacidades que o sistema já reserva a `admin`. Isso é intencional e foi aprovado pelo proprietário.

### Edição ampla de faturas

Administradores poderão corrigir os campos operacionais editáveis da fatura, reabrir revisão, confirmar classificação, cancelar lançamentos elegíveis e registrar a baixa da conta vinculada. A interface não esconderá essas ações da Rose.

Integridade financeira continua sendo responsabilidade do contrato das operações: fatura paga não é reaberta silenciosamente, compra parcelada não vira recorrência, origem de recorrência não é apagada e toda alteração continua auditada. Essas regras protegem a coerência do dado; não servem para limitar a autonomia da Rose.

### Estados de ação independentes

Cada lançamento será bloqueado apenas pela ação que está sendo executada naquele lançamento. Resolver uma sugestão de previsão não desabilita classificação, revisão ou cancelamento das demais linhas. Toda ação limpa seu estado em sucesso e falha.

Os botões usam rótulos operacionais claros:

- `Reabrir para revisão` altera somente a situação da classificação;
- `Confirmar classificação` confirma empresa, centro e plano;
- `Cancelar lançamento` remove o lançamento elegível e recalcula a fatura;
- ações indisponíveis explicam a causa, em vez de parecerem travadas.

### Tornar compra existente recorrente

Uma compra já registrada em fatura aberta ganha a ação `Tornar recorrente`. Ela fica disponível apenas quando a transação:

- é uma compra real;
- pertence a uma fatura aberta;
- não é parcela nem parte de uma compra parcelada;
- ainda não é origem de outra recorrência.

A operação reaproveita a transação existente como origem. Não cria outra compra e não altera o total da fatura atual. Cria uma única regra e a primeira previsão em uma competência futura aberta. Clique duplo ou retry devolve a mesma regra.

Tarifas, estornos, ajustes, parcelas e faturas fechadas exibem a razão pela qual a conversão não se aplica.

## Arquitetura de acesso

Uma função de autorização única consulta `user_profiles.role` pelo `auth.uid()` e reconhece `admin`. As políticas de escrita de `financeiro_cartao_faturas` e as RPCs administrativas usam essa decisão. A mudança de perfil da Rose é versionada e idempotente, vinculada ao UUID já existente do perfil.

O gatilho que sincroniza o pagamento de Contas a Pagar com a fatura é uma operação interna do banco. Ele será executado com privilégios controlados, `search_path` fixo e sem porta pública de execução. Assim, a baixa funciona para a administradora sem depender de concessões acidentais entre tabelas.

## Fluxos

### Baixa da fatura

1. Rose abre a conta gerada pela fatura em Contas a Pagar.
2. Informa data, método e observação.
3. A conta passa para `pago`.
4. O gatilho interno marca a fatura vinculada como `paga` na mesma transação.
5. Se qualquer etapa falhar, nada fica parcialmente atualizado e a interface mostra a causa operacional.

### Compra existente recorrente

1. Rose abre uma fatura aberta e localiza uma compra elegível.
2. Clica em `Tornar recorrente`.
3. Confirma data-base, descrição, valor e classificação que valerão para previsões futuras.
4. O banco vincula uma única regra à compra existente e gera a próxima previsão aplicável.
5. O valor atual não muda; a previsão permanece fora dos totais até chegar uma cobrança real e Rose confirmar o vínculo.

## Erros e mensagens

- Erros do banco serão traduzidos para mensagens operacionais; o toast genérico será apenas fallback.
- Falha de permissão administrativa informa que o perfil precisa ser atualizado, sem spinner infinito.
- Falha de baixa preserva conta e fatura no estado anterior.
- A tentativa de cancelar origem de recorrência orienta a encerrar a regra e registrar ajuste ou estorno.
- A conversão de item inelegível explica se o motivo é parcela, tipo, fatura fechada ou recorrência já existente.

## Testes e prova

1. Teste PostgreSQL com JWT autenticado e perfil `admin` prova leitura e edição de fatura.
2. O mesmo teste com perfil `user` prova que a capacidade administrativa não foi concedida a qualquer login.
3. Fixture transacional prova baixa da conta e sincronização da fatura, com rollback e zero sentinelas persistidas.
4. Fixture prova adoção de compra existente sem nova transação, com uma regra e uma previsão futura, inclusive em retry.
5. Testes de interface provam que `savingPrevisaoId` não bloqueia ações de outras linhas e que cada estado limpa em `finally`.
6. Typecheck, testes focados, build e fixture PostgreSQL precisam passar antes da aplicação remota.
7. No navegador autenticado, o smoke confirma ações habilitadas para Rose, mensagens, modal de recorrência e ausência de spinner residual. A baixa real da fatura da Rose não será usada como teste destrutivo; a prova de escrita ocorre em fixture descartável.

## Publicação

As mudanças de schema, perfil e privilégios serão aplicadas em migration versionada depois dos testes locais. Em seguida serão verificados RLS, grants, papel da Rose, funções, logs e advisors do Supabase. O frontend será publicado pela `main` somente depois da verificação do banco. A entrega registra commit, push, migration aplicada, deploy e evidência do navegador.

## Fora de escopo

- Remover auditoria ou integridade de faturas pagas.
- Permitir que qualquer usuário autenticado edite faturas.
- Converter em lote compras antigas para recorrência.
- Criar ou alterar pagamentos bancários reais; o sistema apenas registra a baixa operacional.
