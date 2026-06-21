# Casa da Maria — Contas a Pagar (Design)

**Data:** 2026-06-21  
**Autor:** Luciano + Alf + Maria (brainstorming Superpowers)  
**Status:** Aprovado (design + ajustes Maria) — plano Fatia B em implementação  
**Projeto Supabase:** `ubdvtjbitozhkuvvqkxj` (la-music-folha)

---

## 1. Contexto e objetivo

O **Super Folha** (`dash-folha-pagamento`) evolui para a **Casa da Maria** — sistema financeiro **agent-first**, onde **Maria** é a orquestradora (service role, CRUD + cron) e **Rose/Ana** são revisoras/executoras finais de ações que movem dinheiro real.

**Módulo em foco:** Financeiro → **Contas a Pagar**.

### Estado atual (verificado em 2026-06-20/21)

| Já existe | Não existe |
|-----------|------------|
| `contas_pagar` (~914 linhas), categorias, unidades | Campos de fonte/origem por conta |
| Lista, filtros, CRUD, marcar pago | Tabela de credenciais + Vault por portal |
| Resumo, Auditoria IA, Comparativo IA | Código de barras/PIX **do mês** estruturado |
| `metodo_pagamento`, recorrência, parcelas | Snapshot de relatório WhatsApp auditável |
| Light + dark com tokens semânticos (piloto Contas) | Automação Maria (cron, WhatsApp, Pluggy) |

**Gap operacional real:** Rose/Ana precisam documentar **onde buscar** cada conta; Maria precisa **coletar código mensal**, **montar relatório** e **auditar** o que foi enviado vs. o que está no banco.

### Objetivo deste design

Definir schema, UI, fluxos e ordem de entrega (**B → C → D**) para:

1. Rose/Ana trabalharem amanhã sem migration grande (**Fatia B**).
2. Estrutura correta para Maria operar (**Fatia C**).
3. Automação completa depois (**Fatia D** — fora do escopo imediato deste spec).

### Frase de decisão (Maria)

> `contas_pagar` recebe campos operacionais de fonte principal; credenciais ficam desacopladas em `contas_credenciais` com referência ao Supabase Vault; códigos mensais ficam em `contas_pagar_codigo_mes`; snapshots enviados/copiados ao WhatsApp ficam em `contas_pagar_relatorio_dia`.

---

## 2. Decisões do brainstorm (validadas)

| Tema | Decisão |
|------|---------|
| Ordem geral | **A → B → C → D** (confiável → saneamento → schema → automação) |
| Sessão Rose amanhã | Lista + Auditoria/Comparativo **em paralelo** |
| Acesso Rose | **Criar login**; permissão **igual à Ana** (total no Contas a Pagar) |
| Pré-requisito amanhã | **Fatia B** — sem migration grande |
| Modelo cadastro | **Abordagem 1** — fonte fixa em `contas_pagar`; credencial separada; código mensal em tabela própria |
| Código do mês | Maria coleta todo dia; **não** fica fixo no cadastro |
| Snapshot WhatsApp | Tabela própria + campos de auditoria reforçados (ver §4.4) |
| Descartado agora | Normalização 1:N de fontes; só `observacoes` + vault externo |
| UI | Tokens semânticos dark **e** light; componentes existentes (`Card`, `Badge`, `Modal`, etc.) |
| Comparativo IA | Bug duplicate key corrigido (`upsert` on `input_hash`, deploy v16) |

---

## 3. Regra obrigatória de UI (tokens semânticos)

Toda UI nova ou alterada em Contas a Pagar **deve** usar tokens de `styles/theme.css` — **proibido** introduzir `bg-slate-*`, `text-white`, hex hardcoded ou duplicar estilos por tema.

Referência: `Docs/superpowers/specs/2026-06-20-light-mode-pro-design.md`.

| Uso | Classes |
|-----|---------|
| Fundo página | `bg-bg` |
| Cards, modais, sidebar | `bg-surface`, `border-line` |
| Texto | `text-primary`, `text-secondary`, `text-muted` |
| Badge sem código | `bg-surface-2 text-muted` |
| Coletado | `bg-success/10 text-success` |
| Indisponível | `bg-warning/10 text-warning` |
| Vencido / precisa atualizar | `bg-danger/10 text-danger` |
| Ação primária | `bg-accent text-on-accent` |

**Proibido:** `text-white`, `bg-slate-*`, hex hardcoded, ou duplicar estilos por tema.

Token **`--on-accent`** (texto sobre fundo accent): adicionar em `styles/theme.css` e mapear em `index.html` como `on-accent`:

