# Agenda × Maria — rotinas mensais, pacotes, responsáveis e RPCs (design)

**Data:** 2026-09-01 · **Status:** aprovado por seções (1–5) com o Alf e o chat da Maria ·
**Fases:** A (fundação) → B (rotinas + RPCs), dois planos desta spec.

## 1. Objetivo e escopo

Trazer pra Agenda do Super Folha as rotinas mensais do grupo Financeiro que hoje rodam no LA
Organizer (Rose · Ana), e dar à Maria **plenos poderes** sobre a agenda por WhatsApp — paridade
com o app, auditada, domínio-agnóstica (RH e Folha entram depois com outra lista, mesma
ferramenta).

Cinco itens, na ordem aprovada **1 → 3 → 4 → 6 → 5**:

| # | Item | Fase |
|---|---|---|
| 1 | Espelho "Pagar:" gerado no servidor + índice único de vínculo | A |
| 3 | `parent_id` (pacote pai/filha) + triggers | A |
| 4 | Responsável, membros da lista, notificações multiusuário | A |
| 6 | `agenda_rotinas` + materializador por competência + seed | B |
| 5 | 18 RPCs `maria_agenda_*` + autorização + grants + handoff | B |

**Fora de escopo (follow-ups em §14):** sync de Folha no servidor, feriados, frequência semanal,
RLS de `tarefas`, UI de agrupamento visual.

## 2. Contexto verificado (auditoria de 01/09)

- "Pagar:" nascem **só no cliente** (`services/agendaIntegrations.ts` ← `AgendaPage`, throttle 120 s).
  Servidor só *lê* (`whatsapp-agenda-lembretes`, `whatsapp-agenda-resumo`, pg_cron a cada 5 min).
  Se ninguém abre a tela, conta nova não vira tarefa.
- `idx_tarefas_vinculo (vinculo_tipo, vinculo_id)` é **não-único**; dedup só client-side. 0 duplicatas hoje.
- Recorrência de tarefas: colunas mortas (0/600 linhas), sem UI, sem gerador.
- `tarefas_subtarefas` não tem data; Meu Dia, Atrasadas e os dois jobs leem `tarefas.vencimento_em` —
  subtarefa é invisível a todos.
- Sem responsável em `tarefas`. `notificacao_config` é por usuário no schema (`UNIQUE user_id`) mas
  **todos os leitores assumem 1 linha** (app `.maybeSingle()` sem filtro + RLS `authenticated`;
  jobs `.limit(1)` "Somente Ana").
- Sem RPCs de agenda; app escreve direto com RLS `authenticated ALL`, sem auditoria.
- `maria_assert_actor` autoriza **só por papel**; papéis são todos financeiros; ator não tem `user_id`.
- Laudo de contas das 08:00 vai pro grupo **"SUPORTE Financeiro Grupo LA"**; no **"Financeiro Grupo
  LA Music"** (Rose · Ana) o envio está **desligado** (09:00). O slot 08:00 lá está livre.

## 3. Decisões de arquitetura

