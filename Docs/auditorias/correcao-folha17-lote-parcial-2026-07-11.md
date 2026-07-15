# Correcao controlada da folha 17 - lote parcial

Data da execucao: 11/07/2026
Competencia: 07/2026
Projeto Supabase: `ubdvtjbitozhkuvvqkxj`

## Escopo executado

- Oito colaboradores corrigidos.
- Dez chamadas a `public.folha_corrigir_componente` porque Ana Paula possui tres linhas por unidade.
- Nenhum `UPDATE` direto em `lancamentos_folha`.
- Nenhuma chamada a `folha_rateio_contas_salvar` neste lote.
- Caio Araujo permaneceu intocado, aguardando confirmacao da Ana.

## Resultado por lancamento

| Colaborador | Unidade | Categoria | Componente | Antes | Depois | Total da linha antes | Total da linha depois | Delta |
|---|---|---|---|---:|---:|---:|---:|---:|
| Jonathan Santos | rec | professores | passagem | R$ 0,00 | R$ 50,00 | R$ 60,00 | R$ 110,00 | +R$ 50,00 |
| Jhonatan Samuel | cg | equipe_operacional | passagem | R$ 250,00 | R$ 213,89 | R$ 1.887,61 | R$ 1.851,50 | -R$ 36,11 |
| Pedro Gloria | cg | professores | passagem | R$ 200,00 | R$ 210,00 | R$ 1.550,82 | R$ 1.560,82 | +R$ 10,00 |
| Marcos Saturnino | cg | professores | salario | R$ 1.060,00 | R$ 940,00 | R$ 888,01 | R$ 768,01 | -R$ 120,00 |
| Daiana Pacifico | bar | staff_rateado | reembolso | R$ 0,00 | R$ 242,43 | R$ 250,00 | R$ 492,43 | +R$ 242,43 |
| Ana Paula | cg | staff_rateado | bonus | R$ 200,00 | R$ 300,00 | R$ 1.499,32 | R$ 1.599,32 | +R$ 100,00 |
| Ana Paula | rec | staff_rateado | bonus | R$ 250,00 | R$ 350,00 | R$ 1.050,00 | R$ 1.150,00 | +R$ 100,00 |
| Ana Paula | bar | staff_rateado | bonus | R$ 250,00 | R$ 300,00 | R$ 950,00 | R$ 1.000,00 | +R$ 50,00 |
| Leticia Palmeira | cg | professores | descontos | R$ 240,39 | R$ 240,09 | R$ 809,61 | R$ 809,91 | +R$ 0,30 |
| Johnatan Gomes | cg | staff_rateado | inss | R$ 155,68 | R$ 155,69 | R$ 1.591,26 | R$ 1.591,25 | -R$ 0,01 |

## Reconciliacao da folha

| Medida | Antes | Depois | Variacao |
|---|---:|---:|---:|
| Campo Grande | R$ 64.659,48 | R$ 64.613,66 | -R$ 45,82 |
| Recreio | R$ 58.892,17 | R$ 59.042,17 | +R$ 150,00 |
| Barra | R$ 47.307,81 | R$ 47.600,24 | +R$ 292,43 |
| Total geral | R$ 170.859,46 | R$ 171.256,07 | +R$ 396,61 |

O total provisório de `R$ 171.256,07` e o esperado sem a correcao pendente de Caio Araujo. Se a Ana confirmar o ajuste adicional de `-R$ 36,11`, o total esperado passa a `R$ 171.219,96`.

## Travas e auditoria

- Dez registros `CORRECAO_COMPONENTE_FOLHA` gravados em `maria_audit_log`.
- Todos possuem `antes`, `depois`, motivo, folha, colaborador e componente.
- O valor esperado foi validado em cada chamada.
- `conta_pagadora_id` nao foi alterado.
- Caio permanece com `passagem = 0,00`, `descontos = 541,40` e total CG `2.982,60`.
- O preflight permanece com 10 pessoas pendentes e 25 fatias sem conta.
- Nenhum rateio novo foi executado neste lote.
