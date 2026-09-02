# Agenda × Maria — follow-ups deferidos (fases A e B1)

> Registro durável dos achados de review que ficaram **deferidos/parkeados** nas fases A (01/09/2026) e B1 (02/09/2026), extraído dos ledgers SDD antes de apagá-los. Nenhum é bloqueante; cada linha diz task de origem e o achado. Rulings completas estão nas mensagens de commit, no handoff e na spec.

## Abertos de maior valor (triagem do orquestrador, 02/09)

- **Sync de folha não fecha espelho quando a folha sai de `pendente`** — origem do fantasma "Aprovar Folha: Mai/2026". Corrigido em `fix/agenda-folha-sync-espelhos-orfaos` (02/09).
- **Alerta sobre `agenda_materializacoes.erros`** — um pacote com erro falha todo dia em silêncio. Vai na sonda da Maria (lado do Alf).
- **`10_sweeps.sql`** — varreduras ao vivo de fuso (`pg_proc.prosrc`) e `proacl` sobre `agenda_%` como teste commitado (spec §10); hoje só a versão por texto de migration existe.
- **Retenção de `agenda_materializacoes`** — wrapper do cron 19 apaga > 60 d de todas as origens (inclusive `sync`, ~144 linhas/dia). Decidir se `sync` merece outra janela.
- **`agenda_brl(numeric)` sem `set search_path`** — função pura da fase A; uniformidade.
- **Arquivo `supabase/migrations/20260902020000_maria_agenda_rpcs_tarefas.sql` tem versão local ≠ servidor (`20260902015450`)** — nunca `supabase db push` deste repo.
- **`pulados` mistura dois significados** (pai pulado por vigência = 1; filhas sob pai fechado = N) e o log tem dois vocabulários de contadores (materializador × sync) — documentar ou separar.
- **Sync de folha: "Fechar Folha" e "Aprovar Folha" da mesma folha compartilham o `vinculo_id`** (`folha:<id>`), então quando a folha mais recente também está `pendente` os dois blocos escrevem na mesma linha (último vence: Aprovar). Pré-existente; inofensivo hoje, mas o título do espelho oscila entre os dois nomes. Distinguir por vínculo (`folha:<id>:fechar` / `:aprovar`) exige migrar os espelhos existentes.
- **Sync de folha: com `folha_alerta_fechamento_ativo = false`, o espelho "Fechar Folha" da folha mais recente passa a ser fechado** (concluída/cancelada conforme a folha) em vez de ficar congelado — comportamento novo do fix de 02/09, intencional.
- **Seed: replay após renomear um pai duplica o pacote** (casamento por título) — conferir `count(*) = 36` em branch/restore (nota já no handoff §12).

## Fase A — deferidos e parkeados (ledger de 01/09)

