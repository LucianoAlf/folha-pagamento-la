# Diretriz de Execução — Plano de Contas + Centro de Custo (Super Folha)

**Data:** 2026-06-23 (rev. 2 — corrige o tratamento dos lançamentos atuais)
**Para:** time do Cursor (executar). Auditoria posterior pelo Claude via MCP Supabase — projeto `ubdvtjbitozhkuvvqkxj`.
**Premissa inegociável:** **zero retrabalho, zero erro agora.** Cada etapa tem checkpoint de auditoria antes de seguir.
**Fonte de verdade do plano:** `Relatório_Financeiro_Geral_EMLA_-_Novo_Plano_de_Contas.csv` — espelho **exato** do Emusys. **3.3 confirmado inexistente** (Rose confirmou + ausente no Fluxo_Barra). Não inventar 3.3.

---

## 0. Estado real (auditado em 2026-06-23) — LER ANTES DE TUDO

- A limpeza dos dados antigos (período da Ana) **já foi feita**.
- Os **31 lançamentos hoje em `contas_pagar` são da Rose**, feitos em 22–23/06 (um único usuário). **São válidos e atuais.**
- Eles foram lançados na **estrutura velha** (19 categorias planas + `unidade` texto), porque o `plano_contas` novo ainda não existe.

> **⛔ NÃO APAGAR esses 31 lançamentos. NÃO pedir pra Rose refazer.** O caminho é **preservar e converter** pro modelo novo. Apagar = perda de dado. Refazer = retrabalho. Ambos violam a premissa. A conversão é determinística (ver §5 e Apêndice A) — a Rose não perde nada.

**Implicação de timing:** subir a estrutura nova o quanto antes e converter os 31, pra Rose seguir lançando **direto no modelo novo**. Avisar a Rose pra segurar o lançamento pesado durante a virada (~horas), pra não digitar em estrutura no meio da migração.

---

## 1. Decisões tomadas (travadas — sem perguntas em aberto)

1. **Abordagem B** — `plano_contas` hierárquica espelhando o CSV Emusys. (Best practice: ContaAzul recomenda espelhar o plano da contabilidade pra conciliação.)
2. **Centro de custo entra JÁ no modelo** — tabela + FK + seed das 3 unidades. *UI de gestão e DRE ficam pra depois; só o modelo é agora.*
3. **Preservar e converter os 31 lançamentos da Rose** — sem apagar, sem refazer. Conversão determinística.
4. **Sem "Outros" global** — o Emusys não tem. Mantêm-se os "Outras X" por grupo. Pendência futura de classificação = `plano_conta_id IS NULL` (inbox "a categorizar"), nunca conta-lixo. (Obs.: nenhum dos 31 atuais fica em inbox — todos têm nó real; ver Apêndice A.)
5. **`tipo_custo` derivado do bloco** — 4=variável, 5=fixo, 6=capex, 7=não operacional. Read-only pras meninas.
6. **Unificar no plano gerencial Emusys** (estilo DRE). Sem camada contábil separada agora (`emusys_id` deixa a porta aberta).
7. **"Cartões Corporativos" e "Parcelamentos (Diversos)" NÃO viram nós.** Cartão = `metodo_pagamento` (já existe). Parcelamento = `tipo_lancamento = 'parcelada'`.

---

## 2. Modelo de dados final

### 2.1 `plano_contas`

```sql
plano_contas (
  id              uuid PK,
  codigo          text UNIQUE NOT NULL,   -- '5.2.3'
  nome            text NOT NULL,          -- 'Energia Elétrica'
  nome_completo   text NOT NULL,          -- '5.2.3 Energia Elétrica'
  parent_id       uuid REFERENCES plano_contas(id),
  nivel           int,                    -- 1=bloco, 2=grupo, 3=folha
  grupo_plano     text,                   -- receita | custo_variavel | despesa_fixa | investimento | nao_operacional
  natureza        text NOT NULL,          -- 'entrada' (blocos 3 e 7.1) | 'saida' (blocos 4,5,6 e 7.2)  ← CRÍTICO
  label_educativo text,
  inclui_ebitda   boolean,
  inclui_margem   boolean,                -- bloco 4
  inclui_capex    boolean,                -- bloco 6
  emusys_id       text NULL,
  ativo           boolean DEFAULT true,
  ordem           int,
  icone           text NULL
)
```

- **`natureza` é obrigatório** — sem ele o seletor de contas a pagar não esconde o bloco 7.1, porque 7.1 e 7.2 caem no mesmo `grupo_plano`.
- **Só folhas** (sem filhos) são selecionáveis em lançamento.

### 2.2 `centros_custo` (NOVO)

