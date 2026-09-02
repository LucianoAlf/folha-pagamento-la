# HANDOFF — Agenda × Maria (contrato das RPCs `maria_agenda_*`)

> **STATUS: CONTRATO PRÉ-IMPLEMENTAÇÃO — 01/09/2026.**
> **Nada abaixo existe no banco ainda.** Este arquivo fixa nomes, grants, shapes de retorno e
> semânticas **aprovados** no design (Super Folha, spec `Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md`),
> pra que o lado da Maria prepare tools, allowlist e o `maria_agenda_envios` em paralelo.
>
> **Final aqui:** nomes das 18 RPCs, grant de cada uma, regras de negócio, shapes de retorno,
> catálogo de erros, agenda da manhã, semântica de destinatários, seed.
> **Só na versão `PRONTO`** (mesmo arquivo, fase B): tipos e ordem exatos dos parâmetros, saída
> real da query de `proacl`, versões das migrations, evidência dos testes.
>
> **Não inscreva tool na allowlist apontando pra RPC que ainda não existe.** Prepare; ative quando
> o status virar `PRONTO`.

**Onde vive:** `LucianoAlf/folha-pagamento-la` → `Docs/handoffs/`. Cada agente escreve no próprio
repositório; a Maria copia pro dela ao receber. **Nada é escrito em `maria-backup`.**

---

## 0. O que é / o que não é

- **É:** o contrato entre o banco (Super Folha é dono do schema e das RPCs) e a Maria (dona das
  tools, da allowlist, do digest do grupo e do `maria_agenda_envios`).
- **Não é:** SQL pra aplicar. As migrations saem do repo do Super Folha, na fase B.
- **Princípio (do Alf):** a Maria é *agent-first* — **paridade com o app**. Tudo que a Rose faz
  na tela, a Maria faz por RPC, auditada. Agent-first não é sem rastro; é sem porteiro.
- **Domínio-agnóstico desde o dia 1:** as RPCs operam em `tarefas` e `agenda_rotinas` por
  **lista**, não por "financeiro". RH e Folha entram com outra lista, mesma ferramenta.

---

## 1. Decisões aprovadas que moldam o contrato

| Decisão | Efeito pra Maria |
|---|---|
| **A1 — a lista é o grupo.** `responsavel_id` nulo = todos os membros da lista (`tarefas_listas_membros`). Sem entidade "grupo". | "Rose e Ana" vem de `destinatarios[]` |
| **Autorização em duas portas.** Papel (`maria_assert_actor` existente) + associação à lista. `owner_full` passa direto. | Ator precisa de `user_id` vinculado (§3) |
| **B1 — molde auto-referente `agenda_rotinas`.** Pai + filhas na mesma tabela, dia próprio. Profundidade máx. 1. | `rotina_filha_*` opera na linha filha; `rotina_id` é a identidade |
| **Chave da recorrência = `(rotina_id, competencia)`**, único, sem filtro de status. Cancelada ocupa a chave. | `remarcar` nunca muda competência; `cancelar` é o soft-delete de instância |
| **C — materializador e sync em plpgsql**, `pg_cron` + chamada de dentro das RPCs. | `rotina_criar` já devolve o mês corrente materializado |
| **Fuso:** "hoje", competência e `vencimento_em` em `America/Sao_Paulo`. | Entradas `date` são calendário SP; sai `data_local` pronto |
| **Pai não auto-conclui.** Dia próprio = etapa de fechamento. **Vencimento do pai em pacote = max(nominal do pai, nominal das filhas)** — o `dia_mes` do pai é piso. | `concluir` no pai recusa enquanto houver filha pendente; o pai nunca aparece atrasado antes da última filha |
| **Canal padrão da agenda = grupo Financeiro** (decisão do Alf, como o TOM). Lembrete individual é **opt-in** pela tela de Notificações. | `notificacao_config` sem linha da Rose é estado normal, não falha |
| **Digest do grupo sai pela Maria.** | Slot **08:00 no Financeiro Grupo LA Music** (§8); a Maria grava `message_id → tarefa_ids` |

