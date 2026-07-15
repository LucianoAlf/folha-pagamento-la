# Reconciliação Santander x Folha 17 - Julho/2026

> Relatório estritamente read-only. Nenhuma escrita, RPC, migration ou atribuição de conta pagadora foi executada.

## 1. Resultado executivo

- **Extratos:** 141 pagamentos, **R$ 170.859,46**.
- **Folha 17:** 138 lançamentos, 67 colaboradores, **R$ 170.859,46**.
- **Checksum global:** OK. Extratos e folha fecham no mesmo total.
- **Critério de nome:** normalização em maiúsculas, sem acentos e com espaços aparados; as quebras de linha internas do PDF também são reconstruídas. Somente igualdade normalizada é tratada como casamento exato. Toda aproximação permanece `INCERTO`; ambiguidades ficam `NÃO_CASADO`.

### Classificações por pessoa extraída

| Classificação | Quantidade |
|---|---:|
| ALINHADO | 47 |
| CRUZADO | 1 |
| DIVERGENTE_TOTAL | 9 |
| INCERTO | 2 |
| NÃO_CASADO | 7 |

## 2. Checksums dos PDFs

| Conta | Extraído | Total extraído | Declarado no PDF | Total declarado | Status |
|---|---:|---:|---:|---:|---|
| Barra | 37 | R$ 47.495,24 | 37 | R$ 47.495,24 | OK |
| KidsCG | 27 | R$ 29.049,85 | 27 | R$ 29.049,85 | OK |
| Recreio | 45 | R$ 59.042,17 | 45 | R$ 59.042,17 | OK |
| EMLA | 32 | R$ 35.272,20 | 32 | R$ 35.272,20 | OK |
| **Total** | **141** | **R$ 170.859,46** | **141** | **R$ 170.859,46** | **OK** |

## 3. Mapeamento das contas pagadoras

| Empresa | Conta Santander | conta_pagadora_id | Unidade derivada |
|---|---|---|---|
| Barra | 13002358-5 | `2670b337-3711-4ce7-9ce0-c25b4ae855c8` | bar |
| Kids CG | 13002360-2 | `32bf1231-b6cc-476d-87d1-5a4acbfc2cec` | cg |
| Recreio | 13002361-9 | `63ecfa2e-25ec-45cd-9d7b-cb4250237c2a` | rec |
| EMLA CG | 13002359-2 | `17ff042d-ce80-4977-97d8-1a96e1792894` | cg |

## 4. Extrato por unidade x custo da folha por unidade

Kids CG e EMLA CG compartilham a unidade `cg`; por isso aparecem somadas nesta comparação territorial.

| Unidade | Pago nos extratos | Custo na folha | Diferença (extrato - folha) |
|---|---:|---:|---:|
| Campo Grande | R$ 64.322,05 | R$ 65.659,48 | -R$ 1.337,43 |
| Recreio | R$ 59.042,17 | R$ 57.192,17 | R$ 1.850,00 |
| Barra | R$ 47.495,24 | R$ 48.007,81 | -R$ 512,57 |
| **Total** | **R$ 170.859,46** | **R$ 170.859,46** | **R$ 0,00** |

## 5. Por que 141 pagamentos e 138 lançamentos não são comparáveis 1:1

- Os PDFs contêm **141 transferências bancárias**.
- Após somar repetições da mesma pessoa na mesma conta, há **130 pares pessoa-conta**.
- Portanto, **11 transferências** são parcelas adicionais do mesmo par pessoa-conta.
- A folha contém **138 linhas contábeis** distribuídas por unidade e **67 colaboradores**.
- Uma transferência bancária não corresponde necessariamente a uma linha de `lancamentos_folha`: a mesma pessoa pode receber mais de uma transferência na mesma conta e também receber por contas diferentes.

## 6. Exceções para decisão humana

### Pagamentos cruzados entre unidades (1)

| Nome no extrato | Candidato na folha | Confiança | Total pago | Total folha |
|---|---|---|---:|---:|
| FABIOLA DE SOUSA VA LDEVINO | Fabiola Valdevino | EXATO (100%) | R$ 4.859,20 | R$ 4.859,20 |

### Não casados (7)

