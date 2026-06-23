# HANDOFF — Super Folha → Casa da Maria (para Codex)

**Gerado em:** 2026-06-23  
**Repo:** `https://github.com/LucianoAlf/folha-pagamento-la`  
**Branch principal:** `main`  
**Supabase project ref:** `ubdvtjbitozhkuvvqkxj`  
**URL:** `https://ubdvtjbitozhkuvvqkxj.supabase.co`

---

## QUICKSTART

```bash
git clone https://github.com/LucianoAlf/folha-pagamento-la.git
cd folha-pagamento-la
npm install
# Criar .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver §3)
npm run dev          # http://localhost:3000
npm run typecheck    # gate mínimo
npm run build        # gate mínimo
```

**Login:** usuários criados no Supabase Auth (Rose, Ana, etc.). Sem login, RLS bloqueia tudo.

**Módulo ativo:** App → aba **Financeiro → Contas a Pagar** (`components/contas/ContasPagarPage.tsx`).

**Próxima ação (prioridade máxima):** implementar **plano de contas Emusys + centro de custo** seguindo **`Docs/diretriz-plano-contas-centro-custo.md`** (T1–T9, checkpoints via MCP). **Não apagar** os 31 lançamentos atuais em `contas_pagar` — migrar/recategorizar.

**Antes de codar:** diretriz e CSV Emusys estão em `Docs/diretriz-plano-contas-centro-custo.md` e `Docs/data/Relatório_Financeiro_Geral_EMLA_-_Novo_Plano_de_Contas.csv`.

---

## 1. O que é o projeto

**Super Folha** (`la-music-payroll`) é o sistema interno da **LA Music Group** (escola de música). Nasceu como RH/folha para Anna; ganhou **Contas a Pagar** quando Rose cobriu licença-maternidade. Agora evolui para **Casa da Maria** — sistema financeiro **agent-first**.

| Papel | Quem | Função |
|-------|------|--------|
| Operacional | **Rose / Ana** | Lançam contas, pagam, geram preview WhatsApp, usam Auditoria/Comparativo IA |
| Orquestração (futuro) | **Maria** | Auditoria cruzada, conciliação, automação via Edge Functions + OpenClaw |
| Dev | Luciano + agentes | Schema, UI, integrações |

### Visão (médio prazo)

- Espelhar **plano de contas Emusys** (códigos `4.x`, `5.x`, `6.x`, `7.x`)
- Integração futura **Emusys API** (IDs estáveis, sync)
- **Conciliação bancária** Maria via Open Finance (Pluggy — Fatia D, ainda não implementada)
- **DRE gerencial / EBITDA / CAPEX** (parkado até plano de contas estar no ar)

### O que estamos construindo AGORA

1. Tabela **`plano_contas`** espelhando CSV Emusys (árvore hierárquica)
2. Dimensão **`centros_custo`** (centro de custo por unidade/área)
3. UI: dropdown em árvore no Nova/Editar Conta (código + nome, estilo Emusys)
4. Migração dos **31 lançamentos Rose** + futuros **17 "Outros"** → códigos Emusys corretos
5. Desativar categoria flat **"Outros"** após migração

**Red line de domínio:** o sistema **lista, prepara, audita** — **NUNCA move dinheiro real**. Pagamento real é ação humana fora do sistema (PIX, banco, etc.).

---

## 2. Stack e arquitetura

### Stack (versões em `package.json`)

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Runtime | Node.js | 18+ (README) |
| Bundler | Vite | ^6.2.0 |
| UI | React | ^19.2.3 |
| Linguagem | TypeScript | ~5.8.2 |
| Backend | Supabase (Postgres + Auth + RLS + Realtime + Vault) | projeto `ubdvtjbitozhkuvvqkxj` |
| Client SDK | `@supabase/supabase-js` | ^2.49.1 |
| UI primitives | Radix (Popover, Select, Tooltip) | ^1.x / ^2.x |
| Datas | date-fns | ^4.1.0 |
| Calendário | react-day-picker | ^9.13.0 |
| Ícones | lucide-react | ^0.562.0 |
| Gráficos | recharts | ^3.6.0 |
| IA (server) | Google Gemini via Edge Functions | modelo primário `gemini-3-flash-preview` |
| WhatsApp (server) | UAZAPI via Edge `whatsapp-send` | secrets `UAZAPI_URL`, `UAZAPI_TOKEN` |

