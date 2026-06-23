# Plano de Contas Emusys — Design Spec

**Data:** 2026-06-23  
**Status:** Proposta para aprovação  
**Objetivo:** Espelhar o plano de contas Emusys no Super Folha para eliminar retrabalho, habilitar DRE/EBITDA/CAPEX e integração futura (API, conciliação Maria).

---

## 1. Contexto e problema

O Super Folha nasceu como RH (Anna) com Contas a Pagar operacional (Rose). Hoje evolui para **sistema financeiro sério** que deve:

- Conversar com **Emusys** (ERP legado: conciliação, folha, professores, mensais, parceladas)
- Permitir **auditoria cruzada** (Maria: Emusys × Super Folha × banco)
- Alimentar **DRE gerencial, EBITDA, CAPEX, CAC** no futuro
- Ser **educativo** para Rose/Ana (termos de mercado com explicação entre parênteses)

**Problema atual:** `categorias_despesa` é lista plana (19 itens) com `tipo_custo` fixo/variável. Emusys usa **árvore numerada** (4.x, 5.x, 6.x, 7.x) + **tipo operacional** (Eventual / Mensal / Parcela). Lançamentos em "Outros" não batem com Emusys.

**Risco:** Se Rose continuar lançando sem espelho Emusys → retrabalho em massa depois.

---

## 2. O que o Emusys já faz (referência dos prints)

### 2.1 Três conceitos separados (não confundir)

| Conceito Emusys | O que é | Super Folha hoje | Super Folha futuro |
|-----------------|---------|------------------|-------------------|
| **Plano de Conta** | Código hierárquico (ex. `5.2.3 Energia Elétrica`) | `categorias_despesa.nome` plano | `plano_contas` árvore |
| **Tipo operacional** | Eventual / Mensal / Parcela | `tipo_lancamento` unica/recorrente/parcelada | 1:1 mapeado |
| **Cadastro vs lançamento** | Templates (mensal, parcelada) vs Contas por Período | Só `contas_pagar` | Templates opcional fase 2 |

### 2.2 Blocos do plano (CSV + UI Emusys)

| Bloco | Nome | Uso estratégico |
|-------|------|-----------------|
| 3 | Receita / Faturamento | DRE topo (fase receitas) |
| 4 | Despesas/Custos variáveis | Margem bruta, CAC (marketing, comissão) |
| 5 | Despesas fixas | **EBITDA** (estrutura: aluguel, folha, software) |
| 6 | Investimentos | **CAPEX** (instrumentos, mobiliário, reforma) |
| 7 | Não operacionais | Empréstimos, rateio, distribuição lucros |

### 2.3 Folha / professores (Emusys)

Aba **Pagamento de Professores** + contas `5.3.x`:

- `5.3.14` Salários Professores CLT/Estagiário
- `5.3.15` Salários Professores Horistas
- `5.3.16` Salários Marketing/Comercial
- `5.3.1` Salário Adm, gerente e manutenção
- `5.3.9` Pró-labores
- etc.

**Folha no Super Folha** deve usar **os mesmos códigos** quando integrar pagamentos de colaboradores/professores.

---

## 3. Abordagens consideradas

### A — Importar árvore Emusys; manter `categorias_despesa` como alias legado

- Prós: zero quebra imediata
- Contras: duas fontes de verdade; sync API duplicado

### B — Substituir categorias por `plano_contas` (recomendada)

- Importar CSV → tabela `plano_contas` hierárquica
- `contas_pagar.plano_conta_id` (FK para folha da árvore)
- Migrar categorias atuais → nós Emusys equivalentes
- Deprecar `tipo_custo` fixo/variável → **derivado do bloco** (4=variável operacional, 5=fixo, 6=capex)
- Prós: 1:1 Emusys, API-ready, DRE correto
- Contras: migration + UI árvore (esforço ~1 sprint)

### C — Só adicionar `codigo_emusys` nas 19 categorias atuais