```sql
centros_custo (
  id     uuid PK,
  codigo text,             -- 'cg' | 'rec' | 'bar'
  nome   text NOT NULL,    -- 'Campo Grande' | 'Recreio' | 'Barra'
  tipo   text NOT NULL,    -- 'unidade' (futuro: 'funcional', 'projeto')
  ativo  boolean DEFAULT true,
  ordem  int
)
-- seed: Campo Grande/cg, Recreio/rec, Barra/bar — tipo 'unidade'
```

### 2.3 `contas_pagar` (alterações)

```sql
ALTER TABLE contas_pagar ADD COLUMN plano_conta_id       uuid REFERENCES plano_contas(id);
ALTER TABLE contas_pagar ADD COLUMN centro_custo_id      uuid REFERENCES centros_custo(id);
ALTER TABLE contas_pagar ADD COLUMN emusys_lancamento_id text NULL;
-- manter `unidade` (texto) e `categoria_id` durante a transição; depois de converter, novos lançamentos usam só os FKs
```

---

## 3. Caminho de execução (ordem obrigatória)

| # | Task | Observação |
|---|------|-----------|
| **T1** | Migration: criar `plano_contas` (com `natureza`) + `centros_custo` | DDL |
| **T2** | Seed `plano_contas` do CSV (árvore completa, `natureza` correta) + seed `centros_custo` (3 unidades) | árvore fiel ao Emusys |
| **T3** | Migration: ADD colunas em `contas_pagar` (`plano_conta_id`, `centro_custo_id`, `emusys_lancamento_id`) | DDL |
| **T4** | **Backup** de `contas_pagar` (31 linhas) → `contas_pagar_backup_2026_06` | segurança antes do UPDATE |
| **T5** | **Converter** os 31 lançamentos: `unidade`→`centro_custo_id` e `categoria_id`/descrição→`plano_conta_id` (ver Apêndice A) | **UPDATE, não DELETE** — só depois do backup auditado |
| **T6** | UI: seletor de plano de conta em **árvore + busca** (Nova/Editar), filtrando `natureza='saida'` **e** folha; seletor de **centro de custo** (3 unidades) | remove a lista plana de 19 e o campo livre de unidade |
| **T7** | Lista/Auditoria: exibir `codigo nome` do plano + centro de custo | |
| **T8** | Guia HTML atualizado pra Rose/Ana (árvore Emusys + centro de custo) | |
| **T9** | Rose **segue lançando no modelo novo** (não refaz nada) | |

---

## 4. Checkpoints de auditoria (Claude roda via MCP depois de cada etapa)

**Depois de T2 — `plano_contas`:**
- COUNT de folhas == nº de folhas do CSV; **nenhum código duplicado**; nenhuma lacuna além da ausência intencional de 3.3.
- Spot-check: `5.2.3`, `6.2.7`, `5.3.15`, `4.7.4` existem e são folha.
- `natureza`: nós sob blocos 3 e 7.1 = `'entrada'`; sob 4/5/6/7.2 = `'saida'`. **Zero divergência.**
- 7.1 (entradas) **e** 7.2 (saídas) ambos presentes.

**Depois de T2 — `centros_custo`:** 3 linhas — CG/cg, Recreio/rec, Barra/bar, tipo `'unidade'`.

**Depois de T3 — colunas:** `plano_conta_id`, `centro_custo_id`, `emusys_lancamento_id` existem; FKs válidas.

**Antes de T5 — GATE de backup:** `contas_pagar_backup_2026_06` existe **e** tem 31 linhas. **Só libera o UPDATE com isso confirmado.**

**Depois de T5 — conversão (GATE crítico de não-perda):**
- `COUNT(*)` em `contas_pagar` continua **31** (zero perda).
- **Todos os 31** têm `plano_conta_id` não nulo apontando pra folha com `natureza='saida'`, e `centro_custo_id` válido.
- Os 17 ex-"Outros" caíram nos 4 nós certos: 6 em `6.2.4`, 6 em `6.2.1`, 4 em `6.2.7`, 1 em `4.2.3` (ver Apêndice A).

**Durante T9 — Rose lançando:** todo lançamento novo com `plano_conta_id` (folha `natureza='saida'`) + `centro_custo_id`; zero apontando pra `3.x`/`7.1.x`.

**T6 — seletor:** o dropdown só oferece folhas `natureza='saida'` (4/5/6/7.2). Não aparece `3.x` nem `7.1.x`.

---

## 5. Conversão dos 31 (lógica)

- **Centro de custo:** `unidade` texto → FK. `cg`→Campo Grande, `rec`→Recreio, `bar`→Barra.
- **Plano de conta (14 não-"Outros", por categoria):** Energia Elétrica→`5.2.3`; Softwares / Assinaturas→`5.2.11`; Monitoramento e Segurança→`5.2.10`; Aluguel→`5.2.4`.
- **Plano de conta (17 "Outros", por descrição):** ver Apêndice A.
- **Pendência conhecida (Rose conferir, não trava):** o lançamento `Instrumentos novos - (Recreio) (3/6)` está com `unidade = cg`, mas a descrição diz Recreio. Provável erro de digitação — a conversão mapeia o campo `unidade` como está; a Rose corrige depois se for o caso.