**Automação:** Supabase **Edge Functions** + **pg_cron** + agente **OpenClaw** (futuro).  
**NÃO usar n8n** — regra explícita do projeto.

### Pontos de entrada

| Arquivo | Função |
|---------|--------|
| `index.html` | Shell HTML, PWA, carrega `styles/theme.css` |
| `index.tsx` | Bootstrap React (`ThemeProvider`, `ToastProvider`, lazy `App`) |
| `App.tsx` | Router por abas (Folha, Contas, Agenda, RH, Férias, Bistrô…) |
| `vite.config.ts` | Dev server **porta 3000**, alias `@/`, injeta Supabase URL/key |
| `config/supabaseDefaults.ts` | Fallback URL/anon key do projeto (sobrescritos por `.env.local`) |
| `services/supabase.ts` | Cliente Supabase browser |

### Estrutura de pastas (essencial)

```
dash-folha-pagamento/
├── App.tsx                          # Shell principal + lazy routes
├── components/
│   ├── UI.tsx                       # DatePicker, Button, Card, CustomSelect, tokens
│   └── contas/                      # Módulo Contas a Pagar
│       ├── ContasPagarPage.tsx      # Página principal (abas internas)
│       ├── ContasTable.tsx          # Lista
│       ├── NovaContaModal.tsx       # Criar conta
│       ├── EditarContaModal.tsx     # Editar + código mês + fonte
│       ├── PagarContaModal.tsx      # Registrar pagamento
│       ├── CategoriaModal.tsx       # CRUD categorias (legado — será substituído)
│       ├── CredenciaisModal.tsx     # Portais + vault senha
│       ├── RelatorioDoDiaPanel.tsx  # Preview WhatsApp do dia
│       ├── ContaAuditCard.tsx       # Card auditoria IA
│       └── ...
├── services/
│   ├── contasPagarService.ts        # CRUD + recorrentes + relatório + credenciais
│   └── agendaIntegrations.ts        # Sync contas → tarefas agenda
├── types/
│   └── contasPagar.ts               # Tipos TypeScript do módulo
├── styles/
│   └── theme.css                    # Tokens semânticos light/dark
├── supabase/
│   ├── migrations/                  # 43 migrations SQL (fonte de schema)
│   └── functions/                   # Edge Functions Deno
├── Docs/
│   ├── HANDOFF-CODEX.md             # Este arquivo
│   ├── decisao-modelo-acesso-rls-2026-06.md
│   ├── superpowers/specs/           # Design specs aprovados
│   └── superpowers/plans/           # Planos de implementação
├── public/
│   └── guia-contas-pagar-operacional.html  # Guia HTML Rose/Ana
└── scripts/
    ├── deploy-edge-function.mjs     # Deploy via Management API
    └── deploy-edge-functions.mjs    # Gera payload JSON para deploy
```

### Contas a Pagar — arquitetura UI

`ContasPagarPage.tsx` gerencia modos internos (não tabs do `App.tsx`):

| Modo (`ContasMode`) | Função |
|---------------------|--------|
| `dashboard` | KPIs + gráficos resumo |
| `visao-geral` | Calendário + contas do dia |
| `todas` | Lista completa + filtros + Auditoria IA |
| `comparativo` | Comparativo IA mês a mês |
| `categorias` | Gestão `categorias_despesa` (legado) |

Chama Edge Functions via `fetch(`${SUPABASE_URL}/functions/v1/...`)` com JWT do usuário logado.

### Supabase — conexão

- **Browser:** `services/supabase.ts` → `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`
- **Edge Functions:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Deno env, injetados pelo Supabase)
- **Secrets sensíveis:** Supabase Vault via RPC `get_vault_secret` / `set_vault_secret` (ver `supabase/functions/_shared/gemini.ts`)

### RLS (modelo de acesso)

Documentado em `Docs/decisao-modelo-acesso-rls-2026-06.md`:

- **Tabelas core** (`contas_*`, `folhas_*`, `colaboradores`, etc.): **autenticado = acesso total** (políticas permissivas)
- **Módulo RH** (`rh_*`): RBAC granular
- **Anônimo:** bloqueado em todas as tabelas
- **Front nunca usa `service_role`** — apenas anon key + JWT do usuário

### Edge Functions (contas + IA)

| Function | Pasta | Uso |
|----------|-------|-----|
| `ai-contas-auditoria` | `supabase/functions/ai-contas-auditoria/` | Auditoria IA (aba Todas) |
| `ai-contas-comparativo` | `supabase/functions/ai-contas-comparativo/` | Comparativo IA |
| `contas-credencial-vault` | `supabase/functions/contas-credencial-vault/` | Gravar senha portal no Vault |
| `whatsapp-contas-notificacoes` | `supabase/functions/whatsapp-contas-notificacoes/` | Cron lembretes contas |
| `whatsapp-send` | `supabase/functions/whatsapp-send/` | Envio UAZAPI |

Deploy:

```bash
# Opção A — npm script (comparativo only)
npm run deploy:comparativo

# Opção B — script genérico (requer SUPABASE_ACCESS_TOKEN ou token CLI)
node scripts/deploy-edge-function.mjs ai-contas-auditoria
node scripts/deploy-edge-function.mjs contas-credencial-vault

# Opção C — Supabase MCP (apply_migration, deploy_edge_function) no Cursor
```

`verify_jwt`: maioria das functions de IA usa `false` no deploy script legado — conferir `config.toml` de cada function antes de deploy.

---

## 3. Como rodar / buildar / testar / deployar

### Comandos

```bash
npm install
npm run dev          # Vite → http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # vite build → dist/
npm run preview      # preview do build
```

**Não há teste E2E automatizado** no CI. Validação = `typecheck` + `build` + smoke manual no browser.

### Variáveis de ambiente

#### Frontend (`.env.local` na raiz)

| Variável | Obrigatória | Notas |
|----------|-------------|-------|
| `VITE_SUPABASE_URL` | Recomendada | Fallback em `config/supabaseDefaults.ts` |
| `VITE_SUPABASE_ANON_KEY` | Recomendada | Fallback em `config/supabaseDefaults.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Alternativa | Legado Next-style, também lida |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alternativa | Legado |

**Nunca** colocar `GEMINI_API_KEY` no frontend.

#### Edge Functions (secrets no Supabase Dashboard / Vault)

| Variável | Usado por |
|----------|-----------|
| `SUPABASE_URL` | Todas (auto-injetado) |
| `SUPABASE_ANON_KEY` | Todas (auto-injetado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas com admin (auto-injetado) |
| `GEMINI_API_KEY` | `ai-contas-auditoria`, `ai-contas-comparativo`, folha, agenda, RH IA |
| `UAZAPI_URL` | `whatsapp-send` |
| `UAZAPI_TOKEN` | `whatsapp-send` |

#### Scripts locais (opcional)

| Variável | Usado por |
|----------|-----------|
| `SUPABASE_ACCESS_TOKEN` | `scripts/deploy-edge-function.mjs` |
| `SUPABASE_PROJECT_REF` | deploy scripts (default `ubdvtjbitozhkuvvqkxj`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/create-rose-user.mjs` |

### Deploy migrations

Migrations em `supabase/migrations/`. Em produção, aplicar via:

- Supabase CLI: `supabase db push` (após `supabase link`)
- Ou MCP `apply_migration` (um arquivo por vez)

**Não há branch de banco** — migrations vão direto no projeto remoto. Cuidado com DDL destrutivo.

### Smoke manual sugerido (Contas)

1. Login como Rose/Ana
2. Financeiro → Contas a Pagar
3. Lista carrega 31 contas
4. Criar conta eventual → salvar
5. Editar → fonte + credencial + código do mês
6. Relatório do dia → Gerar preview → só vencimentos da data selecionada
7. Auditoria IA (aba Todas) → rodar análise
8. Comparativo IA → rodar

---

## 4. Estado atual do banco (2026-06-23, verificado via SQL)

