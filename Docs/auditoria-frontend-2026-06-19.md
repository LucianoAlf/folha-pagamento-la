# Auditoria do Frontend — la-music-folha (2026-06-19)

Auditoria read-only de 86 arquivos / ~40.800 linhas, conduzida por 7 agentes paralelos
(um por módulo). Escopo: correção, performance, qualidade, tratamento de erro,
acessibilidade e segurança client-side. **A camada de banco/RLS foi auditada à parte**
(ver `supabase/migrations/20260619_audit_quickwins_rls_searchpath.sql`).

---

## 1. Veredito geral

O app é funcional e bem coberto em vários pontos (loading/error states nas leituras
principais, lazy-loading por módulo, auth via Supabase configurada corretamente). Os
problemas se concentram em **padrões sistêmicos** que se repetem em quase todos os
módulos — o que é uma boa notícia: corrigir o *padrão* corrige dezenas de achados de
uma vez.

**Saúde por módulo:**

| Módulo | Linhas | Saúde | Maior risco |
|---|---|---|---|
| agenda | 6,7k | 🟡 Boa, com bug de timezone | Datas em dia errado no calendário |
| contas | 5,9k | 🟠 Atenção (financeiro) | Arredondamento de parcelas + mutações sem erro |
| ferias | 3,9k | 🟡 Boa estrutura | Cálculo de abono CLT + timezone |
| rh-jornada | 5,1k | 🟡 Completa, erro frágil | Mutações sem try/catch + race conditions |
| services (dados) | 8,5k | 🟢 Razoável | Erros engolidos pontuais + sem paginação |
| app shell + UI | 7,6k | 🟠 Monólito | App.tsx 4.562 linhas + sem ErrorBoundary + Modal sem a11y |
| bistro/notif/colab | 3,0k | 🟠 Bistro monolítico | parseMoney BR + mutações sem erro |

## 2. Pontos positivos (confirmados pelos 7 agentes) ✅

- **Sem segredos hardcoded** e **sem `service_role` key no frontend** — só `ANON_KEY` via `import.meta.env`.
- **Cliente Supabase NÃO está duplicado** — instância única em `services/supabase.ts`, importada por todos os services (a suspeita de múltiplas conexões era falsa).
- **Nenhum `dangerouslySetInnerHTML`** em todo o código.
- **Nenhum dado sensível / token em `console.log`** (só debug pontual de userId em ConfiguracoesAgenda).
- Auth com `persistSession`/`autoRefreshToken`; `google_refresh_token` removido antes de exibir.

---

## 3. Temas sistêmicos (corrigir o padrão → resolve dezenas)

### T1 — 🔴 Bug de timezone (classe inteira de bugs, -1 dia em GMT-3)
`new Date('YYYY-MM-DD')` e `data.toISOString().split('T')[0]` interpretam/produzem UTC.
No Brasil (UTC-3) isso desloca datas em 1 dia perto da virada.
- agenda: `CalendarioView.tsx:11,37`, `AgendaPage.tsx:656`, `AgendaContent.tsx:287`, ScheduleView
- contas: `ContaAuditCard.tsx:131`, `contasPagarService.ts:452-498` (`calcularResumo` mistura `hojeISO` UTC com local)
- ferias: `AjustarPeriodosModal.tsx:253-259`, `RegistrarPagamentoModal.tsx:130-136`, `EditarProgramacaoModal.tsx:200-205`
- rh-jornada: coexistência dos dois estilos (timestamp vs `YYYY-MM-DD`) sem helper
- **Fix único:** centralizar `toLocalYmd(date)` e `parseISODate(str)` (já existe em `utils/feriasCalculations.ts`!) e usar em todo lugar. Eliminar `new Date(iso)` cru para datas-só.

### T2 — 🔴/🟡 Mutações async sem `try/catch` nem feedback (o achado mais pervasivo)
Centenas de handlers `onClick={async …}` ou `onConfirm` que escrevem no Supabase e, em
caso de falha (RLS, rede), **falham em silêncio** — sem feedback, com UI otimista
dessincronizada ou modal travado. Pior nos módulos financeiros.
- contas (financeiro!): `ContasPagarPage.tsx:2443-2469, 3103-3134, 3169, 3182, 3238-3270` (pagar/editar/excluir/lote/finalizar)
- bistro: `BistroTab.tsx:640-673, 702-716, 839-882, 390-411` (quase todas as escritas)
- rh-jornada: CandidatosTab, DocumentosTab, DesligamentosTab, Stage/Eval/Activity panels (dezenas)
- agenda: `TarefaDetailPanel.tsx`, `TemplatesModal.tsx:246`, quick-pay `AgendaPage.tsx:996`
- **Fix único:** um helper `runAction(fn)` (igual ao `runAction` de `DesenvolvimentoTab` e ao padrão de `NotificacoesPage`) com try/catch + toast/estado de erro + rollback do otimismo. Padronizar em todo o app.