---

## 2. O que a Maria enxerga no modelo

**`tarefas`** — novas: `parent_id` (filha → tarefa-pai deste mês), `rotina_id` (instância → molde),
`competencia` (1º dia do mês; NOT NULL quando `rotina_id` não é), `responsavel_id`,
`concluida_por`, `mensagem_origem_id`. Relevantes já existentes: `vinculo_tipo`, `vinculo_id`
(espelho "Pagar:" → `conta_pagar`), `lista_id`, `dia_inteiro`, `vencimento_em`, `status`
(`pendente | em_andamento | concluida | cancelada | adiada`).

**`agenda_rotinas`** (molde): `parent_rotina_id` (nulo = pai), `titulo`, `lista_id`, `frequencia`
(`mensal`; `semanal` só a coluna, CHECK barra), `dia_mes` | `ultimo_dia`, `se_cair_fim_de_semana`
(`manter | proximo_dia_util | dia_util_anterior`), `hora`, `dia_inteiro`, `prioridade`,
`responsavel_id`, `status` (`ativa | pausada | encerrada`), `vigencia_inicio`, `encerrada_em`.

**`tarefas_listas_membros (lista_id, user_id)`** — quem é do grupo. Seed: Financeiro ← Rose, Ana;
RH ← Ana.

**`agenda_materializacoes`** — resultado de cada rodada do materializador (`competencia`,
`executado_em`, `origem`, `pais_criados`, `filhas_criadas`, `pulados`, `erros jsonb`). **A sonda
lê daqui**, não de `cron.job_run_details`. Rotina falhando três dias em silêncio é o defeito mais
caro da semana.

**Dois campos que decidem a ação da Maria** (por isso vêm em toda listagem):
- `vinculo_tipo = 'conta_pagar'` → a ação real é **na conta** (`maria_contas_dar_baixa`). A tarefa
  é espelho; fecha sozinha pelo sync (≤ 10 min).
- `rotina_id` não nulo → instância de rotina: **`cancelar`**, nunca `excluir`.

---

## 3. Autorização — o que precisa existir do lado de lá

`maria_agenda_assert(ator, papel, lista_id, escrita)` — ponto único, chamado por toda RPC:

1. **Porta grossa (papel):** `maria_assert_actor` existente, inalterado.
   - Escrita: `owner_full`, `finance_ops_write_safe`, `finance_assistant_write_safe`.
   - Leitura: os três + `strategic_read_prepare`.
   - `gov_agent_tecnico`: **leitura** (as 3 L) — audita a agenda como audita contas.
2. **Porta fina (lista):** `owner_full` passa. Os demais exigem
   `ator.user_id ∈ tarefas_listas_membros(lista_id)`. `listar` sem lista devolve só as listas do
   ator.

**`maria_whatsapp_atores.user_id`** — mapa **recebido e verificado** (não casado por nome), vai na
migration da fase B:

| Ator | `maria_whatsapp_atores.id` | `user_profiles.id` |
|---|---|---|
| Rose | `c67a8e42-05cf-499b-a249-a34d29c6479f` | `cf0e4bf0-d056-4b55-83c1-92b81f6be9c4` |
| Ana | `316f156b-3be7-4c44-af16-259f0db7adc3` | `81305959-dc68-4f8e-b54f-dd055dabcfd4` |
| Luciano Alf | `b7f8dbda-1d4c-484e-859c-c33c8cfb2b29` | `41351a8b-68bf-48d5-a5d1-69c1a2848f5d` |
| Anne Susan, Agente de Governança | — | `null` — leitura pela porta grossa; escrita recusa nomeando o problema |

`responsavel_id` é **quem é pingado**, não quem pode agir. Rose responsável + Ana membro → Ana
conclui. "Qualquer uma conclui" preservado.

---

## 4. Contrato das 18 RPCs

### 4.1 Parâmetros comuns (contexto do ator) — mesmos nomes das `maria_contas_*`

| Tipo | Parâmetros |
|---|---|
| **Leitura (3)** | `p_ator_numero text, p_papel text, p_canal text` |
| **Escrita (15)** | `p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text` |