> **Contagens:** sempre `SELECT COUNT(*)` — **não confiar** em `reltuples` do `list_tables` MCP.

### Snapshot `contas_pagar`

| Métrica | Valor |
|---------|-------|
| **Total de lançamentos** | **31** |
| Criados em 22–23/06/2026 | **31** (todos — batch Rose) |
| Por `tipo_lancamento` | 17 parcelada, 14 recorrente |
| `plano_contas` existe? | **NÃO** |
| `centros_custo` existe? | **NÃO** |

**CRÍTICO:** os 31 registros são **dados reais em uso operacional**. **NÃO DELETE**, **NÃO TRUNCATE**. Migrar/recategorizar quando `plano_contas` existir.

### Tabelas do módulo Contas a Pagar

#### `contas_pagar` (principal)

Colunas atuais (verificadas):

`id`, `descricao`, `categoria_id`, `unidade`, `valor`, `data_lancamento`, `data_vencimento`, `competencia`, `status`, `data_pagamento`, `metodo_pagamento`, `tipo_lancamento`, `parcela_atual`, `total_parcelas`, `observacoes`, `created_at`, `updated_at`, `created_by`, `recorrente_modelo_id`, `fonte_tipo`, `fonte_url`, `fonte_instrucoes`, `fonte_identificador`, `credencial_id`, `pix_chave_fixa`, `email_pagamento`

- `unidade`: `cg` | `rec` | `bar` | `todas` | null
- `status`: `pendente` | `pago` | `cancelado` | `finalizado`
- `tipo_lancamento`: `unica` | `recorrente` | `parcelada`
- Índice anti-duplicata recorrente: `idx_contas_pagar_recorrente_mes_unico` (`recorrente_modelo_id`, `competencia`) — migration `20260622_contas_recorrente_unique_mes.sql`

**TODO (não existe ainda):** `plano_conta_id`, `centro_custo_id`, `emusys_lancamento_id`, `valor_previsto`

#### `categorias_despesa` (legado — flat, 19 ativas)

Sem `codigo_emusys`, sem hierarquia. Lista atual:

Aluguel, Condomínio, Folha de Pagamento, Impostos/Taxas, Energia, Água, Internet/Telefone, Softwares, Marketing, Manutenção, Materiais, Serviços Terceiros, Contador, Empréstimos, Cartões Corporativos, Monitoramento e Segurança, Seguros, Parcelamentos (Diversos), **Outros**

**TODO:** substituir por `plano_contas`; desativar "Outros" e "Parcelamentos (Diversos)" após migração.

#### `contas_credenciais`

Metadados de portais (nome, portal, login_hint). **Senha não fica na tabela** — vai para Vault via Edge `contas-credencial-vault` + RPC `set_vault_secret`.

#### `contas_pagar_codigo_mes`

Código de barras / PIX / QR por competência (`competencia` + `conta_pagar_id`). Status: `pendente` | `coletado` | `indisponivel`.

#### `contas_pagar_relatorio_dia`

Snapshots do relatório WhatsApp (`mensagem_texto`, `hash_mensagem`, `status_envio`, `data_referencia`, `unidade`).

#### `contas_pagar_notificacoes`

Overrides de lembretes WhatsApp por conta (migration `20260112_notificacoes_central_contas_overrides_fix.sql`).

#### `contas_ai_insights`

Cache Auditoria IA (`input_hash` unique, `competencia_ym`, `unidade`, `response_json`).

#### `contas_comparativo_ai_insights`

Cache Comparativo IA (`input_hash` unique, `competencia_ym`, `base_ym`, `unidade`).

#### `contas_anomalia_notas`

Memória/notas por anomalia (Auditoria).

### O que já funciona (código + banco)