### T3 — 🔴 Race conditions em master-detail (sem cancelamento)
Efeitos async que buscam detalhe ao mudar seleção, sem guarda — resposta antiga
sobrescreve a nova.
- `App.tsx:953-957` (`loadMonthData` ao trocar de mês) + `App.tsx:711-719` (`fetchMetadata` retorna `colaboradores` do state via closure obsoleta)
- `rh-jornada/CandidatosTab.tsx:96-116` (`loadRecruitment`)
- ferias/contas em vários efeitos
- **Fix único:** padrão `let active = true; … if (active) setX()` / `AbortController` / hook `useSelectedDetail`. (Só `TemplatesTab` já faz isso com flag `mounted`.)

### T4 — 🟠 Componentes monolíticos (manutenção + re-render)
- `App.tsx` — **4.562 linhas**, 69 `useState`, 16 `useEffect`, **0 `useCallback`**, `MODULE_CONFIG` recriado a cada render
- `ContasPagarPage.tsx` — 3.283 linhas (5 modos + 2 pipelines IA + lote + calendário)
- `BistroTab.tsx` — 1.883 linhas, 41 `useState`
- `AgendaPage.tsx` (1.029), `ProgramarFeriasModal.tsx` (842, 6 steps inline)
- **Fix:** extrair providers/hooks (`useAuth`, `usePayrollData`) e componentes de aba.

### T5 — 🔴 a11y: Modal compartilhado + lacunas gerais
- `components/UI.tsx:496-549` — `Modal` sem focus-trap, sem `Escape`, sem `role="dialog"`/`aria-modal`, sem lock de scroll, sem portal. **Afeta todos os modais do app.**
- Sem `ErrorBoundary` global (`index.tsx`/`App.tsx`) → erro de render = tela branca.
- Botões só-ícone sem `aria-label` e inputs sem `<label>`/`aria-label` em quase todos os módulos; `div onClick` sem teclado (ScheduleView, ContasCalendar).
- **Fix:** migrar `Modal`/dialogs para `@radix-ui/react-dialog` (já é dependência); adicionar `ErrorBoundary`; varredura de `aria-label`.

### T6 — 🟡 Duplicação de helpers
- **Parsing de moeda BR** em variantes divergentes: `parseBRL` (NovaContaModal:99, EditarContaModal:16), `parseMoneyBR`/inline (BistroTab:68,510,704). Uma variante misreads milhar.
- **Formatação de data** reimplementada em 5+ arquivos de contas, 3 de agenda, etc.
- **`humanizeRole`/`*_STATUS_META`** duplicados em 3-4 arquivos de rh-jornada.
- **Bloco de env Supabase** duplicado em `api.ts:4-17` e `feriasService.ts:22-35` (já exportado por `supabase.ts`).
- **Fix:** util único de moeda/data; importar env de `./supabase`.

---

## 4. 🔴 Achados de alta severidade (lista consolidada)

| # | Arquivo:linha | Problema | Impacto |
|---|---|---|---|
| C1 | `services/contasPagarService.ts:167` (+ `NovaContaModal.tsx:389`) | `valor / qtdParcelas` sem arredondar p/ centavos | Parcelas não somam o total (financeiro) |
| C2 | `services/contasPagarService.ts:329-337` (`fetchParcelasIrmas`) | Agrupa parcelas por `LIKE descricao` | Pode excluir/finalizar parcelas erradas |
| C3 | `services/bistroService.ts:435` | `"1.500"` → 1.5 (separador de milhar) | Valor de consumo R$1.500 vira R$1,50 |
| C4 | `EditarProgramacaoModal.tsx:106`, `ProgramarFeriasModal.tsx:486-504`, `utils:68` | Abono = `floor(diasCorridos/3)` em vez de 1/3 de 30 | Cálculo CLT de abono incorreto p/ férias fracionadas |
| C5 | `App.tsx:953-957` | `loadMonthData` sem guarda de sequência | Mês errado sobrescreve dados na tela |
| C6 | `App.tsx:711-719` | `fetchMetadata` retorna `colaboradores` por closure obsoleta | Consumidores recebem lista vazia/velha |
| C7 | `rh-jornada/CandidatosTab.tsx:96-116` | `loadRecruitment` sem cancelamento | Dados de candidato anterior gravados |
| C8 | `agenda/CalendarioView.tsx:11,37` + 3 locais | `toISOString().split('T')[0]` UTC | Tarefa noturna cai no dia errado |
| C9 | `services/contasPagarService.ts:49-98` | Geração de recorrentes engole `error`; insert sem checar | Conta duplicada/omitida em silêncio |
| C10 | `bistro/BistroTab.tsx:390-411` (`applyLuciaToFolha`) | `try/finally` sem `catch` | Aplica na folha mas falha invisível |
| C11 | `components/UI.tsx:496-549` (`Modal`) | Sem focus-trap/Escape/role/portal | a11y quebrada em todos os modais |
| C12 | `index.tsx`/`App.tsx` | Sem `ErrorBoundary` | Qualquer erro de render = tela branca |