Toda escrita grava `maria_audit_log` (`origem = 'agenda'`, `tabela`, `entidade_tipo`,
`entidade_id`, `operacao`, `antes`, `depois`, `motivo`, `texto_original`).

### 4.2 Grants (final)

| Sigla | `EXECUTE` |
|---|---|
| **E** | `service_role`, `maria_operacional` |
| **L** | `service_role`, `maria_operacional`, `maria_leitura` |

Todas: `revoke execute … from public, anon, authenticated` explícito (revoke de `PUBLIC` sozinho
**não** tira `anon`/`authenticated`). Helpers internos (`maria_agenda_assert`, materializador,
`agenda_destinatarios`) → só owner. Verificação em §9.

### 4.3 Leitura

| RPC | G | Parâmetros de domínio | Regra |
|---|---|---|---|
| `maria_agenda_listar` | L | `p_escopo` (`dia` \| `semana` \| `atrasadas` \| `periodo`), `p_data date`, `p_data_fim date` (só `periodo`), `p_lista_id uuid?`, `p_responsavel_id uuid?`, `p_busca text?` (ilike no título) | **Plano**: pai e filhas com `parent_id`. `busca` é como a Maria acha o `tarefa_id` ("conclui a conciliação do 8641") sem puxar a semana e adivinhar |
| `maria_agenda_detalhar` | L | `p_tarefa_id uuid` | Pai + filhas aninhadas + progresso |
| `maria_agenda_rotinas_listar` | L | `p_lista_id uuid?`, `p_status text?` | Moldes com filhas; `encerrada` inclui as 3 do Organizer registradas como histórico |

### 4.4 Tarefa

| RPC | G | Parâmetros de domínio | Regra |
|---|---|---|---|
| `maria_agenda_criar` | E | `p_titulo, p_lista_id, p_data date, p_dia_inteiro bool, p_hora time?, p_prioridade, p_responsavel_id?, p_descricao?, p_parent_id?` | Manual. `parent_id` permite pacote manual (trigger garante profundidade 1). **Idempotente por `(p_mensagem_origem_id, titulo)`** |
| `maria_agenda_editar` | E | `p_tarefa_id, p_titulo?, p_descricao?, p_prioridade?, p_lista_id?, p_responsavel_id?, p_limpar_responsavel bool` | Só esses campos. `null` = mantém; **limpar é flag explícita**. Em espelho "Pagar:" só `responsavel_id` (o resto o sync sobrescreve) |
| `maria_agenda_remarcar` | E | `p_tarefa_id, p_nova_data date, p_hora time?` | **Só `vencimento_em`.** Competência e `rotina_id` intocados. Filha isolada ok. **Pai não arrasta filhas.** Espelho → recusa ("remarque a conta") |
| `maria_agenda_concluir` | E | `p_tarefa_id` | `conta_pagar` → **recusa** com hint `maria_contas_dar_baixa(conta_id=<vinculo_id>)`. Pai com filha pendente → recusa listando quais. Grava `concluida_por = ator.user_id`. Filha → devolve `progresso_pai` |
| `maria_agenda_reabrir` | E | `p_tarefa_id` | `concluida`/`cancelada` → `pendente`. Filha de pai concluído → recusa ("reabra o pai") — invariante sem cascata. Espelho → recusa |
| `maria_agenda_cancelar` | E | `p_tarefa_id` (+ `p_motivo`) | **É o soft-delete de instância de rotina** (chave fica ocupada; nunca ressuscita). Pai com filha ativa → recusa. Espelho → recusa |
| `maria_agenda_excluir` | E | `p_tarefa_id` (+ `p_motivo`) | Hard delete **só manual** (`rotina_id` e `vinculo_id` nulos). Instância de rotina → recusa apontando `cancelar`. Audit guarda `antes` — único rastro |

### 4.5 Rotina