| Decisão | Motivo |
|---|---|
| **A1 — a lista é o grupo.** `tarefas_listas_membros (lista_id, user_id)` serve lembrete (`responsavel_id` nulo = membros) **e** autorização (ator pode operar as listas de que é membro). Sem entidade "grupo". | A regra "Rose: Financeiro; Ana: RH e Financeiro" *é* a associação. Matriz separada = mesma informação duas vezes. |
| **B1 — `agenda_rotinas` auto-referente.** Pai e filhas na mesma tabela, dia próprio, profundidade 1. Instância carrega `rotina_id` + `competencia` + `parent_id`. | O molde tem a forma pai/filha da instância; uma tabela espelha sem join. |
| **Chave da recorrência = `(rotina_id, competencia)`**, único, **sem filtro de status**. | Lição de 29/08: dedup por data mutável + drop de índice = 16 fantasmas. Cancelada ocupa a chave. |
| **C — materializador e sync em plpgsql, uma implementação**, pg_cron em SQL direto + chamada de dentro das RPCs. App não materializa nem sincroniza contas. | A duplicação edge + front foi metade da dor das recorrentes de contas. |
| **Índices únicos não-parciais.** `NULL` é distinto; `ON CONFLICT (cols)` sem `WHERE` só infere não-parcial (42P10). | |
| **Fuso: `America/Sao_Paulo` em toda decisão de "hoje", competência e `vencimento_em`.** `current_date` e `now()::date` **proibidos** no módulo — com teste (§10). | pg_cron roda em UTC; às 21h SP `current_date` já é amanhã. |
| **Invariantes em trigger, não só na RPC.** `tarefas` tem dois escritores (app + RPCs). | Guarda numa porta só vale pra metade do tráfego (parcelamento Kids CG). |
| **Pai não auto-conclui.** Tem dia próprio (Conciliação = 30) — etapa de fechamento. | |
| **Canal padrão da agenda = grupo Financeiro** (como o TOM). Lembrete individual é **opt-in** pela tela de Notificações. | Decisão do Alf. `notificacao_config` sem linha da Rose é estado normal. |
| **Digest do grupo sai pela Maria**, não pelo app. | Ela precisa saber o que disparou (`message_id → tarefa_ids`) pra resolver "isso já foi feito" por citação. |
| **18 ferramentas explícitas; nada de `editar(jsonb)`.** | Ferramenta estreita faz o agente acertar; genérica faz improvisar. |
| **Cada agente escreve no próprio repositório.** Handoff nasce em `Docs/handoffs/` daqui; a Maria copia. | Dia 29 o backup dela apagou trabalho por escrita cruzada em `maria-backup`. |

## 4. Modelo de dados (final)

### 4.1 `tarefas` — colunas novas

```sql
parent_id            uuid null references tarefas(id) on delete set null
rotina_id            uuid null references agenda_rotinas(id) on delete restrict
competencia          date null                       -- 1º dia do mês (SP)
responsavel_id       uuid null references user_profiles(id)   -- NULL = membros da lista
concluida_por        uuid null references user_profiles(id)
mensagem_origem_id   text null                       -- idempotência (lookup, não unique)
check (rotina_id is null or competencia is not null)
```

As três colunas mortas (`is_recorrente`, `recorrencia`, `recorrencia_pai_id`) ficam; não são usadas.

### 4.2 `agenda_rotinas` — molde auto-referente

```sql
id, parent_rotina_id uuid null references agenda_rotinas(id)      -- NULL = pai
titulo text not null, descricao text
lista_id uuid not null references tarefas_listas(id)
categoria text, prioridade text not null default 'media'
responsavel_id uuid null references user_profiles(id)
frequencia text not null default 'mensal' check (frequencia in ('mensal'))   -- semanal: só a coluna
dia_mes smallint check (dia_mes between 1 and 31)
ultimo_dia boolean not null default false
check (ultimo_dia or dia_mes is not null)
se_cair_fim_de_semana text not null default 'manter'
  check (se_cair_fim_de_semana in ('manter','proximo_dia_util','dia_util_anterior'))
hora time not null default '09:00', dia_inteiro boolean not null default true
status text not null default 'ativa' check (status in ('ativa','pausada','encerrada'))
vigencia_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date
encerrada_em timestamptz, observacao text, ordem int, mensagem_origem_id text
created_by, created_at, updated_at
```

- Profundidade máxima 1 (filha não tem filha) — trigger + RPC.
- Filha tem colunas próprias (dia, regra, prioridade, responsável); `rotina_filha_adicionar` copia
  lista/categoria/regra do pai por padrão. Instância copia do seu molde.
- `parent_id` (hierarquia de instâncias deste mês) e `rotina_id` (linhagem → molde) são
  independentes. Pacote manual (via `criar`) usa só `parent_id`.

### 4.3 `tarefas_listas_membros`

```sql
lista_id uuid references tarefas_listas(id) on delete cascade
user_id  uuid references user_profiles(id) on delete cascade
primary key (lista_id, user_id), created_at
```

### 4.4 `maria_whatsapp_atores.user_id`

`uuid null unique references user_profiles(id)`. Ator sem `user_id`: leitura passa pela porta
grossa; escrita recusa nomeando o problema.

### 4.5 `notificacao_config` — RLS