---

## 5. Plano de ação recomendado (priorizado)

**P0 — Correção (dados/dinheiro errados):** C1, C2, C3, C4 (cálculos financeiros/CLT) +
C5, C6, C7 (race conditions) + T1 (timezone). São bugs que produzem valores/datas
incorretos ou corrompem estado.

**P1 — Tratamento de erro sistêmico (T2):** criar `runAction` + toast e envolver todas
as mutações async — começando por **contas** (financeiro) e **bistro**.

**P2 — Robustez do shell:** `ErrorBoundary` global (C12) + `Modal` acessível sobre Radix (C11/T5).

**P3 — Manutenção:** quebrar monólitos (T4), centralizar helpers de moeda/data (T6),
gerar tipos TS do schema (substituir ~129 `as` em rhJornadaService), adicionar `.range()`
nas listas grandes (cap de 1000 linhas).

**P4 — Varredura de a11y (T5):** `aria-label` em botões só-ícone, `<label>`/`aria-label`
em inputs, teclado em `div onClick`.

---

## 6. Anexo — achados completos por módulo

### agenda
- 🔴 timezone: `CalendarioView.tsx:11,37`; `AgendaPage.tsx:656`; `AgendaContent.tsx:287` (ScheduleView)
- 🔴 erro: `TarefaDetailPanel.tsx:235-239,433-436,469-486,530-533` (toggle/subtarefa/excluir sem try/catch)
- 🔴 erro: `AniversariosView.tsx:184-185` (`Promise.all` aborta no 1º erro → exclusão parcial)
- 🟡 perf: `AgendaPage.tsx:530-541` (`scheduleRefresh` refetch pesado por evento de 7 tabelas)
- 🟡 bug: `AgendaPage.tsx:549-558` (closure obsoleta de `viewMode`)
- 🟡 a11y: `ScheduleView.tsx:393-411` (`div onClick` sem teclado)
- 🟡 erro: `AgendaPage.tsx:996-1008` (quick-pay sem try/catch); `TemplatesModal.tsx:246-256`
- 🟡 bug: `AgendaContent.tsx:112` (fallback `timeline→tarefas` em calendário)
- 🟢 ruído: `ConfiguracoesAgenda.tsx:90,95,113,129` (console.log de userId); dead-code `TarefaCard.tsx:7,37-38`
- Duplicação: `formatWhen`/`formatWhenShort` (3x), agrupamento por lista (3x), eventos `window`

### contas
- 🔴 `contasPagarService.ts:167` arredondamento de parcela; `:329-337` `fetchParcelasIrmas` por LIKE
- 🔴 erro: `ContasPagarPage.tsx:2443-2469,3103-3134,3169,3182,3238-3270` (mutações financeiras sem try/catch)
- 🟡 bug: `EditarContaModal.tsx:88-117` (valor/total_parcelas sem recalcular)
- 🟡 perf: `ContasPagarPage.tsx` monólito 3.283 linhas
- 🟡 erro: `ContasPagarPage.tsx:470-490` (`saveNotas` sem checar error, seta Saved=true); `ContaLembretesWhatsApp.tsx:59-77,184-195` (`try/finally` sem catch)
- 🟡 bug: `ContasTable.tsx:40-43` (deps de debounce); `ContasPagarPage.tsx:934-937` (memo deps falsas); `:956-963` (`calcTrend` prev===0)
- 🟢 a11y `ContasCalendar.tsx:211-225`; timezone `ContaAuditCard.tsx:131`; badge "Vencida" perdido `:149`
- Duplicação: `parseBRL` (2x), formatadores de data (5x), `UNIDADES_SIMPLES` (2x), `keyFor/normalizeKey` (2x)