| RPC | G | Parâmetros de domínio | Regra |
|---|---|---|---|
| `maria_agenda_rotina_criar` | E | `p_titulo, p_lista_id, p_dia_mes int?, p_ultimo_dia bool, p_se_cair_fim_de_semana, p_hora, p_dia_inteiro, p_prioridade, p_responsavel_id?, p_descricao?, p_vigencia_inicio date = hoje SP` | Materializa mês corrente + próximo **na hora**. Filhas por chamadas separadas (`pai_id` no retorno). **Idempotente por `(p_mensagem_origem_id, titulo)`** |
| `maria_agenda_rotina_editar` | E | `p_rotina_id` + mesmos campos de criar (opcionais) + `p_limpar_responsavel` | **Muda o futuro; instância existente não se move** — o mês corrente é `remarcar`. `lista_id` **não** editável (encerra + cria). Encerrada → recusa |
| `maria_agenda_rotina_filha_adicionar` | E | `p_rotina_pai_id, p_titulo, p_dia_mes?, p_ultimo_dia, p_se_cair_fim_de_semana?, p_prioridade?, p_responsavel_id?` | Copia lista/categoria/regra do pai por padrão. Alvo já é filha → recusa. Materializa. **Idempotente por `(p_mensagem_origem_id, titulo, pai)`** |
| `maria_agenda_rotina_filha_editar` | E | `p_rotina_filha_id` + campos | **Preserva `rotina_id`** (identidade) — "8641 pro dia 19 todo mês". Remover+adicionar mudaria a chave e abriria duplicata |
| `maria_agenda_rotina_filha_remover` | E | `p_rotina_filha_id` (+ `p_motivo`) | Semântica = **encerrar a filha** (FK restrict — instâncias passadas referenciam). Histórico fica |
| `maria_agenda_rotina_pausar` | E | `p_rotina_id` (+ `p_motivo`) | Pai pausado → pacote inteiro pula; filha pausada → só ela. Instâncias existentes intocadas |
| `maria_agenda_rotina_reativar` | E | `p_rotina_id` | `pausada` → `ativa`; materializa corrente + próximo. Encerrada → recusa (terminal) |
| `maria_agenda_rotina_encerrar` | E | `p_rotina_id` (+ `p_motivo`) | `encerrada_em`; **nunca apaga**. Instâncias pendentes de **competência futura** (o próximo mês já nasceu) → canceladas; passadas e concluídas ficam |

### 4.6 Idempotência (reenvio após timeout é rotina, não exceção)

`criar`, `rotina_criar`, `rotina_filha_adicionar`: lookup por `(p_mensagem_origem_id, titulo[, pai])`
**antes** do insert. Mesma mensagem, mesmo título → devolve o existente com `"idempotente": true`.
Não é unique na coluna: uma mensagem da Rose pode gerar 1 rotina + 3 filhas com o mesmo
`mensagem_origem_id`.

---

## 5. Shapes de retorno (jsonb)

### Item de tarefa (em `listar`, `detalhar`, e em toda escrita)

```json
{
  "id": "uuid", "titulo": "…", "descricao": "…|null",
  "status": "pendente|em_andamento|concluida|cancelada|adiada",
  "prioridade": "baixa|media|alta|urgente",
  "vencimento_em": "timestamptz", "data_local": "YYYY-MM-DD", "hora_local": "HH:MM", "dia_inteiro": true,
  "lista": { "id": "uuid", "nome": "Financeiro" },
  "responsavel": { "id": "uuid", "nome": "Rose" },
  "destinatarios": [ { "id": "uuid", "nome": "Rose" }, { "id": "uuid", "nome": "Ana" } ],
  "rotina_id": "uuid|null", "competencia": "YYYY-MM-01|null", "parent_id": "uuid|null",
  "vinculo_tipo": "conta_pagar|null", "vinculo_id": "uuid|null",
  "progresso_pai": { "feitas": 4, "total": 6 },
  "concluida_por": { "id": "uuid", "nome": "Ana" }, "data_conclusao": "timestamptz|null"
}
```