```css
:root, .dark, .light {
  --on-accent: 255 255 255;
}
```

```js
'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
```

Critério: alternar light/dark no toggle e conferir contraste + legibilidade antes de marcar tarefa pronta.

---

## 4. Seção 1 — Modelo de dados (Fatia C)

### 4.1 Campos de fonte em `contas_pagar`

Novos campos na tabela existente (migration única):

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `fonte_tipo` | text CHECK | `site`, `email`, `pix_fixo`, `banco`, `whatsapp`, `manual` |
| `fonte_url` | text NULL | URL do portal (Light, CEDAE, etc.) |
| `fonte_instrucoes` | text NULL | Passo a passo para Maria/Rose |
| `fonte_identificador` | text NULL | CNPJ, nº instalação, conta na credenciadora |
| `credencial_id` | uuid NULL FK | → `contas_credenciais(id)` |
| `pix_chave_fixa` | text NULL | Quando PIX não muda mês a mês |
| `email_pagamento` | text NULL | E-mail de pagamento a pessoa |

**Nota dark/light:** nenhum impacto no schema.  
**Notas operacionais:** várias contas podem compartilhar o mesmo `credencial_id`.

### 4.2 `contas_credenciais`

Apenas **metadados operacionais seguros** — nenhum identificador de segredo exposto ao frontend.

| Coluna | Tipo | Visível UI (Rose/Ana) |
|--------|------|------------------------|
| `id` | uuid PK | — |
| `nome` | text NOT NULL | sim |
| `portal` | text NOT NULL | sim (light, cedae, claro, itau, …) |
| `login_hint` | text NULL | sim (e-mail/usuário, **nunca** senha) |
| `ativo` | boolean DEFAULT true | sim |
| `created_at`, `updated_at` | timestamptz | — |

**Segredo no Vault (derivado internamente):**

- O frontend **não** conhece nem manipula o nome do segredo.
- A Edge Function deriva o path ao gravar/ler: `contas_credenciais/{credencial_id}`.
- Fluxo **Definir senha:** browser envia `{ credencial_id, senha }` uma vez → Edge grava no Vault → resposta **somente** `{ ok: true }`. Senha **nunca** retorna ao browser.

**Leitura:** apenas `service_role` / Maria via `get_vault_secret('contas_credenciais/' || credencial_id)` (ou RPC equivalente).

**RLS:** authenticated pode CRUD nos metadados; Edge valida permissão antes de gravar segredo (ver §4.5).

### 4.3 `contas_pagar_codigo_mes`

| Coluna | Tipo |
|--------|------|
| `id` | uuid PK |
| `conta_pagar_id` | uuid FK → `contas_pagar` |
| `competencia` | date NOT NULL (1º dia do mês, alinhado a `contas_pagar.competencia`) |
| `codigo_barras` | text NULL |
| `chave_pix` | text NULL |
| `qr_pix_payload` | text NULL (EMV/brcode) |
| `valor_coletado` | numeric(12,2) NULL |
| `coletado_em` | timestamptz NULL |
| `coletado_por` | text NULL (`maria`, `rose`, `ana`, `alf`) |
| `status_coleta` | text CHECK (`pendente`, `coletado`, `indisponivel`) |
| `created_at`, `updated_at` | timestamptz |

**Unique:** `(conta_pagar_id, competencia)` — upsert ao atualizar no mesmo mês.

### 4.4 `contas_pagar_relatorio_dia`

| Coluna | Tipo |
|--------|------|
| `id` | uuid PK |
| `data_referencia` | date NOT NULL |
| `unidade` | text NOT NULL (`cg`, `rec`, `bar`, `todas`, …) |
| `mensagem_texto` | text NOT NULL |
| `gerado_por` | text NOT NULL (`maria`, `rose`, `ana`, `alf`) |
| `status_envio` | text CHECK (`rascunho`, `copiado`, `enviado`, `erro`) |
| `hash_mensagem` | text NOT NULL (SHA-256 do `mensagem_texto`) |
| `payload_json` | jsonb NULL (IDs das contas incluídas, metadados) |
| `canal` | text NULL (`whatsapp_grupo_cg`, …) |
| `provider_message_id` | text NULL |
| `enviado_em` | timestamptz NULL |
| `created_at`, `updated_at` | timestamptz |

**Auditoria:** comparar `hash_mensagem` entre versões; cruzar `payload_json.conta_ids` com `contas_pagar_codigo_mes` do dia.

### 4.5 Edge Function: `contas-credencial-vault`

**Entrada:** `{ credencial_id, senha }`.  
**Saída:** `{ ok: true }` — **nunca** retorna o segredo.