Política `auth_config` (`authenticated ALL`) → `user_id = auth.uid()` em select/insert/update/delete.
`service_role` continua vendo todas (jobs iteram). `fetchNotificacaoConfig` fica como está.
`upsertNotificacaoConfig` **já envia `user_id` no insert** (`agendaService.ts`) — o `with_check` exige
isso; sem `user_id` a tela de Configurações daria 42501 pra quem ainda não tem linha (a Rose). A fase A
testa o insert de usuário sem linha passando a política.

### 4.6 `agenda_materializacoes` — resultado de cada rodada

```sql
id, competencia date, executado_em timestamptz, origem text ('cron'|'rpc'),
pais_criados int, filhas_criadas int, pulados int,
erros jsonb    -- [{rotina_id, titulo, erro}]
duracao_ms int
```

Ninguém lê `cron.job_run_details`; a sonda e o laudo leem tabela. Rotina falhando três dias em
silêncio é o defeito mais caro da semana.

### 4.7 Índices

```sql
unique (rotina_id, competencia)      -- não-parcial, sem status
unique (vinculo_tipo, vinculo_id)    -- não-parcial; 0 duplicatas hoje, entra sem limpeza
index (parent_id), index (responsavel_id), index (competencia), index (mensagem_origem_id)
```

### 4.8 Triggers em `tarefas`

- `BEFORE INSERT OR UPDATE OF parent_id`: `parent_id <> id`; e o pai apontado tem `parent_id` nulo
  (profundidade ≤ 1). Mensagem: `profundidade maxima 1: filha nao pode ter filha.`
- `BEFORE DELETE`: recusa se existe filha com `parent_id = OLD.id` e status em
  (`pendente`, `em_andamento`, `adiada`). Mensagem: `pai com filha ativa nao pode ser excluido.`
- `on delete set null` no `parent_id` é rede de segurança; o trigger é a guarda.

## 5. Jobs em plpgsql

### 5.1 `agenda_ajustar_data(p_data date, p_regra text) returns date`

**Único lugar que sabe de calendário.** Hoje: fim de semana (`manter` | `proximo_dia_util` |
`dia_util_anterior`). Amanhã: `agenda_feriados` entra *dentro* dela; o materializador não muda.

### 5.2 `agenda_resolve_dia(p_competencia date, p_dia_mes int, p_ultimo_dia bool) returns date`

`ultimo_dia` → último dia do mês; `dia_mes` maior que o mês → clampa (31 em fev = 28/29). É a
**data nominal**.

### 5.3 `agenda_rotinas_materializar(p_competencia date, p_origem text) returns jsonb` — idempotente

```
para cada molde PAI com status='ativa'  (bloco exception por pai → raise warning + erros[])
  nominal_pai = agenda_resolve_dia(competencia, dia_mes, ultimo_dia)
  se nominal_pai < vigencia_inicio → pula                      -- compara NOMINAL, não ajustada
  filhas = moldes FILHA do pai com status='ativa'
           e nominal_f = agenda_resolve_dia(competencia, filha.dia_mes, filha.ultimo_dia) >= filha.vigencia_inicio
  nominal_pai = max(nominal_pai, max(nominal_f das filhas))    -- dia_mes do pai é PISO, não data fixa
  data = agenda_ajustar_data(nominal_pai, se_cair_fim_de_semana)  -- pode sair do mês; competência fica
  vencimento_em = (data + hora) at time zone 'America/Sao_Paulo'
  INSERT tarefa-pai … ON CONFLICT (rotina_id, competencia) DO NOTHING
  pai = linha existente-ou-nova
  se pai.status in (concluida, cancelada) → filhas novas pulam (pulados += n)   -- pai fechado não ganha filha
  senão, para cada filha:
     data_f = agenda_ajustar_data(nominal_f, filha.regra)
     INSERT tarefa-filha (parent_id = pai.id, rotina_id = filha.id, competencia) ON CONFLICT DO NOTHING
grava agenda_materializacoes; retorna {pais_criados, filhas_criadas, pulados, erros}
```

- **Vigência compara a data nominal**: rotina dia 1 com `dia_util_anterior` num domingo cai no mês
  anterior — comparando a ajustada, a 1ª ocorrência morreria em silêncio.