| Feature | Onde |
|---------|------|
| Lista + CRUD + filtros | `ContasPagarPage`, `contasPagarService` |
| Recorrentes (auto-instância por mês) | `ensureRecorrentesInstancias()` em `contasPagarService.ts` |
| Parceladas (timeline, irmãs) | `ParcelasTimeline.tsx`, `fetchParcelasIrmas` |
| Marcar pago | `PagarContaModal`, `registrarPagamento` |
| Resumo KPIs + gráficos | `ContasSummaryCards`, `calcularResumo` |
| Auditoria IA | Edge `ai-contas-auditoria`, tabela `contas_ai_insights` |
| Comparativo IA | Edge `ai-contas-comparativo`, tabela `contas_comparativo_ai_insights` |
| Fonte/origem por conta | campos `fonte_*` + UI em `EditarContaModal` |
| Credenciais + Vault | `CredenciaisModal`, Edge `contas-credencial-vault` |
| Código do mês | `contas_pagar_codigo_mes` + UI |
| Relatório do dia (preview + copiar) | `RelatorioDoDiaPanel`, `montarRelatorioMensagem` |
| Lembretes WhatsApp | `ContaLembretesWhatsApp`, cron `whatsapp-contas-notificacoes` |
| Sync Agenda | `agendaIntegrations.ts` (contas → tarefas) |
| Light/dark tokens | `styles/theme.css`, piloto Contas |

### O que NÃO existe ainda

- `plano_contas`, `centros_custo`
- Dropdown árvore Emusys
- DRE / EBITDA / telas gerenciais
- API Emusys live
- Pluggy / Open Finance
- Automação Maria completa (Fatia D)

---

## 5. O que está em andamento

### Plano de contas Emusys — **NÃO implementado**

- Design aprovado conceitualmente: `Docs/superpowers/specs/2026-06-23-plano-contas-emusys-design.md`
- Abordagem B: tabela `plano_contas` espelho total do CSV Emusys
- `tipo_custo` fixo/variável vira **derivado do bloco** (4=variável, 5=fixo, 6=CAPEX)
- Folha futura alinhada ao bloco **5.3.x**

### Rose está lançando ao vivo

Ela usa a estrutura **antiga** (`categorias_despesa` flat, muitas em "Outros"). Cada dia sem `plano_contas` = mais retrabalho de migração.

### Timing urgente

1. Subir `plano_contas` + `centros_custo` (migrations T1–T3 da diretriz)
2. UI árvore
3. **Converter os 31 lançamentos** + mapear "Outros" (Apêndice A da diretriz — 17 itens históricos em jul/2026 no legado; hoje o banco tem 31 contas Rose)
4. Desativar "Outros"

### Commits recentes relevantes (`main`)

```
b176ee9 chore: limpar artefatos locais e reforcar gitignore
27070fd fix(ui): DatePicker cabecalho customizado
b1390c0 fix(contas): preview relatorio so dia selecionado
4bbe557 fix(agenda): tarefas orfas contas
e7cb4d8 fix(contas): instancias recorrentes por mes
```

---

## 6. Convenções e guardrails

### Código

- TypeScript estrito; tipos em `types/`
- Serviços Supabase em `services/` (não SQL no componente)
- Componentes React funcionais; lazy load de páginas pesadas no `App.tsx`
- Datas: helper `utils/dateOnly.ts` (`toDateOnly`) — cuidado com timezone
- Unidades: sufixo `-(Recreio)` / `-(CG)` / `-(Barra)` na descrição é **intencional** (não strippar — fix em `544f58a`)

### UI — tokens semânticos (OBRIGATÓRIO em Contas)

Spec: `Docs/superpowers/specs/2026-06-20-light-mode-pro-design.md` + `Docs/superpowers/specs/2026-06-21-casa-maria-contas-pagar-design.md` §3

| Uso | Classes |
|-----|---------|
| Fundo | `bg-bg`, `bg-surface`, `bg-surface-2` |
| Borda | `border-line` |
| Texto | `text-primary`, `text-secondary`, `text-muted` |
| Ação primária | `bg-accent text-on-accent` |
| Sucesso / perigo | `text-success`, `text-danger`, badges `bg-success/10` etc. |

**Proibido:** `bg-slate-*`, `text-white` hardcoded, hex solto em componentes novos.

### Domínio

- Sistema **não executa pagamentos**
- `registrarPagamento` apenas marca status `pago` + metadados
- Credenciais: senha só via Vault; UI mostra `login_hint`, nunca senha

### RLS