**Autorização (além de JWT válido):**

1. Validar usuário autenticado.
2. Carregar `user_profiles.role` e/ou e-mail.
3. Permitir apenas: **admin** (Alf/Luciano), **rh** (Ana), e **Rose** (e-mail cadastrado no allowlist interno da Edge).
4. Rejeitar `403` para qualquer outro usuário autenticado genérico.

**Gravação:** derivar secret name internamente como `contas_credenciais/{credencial_id}`; upsert no Vault via RPC `set_vault_secret` (migration C3).

Rose/Ana usam botão **"Definir senha"** — browser envia uma vez e esquece.

---

## 5. Seção 2 — UI

### 5.1 Princípio de separação

| Rose/Ana (operacional) | Maria (por trás) |
|------------------------|------------------|
| Origem/fonte, instruções, identificador | `vault_secret_name`, coleta automatizada |
| Credencial vinculada (nome/portal/login hint) | Leitura Vault na coleta |
| PIX/e-mail fixo quando aplicável | UPSERT `contas_pagar_codigo_mes` |
| Badge status código do mês | Snapshot + comparação banco vs WhatsApp |
| Preview relatório + **Copiar mensagem** | Cron, envio WhatsApp (Fatia D) |

### 5.2 `EditarContaModal` — bloco "Origem / Fonte"

Nova seção (tokens semânticos, componentes existentes):

- Select `fonte_tipo`
- Input `fonte_url` (condicional)
- Textarea `fonte_instrucoes`
- Input `fonte_identificador`
- Select `credencial_id` + atalho "Nova credencial"
- Input `pix_chave_fixa` / `email_pagamento` (condicional)

### 5.3 Credenciais (sub-aba ou modal)

Lista: nome, portal, login hint, ativo/inativo.  
Ação: **Definir senha** → Edge → Vault.  
**Proibido:** exibir `vault_secret_name`, senha ou segredo retornado.

### 5.4 Badge código do mês (lista)

Na linha da conta, badge simples:

| Status | Badge |
|--------|-------|
| Sem código | `Sem código` (muted) |
| Coletado | `Coletado` (success) |
| Indisponível | `Indisponível` (warning) |
| Vencido / precisa atualizar | `Atualizar` (danger) |

Detalhe completo (código barras, PIX, QR, valor, coletado_em) **somente** ao abrir a conta.

### 5.5 Relatório do dia (prioridade prática)

Nova sub-seção em Contas a Pagar ou Resumo:

- Lista por `data_referencia` + unidade
- Preview de `mensagem_texto`
- Botão **Copiar mensagem** (formato das meninas)
- Atualiza `status_envio` → `copiado` ao copiar
- Valor **mesmo sem** automação WhatsApp (Fatia D)

### 5.6 Fora do escopo UI (Fatia C)

- RBAC fino Rose vs Ana (Fatia C+ ou posterior)
- Conciliação bancária
- Upload de comprovantes (spec futuro)

---

## 6. Seção 3 — Fluxos e ordem B → C → D

### 6.1 Fluxo diário Maria (alvo)

1. **Consulta** — contas vencendo hoje/amanhã por unidade, com fonte + credencial + status código mês.
2. **Coleta** — por conta: `pix_fixo`/`email` do cadastro; `site`/`banco` via Vault + instruções; upsert `contas_pagar_codigo_mes`.
3. **Montagem** — relatório formato meninas (+ saldos Pluggy quando Fatia D).
4. **Snapshot** — insert `contas_pagar_relatorio_dia` com `hash_mensagem`, `payload_json`, `gerado_por`, `status_envio`.
5. **Distribuição** — envio WhatsApp (D) ou Rose copia manualmente (C).
6. **Pós-pagamento** — Rose marca pago; Maria relaciona comprovante/status (spec futuro).

**Linha vermelha:** Maria **não** executa PIX/transferência/pagamento real.

### 6.2 Fluxo Rose/Ana

| Momento | Ação |
|---------|------|
| Amanhã (B) | Lista + Auditoria/Comparativo; saneamento; fonte provisória em `observacoes` se C não subiu |
| Pós-C | Preenchem Origem/Fonte; vinculam credencial; conferem badges; geram/copiam relatório |
| Diário | Pagam no banco; marcam pago no sistema; ✅ no WhatsApp |

### 6.3 Fatia B — antes/durante amanhã

| ID | Entrega | Critério |
|----|---------|----------|
| B1 | Usuário Rose (Supabase Auth) | Login funcional — **requer e-mail da Rose** |
| B2 | Deploy `ai-contas-auditoria` upsert | "Atualizar" na Auditoria sem erro duplicate key |
| B3 | `saveNotas` com toast de erro | Falha visível, não silenciosa |
| B4 | Smoke manual | Lista, editar, pagar, auditoria, comparativo |