- **Vigência por linha** (pai e cada filha). Pacote criado no dia 20 nasce com filhas parciais no 1º
  mês — honesto; `concluir` no pai só exige as filhas que existem.
- `pausada`: pula, existentes intocadas. `encerrada`: pula, histórico fica. Cancelada ocupa a chave.
- Remarcar o pai não move filha; o materializador também não.
- **Vencimento do pai em pacote = `max(nominal do pai, nominal das filhas)`** da competência; o `dia_mes`
  do pai é **piso**, não data fixa. Sem isso, Pedir fatura (pai 1, filhas até 29), Depósito (6, filha 21)
  e Cashbacks (1, filhas 3) ficariam atrasados do dia seguinte até a última filha — pai que não pode
  ser concluído e aparece vencido o mês inteiro é ruído permanente. Com o max: Conciliação fica 30,
  Depósito vai a 21, Pedir fatura a 29, Cashbacks a 3. O max é sobre as **nominais**; a regra de FDS
  do pai aplica depois. Instância de pai já existente **não** se move quando uma filha é adicionada
  no meio do mês (molde muda o futuro) — o mês corrente é `remarcar`.
- **Pai da competência já `concluida`/`cancelada` não ganha filha nova** (filha-molde adicionada dia 25
  com pai fechado dia 20): pula e conta em `pulados`.
- **Cron:** 07:30 SP (`30 10 * * *` UTC), mês corrente **e** próximo, competência calculada em SP.
  **RPCs** `rotina_criar` / `rotina_editar` / `rotina_filha_adicionar` / `rotina_reativar` chamam pra
  corrente + próximo na hora.

### 5.4 `agenda_sync_contas_pagar() returns jsonb` — espelho "Pagar:" no servidor

Port set-based de `syncContasAsAgendaTasks`: janela −90 d / +45 d em `data_vencimento`, contas com
status ∉ (`cancelado`, `finalizado`), prioridade por dias (`<0 urgente`, `0 alta`, `≤3 media`,
senão `baixa`; `pago → baixa`), `pago → concluida` com `data_conclusao`.

- Lista "Financeiro" resolvida por nome (não-smart), criada se faltar.
- `INSERT … SELECT … ON CONFLICT (vinculo_tipo, vinculo_id) DO UPDATE SET` **só**:
  `titulo, descricao, prioridade, status, data_conclusao, vencimento_em, unidade, tags, lista_id,
  updated_at`. **Nunca toca** `responsavel_id`, `parent_id`; `lembrete_minutos` e `ordem` só no insert.
- **Órfã = conta inexistente, cancelada ou finalizada** → `DELETE`. **Sair da janela não é órfã**:
  tarefa concluída com conta paga há 100 dias fica — histórico ("Feitas no mês") não encolhe.
- **Cron:** `*/10 * * * *`. Falha inteira e alta (set-based); próxima em 10 min.
- **Cliente:** `syncContasAsAgendaTasks`, `cleanupOrphanContaTasks`, `dedupeContaTasksByVinculo`
  saem do `AgendaPage`. `syncFolhaAsAgendaTasks` **fica** (follow-up, §14).

### 5.5 Grants dos jobs

`EXECUTE` só `service_role` (cron roda como `postgres`); revoke `public, anon, authenticated`. As
`maria_agenda_*` chamam por dentro (security definer).

## 6. Notificações

### 6.1 `agenda_destinatarios(p_tarefa_id) returns table (user_id, nome)` — ponto único

```
responsavel_id definido     → só ele
senão, tarefa tem lista_id  → membros de tarefas_listas_membros da lista
senão                       → created_by
```

Lembrete só pra `status in (pendente, em_andamento)`. Jobs, `listar` e `detalhar` leem daqui;
ninguém reimplementa a cascata. `responsavel_id` é quem é pingado, não quem pode agir.

### 6.2 `agenda_momento_lembrete(tarefa, lembrete_minutos) returns timestamptz` — ponto único

- `dia_inteiro = false` → `vencimento_em − minutos`.
- `dia_inteiro = true` → **sem ping próprio**; coberta pelo resumo individual.
- **Janela de silêncio 07:30–21:00 SP**: momento fora → adia pro início da próxima janela. Vale pros
  dois jobs e pro digest da Maria.