`responsavel`, `progresso_pai`, `concluida_por` são `null` quando não se aplicam. `destinatarios`
vem de `agenda_destinatarios` (§7) — sempre com **`id` e `nome`**; a Maria fala "Rose e Ana", não
UUID.

### Envelopes

| RPC | Retorno |
|---|---|
| `listar` | `{ "success": true, "escopo", "data_inicio", "data_fim", "total", "itens": [item…], "resumo": "…" }` |
| `detalhar` | `{ "success": true, "tarefa": item, "filhas": [item…], "resumo": "…" }` |
| `rotinas_listar` | `{ "success": true, "total", "rotinas": [ { id, titulo, lista, frequencia, dia_mes, ultimo_dia, se_cair_fim_de_semana, hora, dia_inteiro, prioridade, responsavel, status, vigencia_inicio, encerrada_em, filhas: [ … ] } ] }` |
| Escrita em tarefa | `{ "success": true, "id", "resumo": "…", "tarefa": item }` (+ `"idempotente": true` quando for) |
| Escrita em rotina | `{ "success": true, "id", "resumo": "…", "rotina": { … } }` (+ `"idempotente": true`) |

`resumo` é sempre **uma linha legível**, pronta pra repassar:
`"Concluída: Conciliar cartão 8641 (Financeiro) — pai Conciliação de Cartões 4/6"`.

---

## 6. Catálogo de erros e hints (a Maria repassa o texto)

| errcode | Mensagem | hint |
|---|---|---|
| `42501` | `sender nao autorizado para a Maria.` / `papel nao autorizado para esta operacao.` | — |
| `42501` | `ator sem usuario vinculado (user_id).` | `vincular maria_whatsapp_atores.user_id` |
| `42501` | `ator nao e membro da lista <nome>.` | — |
| `P0001` | `tarefa vinculada a conta a pagar: conclua pela baixa da conta.` | `maria_contas_dar_baixa(p_conta_id=<vinculo_id>)` |
| `P0001` | `espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.` | `maria_contas_*` |
| `P0001` | `pai com filhas pendentes: <títulos>.` | `conclua ou cancele as filhas` |
| `P0001` | `filha de pai concluido: reabra o pai primeiro.` | `maria_agenda_reabrir(<parent_id>)` |
| `P0001` | `instancia de rotina nao se exclui: use cancelar.` | `maria_agenda_cancelar` |
| `P0001` | `pai com filha ativa nao pode ser excluido/cancelado.` | — |
| `P0001` | `profundidade maxima 1: filha nao pode ter filha.` | — |
| `P0001` | `rotina encerrada nao aceita edicao nem reativacao.` | `maria_agenda_rotina_criar` |
| `P0001` | `lista da rotina nao e editavel: encerre e crie outra.` | — |
| `22023` | `escopo invalido` / `data invalida` / `dia_mes fora de 1..31` / `regra de fim de semana invalida` / `informe dia_mes ou ultimo_dia` | — |
| `23514` | `frequencia semanal ainda nao implementada` (CHECK) | — |

Os triggers do banco seguram o app (profundidade, delete de pai); a RPC pré-checa pra dar a
mensagem legível antes de o trigger disparar.

---

## 7. `agenda_destinatarios(tarefa_id)` — ponto único da cascata

```
responsavel_id definido        → só ele
senão, tarefa tem lista_id     → todos em tarefas_listas_membros da lista
senão                          → created_by
```

Lembrete só pra `status in (pendente, em_andamento)` — uma concluiu, ninguém mais recebe. Os
dois jobs do app e o `listar`/`detalhar` leem daqui. **Ninguém reimplementa a cascata** — nem a
Maria.

---

## 8. Agenda da manhã e janela de silêncio

**Fato verificado em 01/09:** o laudo de contas das 08:00 vai pro grupo **"SUPORTE Financeiro Grupo
LA"**. No **"Financeiro Grupo LA Music"** (Rose · Ana) o envio está **desligado** (configurado pra
09:00). O slot 08:00 nesse grupo está livre.