---

## 6. Fora de escopo (parkado — NÃO fazer agora)

- Telas de **DRE/EBITDA/AV/AH** — o Fluxo manual vira automático depois, lendo `plano_contas` + centro de custo.
- **UI de gestão** de centros de custo — só modelo + seed agora.
- **Rateio multi-centro** — 1 centro por conta por enquanto; porta aberta pra `contas_pagar_rateio` no futuro.
- **API Emusys live** — `emusys_id` null agora.
- **Módulo de receita** (bloco 3) — entra com o DRE.
- **Bistrô** — conta bancária separada; tema futuro, possivelmente sob a Ana. Tabelas `bistro_*` já existem; não mexer.

---

## Apêndice A — Mapeamento dos 17 lançamentos "Outros" (dado vivo, 23/06)

| Descrição (padrão) | Qtd | → Nó Emusys |
|---|---|---|
| `Cadeiras - (Recreio) (n/8)` | 6 | **6.2.4** Mobiliário |
| `Instrumentos novos ...` | 4 | **6.2.7** Aquisição de instrumentos |
| `Equipamentos Disconildo Lounge ...` | 2 | **6.2.1** Aquisição de Materiais e equipamentos |
| `Compras de Equipamentos Lojas novas ...` | 4 | **6.2.1** Aquisição de Materiais e equipamentos |
| `Uniforme Colaboradores Soul do Céu ...` | 1 | **4.2.3** Vestuário e acessórios (colaboradores) |

Total: 17 → 6.2.4 (6), 6.2.1 (6), 6.2.7 (4), 4.2.3 (1). Todos são parcelados (`tipo_lancamento='parcelada'`, com `parcela_atual/total_parcelas` na notação `(x/y)`). **Recomendado:** Rose dar um ok visual nesse mapa antes do UPDATE (é inequívoco, mas honra o "zero erro").

---

## 7. Fundamento das decisões (o "porquê" — caso precise defender)

- **Espelho exato (Abordagem B):** best practice — a ContaAzul recomenda espelhar o plano de contas da contabilidade justamente pra a conciliação bater. Além disso dá a ponte cognitiva pra Rose/Ana (mesma cabeça do Emusys) e a base do DRE e da conciliação da Maria.
- **Centro de custo é eixo separado:** no mercado, plano de conta e centro de custo são duas dimensões — categoria = "o quê" (energia, salário), centro de custo = "onde/quem" (CG, Recreio, Marketing). A análise estratégica nasce do cruzamento. A LA já opera por unidade (planilhas Indicadores/Fluxo por unidade + "Rateio entre unidades" com valor real), então é capturar o que já existe, não inventar.
- **Centro de custo AGORA:** com a base limpa, modelar custa quase nada; depois custa retrabalho (mudar schema + retocar lançamentos). A premissa "zero retrabalho" decide por agora.
- **Sem "Outros" global:** o Emusys não tem — só "Outras X" por grupo (4.1.5, 5.2.10…). Espelho fiel mantém esses e não cria o global. Pendência futura = inbox `plano_conta_id IS NULL` (como a conciliação do ContaAzul), nunca conta-lixo.
- **`tipo_custo` derivado:** é como o ContaAzul deriva o DRE — a classificação vem da conta, não de um toggle por lançamento. Menos erro pras meninas.
- **Plano gerencial, não contábil:** o CSV é estilo DRE (bloco 3 receita → 7 não operacional), não balanço (ativo/passivo). É o certo pra operação + Maria. Camada contábil só entra se o plano oficial do Geraldo divergir um dia (`emusys_id` deixa a porta aberta).
- **Cartão/Parcelamento não são nós:** cartão = `metodo_pagamento` (já existe); parcelamento = `tipo_lancamento='parcelada'`. Categoriza-se pela natureza do que foi comprado.
- **`natureza` no `plano_contas`:** separa o bloco 7 (7.1 entradas / 7.2 saídas caem no mesmo `grupo_plano`), pro seletor de pagar mostrar só saídas.

*Boas práticas: documentação e central de ajuda da ContaAzul (categoria × centro de custo; plano espelhado na contabilidade; conciliação) e Mainô. Auditoria técnica: banco `ubdvtjbitozhkuvvqkxj` via MCP Supabase (somente leitura).*

---

## Referência

- Plano = o CSV (espelho exato do Emusys). 3.3 inexistente (confirmado Rose + ausente no Fluxo_Barra).
- Este doc **substitui** o `contraponto-plano-contas-emusys.md` (que pode ser descartado): as decisões em aberto dele já estão fechadas aqui (§1), e o fundamento foi trazido pra cima (§7).