| Nome no extrato | Candidato na folha | Confiança | Total pago | Total folha |
|---|---|---|---:|---:|
| ANTONIO MARCOS AN GELO DANTAS FILHO | - | NÃO CASADO (melhor 0.0%; margem 0.0) | R$ 149,10 | R$ 0,00 |
| DEMERVALDO DELFIN O DO NASCIMENTO NE TO | - | NÃO CASADO (melhor 0.0%; margem 0.0) | R$ 3.942,00 | R$ 0,00 |
| GABRIEL ANTONY ALVE S DE ARAUJO | - | NÃO CASADO (melhor 86.9%; margem 1.4) | R$ 2.640,82 | R$ 0,00 |
| GABRIEL SANTOS TEIX EIRA DA SILVA | - | NÃO CASADO (melhor 85.5%; margem 0.0) | R$ 2.522,99 | R$ 0,00 |
| LUIS LEONARDO CABR AL DE CASTRO | - | NÃO CASADO (melhor 0.0%; margem 0.0) | R$ 4.720,00 | R$ 0,00 |
| MARIA ROSEANE ALVE S DE ARAUJO | - | NÃO CASADO (melhor 60.0%; margem 60.0) | R$ 3.850,00 | R$ 0,00 |
| RAFAEL ALVES SOUZA | - | NÃO CASADO (melhor 85.5%; margem 5.5) | R$ 5.335,00 | R$ 0,00 |

### Casamentos incertos (2)

| Nome no extrato | Candidato na folha | Confiança | Total pago | Total folha |
|---|---|---|---:|---:|
| LARISSA BHEATTRIZ BA RBOSA SANTOS | Larissa Bheatriz | INCERTO (85.5%; margem 85.5) | R$ 2.601,82 | R$ 2.601,82 |
| WILLIAN DE ANDRADE DA SILVA | William Andrade | INCERTO (85.5%; margem 33.6) | R$ 2.345,82 | R$ 2.345,82 |

### Totais divergentes (9)

| Nome no extrato | Candidato na folha | Confiança | Total pago | Total folha |
|---|---|---|---:|---:|
| ANA PAULA ALVES ME NDONCA DA SILVA | Ana Paula | EXATO (100%) | R$ 3.749,32 | R$ 3.499,32 |
| CAIO TENORIO DE ARA UJO | Caio Araujo | EXATO (100%) | R$ 3.694,49 | R$ 3.730,60 |
| DAIANA PACIFICO DA S ILVA DOS ANJOS | Daiana Pacífico | EXATO (100%) | R$ 3.648,42 | R$ 3.405,99 |
| JHONATAN SAMUEL VI CENTE SILVEIRA | Jhonatan Samuel  | EXATO (100%) | R$ 1.851,50 | R$ 1.887,61 |
| JOHNATAN DE JESUS G OMES SILVA | Johnatan Gomes | EXATO (100%) | R$ 2.681,82 | R$ 2.681,83 |
| JONATHAN DE LIMA SA NTOS | Jonathan Santos  | EXATO (100%) | R$ 110,00 | R$ 60,00 |
| LETICIA DE ALMEIDA P ALMEIRA | Letícia Palmeira | EXATO (100%) | R$ 2.178,00 | R$ 2.177,70 |
| MARCOS DA SILVA SAT URNINO | Marcos Saturnino | EXATO (100%) | R$ 3.248,01 | R$ 3.368,01 |
| PEDRO SERGIO FIGUEI REDO DA GLORIA | Pedro Glória | EXATO (100%) | R$ 2.665,82 | R$ 2.655,82 |

### Colaboradores da folha sem casamento exato/aceito no extrato (8)

Esta lista é auxiliar: inclui pessoas que podem estar entre os casos incertos ou não casados. Não significa automaticamente ausência de pagamento.

- Gabriel Anthony - R$ 2.640,82
- Gabriel Leão - R$ 2.522,99
- Jeyson Gaia - R$ 360,50
- Léo Castro - R$ 4.720,00
- Marcos Ângelo - R$ 149,10
- Rafael Alves (Akeem) - R$ 5.335,00
- Roseane Alves - R$ 3.850,00
- Valdo Delfino - R$ 3.942,00

## 7. Arquivo detalhado

A tabela completa por pessoa está em `reconciliacao-extratos-santander-folha-17-2026-07.csv`. Valores monetários no CSV usam ponto decimal e representam reais.

## 8. Limites e próximo passo

- Este relatório não atribui conta pagadora a ninguém.
- `INCERTO` e `NÃO_CASADO` exigem validação de Alf/Ana/Rose antes de qualquer chamada a `folha_rateio_contas_salvar`.
- Mesmo um casamento exato pode resultar em `CRUZADO`: isso descreve a diferença entre caixa pagador e rateio de custo; não é erro automático.