### 6.3 Canal padrão e opt-in

**Padrão: grupo Financeiro** (digest da Maria, §6.6). Lembrete/resumo individual no WhatsApp
pessoal só se a pessoa ligar `whatsapp_ativo` na tela de Notificações. `notificacao_config` sem
linha da Rose = normal.

### 6.4 Jobs multiusuário

`whatsapp-agenda-lembretes` e `whatsapp-agenda-resumo` deixam de ser "Somente Ana": iteram **todas**
as `notificacao_config` ativas (service_role; modelo `rh-stage-whatsapp-notify`) e, por usuário,
montam as tarefas em que ele é destinatário. Sem config → `skipped`. Cada um respeita
`resumo_diario_hora` / `lembrete_padrao_minutos` próprios. try/catch por usuário.

**Idempotência por destinatário:** `lembretes_log` chaveado por
`(tarefa_id, tipo, destinatario, date_trunc('hour', scheduled_for))`.

### 6.5 Resumo individual completo

Sem "…e mais N". Rotinas e tarefas manuais **uma a uma**; "Pagar:" **agregadas numa linha**
("7 contas hoje — R$ X, detalhe no laudo") — a conta já tem canal próprio. Inclui atrasadas.
**Mudança de comportamento confirmada:** Ana deixa de receber ping 08:30 por "Pagar:" e recebe a
lista às 08:00.

### 6.6 Agenda da manhã (SP)

| Hora | Quem | O quê |
|---|---|---|
| 07:30 | pg_cron | materializar (corrente + próximo) |
| ≤ 07:40 | pg_cron `*/10` | sync "Pagar:" |
| 08:00 | dispatcher do app | laudo de contas → **SUPORTE Financeiro Grupo LA** (outro grupo) |
| **08:00** | **Maria** | **digest de agenda → Financeiro Grupo LA Music** (slot livre lá) |
| hora de cada uma | app | resumo individual (opt-in) |

O laudo de contas do app **não** será ligado no Financeiro Grupo LA Music por ora (decisão do Alf):
hoje a Rose pede "contas a pagar hoje" e a Maria responde no formato que ela validou; dois relatórios
de contas com formatos diferentes na mesma conversa é ruído. Reavaliar após a fase B — se contas do
dia entram no digest, com uma voz só.

## 7. Contrato das RPCs `maria_agenda_*`

Molde: `maria_contas_dar_baixa` — `security definer`, `set search_path = public`, `for update`,
`maria_audit_log` em toda escrita (`origem='agenda'`), retorna `jsonb`.

**Contexto do ator:** leitura `p_ator_numero, p_papel, p_canal`; escrita
`+ p_texto_original, p_motivo, p_mensagem_origem_id, p_canal_origem`.

**Autorização — `maria_agenda_assert(ator, papel, lista_id, escrita)`:**
1. Porta grossa: `maria_assert_actor` inalterado. Escrita: `owner_full, finance_ops_write_safe,
   finance_assistant_write_safe`; leitura: + `strategic_read_prepare`, `gov_agent_tecnico`
   (audita a agenda como audita contas).
2. Porta fina: `owner_full` passa; demais exigem `ator.user_id ∈ membros(lista)`. `listar` sem lista
   devolve só as listas do ator.

**Retorno:** escrita `{success, id, resumo, tarefa|rotina, idempotente?}`; leitura array **plano**
com `id, titulo, descricao, status, prioridade, vencimento_em, data_local, hora_local, dia_inteiro,
lista{id,nome}, responsavel{id,nome}|null, destinatarios[{id,nome}], rotina_id, competencia,
parent_id, vinculo_tipo, vinculo_id, progresso_pai{feitas,total}|null, concluida_por{id,nome}|null,
data_conclusao`. `resumo` é uma linha legível.

**Idempotência:** `criar`, `rotina_criar`, `rotina_filha_adicionar` fazem lookup por
`(mensagem_origem_id, titulo[, pai])` antes do insert; hit → existente + `idempotente: true`. Não é
unique: uma mensagem pode gerar 1 rotina + 3 filhas.