- Prós: rápido
- Contras: não espelha árvore; meninas não veem `6.2.7`; integração API frágil

**Recomendação: B** — espelho total desde o alicerce.

---

## 4. Modelo de dados proposto

### 4.1 Tabela `plano_contas`

```sql
plano_contas (
  id              uuid PK
  codigo          text UNIQUE NOT NULL   -- '5.2.3'
  nome            text NOT NULL          -- 'Energia Elétrica'
  nome_completo   text NOT NULL          -- '5.2.3 Energia Elétrica' (como Emusys)
  parent_id       uuid FK plano_contas
  nivel           int                    -- 1=bloco, 2=grupo, 3=folha
  grupo_plano     text                   -- 'custo_variavel'|'despesa_fixa'|'investimento'|'nao_operacional'|'receita'
  label_educativo text                   -- '(Despesa fixa — entra no EBITDA)'
  inclui_ebitda   boolean
  inclui_margem   boolean                -- bloco 4
  inclui_capex    boolean                -- bloco 6
  emusys_id       text NULL              -- ID API futura
  ativo           boolean DEFAULT true
  ordem           int
  icone           text NULL              -- só folhas selecionáveis
)
```

**Regra:** só nós **folha** (sem filhos) são selecionáveis em lançamentos — igual dropdown Emusys.

### 4.2 Alterações em `contas_pagar`

```sql
ALTER contas_pagar ADD COLUMN plano_conta_id uuid FK plano_contas;
ALTER contas_pagar ADD COLUMN emusys_lancamento_id text NULL;
ALTER contas_pagar ADD COLUMN valor_previsto numeric NULL;  -- opcional, como Emusys
```

Manter `categoria_id` temporariamente (view/sync) até migração completa.

### 4.3 Mapeamento `tipo_lancamento` ↔ Emusys

| Super Folha | Emusys tipo |
|-------------|-------------|
| `unica` | Eventual |
| `recorrente` | Mensal |
| `parcelada` | Parcela |

### 4.4 Derivação fixo/variável (substitui escolha manual)

| `grupo_plano` | Comportamento gerencial |
|---------------|-------------------------|
| `custo_variavel` (4) | Variável |
| `despesa_fixa` (5) | Fixo |
| `investimento` (6) | CAPEX (fora EBITDA) |
| `nao_operacional` (7) | Fora operação |

Campo `tipo_custo` em categorias legadas: **read-only derivado** ou removido na fase 2.

---

## 5. UI / UX (linguagem educativa)

### 5.1 Seletor de plano de conta (Nova Conta / Editar)

Igual Emusys: **Lista em árvore** + **Busca**.

Exemplo de opção:

```
6.2.7 Aquisição de instrumentos
(Investimento / CAPEX — compra que vira patrimônio, não entra no EBITDA)
```

### 5.2 Exibição na lista / agenda / relatório

Coluna **Categoria** sempre: `codigo nome` — ex. `5.2.3 Energia Elétrica`

### 5.3 Aba Categorias → vira **Plano de Contas**

- Visualização árvore (somente leitura para meninas; edição só admin)
- Link "Ver no Emusys" (futuro)
- Sem criar categoria solta sem código — acaba com "Outros" genérico

### 5.4 Guia HTML para Rose/Ana

Slides cobrindo:

1. O que é plano de contas (igual Emusys)
2. Blocos 4 / 5 / 6 / 7 com exemplos LA Music
3. Eventual vs Mensal vs Parcela
4. Onde NÃO lançar (sem "Outros")
5. Mapa: tela Emusys ↔ Super Folha
6. Folha professores → códigos 5.3.x

---

## 6. Migração das categorias atuais → Emusys