- Autenticado = CRUD total nas tabelas `contas_*`
- Testar sempre logado; anon deve falhar

### Git / repo

- Branch: `main`
- Não commitar: `.env*`, `supabase/.temp/`, `.tmp/`, `scripts/.deploy-*` (ver `.gitignore`)
- Commits só quando Alf pedir

---

## 7. Gotchas conhecidos

### Banco / dados

1. **`list_tables` / `reltuples` é estimativa** — sempre validar com `SELECT COUNT(*)`.
2. **Inconsistência unidade vs descrição:** parcela `Instrumentos novos - (Recreio) (3/6)` tem `unidade = 'cg'` mas descrição diz Recreio (`id = ab8cce17-94a1-4903-8bc1-1a28cf666adc`). Conferir/corrigir na migração para `plano_contas` + `centros_custo`.
3. **31 contas são sagradas** — migration deve ser aditiva + UPDATE, nunca wipe.
4. **Recorrentes:** `ensureRecorrentesInstancias` roda no fetch; índice unique evita duplicata por mês; não duplicar mês de início do modelo.
5. **Competência vs vencimento:** filtros da UI usam `competencia` (YYYY-MM-01); relatório do dia usa `data_vencimento` exata.

### Código / UI

6. **`Docs/contas-pagar-musiclass.md` é LEGADO** — descreve arquitetura MusiClass com tabela `transactions`. **Este projeto usa `contas_pagar`**. Ignorar aquele doc para implementação.
7. **DatePicker:** navegação é **cabeçalho customizado** em `components/UI.tsx` (não estilizar `.rdp-nav` do day-picker — quebrou layout 2x). Classe `sf-hide-caption` esconde caption nativo.
8. **Preview relatório:** `filtrarContasRelatorioDia` filtra **somente** `data_vencimento === dataRef` (não inclui amanhã).
9. **Edge Functions IA:** resposta Gemini pode falhar parse JSON — logs em `ai-contas-auditoria` mencionam `raw_preview`; há repair path.
10. **Comparativo IA:** upsert por `input_hash` (fix duplicate key histórico).
11. **Agenda sync:** tarefas órfãs de contas deletadas — `cleanupOrphanContaTasks` em `agendaIntegrations.ts`.
12. **`contas-credencial-vault`:** usa `requireRhAdminContext` — pode bloquear usuários sem papel RH admin; Rose/Ana precisam ter acesso se forem usar vault (verificar `rh-auth.ts`).

### Deploy

13. **`supabase/.temp/`** é cache local CLI — não versionar (removido do git em `b176ee9`).
14. **MCP deploy vs CLI:** dois caminhos coexistem; preferir um e documentar no checkpoint.

### Documentação desatualizada

15. `Docs/superpowers/specs/2026-06-21-casa-maria-contas-pagar-design.md` §1 diz "~914 linhas" em `contas_pagar` — **hoje são 31** (ambiente foi resetado/saneado). Trust SQL, not spec counts.

---

## 8. Ordem de trabalho (NÃO reescrever)

A ordem de trabalho completa, decisões travadas, modelo de dados, **tasks T1–T9**, checkpoints e **Apêndice A** (mapa dos 17 "Outros") está no arquivo:

**`Docs/diretriz-plano-contas-centro-custo.md`**

> **No repo:** `Docs/diretriz-plano-contas-centro-custo.md`. **Não inventar ordem alternativa** — seguir a diretriz.

### Regras dos checkpoints

- Validados **externamente no banco via MCP** (`execute_sql`, `apply_migration`) **entre cada etapa**
- São **gates**, não sugestões — **não pular**
- Após cada migration: `COUNT(*)`, conferir FKs, smoke UI

### Consistência com estado atual

| Diretriz assume | Realidade hoje |
|-----------------|----------------|
| `plano_contas` | Não existe — T1 cria |
| `centros_custo` | Não existe — T? cria (ver diretriz) |
| 31 lançamentos Rose | Confirmado — preservar |
| 17 "Outros" jul/2026 | Legado histórico no Apêndice A; banco atual tem categorias flat, migrar quando árvore existir |
| `categorias_despesa` | 19 ativas — mapear → `plano_contas`, depois deprecar |