**Explicitamente fora de B:** migration C, WhatsApp cron (D), RBAC.

### 6.4 Fatia C — após saneamento inicial

**Ordem técnica de migrations (Maria):** C2 → C1 → C4/C5 → C3/UI

| ID | Entrega | Ordem |
|----|---------|-------|
| C2 | Migration `contas_credenciais` + RLS | 1º |
| C1 | Migration campos fonte + `credencial_id` FK em `contas_pagar` | 2º (após C2) |
| C4 | Migration `contas_pagar_codigo_mes` | 3º |
| C5 | Migration `contas_pagar_relatorio_dia` | 3º (paralelo C4) |
| C3 | RPC `set_vault_secret` + Edge `contas-credencial-vault` | 4º |
| C6 | UI Origem/Fonte (`EditarContaModal`) | 5º |
| C7 | UI Credenciais | 5º |
| C8 | Badge + detalhe código do mês | 5º |
| C9 | Relatório do dia (preview + copiar) | 5º |
| C10 | Types + `contasPagarService` | transversal |

### 6.5 Fatia D — automação (spec futuro)

- Cron coleta + relatório
- Envio WhatsApp automático (corrigir UAZAPI/token)
- Pluggy saldos no relatório
- Conciliação bancária

### 6.6 Matriz de permissões

| Recurso | Rose/Ana (auth) | Maria (service role) |
|---------|-----------------|----------------------|
| `contas_pagar` + fonte | read/write | read/write |
| `contas_credenciais` (hints) | read/write | read/write |
| Vault secret | **nunca** | read/write via Edge |
| `contas_pagar_codigo_mes` | read/write | read/write |
| `contas_pagar_relatorio_dia` | read, copiar, criar rascunho | read/write |

### 6.7 Critérios de pronto

**Fatia B:** Rose loga; edita conta; Auditoria/Comparativo "Atualizar" ok; notas RH salvam ou mostram erro.

**Fatia C:** Rose cadastra fonte + credencial (sem ver senha); vê badges; preview + copiar relatório; UI ok em dark **e** light.

---

## 7. Verificação

- `npm run typecheck` + `npm run build` verdes após cada fatia.
- Smoke manual documentado (lista, modais, IA, relatório copiável).
- Grep anti-vazamento de cores hardcoded nos arquivos tocados em `components/contas/`.
- Comparativo + Auditoria: testar `force: true` (Atualizar) após deploy.

---

## 8. Fora de escopo (YAGNI neste spec)

- Normalização 1:N de fontes por conta
- Comprovantes storage (spec separado)
- Open Finance / Pluggy (Fatia D)
- Perfis RBAC granulares (Rose vs Ana vs Admin)
- Renomear Super Folha → Casa da Maria (branding, posterior)
- Commit automático de migrations em produção sem revisão Alf/Maria

---

## 9. Riscos

| Risco | Mitigação |
|-------|-----------|
| Migration C atrasa sessão Rose | B não depende de C; `observacoes` + planilha na 1ª sessão |
| Segredo vazado na UI | Edge one-way; RLS; nunca SELECT vault no client |
| 821 contas sem `metodo_pagamento` | Fatia B saneamento manual; não bloqueia schema |
| WhatsApp lembretes quebrados (Invalid token) | Fatia D; relatório copiável cobre gap imediato |
| UI inconsistente light/dark | Tokens obrigatórios + checklist §3 |

---

## 10. Referências

- `Docs/contas-pagar-musiclass.md` — módulo legado MusiClass (referência histórica)
- `Downloads/RESUMO_EXECUTIVO_CONTAS_A_PAGAR.md` — auditoria Maria 2026-06-20
- `Downloads/maria-mapa-contas-a-pagar.md` — mapa de descoberta Rose/Ana
- `Downloads/maria-PERMISSOES.md` — agent-first, linha vermelha dinheiro real
- `Downloads/maria-escopo-completo.md` — visão completa Maria
- `supabase/functions/ai-contas-comparativo/index.ts` — upsert cache (v16)
- `styles/theme.css` — tokens semânticos

---

## Changelog

| Data | Nota |
|------|------|
| 2026-06-21 | Spec inicial — Seções 1–3 aprovadas (Alf + Maria) |
| 2026-06-21 | Ajustes Maria: `text-on-accent`, credencial sem vault_secret_name (derivado na Edge), ordem C2→C1→C4/C5→C3, permissão na Edge |