| Categoria atual | Código Emusys alvo |
|-----------------|-------------------|
| Aluguel | 5.2.4 |
| Condomínio | 5.2.4 (mesmo grupo) |
| Energia Elétrica | 5.2.3 |
| Água | 5.2.5 |
| Internet / Telefone | 5.2.1 |
| Softwares / Assinaturas | 5.2.11 |
| Folha de Pagamento | 5.3.1 (ou específico por tipo) |
| Contador | 5.4.1 |
| Marketing / Ads | 4.7.4 |
| Impostos / Taxas | 4.1.1 |
| Serviços Terceiros | 5.4.6 |
| Seguros | 5.2.9 |
| Monitoramento e Segurança | 5.2.9 ou 5.2.10 |
| Empréstimos | 7.2.1 |
| Materiais / Suprimentos | 5.2.13 |
| Manutenção | 5.5.1 |
| Cartões Corporativos | 4.1.6 |
| Parcelamentos (Diversos) | *descontinuar* — usar folha 6.x ou 4.x |
| Outros | *desativar* |

### Lançamentos jul/2026 em "Outros"

| Despesa | Código |
|---------|--------|
| Instrumentos novos | 6.2.7 |
| Equip. Disconildo / Compras equip. lojas | 6.2.1 |
| Cadeiras | 6.2.4 |
| Uniforme colaboradores | 4.2.3 |

**Decisão:** recategorizar **após** import da árvore (1 script SQL), não antes — evita duplo trabalho.

---

## 7. Integração Emusys (fases)

### Fase 1 — Espelho estático (agora)

- Import CSV → `plano_contas`
- UI árvore
- Migração categorias + lançamentos
- `emusys_id` NULL

### Fase 2 — Sync manual assistido

- Export CSV Emusys → re-import diff
- Ou endpoint se documentado

### Fase 3 — API bidirecional

- `emusys_id` em plano_contas e contas_pagar
- Webhook ou job: mudança Emusys → atualiza Super Folha
- Conciliação Maria: comparar totais por `codigo` + mês + unidade

### Fase 4 — Folha professores

- Módulo folha gera `contas_pagar` com `5.3.14` / `5.3.15` automaticamente
- Link com aba Pagamento Professores Emusys

---

## 8. Impacto nos módulos futuros

| Módulo | Depende de plano_contas |
|--------|----------------------|
| DRE gerencial | Sim — agrupa por bloco 3/4/5/6/7 |
| EBITDA | Sim — `inclui_ebitda` |
| CAPEX | Sim — bloco 6 |
| CAC | Sim — 4.7.4 + 4.3.1 + 5.3.16 |
| Conciliação bancária | `plano_conta_id` + valor |
| Notas fiscais | FK futura para despesa |
| Folha Anna | 5.3.x |

---

## 9. Escopo fase 1 (MVP espelho)

**Inclui:**

1. Migration `plano_contas` + seed do CSV
2. Script mapeamento categorias antigas
3. `plano_conta_id` em `contas_pagar`
4. UI: dropdown árvore em Nova/Editar Conta
5. Lista/Auditoria: exibir `codigo nome`
6. Recategorizar 17 lançamentos Outros
7. Desativar categoria "Outros"
8. Guia HTML operacional (relação Emusys)

**Não inclui (fase 2+):**

- API Emusys live
- Templates mensal/parcelada separados (cadastro mestre)
- Módulo receitas bloco 3
- DRE/EBITDA telas

---

## 10. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Emusys muda plano | `codigo` estável + `emusys_id` + job sync |
| Meninas confusas | Mesmo visual Emusys + HTML guia |
| Quebra lançamentos existentes | FK opcional + migração mapeada |
| Folha divergente | Documentar 5.3.x antes de integrar folha |

---

## 11. Aprovação necessária

- [ ] Abordagem B (tabela `plano_contas` espelho total)
- [ ] Recategorizar Outros **depois** do import (não antes)
- [ ] Desativar categoria "Outros" e "Parcelamentos (Diversos)"
- [ ] Fase 1 MVP conforme seção 9

**Próximo passo após aprovação:** `writing-plans` → plano de implementação task-by-task.