- Task 1: minor (deferred): deletes programáticos de `tarefas` (reaper de órfãs da Task 4, trigger `rh_agenda_excluir_espelho_removido`) podem abortar com P0001 se um pai tiver filha ativa — inerte hoje (parent_id novo); fase B: `criar` com parent_id apontando pra espelho? reaper cancela em vez de deletar?
- Task 1: minor (deferred): TOCTOU em `tarefas_guard_parent` (sem `for update` no select do pai) — baixo tráfego; fechar se a fase B escrever concorrente.
- Task 1: minor (deferred): ramos do guard sem teste — auto-pai, "pai nao encontrado", "tarefa com filhas nao pode virar filha" (UPDATE path); 3 linhas em 01_schema_guardas.sql cobrem.
- Task 1: minor (deferred): RLS de `tarefas_listas_membros` só tem prova de texto (regex), não de runtime — teste `set local role authenticated` + não-admin insert esperando 42501.
- Task 1: minor (deferred): `existsSync` importado e não usado em agenda_fase_a.test.mjs:2 (herdado do plano).
- Task 1: minor (deferred): funções de trigger com `proacl` nulo — exposição nula (função `returns trigger` não é chamável diretamente); anotado pra o review final não re-levantar.
- Task 1: minor (deferred): três hierarquias em `tarefas` (`parent_id` novo, `recorrencia_pai_id` morto, `tarefas_subtarefas`) — guards cobrem só `parent_id`; fase B não conflar.
- Task 2: minor (deferred): `upsertNotificacaoConfig` (services/agendaService.ts) usa `.upsert()` sem `onConflict` (PK id) embora a tabela tenha UNIQUE(user_id); funciona porque os callers mandam `id` quando a linha existe e omitem quando não existe. Pré-existente, fora de escopo.
- Task 2: minor (deferred): comentário em 20260901213004_…sql:22 descreve a chave como colunas simples; corrigir pra lista de expressões (final fix wave).
- Task 2: minor (deferred): teste 02 prova select-scoping só porque a linha da Ana existe (estado-dependente); semear 2ª linha como postgres e assertar visível=1/total=2.
- Task 2: minor (deferred): teste negativo do 02 usa o user_id da Ana (já ocupa UNIQUE(user_id)); passa pela razão certa (WITH CHECK antes do índice), mas seria inequívoco com user_id sem linha.
- Task 2: minor (deferred): políticas sem `TO authenticated` (roles={public}); inofensivo (auth.uid() nulo pra anon); plano mandou SQL literal.
- Task 3: minor (deferred): `agenda_resumo_usuario.atrasadas` sem corte inferior de data — backlog antigo gera digest longo; avaliar corte (ex.: 60 d) ou contagem + N mais antigas no review final / fase B.
- Task 3: minor (deferred): teste 03 não cobre o reparo do Alf (lista com 0 membros → created_by; a asserção 3 usa lista_id NULL), nem os cantos 07:30/21:00, nem null/negativo em p_minutos, nem `atrasadas`/`pagar`/`pagar_atrasadas` do resumo, nem o contrato de 12 colunas.
- Task 3: minor (deferred): fallback `created_by` resolve via `user_profiles`, mas `tarefas.created_by` FK é `auth.users(id)` — auth user sem profile → 0 destinatários em silêncio (0 casos hoje). Considerar left join em auth.users ou invariante de dados.
- Task 3: minor (deferred): `agenda_resumo_usuario` com p_data nulo devolve payload vazio em vez de 22023; p_user_id sem profile → nome nulo (só service_role alcança).
- Task 3: minor (deferred): lookback de 12 h ancorado em now(), não em p_ate — replay histórico devolve nada; comentar.
- Task 3: minor (deferred): só `lembrete_minutos[1]` é honrado; comentar no call site.
- Task 3: minor (deferred, re-review): predicado referencia `nc` (joined após o lateral) → `agenda_destinatarios` é invocada pra toda tarefa com hora pendente com qualquer vencimento futuro (não só ≤ p_ate); 0 linhas hoje, teto = janela −90/+45 após a Task 4. Se crescer: pré-filtrar por `vencimento_em <= p_ate + interval '1 day'` antes do lateral (aceita perda pra offsets > 1440) ou materializar o offset.
- Task 3: minor (deferred, re-review): offset negativo em `lembrete_minutos[1]`/`lembrete_padrao_minutos` encolhe o horizonte (predicado usa o valor cru; `agenda_momento_lembrete` clampa em 0). 0 negativos hoje, sem CHECK. Considerar `greatest(…, 0)` no predicado ou CHECK ≥ 0.
- Task 4: minor (deferred): reaplicar a migration desativa o job de novo (o bloco `do` sempre desativa) — benigno no fluxo Supabase; relevante se a fase A for replicada em outro projeto.
- Task 4: minor (deferred): o `delete` de órfãs varre todos os espelhos `conta_pagar`, não só a janela — irrelevante a ~532; cresce com o histórico.
- Task 4: minor (deferred): descricao muda em todos os 532 só por NBSP→espaço após R$ (byte c2a0→20); esperado, cosmético.
- Task 4: minor (deferred) → carregar pro aviso da Task 8: o sync reverte pra `pendente` também `em_andamento`, `adiada` e `cancelada` em espelho (não só `concluida`).
- Task 4: minor (deferred): `c.status not in (…)` sem coalesce — NULL viraria delete em massa se status ficar nullable (hoje NOT NULL); `coalesce(c.status,'')` endurece (:40 e :92).
- Task 4: minor (deferred): delete de órfã cascateia lembretes_log/subtarefas (FK cascade; 169 logs em espelhos) — paridade com legado; conta re-ativada pode re-disparar lembrete.
- Task 4: minor (deferred): teste 04 não cobre `finalizado` como órfã, preservação de parent_id/concluida_por, lembrete_minutos/ordem insert-only, vencimento_em 09:00 exato, ordem das linhas da descricao.
- Task 4: minor (deferred): `select 'PASS'` após rollback é literal (drivers que seguem após erro imprimiriam PASS); o MCP aborta o batch, então vale hoje.
- Task 4: minor (deferred): `(xmax = 0)` é heurística de contagem; `perform cron.schedule` descarta o jobid (R12 corrige usando o retorno).
- Task 4: minor (deferred): relatório do implementer dizia que tarefas_status_check aceita só pendente|concluida — aceita 5 valores.
- Task 4: minor (deferred, re-review): `tarefas_recorrencia_pai_id_fkey` é NO ACTION — órfã que seja `recorrencia_pai_id` de outra tarefa abortaria o sync com 23503 (mesma classe de R11, outra aresta; 0 casos hoje; coluna morta). Follow-up.
- Task 6: minor (deferred): cobertura — fallback do horaSp (ISO inválido), prioridade/categoria null em formatLembrete, whatsapp_numero não-numérico.
- Task 6: minor (deferred, pré-existente): se o insert no lembretes_log passa e o fetch da UAZAPI lança (rede), a linha fica `pendente` pra sempre (o catch externo só faz erros++). Herdado do código original; follow-up: marcar `falhou` no catch.
- Task 7: minor (deferred): testes não cobrem filha órfã em ordenarComFilhas, dia_inteiro=false/null (ramo horaSp), pagar×pagar_atrasadas parciais; 2 RPCs de momento chamadas mesmo com resumo_*_ativo=false (round-trips evitáveis); `brl()` manual sem teste pra negativo/muito grande (código literal do brief).
- Task 8: minor (deferred): tabela do Step 2 no relatório sem separação por job (apresentação).
- Ruling R26 (parked, re-review m1): `ON CONFLICT … DO UPDATE … WHERE` ainda trava as 533 linhas por tick (lock bits + WAL de lock), sem criar versões. Aceito: os danos reais (versões, non-HOT, autovacuum, updated_at) sumiram; zero-writes exigiria DO NOTHING + UPDATE separado — não vale. Custo se errado: WAL de locks a cada 10 min.
- Ruling R27 (parked, re-review m2): `updatesAprovar` via `upsert(onConflict:'id')` pode ressuscitar um espelho apagado entre o fetch e o write com `vencimento_em = NULL`. Race estreito; follow-up: trocar por `.update().eq('id')`. Custo se errado: 1 linha órfã com vencimento nulo num race raro.
- Ruling R28 (parked, re-review m3): 2 RPCs de clamp por usuário por tick no diário (a de "ontem" é sempre inútil pra hora ≤ 21:00). Follow-up: só calcular "ontem" quando hora > 21:00. Custo se errado: 1 RPC extra a cada 5 min por usuário.
- Ruling R29 (parked, re-review m4): no dia em que o usuário muda `resumo_diario_hora` de >21:00 pra ≤21:00 pode receber 2 resumos (ontem-clamp às 07:30 + novo horário). Só no dia da troca. Aceito. Custo se errado: 1 mensagem duplicada, uma vez.
- Ruling R30 (parked, re-review m5): cabeçalho "N mais recentes de M" com lista em ordem ascendente (mais antiga primeiro dentro do piso). Cosmético; follow-up: ordenar desc ou ajustar texto. Custo se errado: nenhum.
- Ruling R31 (parked, re-review m6): asserção estática da v4 é só `/is distinct from/` — não pega tupla incompleta/desordenada. Follow-up: assertar as 9 colunas. Custo se errado: regressão silenciosa futura só pega no comportamental 04 (que cobre atualizadas = 0).