| RPC | G | Regra |
|---|---|---|
| `listar(escopo: dia\|semana\|atrasadas\|periodo, data, data_fim?, lista_id?, responsavel_id?, busca?)` | L | Plano; `busca` = ilike no título |
| `detalhar(tarefa_id)` | L | Pai + filhas aninhadas + progresso |
| `rotinas_listar(lista_id?, status?)` | L | Moldes com filhas |
| `criar(titulo, lista_id, data, dia_inteiro, hora?, prioridade, responsavel_id?, descricao?, parent_id?)` | E | Manual; idempotente |
| `editar(tarefa_id, titulo?, descricao?, prioridade?, lista_id?, responsavel_id?, limpar_responsavel)` | E | `null` mantém; limpar é flag. Espelho: só `responsavel_id` |
| `remarcar(tarefa_id, nova_data, hora?)` | E | Só `vencimento_em`; competência e `rotina_id` intocados; filha isolada; **pai não arrasta**. Espelho recusa |
| `concluir(tarefa_id)` | E | `conta_pagar` → recusa, hint `maria_contas_dar_baixa`. Pai com filha pendente → recusa listando. Grava `concluida_por`. Filha → `progresso_pai` |
| `reabrir(tarefa_id)` | E | Filha de pai concluído → recusa. Espelho recusa |
| `cancelar(tarefa_id, motivo)` | E | Soft-delete de instância de rotina. Pai com filha ativa → recusa. Espelho recusa |
| `excluir(tarefa_id, motivo)` | E | Hard delete só manual (`rotina_id` e `vinculo_id` nulos). Instância → recusa → `cancelar` |
| `rotina_criar(titulo, lista_id, dia_mes?, ultimo_dia, se_cair_fds, hora, dia_inteiro, prioridade, responsavel_id?, descricao?, vigencia_inicio=hoje SP)` | E | Materializa corrente + próximo; idempotente; filhas por chamadas separadas |
| `rotina_editar(rotina_id, …, limpar_responsavel)` | E | Muda o futuro; instância existente não se move. `lista_id` não editável. Encerrada recusa |
| `rotina_filha_adicionar(pai_id, titulo, dia_mes?, ultimo_dia, regra?, prioridade?, responsavel_id?)` | E | Copia do pai; alvo filha → recusa; materializa; idempotente |
| `rotina_filha_editar(filha_id, …)` | E | **Preserva `rotina_id`** |
| `rotina_filha_remover(filha_id, motivo)` | E | = encerrar a filha (FK restrict); histórico fica |
| `rotina_pausar(rotina_id, motivo)` | E | Pai → pacote pula; filha → só ela |
| `rotina_reativar(rotina_id)` | E | `pausada → ativa`; materializa. Encerrada recusa |
| `rotina_encerrar(rotina_id, motivo)` | E | `encerrada_em`; nunca apaga; pendentes de competência futura → canceladas |

**Grants:** E = `service_role, maria_operacional`; L = E + `maria_leitura`. Helpers internos só
owner. `revoke … from public, anon, authenticated` explícito; **`proacl` nulo é falha** (função sem
ACL tem `EXECUTE` pra `PUBLIC`). Query de verificação e catálogo de erros/hints: handoff §6 e §9.

## 8. Seed (fase B, migration **idempotente**)

`insert … where not exists (mesmo titulo + lista_id + parent_rotina_id)`. Migration roda uma vez em
prod mas de novo em branch e restore — 10 moldes duplicados viram 20 pacotes no dia 1.

**10 moldes ativos** (+ 4 registros `encerrada`), lista Financeiro, `vigencia_inicio = 2026-09-01`, `hora 09:00`, dia-inteiro,
prioridade média, `responsavel_id` nulo. **Nunca instâncias.**