---

## 9. Fora de escopo agora (parkado)

- DRE / EBITDA / telas gerenciais
- UI de gestão de centro de custo (além do FK no lançamento — ver diretriz)
- Rateio multi-centro
- API Emusys live / sync bidirecional
- Módulo de receita (bloco 3 do plano)
- Bistrô (conta bancária separada — módulo existe em `components/bistro/` mas não integrar agora)
- Pluggy / Open Finance / saldos automáticos no relatório do dia
- Automação WhatsApp completa Maria (Fatia D)
- n8n (proibido)

---

## 10. Ponteiros canônicos

### Roteiro de execução (ler primeiro)

| Arquivo | Status | Conteúdo |
|---------|--------|----------|
| **`Docs/diretriz-plano-contas-centro-custo.md`** | No repo | T1–T9, checkpoints, Apêndice A |
| `Docs/superpowers/specs/2026-06-23-plano-contas-emusys-design.md` | No repo | Design aprovado: `plano_contas`, migração, UI árvore, fases |
| `Docs/superpowers/specs/2026-06-21-casa-maria-contas-pagar-design.md` | No repo | Fatias B/C/D, schema fonte/credencial/código/relatório |
| `Docs/superpowers/specs/2026-06-20-light-mode-pro-design.md` | No repo | Tokens semânticos light/dark |
| `Docs/decisao-modelo-acesso-rls-2026-06.md` | No repo | ADR RLS |

### CSV plano de contas Emusys

| Arquivo | Status |
|---------|--------|
| **`Docs/data/Relatório_Financeiro_Geral_EMLA_-_Novo_Plano_de_Contas.csv`** | No repo | Fonte de verdade Emusys (espelho exato) |

### Código principal

| Arquivo | Função |
|---------|--------|
| `components/contas/ContasPagarPage.tsx` | UI principal |
| `services/contasPagarService.ts` | Lógica de negócio |
| `types/contasPagar.ts` | Tipos |
| `components/UI.tsx` | DatePicker, componentes base |
| `styles/theme.css` | Design tokens |
| `supabase/migrations/20260621_contas_*.sql` | Migrations Fatia C |
| `supabase/functions/ai-contas-auditoria/` | Auditoria IA |
| `supabase/functions/ai-contas-comparativo/` | Comparativo IA |
| `supabase/functions/contas-credencial-vault/` | Vault senhas |
| `public/guia-contas-pagar-operacional.html` | Guia operacional Rose/Ana |

### Operadores

| Pessoa | Uso |
|--------|-----|
| Rose | Lançamentos diários, preview WhatsApp |
| Ana | Backup operacional |
| Maria | Auditoria futura, conciliação |
| Luciano (Alf) | Produto + dev |

### Mapeamento Emusys (referência rápida — detalhes na diretriz)

| Categoria legado | Código Emusys alvo |
|------------------|-------------------|
| Energia | 5.2.3 |
| Aluguel / Condomínio | 5.2.4 |
| Softwares | 5.2.11 |
| Folha | 5.3.x |
| Marketing | 4.7.x |
| Impostos | 4.1.1 |
| Instrumentos | 6.2.7 |
| Equipamentos | 6.2.1 |
| Mobiliário | 6.2.4 |
| Uniformes | 4.2.3 |
| Outros | **eliminar** |

---

## Apêndice: checklist Codex (primeira hora)

- [ ] Clone + `npm install` + `.env.local`
- [ ] `npm run typecheck && npm run build`
- [ ] Login + abrir Contas a Pagar
- [ ] Confirmar `SELECT COUNT(*) FROM contas_pagar` → 31
- [ ] Confirmar `plano_contas` / `centros_custo` não existem
- [ ] Colocar `Docs/diretriz-plano-contas-centro-custo.md` no repo *(feito)*
- [ ] Colocar CSV Emusys em `Docs/data/` *(feito)*
- [ ] Ler diretriz T1 → executar com checkpoint MCP
- [ ] Não deletar dados Rose

---

*Fim do handoff. Dúvidas de negócio: Luciano. Dúvidas operacionais: Rose/Ana.*
