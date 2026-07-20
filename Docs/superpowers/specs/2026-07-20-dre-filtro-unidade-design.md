# DRE com filtro de unidade operacional

## Objetivo

Conectar o rateio econômico de `folha_alocacao_dre_resolver` ao DRE e permitir consultar Consolidado, CG, Recreio ou Barra sem perder cobertura, reconciliação ou rastreabilidade das fontes.

## Escopo

- Recriar `dre_linhas_normalizadas`, `dre_consultar` e `dre_detalhes` em uma migration nova.
- Acrescentar `unidade_operacional`, `qualidade_unidade`, `motivo_sem_unidade` e `colaborador_id` à linha normalizada.
- Acrescentar `p_unidade` às duas RPCs públicas, com default `consolidado` e allowlist `consolidado|cg|rec|bar`.
- Acrescentar filtro de unidade à tela DRE e propagar a seleção para consulta e drill-down.
- Tornar o cursor determinístico para fatias da mesma origem em unidades diferentes.
- Exibir um resumo consolidado de linhas sem unidade operacional.

Ficam fora de escopo a tela de confirmação da Ana, mudanças em `folha_fechar`, o rateio financeiro de Contas a Pagar, merge, deploy e aplicação remota da migration.

## Normalização por fonte

| Fonte | Unidade | Qualidade | Motivo quando ausente |
|---|---|---|---|
| Folha pronta | `resolver.unidade_dre` | `exata` | n/a |
| Folha sem confirmação | `null` | `null` | `folha_sem_alocacao` |
| Folha desatualizada | `null` | `null` | `folha_desatualizada` |
| Cartão confirmado | `financeiro_cartao_transacoes.centro_custo_id -> centros_custo.codigo` | `exata` | `fonte_sem_unidade` se a referência estiver ausente |
| Cartão não confirmado | `null` | `null` | `cartao_nao_confirmado` |
| Contas a Receber | `centro_custo_id -> centros_custo.codigo`, com fallback para `unidade` | `exata` | `fonte_sem_unidade` |
| Contas a Pagar | `centro_custo_id -> centros_custo.codigo`, com fallback para `unidade` | `aproximada_conta_pagadora` | `fonte_sem_unidade` |

`unidade_operacional` só pode conter `cg`, `rec`, `bar` ou `null`. A qualidade de Contas a Pagar descreve a natureza fiscal/pagadora da fonte inteira; não atribui conta pagadora às linhas que não a possuem.

## Folha por regime

Em Competência, `folhas_alvo` contém a folha única cujo `ano/mes` coincide com `p_competencia`.

Em Caixa, `folhas_alvo` contém `DISTINCT folha_id` extraído das Contas a Pagar de folha efetivamente pagas dentro do mês consultado. Essa lista é somente uma pré-seleção. Para cada linha retornada pelo resolver:

1. Rejuntar `folha_classificacao_dre` pela chave primária `(folha_id, lancamento_folha_id, componente, sequencia)` apenas para recuperar `conta_pagadora_id_usada`.
2. Encontrar a Conta a Pagar da mesma folha e da mesma conta pagadora.
3. Em Caixa, incluir a linha somente se essa conta específica estiver `pago` e sua `data_pagamento` estiver no mês consultado.

Cada fatia usa `valor_assinado_rateado` como `valor_origem`. `valor_assinado_original` nunca é replicado nas fatias.

## Contratos SQL

```sql
dre_linhas_normalizadas(date, text)
dre_consultar(date, text, text default 'consolidado')
dre_detalhes(
  p_competencia date,
  p_regime text,
  p_plano_codigo text default null,
  p_fonte text default null,
  p_unidade text default 'consolidado',
  p_cursor jsonb default null,
  p_limite integer default 50
)
```

A migration remove, sem `CASCADE`, as funções externas antes da interna; depois recria normalizador, consulta e detalhes nessa ordem. `STABLE`, `SECURITY DEFINER`, `search_path`, `REVOKE` e `GRANT` são reaplicados às assinaturas exatas.

## Filtragem e reconciliação

`dre_consultar` materializa duas camadas:

- `linhas_base`: todas as linhas do período e regime.
- `linhas_filtradas`: `linhas_base` inteira para Consolidado ou somente a unidade solicitada.

KPIs, grupos, planos e detalhes usam `linhas_filtradas`. Cobertura, reconciliação e `sem_unidade_operacional` usam sempre `linhas_base`.

`sem_unidade_operacional` retorna:

```text
valor_origem
valor_resultado
linhas
colaboradores_folha
por_motivo.<motivo> = {
  valor_origem,
  valor_resultado,
  linhas,
  colaboradores_folha
}
```

Os motivos fixos são `folha_sem_alocacao`, `folha_desatualizada`, `cartao_nao_confirmado` e `fonte_sem_unidade`.

## Paginação

O cursor e a ordenação incluem `unidade_operacional` depois de `origem_sequencia`. O `next_cursor`, o tipo TypeScript e a chave React carregam o mesmo campo, impedindo que duas fatias da mesma origem colidam ou sejam puladas.

## Interface

A página acrescenta um `SegmentedControl` com Consolidado, CG, Recreio e Barra ao lado de Competência, Regime e Visão. A unidade participa das dependências das consultas principal e de detalhes. Alterar a unidade limpa os detalhes/cursor anteriores.

O drill-down mostra a unidade e alerta quando `qualidade_unidade` for `aproximada_conta_pagadora`. O resumo de reconciliação mostra `sem_unidade_operacional` mesmo com uma unidade filtrada.

## Testes e rito

- Testes de contrato SQL falham antes da migration e cobrem assinaturas, allowlist, seleção distinta de folhas, vínculo de Caixa por conta específica, valor rateado, fontes de unidade, base não filtrada, cursor e privilégios.
- Testes TypeScript cobrem propagação de `p_unidade`, rótulos e resumo sem unidade.
- PostgreSQL local/CI deve cobrir folha paga em mês diferente e colaborador com CG+REC+Barra atravessando paginação. Nenhuma fixture será criada em produção no rito normal.
- QA real confirma as 31 confirmações `backfill_privilegiado` atuais (CG 16, Recreio 9, Barra 6) e os 36 pendentes.
- A identidade CG + Recreio + Barra + sem unidade = Consolidado fecha centavo a centavo em cada regime, por KPI, grupo e plano. Caixa e Competência não precisam ser iguais entre si.
- Após implementar e verificar, parar antes de merge, deploy ou aplicação remota para auditoria externa e QA do Alf.