| Rotina | Pai | Filhas (dia) | FDS |
|---|---|---|---|
| Conciliação de Cartões | 30 | 2270 EMLA (12) · 8516 Barra (12) · 8641 Recreio (17) · 8434 Kids CG (25) · 1074 Kids CG (25) · Mercado Pago Barra (27) | manter |
| Pedir fatura ao Luciano | 1 | Recreio 8641 (3) · Kids CG 1074 (14) · Kids CG 8434 (14) · Mercado Pago 4425 (20) · Barra 8516 (29) · EMLA CG 2270 (29) | manter |
| Depósito de Cheques | 6 | Venc 05→06 (6) · Venc 08→09 (9) · Venc 10→11 (11) · Venc 20→21 (21) | proximo_dia_util |
| Repasses de Cartões – Maquininha | último | Recreio · Barra · CG (último dia) | proximo_dia_util |
| Cashbacks do mês aplicados | 1 | Barra · CG · Recreio (3) | proximo_dia_util |
| Dar baixa prolabore/poupança/lucros – conta cheques | 1 | — | proximo_dia_util |
| Fazer relação de previsão de cheques das escolas | 2 | — | manter |
| Listar valores repassados para Bistrô | 3 | — | manter |
| Relatório Mensal Financeiro (Grupo) | 5 | — | manter |
| Faturamento Mensal ("indispensável para gerar o SIMPLES") | 8 | — | manter |

Regra de FDS do pai vale pras filhas do pacote (proposta do chat da Maria; Rose ajusta por
`rotina_editar`/`rotina_filha_editar`).

**Registro (status `encerrada`, não migradas):** Conciliação Bancária mês anterior (1), Enviar
faturamento pro Geraldo/contador (5), Planilha do financeiro por unidade (5), e **Conferir débito
automático Light (Recreio)** — Rose confirmou em 01/09 17:28: "pode sair" (passou a débito automático);
observação com esse texto.

**Membros:** Financeiro ← Rose, Ana; RH ← Ana.

**`maria_whatsapp_atores.user_id`** (mapa verificado pelo chat da Maria, não casado por nome):

| Ator | `maria_whatsapp_atores.id` | `user_profiles.id` |
|---|---|---|
| Rose | `c67a8e42-05cf-499b-a249-a34d29c6479f` | `cf0e4bf0-d056-4b55-83c1-92b81f6be9c4` |
| Ana | `316f156b-3be7-4c44-af16-259f0db7adc3` | `81305959-dc68-4f8e-b54f-dd055dabcfd4` |
| Luciano Alf | `b7f8dbda-1d4c-484e-859c-c33c8cfb2b29` | `41351a8b-68bf-48d5-a5d1-69c1a2848f5d` |
| Anne Susan (`strategic_read_prepare`), Agente de Governança | — | `null` (sem usuário no app) |

## 9. Erros

- **Materializador:** bloco `exception` **por molde-pai** → `raise warning` + item em `erros[]` de
  `agenda_materializacoes`; segue. Uma rotina ruim não bloqueia as outras.
- **Sync:** set-based, falha inteira e alta; próxima em 10 min.
- **RPCs:** `raise exception` em português + `hint` com a RPC certa; `errcode` 42501 auth / 22023
  parâmetro / P0001 regra. Catálogo no handoff §6.
- **Jobs de WhatsApp:** try/catch por usuário.
- **Triggers:** mensagem clara; RPC pré-checa pra dar a mensagem legível antes.

## 10. Testes — evidência antes de afirmar

**SQL (`begin … rollback` via MCP), `supabase/tests/agenda/`:**
- Materializador: idempotente (2ª rodada = 0); as 3 regras de FDS; **vigência nominal vs ajustada**
  (domingo dia 1 + `dia_util_anterior`); clamp de fev; pausada/encerrada pulam; cancelada ocupa a
  chave; filhas parciais no 1º mês; `encerrar` cancela só competência futura; `agenda_materializacoes`
  gravada com erro simulado; **vencimento do pai = max(nominal pai, filhas)** — Depósito 6→21, Pedir
  fatura 1→29, Cashbacks 1→3, Conciliação fica 30; filha-molde nova sob pai da competência
  concluído/cancelado → pulada e contada em `pulados`.
- Sync: preserva `responsavel_id` e `parent_id`; órfã só por conta cancelada/finalizada/inexistente
  (paga há 100 d **fica**); índice único absorve execução dupla.
- Triggers: filha de filha recusada; delete de pai com filha ativa recusado.
- RPCs: porta grossa e fina (Ana em RH vs Financeiro; ator sem `user_id`); `concluir` recusa conta e
  pai-pendente; `remarcar` sem cascata; `reabrir` sob pai concluído; `excluir` só manual;
  idempotência por mensagem (rotina + 3 filhas mesma mensagem); `filha_editar` preserva `rotina_id`;
  `encerrar` terminal.