| Hora (SP) | Quem | O quê |
|---|---|---|
| 07:30 | `pg_cron` | `agenda_rotinas_materializar` (mês corrente + próximo) → grava `agenda_materializacoes` |
| ≤ 07:40 | `pg_cron` (`*/10`) | `agenda_sync_contas_pagar` — espelhos "Pagar:" frescos |
| 08:00 | dispatcher do app | Laudo de contas → **SUPORTE Financeiro Grupo LA** (outro grupo) |
| **08:00** | **Maria** | **Digest de agenda → Financeiro Grupo LA Music** — lê `maria_agenda_listar(dia)`, envia, grava `message_id → tarefa_ids` |
| horário de cada uma | app | Resumo individual **opt-in** (`whatsapp_ativo` na tela de Notificações) — completo, rotinas uma a uma, "Pagar:" agregadas numa linha |

O laudo de contas do app **não** será ligado no Financeiro Grupo LA Music por ora (decisão do Alf):
dois relatórios de contas com formatos diferentes na mesma conversa. Reavaliar após a fase B — se
contas do dia entram no digest, com uma voz só.

**Janela de silêncio: nenhum envio proativo fora de 07:30–21:00 SP**; o que cair fora adia pro
início da próxima janela. Regra da casa — **vale também pro digest e pra qualquer proativo da
Maria.**

Recomendação (não contrato): o digest rende mais focando rotinas e tarefas manuais do dia +
atrasadas; as "Pagar:" já têm o laudo.

---

## 9. Verificação de `proacl` — passo do plano, e de vocês também

```sql
select p.proname, p.proacl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'maria\_agenda\_%' escape '\'
 order by p.proname;
```

**Saída esperada** (a real vai colada aqui na versão `PRONTO`):

- Escrita (E): `{postgres=X/postgres,service_role=X/postgres,maria_operacional=X/postgres}`
- Leitura (L): o mesmo **+** `maria_leitura=X/postgres`
- **Nunca**: entrada `=X/…` sem nome (é `PUBLIC`), `anon=…`, `authenticated=…`.
- **`proacl` NULO é FALHA**, não sucesso: função sem ACL explícita tem `EXECUTE` pra `PUBLIC` por
  padrão.

---

## 10. Fronteira — o que é de cada lado

| Super Folha (este repo) | Maria (vocês) |
|---|---|
| Schema, triggers, índices, materializador, sync, as 18 RPCs, grants, testes, seed | Tools no MCP (uma por RPC), allowlist por agente, **`maria_agenda_envios`** (`message_id → tarefa_ids`), digest das 08:00, regra no AGENTS.md |
| Lembrete e resumo individual (opt-in) | Resolver "isso já foi feito, dá baixa" **por citação**; sem citação e >1 candidata → pergunta, nunca chuta |
| `agenda_destinatarios`, `agenda_materializacoes` | Distinguir "dá baixa" (conta → `maria_contas_dar_baixa`) de "conclui" (tarefa avulsa → `maria_agenda_concluir`) usando `vinculo_tipo` |

`listar`/`detalhar` já devolvem os ids que o `maria_agenda_envios` precisa.

---

## 11. Allowlist — lista por papel (o formato do `openclaw.json` é de vocês)

**Ativar só quando o status virar `PRONTO`.**

`owner_full`, `finance_ops_write_safe`, `finance_assistant_write_safe` → **as 18**
(a porta fina por lista faz o escopo; o papel só diz "pode escrever"):

```
maria_agenda_listar
maria_agenda_detalhar
maria_agenda_rotinas_listar
maria_agenda_criar
maria_agenda_editar
maria_agenda_remarcar
maria_agenda_concluir
maria_agenda_reabrir
maria_agenda_cancelar
maria_agenda_excluir
maria_agenda_rotina_criar
maria_agenda_rotina_editar
maria_agenda_rotina_filha_adicionar
maria_agenda_rotina_filha_editar
maria_agenda_rotina_filha_remover
maria_agenda_rotina_pausar
maria_agenda_rotina_reativar
maria_agenda_rotina_encerrar
```

`strategic_read_prepare` → só as 3 de leitura:

