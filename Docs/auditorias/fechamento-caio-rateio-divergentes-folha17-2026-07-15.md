# Fechamento do Caio e rateio dos divergentes - Folha 17 - Julho/2026

> Execucao controlada no projeto Supabase `ubdvtjbitozhkuvvqkxj`. As correcoes foram feitas exclusivamente por `public.folha_corrigir_componente` e os rateios exclusivamente por `public.folha_rateio_contas_salvar`. Nao houve `INSERT` ou `UPDATE` direto, migration nova ou rateio do Jeyson Gaia.

## Correcao do Caio

Lancamento `1916`, colaborador `42`, unidade `cg`, categoria `professores`:

| Componente | Antes | Depois | Motivo | Audit ID |
|---|---:|---:|---|---|
| Comissao | R$ 25,00 | R$ 15,84 | Correcao Emusys - 1 aula calculada a 36,66, valor correto 27,50 | `c24a64ea-d076-4f4d-ab37-da596546960f` |
| Descontos | R$ 541,40 | R$ 568,35 | Desconto de 2 dias de passagem do Recreio lancado incorretamente em CG - R$ 26,95 | `fae485a0-e0e5-4dee-868b-9f958a90c5a1` |

- Total da linha: **R$ 2.982,60 -> R$ 2.946,49**.
- Total geral da folha: **R$ 171.256,07 -> R$ 171.219,96**.
- A conta pagadora permaneceu nula ate a etapa separada de rateio.

## Rateio dos nove divergentes

| Colaborador | Kids CG | EMLA CG | Recreio | Barra | Total | Audit ID |
|---|---:|---:|---:|---:|---:|---|
| Jonathan Santos | R$ 0,00 | R$ 0,00 | R$ 110,00 | R$ 0,00 | R$ 110,00 | `9d623bb5-dea0-4ab9-bda3-ff358217d956` |
| Caio Araujo | R$ 1.946,49 | R$ 1.000,00 | R$ 748,00 | R$ 0,00 | R$ 3.694,49 | `4ca7ab19-e8b1-44dc-a508-cd91b73ce868` |
| Jhonatan Samuel | R$ 1.851,50 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 1.851,50 | `b054a7f9-25c6-43bf-af07-a6616732bdc4` |
| Pedro Gloria | R$ 1.560,82 | R$ 0,00 | R$ 0,00 | R$ 1.105,00 | R$ 2.665,82 | `39a763f0-f23c-4fca-8297-b127f46a7a92` |
| Marcos Saturnino | R$ 1.480,00 | R$ 768,01 | R$ 600,00 | R$ 400,00 | R$ 3.248,01 | `12b579b5-94be-4530-8769-a934797b0759` |
| Daiana Pacifico | R$ 0,00 | R$ 1.470,99 | R$ 350,00 | R$ 1.827,43 | R$ 3.648,42 | `27919829-a4fa-4f25-99c7-6368a378e13a` |
| Ana Paula | R$ 0,00 | R$ 1.599,32 | R$ 1.150,00 | R$ 1.000,00 | R$ 3.749,32 | `c9a72690-2d9b-4ba7-bfa8-518e414596e7` |
| Leticia Palmeira | R$ 809,91 | R$ 0,00 | R$ 1.368,09 | R$ 0,00 | R$ 2.178,00 | `63720eb9-3faa-4994-bb98-33d420825a14` |
| Johnatan Gomes | R$ 591,25 | R$ 1.000,00 | R$ 745,29 | R$ 345,28 | R$ 2.681,82 | `dc72b883-fd79-4a8c-bc20-e1bbdf343fb7` |

Nos dois lancamentos CG divididos entre Kids CG e EMLA CG, cada componente foi repartido proporcionalmente e fechado no centavo:

- Caio: Kids CG `R$ 1.946,49` + EMLA CG `R$ 1.000,00`.
- Johnatan Gomes: Kids CG `R$ 591,25` + EMLA CG `R$ 1.000,00`.

## Reconciliacao final com os extratos Santander

| Conta pagadora | Total na folha | Total do extrato | Diferenca |
|---|---:|---:|---:|
| Kids CG | R$ 29.049,85 | R$ 29.049,85 | R$ 0,00 |
| EMLA CG | R$ 35.272,20 | R$ 35.272,20 | R$ 0,00 |
| Recreio | R$ 59.042,17 | R$ 59.042,17 | R$ 0,00 |
| Barra | R$ 47.495,24 | R$ 47.495,24 | R$ 0,00 |
| **Total pago** | **R$ 170.859,46** | **R$ 170.859,46** | **R$ 0,00** |

## Preflight final

- Total geral da folha: **R$ 171.219,96**.
- Total ja atribuido as quatro contas: **R$ 170.859,46**.
- Saldo ainda nao atribuido as contas: **R$ 360,50**, correspondente exclusivamente ao Jeyson Gaia ainda nao pago.
- Diferenca interna do preflight (total dos lancamentos vs. total da folha): **R$ 0,00**.
- Pessoas pendentes: **1**.
- Fatias sem conta: **2**, ambas do Jeyson Gaia.
- Incoerencias fiscais: **0**.
- Conflitos de chave: **0**.
- Auditorias `RATEIO_CONTAS` deste lote: **9**.

O preflight permanece corretamente como `pronto=false` enquanto o Jeyson nao for pago e rateado. Nenhuma conta foi atribuida a ele nesta execucao.