_41 itens._

## Fase B1 — deferidos (ledger de 02/09)

- Task 1: review — Spec ✅, quality Approved. Important (plan-mandated): `agenda_rotinas_guard_parent` retorna cedo quando `parent_rotina_id is null`, então `update … set lista_id` num pai com filhas não revalida a invariante "filha na mesma lista do pai". Minor (deferred): ramos "rotina com filhas nao pode virar filha" e auto-pai sem teste estático/comportamental; narrativa TDD do report levemente imprecisa (fuso não passou vazio).
- Task 1: minor (deferred): cobrir no teste estático e no 05_rotinas_schema.sql os ramos "rotina com filhas nao pode virar filha" e "auto-pai" do trigger.
- Task 1: minor (deferred): `exists(... parent_rotina_id = new.id)` executado duas vezes no guard quando lista_id não muda (leitura redundante, sem efeito de correção).
- Task 2: minor (deferred): 06_calendario.sql não cobre clamp em mês de 30 dias (`resolve_dia('2026-09-01',31,false)`→09-30), precedência real de `ultimo_dia` (abril com dia 30 não distingue), `p_regra` desconhecida/null em `ajustar_data`, e `resolve_dia(…, null, false)` (default dia 1).
- Task 3: minor (deferred): 07 não afirma "filha parcial no 1º mês" (filha tardia só é testada em out); `pulados >= 1` não discrimina a contagem do pai fechado; exception-per-pai sem cobertura (vira teste do fix I1); wrapper nunca chamado em teste (T5 executa de verdade); `select into v_pai_id` sem guarda not-found (inalcançável hoje); `v_ins` com dois significados; filhas varridas 2x por pai; retenção 60 d apaga `sync` (brief); dia_inteiro com vencimento 09:00 SP (convenção da fase A — lembrete ancora).
- Task 4: review — Spec ✅ (linha a linha + banco ao vivo), quality Approved. Minor (deferred): replay após renomear um pai duplicaria as filhas (padrão de casamento por título é o do brief); CTE `fin` repetida 7x; "~370 linhas" no report (são 413).
- Task 6: review — Spec ✅ (diff v4→v5 conferido byte a byte pelo revisor; proacl ok; jobs 18/19 ativos e intocados), quality Approved. Minor (deferred): package.json → T7 (R-B1-6); bloco estático `sync v5` por regex (padrão do arquivo; comportamento real coberto pelo 09); crescimento de agenda_materializacoes (retenção 60 d do wrapper cobre).
- Task 7: review — Spec ✅ (revisor re-rodou npm test 55/55, typecheck, as 4 varreduras e os hunks do handoff), quality Approved. Minor (deferred): §14 em dois parágrafos (conteúdo íntegro); parágrafo "Fases no Super Folha" no fim do §14 ainda lista "as 18 RPCs, grants" do lado Super Folha — desatualizado frente ao §10/B2 cancelado.
- FINAL REVIEW: dispatched (Opus) sobre review-80aeff5..9d608a1.diff (9 commits). Apontado: rulings R-B1-1..6 e linhas "minor (deferred)"/"Minor (deferred)" deste ledger.

_9 itens._