- **Fuso como teste:** varre `pg_proc.prosrc` de `agenda_%` e `maria_agenda_%` e falha se achar
  `current_date` ou `now()::date`. Regra transversal sem verificador é intenção.
- **`proacl`:** query com saída esperada; falha se nulo ou se houver `PUBLIC`/`anon`/`authenticated`.

**Edge (`node --test`, mock como `recorrentesMes.test.mjs`):** iteração por destinatário; chave
`(tarefa, tipo, destinatario, hora cheia)`; janela de silêncio; linha agregada de "Pagar:";
resumo sem truncar.

**Front:** `npm run typecheck`; Agenda carrega sem o sync de contas.

**Produção, após cada fase:** 0 duplicatas em `(rotina_id, competencia)` e `(vinculo_tipo,
vinculo_id)`; set + out materializados = pais + filhas esperados (10 moldes ativos; Light encerrada não materializa);
`agenda_materializacoes` sem erros; **Financeiro Grupo LA Music recebeu o digest de agenda em
02/09** (verificação da fase — não "Rose recebeu no privado").

## 11. Fases e planos

| Fase | Itens | ~Dias | Entrega |
|---|---|---|---|
| **A — Fundação** | 1 → 3 → 4 | 3 | `agenda_sync_contas_pagar` + cron + índice único de vínculo + cliente sem sync de contas; `parent_id` + triggers; `responsavel_id`, `concluida_por`, `mensagem_origem_id`, `tarefas_listas_membros`, `atores.user_id`, RLS config, `agenda_destinatarios`, `agenda_momento_lembrete`, jobs multiusuário, resumo completo |
| **B — Rotinas + Maria** | 6 → 5 | 6–8 | `agenda_rotinas` + `vigencia_inicio` + `agenda_materializacoes` + `agenda_ajustar_data` + materializador + cron + seed; `maria_agenda_assert` + 18 RPCs + grants + `proacl` + testes + handoff `PRONTO` |

Cada fase: branch → testes → deploy → verificação em produção → merge
(finishing-a-development-branch). **B só começa com A verificada** — o `concluir` que recusa
`conta_pagar` depende do espelho fechar pelo sync.

**Ordem de deploy da fase A:** migration + `agenda_sync_contas_pagar` + cron sobem e **rodam** (1ª
execução verificada) **antes** de o cliente perder `syncContasAsAgendaTasks` — na ordem inversa há
janela sem espelho de conta nova.

## 12. Fronteiras e handoff

| Super Folha | Maria |
|---|---|
| Schema, triggers, índices, jobs, 18 RPCs, grants, testes, seed | Tools no MCP (uma por RPC), allowlist por agente, `maria_agenda_envios` (`message_id → tarefa_ids`), digest das 08:00, AGENTS.md |
| Lembrete/resumo individual (opt-in) | Resolver "isso já foi feito" por citação; distinguir "dá baixa" (conta) de "conclui" (tarefa) por `vinculo_tipo` |

Handoff: `Docs/handoffs/2026-09-01-agenda-maria.md` **neste repo** (versão contrato agora; status
`PRONTO` na fase B). A Maria copia pro dela. Nada é escrito em `maria-backup`.

## 13. Inputs — todos fechados em 01/09

1. **Light (Recreio):** Rose — "pode sair". Registro `encerrada`, não ativa (§8).
2. **`gov_agent_tecnico`:** leitura, sim — as 3 RPCs L (§7).
3. **Laudo de contas no Financeiro Grupo LA Music:** não agora (§6.6).

## 14. Follow-ups (fora desta spec)

- Sync de Folha no servidor: `vinculo_id` é hash FNV em JS — replicar em plpgsql ou remapear ids.
- `agenda_feriados` dentro de `agenda_ajustar_data`.
- `frequencia = 'semanal'`: só abrir o CHECK + ramo no materializador (dedup por data, como contas).
- RLS de `tarefas`/`tarefas_subtarefas` por lista.
- Agrupamento visual pai/filha na UI (o ganho real já vem: filhas no Meu Dia com lembrete).