```
maria_agenda_listar
maria_agenda_detalhar
maria_agenda_rotinas_listar
```

`gov_agent_tecnico` → as mesmas 3 de leitura.

---

## 12. Seed (fase B) — o que vai nascer no banco

**Migration idempotente** (`insert … where not exists` por título + lista + pai): roda de novo em
branch e restore sem virar 22 pacotes.

- **10 moldes ativos** (+ 4 registros `encerrada`), lista Financeiro, `vigencia_inicio = 2026-09-01`,
  `hora 09:00`, dia-inteiro, prioridade média, `responsavel_id` nulo (grupo). **Nunca instâncias** — o
  cron de 07:30 materializa set + out.
- **Vencimento do pai em pacote = max(nominal do pai, nominal das filhas)**; o `dia_mes` do pai é piso.
  Com o seed: Conciliação fica 30, Depósito vai a 21, Pedir fatura a 29, Cashbacks a 3 — o pai nunca
  aparece atrasado antes da última filha.
- **Regras de fim de semana** (proposta por natureza; Rose ajusta por `rotina_editar`):
  `proximo_dia_util` → Depósito de Cheques, Repasses de Cartões, Dar baixa prolabore/poupança/lucros,
  Cashbacks · `manter` → Pedir fatura, Conciliação de Cartões, Relatório Mensal, Faturamento,
  Previsão de cheques, Repasses Bistrô.
- **"Conferir débito automático Light (Recreio)" não entra ativa:** Rose confirmou em 01/09 17:28 —
  "pode sair" (passou a débito automático). Vira registro `encerrada` com essa observação.
- **As 4 encerradas** (3 do Organizer + Light) entram como `status = 'encerrada'` (registro; ninguém
  recria por engano).
- `tarefas_listas_membros`: Financeiro ← Rose, Ana; RH ← Ana. `atores.user_id`: mapa do §3.

---

## 13. Inputs — todos fechados em 01/09

1. **Light (Recreio):** Rose — "pode sair". Registro `encerrada`, não ativa (§12).
2. **`gov_agent_tecnico`:** leitura, sim — as 3 RPCs L (§3, §11).
3. **Laudo de contas no Financeiro Grupo LA Music:** não agora (§8).

Não há gate de cadastro da Rose: canal padrão é o grupo; o individual é opt-in dela.

---

## 14. O que muda quando a fase B pousar (checklist do `PRONTO`)

- [ ] Status deste arquivo → `PRONTO — <data>`
- [ ] Assinaturas finais (tipos e ordem exatos) de cada RPC
- [ ] Saída real da query de `proacl` (§9) colada
- [ ] Versões das migrations em `supabase_migrations.schema_migrations`
- [ ] Evidência dos testes (SQL `begin…rollback` + `node --test`) resumida
- [ ] Contagem em produção: 0 duplicatas em `(rotina_id, competencia)` e `(vinculo_tipo, vinculo_id)`; set + out materializados = pais + filhas esperados; `agenda_materializacoes` sem erros
- [ ] **Financeiro Grupo LA Music recebeu o digest de agenda em 02/09** (verificação da fase)

**Fase A entregue em 01/09/2026:** `tarefas.parent_id/responsavel_id/concluida_por/mensagem_origem_id`, `tarefas_listas_membros` (Financeiro ← Rose, Ana; RH ← Ana), `maria_whatsapp_atores.user_id` (3 atores), `agenda_destinatarios`, `agenda_momento_lembrete`, `agenda_sync_contas_pagar` + cron. Migrations: `20260901211626`, `20260901213004`, `20260901214314`, `20260901215613`, `20260901230636`, `20260901232341`, `20260901233302`. Status geral continua **pré-implementação** até a fase B (RPCs).

Fases no Super Folha: **A — Fundação** (sync no servidor, `parent_id` + triggers, responsável,
membros, jobs multiusuário; ~3 dias) → **B — Rotinas + Maria** (`agenda_rotinas`, materializador,
seed, as 18 RPCs, grants, handoff `PRONTO`; ~6–8 dias). A B só começa com a A verificada em
produção.