### ferias
- 🔴 `EditarProgramacaoModal.tsx:92-96` (closure obsoleta `diasCorridos`); `:106`/`ProgramarFeriasModal.tsx:486-504`/`utils:68` (abono CLT)
- 🔴 `RegistrarPagamentoModal.tsx:130-136` (mistura UTC/local em prazo); exibições `new Date(iso)` cru (AjustarPeriodos, Registrar, Editar)
- 🟡 hook: `ProgramarFeriasModal.tsx:155-159` (dep `vendeu_abono` faltando); `:138-152` (derivar via memo)
- 🟡 `utils/feriasCalculations.ts:30-34` (`Math.abs` mascara inversão de datas)
- 🟡 a11y: inputs sem `htmlFor` (`AjustarPeriodosModal.tsx:281-316`); botões `X` sem aria-label
- 🟡 UX: `ProgramarFeriasModal.tsx:199` (`isPrimeiroPeriodo: true // TODO` hardcoded)
- 🟢 monólito 842 linhas; DatePicker com 2 contratos; imports mortos `EditarProgramacaoModal.tsx:13-17`
- Duplicação: sugestão de abono (3x, com mesmo erro), `calcularDiasRestantes` reimplementado inline

### rh-jornada
- 🔴 `CandidatosTab.tsx:96-116` (race); `RhStageExecutionPanel.tsx:73-89` (`Promise.all` sem try/catch)
- 🟡 erro: mutações sem try/catch em CandidatosTab (283-357), DocumentosTab:100, DesligamentosTab:518-588, panels
- 🟡 perf: `RhJornadaPage.tsx:111-128` (keep-alive monta todas as abas visitadas → fetch em background)
- 🟡 bug: `TemplatesTab.tsx:469-471,520-541` (input ordem `||`, edição por mutação da lista inteira)
- 🟢 dead-code `RhJornadaPage.tsx:98-109` (guard impossível, `RhPlaceholderTab` nunca renderiza)
- 🟢 a11y: inputs/botões só-ícone sem label em várias abas; pop-up bloqueado `DesligamentosTab:574-588`
- Duplicação: `humanizeRole`/`ROLE_OPTIONS`/`*_STATUS_META` (3-4x), master-detail sem `mounted` (só TemplatesTab guarda)

### services / types / utils
- 🔴 `contasPagarService.ts:49,59,93` (recorrentes engolem error/insert sem checar); `bistroService.ts:435` (parse milhar BR)
- 🟡 perf: sem `.range()` (`fetchContasPagar:100-116`, `fetchColaboradores`) → cap 1000 linhas silencioso
- 🟡 perf: N+1 writes (`bistroService.ts:352-398`, `aniversariosService.ts:159-181`, `rhJornadaService.ts:460-471`)
- 🟡 bug: `contasPagarService.ts:452-498` (timezone em `calcularResumo`); `aniversariosService.ts:99-107` (fallback amplo mascara erro)
- 🟡 segurança: `api.ts:52` (`id=eq.${userId}` sem `encodeURIComponent`)
- 🟡 manut: env duplicado (`api.ts:4-17`, `feriasService.ts:22-35`); `getAuthHeaders` duplicado (ferias sem cache)
- 🟢 `select('*')` ~150x + ~129 `as <Tipo>` em rhJornadaService → gerar tipos do schema
- ✅ Cliente Supabase único (não duplicado); padrão de erro `{data,error}` majoritariamente consistente

### app shell + UI
- 🔴 `App.tsx:953-957` (race loadMonthData); `:711-719` (closure obsoleta); `UI.tsx:496-549` (Modal sem a11y); sem `ErrorBoundary`
- 🟡 `App.tsx` monólito 4.562 linhas (69 useState, 0 useCallback); `MODULE_CONFIG` recriado por render (`:262-300`)
- 🟡 bug: `App.tsx:783-786,877-884` (logout não limpa estado de domínio)
- 🟡 a11y: abas sem `role=tablist/tab` (`:1948-2005`); `DashboardWidgets.tsx:20` (cor de trend invertida)
- 🟢 papéis por e-mail hardcoded (`:194-195,920`); avatar "Ana" default no login (`:1551-1557`); `Sidebar` drawer morto; `cn` em arquivo errado
- Recomendação: primitivos caseiros (Modal/Dialog/Tooltip/Select) → migrar p/ Radix

### bistro / notificacoes / colaboradores
- 🔴 bistro: mutações sem try/catch (`:640-673,702-716,839-882`); `applyLuciaToFolha:390-411` (sem catch)
- 🟡 bistro: `normalizePct` 0.1 ambíguo (3x); `saldoFinalEmla:260` ignora repasse/despesa; O(n²) `find` em `.map` (`:1101-1112`); monólito 1.883 linhas
- 🟡 notificacoes: default ON/OFF inconsistente (`!== false` vs `!!`); inputs sem label; numéricos sem clamp
- 🟡 colaboradores: id mágico "Ana Paula" (`:75`); `any` em `salario_base` (`:105`)
- 🟢 notificacoes: 6 accordions duplicados; bistro: 0 `aria-*` no arquivo
- Duplicação: `parseMoneyBR` em 3 variantes (uma sem limpeza de `R$`)
