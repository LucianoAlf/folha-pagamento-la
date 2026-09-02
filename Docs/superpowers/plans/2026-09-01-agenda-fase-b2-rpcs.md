# Agenda × Maria — Fase B2 (18 RPCs `maria_agenda_*`) Implementation Plan

> **CANCELADO em 2026-09-02.** Todas as RPCs `maria_agenda_*` (as 10 de tarefa e as 9 de rotina) ficaram com o chat da Maria — as 10 de tarefa já estão em produção (migration `maria_agenda_rpcs_tarefas`, commit `80aeff5`, arquivo `supabase/migrations/20260902020000_maria_agenda_rpcs_tarefas.sql`) e ligadas no MCP dela. Este repositório não cria nem redefine nada com prefixo `maria_agenda_`. O plano fica só como referência do contrato que foi desenhado; a fase B1 (rotinas) segue.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à Maria paridade com o app sobre a Agenda, por WhatsApp, auditada: 18 RPCs `maria_agenda_*` (3 de leitura, 7 de tarefa, 8 de rotina) com autorização em duas portas (papel × lista), idempotência por mensagem, retornos com `{id, nome}` e `resumo` legível, erros em português com `hint`, grants fechados e `proacl` verificado — e o handoff virando **PRONTO**.

**Architecture:** Todas as RPCs são `security definer`, `set search_path = public`, no molde de `maria_contas_dar_baixa`: `maria_agenda_assert` (porta grossa = `maria_assert_actor` existente; porta fina = `tarefas_listas_membros`) → validação → `for update` → escrita → `maria_audit_log` → `jsonb`. Três helpers internos concentram o que repete: `maria_agenda_item_json` (o item da tarefa, com `agenda_destinatarios` da fase A), `maria_agenda_rotina_json` (molde com filhas) e `maria_agenda_audit`. Espelho "Pagar:" (`vinculo_tipo = 'conta_pagar'`) é **intocável** por concluir/cancelar/excluir/remarcar — a ação real é `maria_contas_dar_baixa` (o sync reverte status manual em ≤10 min). Instância de rotina nunca se exclui: `cancelar` (a chave `(rotina_id, competencia)` fica ocupada). `rotina_*` que muda o molde materializa corrente + próximo na hora via `agenda_materializar_corrente_e_proximo('rpc')` (B1).

**Tech Stack:** Postgres 17 (Supabase `ubdvtjbitozhkuvvqkxj`), plpgsql, MCP `apply_migration`/`execute_sql`, `node --test --experimental-strip-types`, SQL comportamental `begin … rollback` com **atores sintéticos** (sem telefone real).

**Spec:** `Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md` §3, §7, §9, §10, §12, §13. **Contrato:** `Docs/handoffs/2026-09-01-agenda-maria.md` §3–§6, §9, §11 (é a fonte dos nomes, grants, shapes e erros; esta B2 o torna PRONTO). Pré-requisitos: fase A (`agenda_destinatarios`, `tarefas_listas_membros`, `maria_whatsapp_atores.user_id`) e B1 (`agenda_rotinas`, `tarefas.rotina_id/competencia`, `agenda_materializar_corrente_e_proximo`).

## Global Constraints

- **Molde de RPC:** `security definer set search_path = public`; `select … for update` antes de escrever; `maria_audit_log` em toda escrita (`origem = 'agenda'`); retorna `jsonb`; `raise exception` em **português** com `errcode` (`42501` auth, `22023` parâmetro, `P0001` regra) e `hint` apontando a RPC certa.
- **Parâmetros comuns** (nomes iguais às `maria_contas_*`): leitura `p_ator_numero text, p_papel text` (+ `p_canal text default 'whatsapp'`); escrita `+ p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null`. Domínio vem antes; PostgREST chama por nome.
- **Porta grossa (papel):** escrita `owner_full, finance_ops_write_safe, finance_assistant_write_safe`; leitura esses + `strategic_read_prepare, gov_agent_tecnico`. **Porta fina (lista):** `owner_full` passa; ator **com** `user_id` precisa ser membro da lista (`tarefas_listas_membros`); ator **sem** `user_id` lê tudo (auditoria/estratégia) e **não escreve** (`ator sem usuario vinculado (user_id).`).
- **Espelho `conta_pagar`:** `concluir`/`cancelar`/`excluir`/`remarcar` recusam com `hint` `maria_contas_dar_baixa(p_conta_id=<vinculo_id>)`; `editar` só aceita `responsavel_id`.
- **Instância de rotina** (`rotina_id` não nulo): `excluir` recusa → `cancelar`. `remarcar` muda só `vencimento_em` (competência e `rotina_id` intocados; **pai não arrasta filhas**). `concluir` no pai recusa com filha pendente/em_andamento/adiada; `reabrir` filha de pai concluído recusa.
- **Idempotência:** `criar`, `rotina_criar`, `rotina_filha_adicionar` fazem lookup por `(mensagem_origem_id, titulo[, pai])` antes do insert → devolvem o existente com `"idempotente": true`. Não é unique.
- **Retornos:** escrita `{success, id, resumo, tarefa|rotina, idempotente?}`; leitura plano com `id, titulo, descricao, status, prioridade, vencimento_em, data_local, hora_local, dia_inteiro, lista{id,nome}, responsavel{id,nome}|null, destinatarios[{id,nome}], rotina_id, competencia, parent_id, vinculo_tipo, vinculo_id, progresso_pai{feitas,total}|null, concluida_por{id,nome}|null, data_conclusao`.
- **Fuso:** entradas `date` são calendário SP; `data_local`/`hora_local` em SP; "hoje" = `(now() at time zone 'America/Sao_Paulo')::date`. **`current_date`/`now()::date` proibidos** (`maria_agenda_%` entra na varredura).
- **Grants:** E → `service_role, maria_operacional`; L → E + `maria_leitura`; helpers internos (`maria_agenda_assert`, `_item_json`, `_rotina_json`, `_audit`, `_hoje`) → `revoke all … from public, anon, authenticated` **sem** grant a papéis Maria (só owner executa, por dentro). Toda RPC: `revoke all … from public, anon, authenticated` explícito. **`proacl` nulo é falha.**
- **Migrations:** via MCP, versão do servidor no nome, aplicada nunca se edita. **Sem telefone** em arquivo: testes criam atores sintéticos com números fora do padrão `55…` (ex.: `9900000000001`), hash pela própria `maria_normalizar_numero`, dentro da transação.
- **Piso de 30 d das atrasadas fica** (resumo). Guards de `tarefas` seguem SECURITY INVOKER.
- Commits `feat:`/`test:`/`docs:` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; `git add` só dos arquivos da task.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<v>_maria_agenda_base.sql` | `maria_agenda_hoje`, `maria_agenda_assert`, `maria_agenda_pessoa_json`, `maria_agenda_item_json`, `maria_agenda_rotina_json`, `maria_agenda_audit` |
| `supabase/migrations/<v>_maria_agenda_leitura.sql` | `listar`, `detalhar`, `rotinas_listar` |
| `supabase/migrations/<v>_maria_agenda_tarefa_criar_editar.sql` | `criar`, `editar` |
| `supabase/migrations/<v>_maria_agenda_tarefa_estado.sql` | `remarcar`, `concluir`, `reabrir` |
| `supabase/migrations/<v>_maria_agenda_tarefa_cancelar_excluir.sql` | `cancelar`, `excluir` |
| `supabase/migrations/<v>_maria_agenda_rotina_criar_editar.sql` | `rotina_criar`, `rotina_editar` |
| `supabase/migrations/<v>_maria_agenda_rotina_filhas.sql` | `rotina_filha_adicionar`, `rotina_filha_editar`, `rotina_filha_remover` |
| `supabase/migrations/<v>_maria_agenda_rotina_ciclo.sql` | `rotina_pausar`, `rotina_reativar`, `rotina_encerrar` |
| `supabase/migrations/agenda_fase_b2.test.mjs` | estático: assinaturas, grants/revokes das 18 + helpers, hints, fuso, sem telefone |
| `supabase/tests/agenda/10_assert.sql` … `17_rotina_ciclo.sql` | comportamentais `begin … rollback` com atores sintéticos |
| `supabase/tests/agenda/_atores_sinteticos.sql` | fragmento colado no início de cada teste (cria os atores) |
| `Docs/handoffs/2026-09-01-agenda-maria.md` | STATUS → PRONTO; assinaturas finais; `proacl` real; migrations; evidência |
| `package.json` | `npm test` inclui `agenda_fase_b2.test.mjs` |

**Fragmento de atores sintéticos** (`supabase/tests/agenda/_atores_sinteticos.sql`, colado após `begin;` em todo teste 10–17):

```sql
-- Atores sinteticos (rollback apaga). Numeros ficticios fora do padrao 55...; hash pela funcao da casa.
insert into public.maria_whatsapp_atores (nome, papel, numero_hash, numero_last4, ativo, user_id) values
  ('T Owner',  'owner_full',                   encode(extensions.digest(public.maria_normalizar_numero('9900000000001'), 'sha256'), 'hex'), '0001', true, '41351a8b-68bf-48d5-a5d1-69c1a2848f5d'),
  ('T Rose',   'finance_ops_write_safe',       encode(extensions.digest(public.maria_normalizar_numero('9900000000002'), 'sha256'), 'hex'), '0002', true, 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'),
  ('T Ana',    'finance_assistant_write_safe', encode(extensions.digest(public.maria_normalizar_numero('9900000000003'), 'sha256'), 'hex'), '0003', true, '81305959-dc68-4f8e-b54f-dd055dabcfd4'),
  ('T Leitor', 'strategic_read_prepare',       encode(extensions.digest(public.maria_normalizar_numero('9900000000004'), 'sha256'), 'hex'), '0004', true, null),
  ('T Gov',    'gov_agent_tecnico',            encode(extensions.digest(public.maria_normalizar_numero('9900000000005'), 'sha256'), 'hex'), '0005', true, null);
```

> `maria_whatsapp_atores.user_id` é `UNIQUE`: os `user_id` de Rose/Ana/Luciano já estão nos atores reais (fase A). **Implementer:** antes do insert acima, dentro da transação, faça `update public.maria_whatsapp_atores set user_id = null where user_id in ('41351a8b-…','cf0e4bf0-…','81305959-…');` (rollback restaura). Se `maria_normalizar_numero` rejeitar o número sintético (raise), reporte com o erro exato — não troque por número real.

---

### Task 1: Base — `maria_agenda_assert` e helpers JSON/audit

**Files:**
- Create: `supabase/migrations/20260902100000_maria_agenda_base.sql`
- Create: `supabase/migrations/agenda_fase_b2.test.mjs`
- Create: `supabase/tests/agenda/_atores_sinteticos.sql`, `supabase/tests/agenda/10_assert.sql`

**Interfaces:**
- Consumes: `maria_assert_actor(text, text, text[]) returns maria_whatsapp_atores`; `maria_normalizar_numero(text)`; `maria_whatsapp_atores.user_id`; `tarefas_listas_membros`; `agenda_destinatarios(uuid)`; `user_profiles(id, nome)`; `maria_audit_log`.
- Produces (assinaturas exatas):
  - `maria_agenda_hoje() returns date` — hoje em SP.
  - `maria_agenda_papeis_escrita() returns text[]`, `maria_agenda_papeis_leitura() returns text[]`.
  - `maria_agenda_assert(p_ator_numero text, p_papel text, p_lista_id uuid, p_escrita boolean) returns maria_whatsapp_atores`.
  - `maria_agenda_listas_permitidas(p_actor maria_whatsapp_atores) returns uuid[]` — `null` = todas.
  - `maria_agenda_pessoa_json(p_user_id uuid) returns jsonb` — `{id,nome}` ou `null`.
  - `maria_agenda_item_json(p_tarefa_id uuid) returns jsonb` — item do handoff §5.
  - `maria_agenda_rotina_json(p_rotina_id uuid) returns jsonb` — molde + `filhas[]`.
  - `maria_agenda_audit(p_actor maria_whatsapp_atores, p_ator_numero text, p_canal text, p_texto_original text, p_motivo text, p_tabela text, p_entidade_tipo text, p_entidade_id uuid, p_operacao text, p_antes jsonb, p_depois jsonb) returns uuid`.

- [ ] **Step 1: Branch**

```bash
cd "D:/2025/CURSO_VIBE_CODING/dash-folha-pagamento" && git switch -c feat/agenda-fase-b2
```

- [ ] **Step 2: Teste estático (falha)**

Criar `supabase/migrations/agenda_fase_b2.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
function readBySuffix(suffix) {
  const f = readdirSync(dir).find((n) => n.endsWith(suffix));
  return f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
}
const base = readBySuffix('_maria_agenda_base.sql');
const leitura = readBySuffix('_maria_agenda_leitura.sql');
const criarEditar = readBySuffix('_maria_agenda_tarefa_criar_editar.sql');
const estado = readBySuffix('_maria_agenda_tarefa_estado.sql');
const cancExcl = readBySuffix('_maria_agenda_tarefa_cancelar_excluir.sql');
const rotCE = readBySuffix('_maria_agenda_rotina_criar_editar.sql');
const rotFilhas = readBySuffix('_maria_agenda_rotina_filhas.sql');
const rotCiclo = readBySuffix('_maria_agenda_rotina_ciclo.sql');
const todos = [base, leitura, criarEditar, estado, cancExcl, rotCE, rotFilhas, rotCiclo].join('\n');

const E = ['service_role', 'maria_operacional'];
const L = ['service_role', 'maria_operacional', 'maria_leitura'];
const esc = (s) => s.replace(/[()[\],]/g, (c) => `\\${c}`);
function grantsOk(sql, fnSig, roles) {
  assert.match(sql, new RegExp(`revoke all on function public\\.${esc(fnSig)} from public, anon, authenticated`, 'i'), `revoke ${fnSig}`);
  assert.match(sql, new RegExp(`grant execute on function public\\.${esc(fnSig)} to ${roles.join(', ')}`, 'i'), `grant ${fnSig}`);
}
function helperClosed(sql, fnSig) {
  assert.match(sql, new RegExp(`revoke all on function public\\.${esc(fnSig)} from public, anon, authenticated`, 'i'), `revoke ${fnSig}`);
  assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${esc(fnSig)}`, 'i'), `helper ${fnSig} nao deve ter grant`);
}

test('base: assert em duas portas, papeis, helpers fechados', () => {
  assert.match(base, /function public\.maria_agenda_assert\(p_ator_numero text, p_papel text, p_lista_id uuid, p_escrita boolean\)\s+returns public\.maria_whatsapp_atores/i);
  assert.match(base, /'owner_full','finance_ops_write_safe','finance_assistant_write_safe'/);
  assert.match(base, /'strategic_read_prepare','gov_agent_tecnico'/);
  assert.match(base, /ator sem usuario vinculado \(user_id\)\./);
  assert.match(base, /ator nao e membro da lista/);
  assert.match(base, /function public\.maria_agenda_item_json\(p_tarefa_id uuid\)/i);
  assert.match(base, /agenda_destinatarios\(/);
  assert.match(base, /'progresso_pai'/);
  assert.match(base, /function public\.maria_agenda_audit\(/i);
  assert.match(base, /'agenda'/);
  for (const h of ['maria_agenda_hoje()', 'maria_agenda_assert(text, text, uuid, boolean)', 'maria_agenda_pessoa_json(uuid)', 'maria_agenda_item_json(uuid)', 'maria_agenda_rotina_json(uuid)']) helperClosed(base, h);
});

test('leitura: 3 RPCs com grant L', () => {
  assert.match(leitura, /function public\.maria_agenda_listar\(p_ator_numero text, p_papel text, p_escopo text/i);
  assert.match(leitura, /p_busca text default null/i);
  assert.match(leitura, /'periodo'/);
  grantsOk(leitura, 'maria_agenda_listar(text, text, text, date, date, uuid, uuid, text, boolean, text)', L);
  grantsOk(leitura, 'maria_agenda_detalhar(text, text, uuid, text)', L);
  grantsOk(leitura, 'maria_agenda_rotinas_listar(text, text, uuid, text, text)', L);
});

test('tarefa: criar/editar idempotencia e espelho', () => {
  assert.match(criarEditar, /mensagem_origem_id = p_mensagem_origem_id and titulo = p_titulo/i);
  assert.match(criarEditar, /'idempotente', true/);
  assert.match(criarEditar, /campo gerido pela conta/);
  assert.match(criarEditar, /p_limpar_responsavel boolean default false/i);
  grantsOk(criarEditar, 'maria_agenda_criar(text, text, text, uuid, date, boolean, time, text, uuid, text, uuid, text, text, text, text, text)', E);
  grantsOk(criarEditar, 'maria_agenda_editar(text, text, uuid, text, text, text, uuid, uuid, boolean, text, text, text, text, text)', E);
});

test('tarefa: remarcar/concluir/reabrir com as regras do contrato', () => {
  assert.match(estado, /tarefa vinculada a conta a pagar: conclua pela baixa da conta\./);
  assert.match(estado, /maria_contas_dar_baixa\(p_conta_id=/);
  assert.match(estado, /pai com filhas pendentes:/);
  assert.match(estado, /filha de pai concluido: reabra o pai primeiro\./);
  assert.match(estado, /espelho de conta a pagar: remarque\/cancele a conta, nao a tarefa\./);
  assert.match(estado, /concluida_por = v_actor\.user_id/i);
  assert.doesNotMatch(estado, /update public\.tarefas[\s\S]{0,400}competencia\s*=/i);
  grantsOk(estado, 'maria_agenda_remarcar(text, text, uuid, date, time, text, text, text, text, text)', E);
  grantsOk(estado, 'maria_agenda_concluir(text, text, uuid, text, text, text, text, text)', E);
  grantsOk(estado, 'maria_agenda_reabrir(text, text, uuid, text, text, text, text, text)', E);
});

test('tarefa: cancelar/excluir', () => {
  assert.match(cancExcl, /instancia de rotina nao se exclui: use cancelar\./);
  assert.match(cancExcl, /pai com filha ativa nao pode ser excluido\/cancelado\./);
  assert.match(cancExcl, /delete from public\.tarefas where id = v_before\.id/i);
  grantsOk(cancExcl, 'maria_agenda_cancelar(text, text, uuid, text, text, text, text, text)', E);
  grantsOk(cancExcl, 'maria_agenda_excluir(text, text, uuid, text, text, text, text, text)', E);
});

test('rotina: criar/editar', () => {
  assert.match(rotCE, /agenda_materializar_corrente_e_proximo\('rpc'\)/);
  assert.match(rotCE, /lista da rotina nao e editavel: encerre e crie outra\./);
  assert.match(rotCE, /rotina encerrada nao aceita edicao nem reativacao\./);
  assert.match(rotCE, /informe dia_mes ou ultimo_dia/);
  grantsOk(rotCE, 'maria_agenda_rotina_criar(text, text, text, uuid, integer, boolean, text, time, boolean, text, uuid, text, date, text, text, text, text, text)', E);
  grantsOk(rotCE, 'maria_agenda_rotina_editar(text, text, uuid, text, text, integer, boolean, text, time, boolean, text, uuid, boolean, text, text, text, text, text)', E);
});

test('rotina: filhas preservam identidade; remover = encerrar', () => {
  assert.match(rotFilhas, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(rotFilhas, /mensagem_origem_id = p_mensagem_origem_id and titulo = p_titulo and parent_rotina_id = p_rotina_pai_id/i);
  assert.match(rotFilhas, /status = 'encerrada', encerrada_em = now\(\)/i);
  assert.doesNotMatch(rotFilhas, /delete from public\.agenda_rotinas/i);
  grantsOk(rotFilhas, 'maria_agenda_rotina_filha_adicionar(text, text, uuid, text, integer, boolean, text, text, uuid, text, text, text, text, text)', E);
  grantsOk(rotFilhas, 'maria_agenda_rotina_filha_editar(text, text, uuid, text, integer, boolean, text, text, uuid, boolean, text, text, text, text, text)', E);
  grantsOk(rotFilhas, 'maria_agenda_rotina_filha_remover(text, text, uuid, text, text, text, text, text)', E);
});

test('rotina: pausar/reativar/encerrar', () => {
  assert.match(rotCiclo, /competencia > date_trunc\('month', public\.maria_agenda_hoje\(\)\)::date/i);
  assert.match(rotCiclo, /status in \('pendente','em_andamento','adiada'\)/i);
  assert.doesNotMatch(rotCiclo, /delete from public\.agenda_rotinas/i);
  grantsOk(rotCiclo, 'maria_agenda_rotina_pausar(text, text, uuid, text, text, text, text, text)', E);
  grantsOk(rotCiclo, 'maria_agenda_rotina_reativar(text, text, uuid, text, text, text, text, text)', E);
  grantsOk(rotCiclo, 'maria_agenda_rotina_encerrar(text, text, uuid, text, text, text, text, text)', E);
});

test('fuso e telefone: nenhum current_date/now()::date; nenhum numero 55...', () => {
  assert.doesNotMatch(todos, /\bcurrent_date\b/i);
  assert.doesNotMatch(todos, /now\(\)::date/i);
  assert.doesNotMatch(todos, /\b55\d{10,11}\b/);
});

test('arquivos existem', () => {
  for (const [nome, txt] of Object.entries({ base, leitura, criarEditar, estado, cancExcl, rotCE, rotFilhas, rotCiclo })) assert.ok(txt.length > 0, `${nome} vazio/ausente`);
});
```

- [ ] **Step 3: Rodar e ver falhar** — `node --test --experimental-strip-types supabase/migrations/agenda_fase_b2.test.mjs` → tudo FAIL.

- [ ] **Step 4: Escrever a migration base**

Criar `supabase/migrations/20260902100000_maria_agenda_base.sql`:

```sql
-- Fase B2 — base das RPCs maria_agenda_*: autorizacao em duas portas, JSON dos itens, auditoria.
-- Helpers internos: sem grant a papeis Maria (so o owner executa, por dentro das RPCs security definer).

create or replace function public.maria_agenda_hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.maria_agenda_papeis_escrita() returns text[]
language sql immutable as $$ select array['owner_full','finance_ops_write_safe','finance_assistant_write_safe'] $$;

create or replace function public.maria_agenda_papeis_leitura() returns text[]
language sql immutable as $$ select array['owner_full','finance_ops_write_safe','finance_assistant_write_safe','strategic_read_prepare','gov_agent_tecnico'] $$;

-- Porta grossa (papel, via maria_assert_actor) + porta fina (lista, via tarefas_listas_membros).
-- owner_full passa. Ator com user_id precisa ser membro da lista. Ator sem user_id le tudo e nao escreve.
create or replace function public.maria_agenda_assert(p_ator_numero text, p_papel text, p_lista_id uuid, p_escrita boolean)
returns public.maria_whatsapp_atores
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_lista text;
begin
  v_actor := public.maria_assert_actor(
    p_ator_numero, p_papel,
    case when p_escrita then public.maria_agenda_papeis_escrita() else public.maria_agenda_papeis_leitura() end
  );
  if v_actor.papel = 'owner_full' then return v_actor; end if;
  if p_escrita and v_actor.user_id is null then
    raise exception 'ator sem usuario vinculado (user_id).' using errcode = '42501', hint = 'vincular maria_whatsapp_atores.user_id';
  end if;
  if p_lista_id is not null and v_actor.user_id is not null
     and not exists (select 1 from public.tarefas_listas_membros m where m.lista_id = p_lista_id and m.user_id = v_actor.user_id) then
    select nome into v_lista from public.tarefas_listas where id = p_lista_id;
    raise exception 'ator nao e membro da lista %.', coalesce(v_lista, p_lista_id::text) using errcode = '42501';
  end if;
  return v_actor;
end $$;

-- Listas que o ator pode ver/operar: null = todas (owner_full ou ator sem user_id na leitura).
create or replace function public.maria_agenda_listas_permitidas(p_actor public.maria_whatsapp_atores)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when p_actor.papel = 'owner_full' or p_actor.user_id is null then null
    else (select coalesce(array_agg(m.lista_id), array[]::uuid[]) from public.tarefas_listas_membros m where m.user_id = p_actor.user_id)
  end
$$;

create or replace function public.maria_agenda_pessoa_json(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_user_id is null then null
         else (select jsonb_build_object('id', p.id, 'nome', p.nome) from public.user_profiles p where p.id = p_user_id) end
$$;

-- Item de tarefa (handoff §5). Plano: pai e filhas sao itens iguais, ligados por parent_id.
create or replace function public.maria_agenda_item_json(p_tarefa_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.tarefas%rowtype; v_prog jsonb; v_dest jsonb; v_lista jsonb;
begin
  select * into t from public.tarefas where id = p_tarefa_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.user_id, 'nome', d.nome)), '[]'::jsonb) into v_dest from public.agenda_destinatarios(t.id) d;
  select jsonb_build_object('id', l.id, 'nome', l.nome) into v_lista from public.tarefas_listas l where l.id = t.lista_id;
  if exists (select 1 from public.tarefas f where f.parent_id = t.id) then
    select jsonb_build_object('feitas', count(*) filter (where f.status = 'concluida'), 'total', count(*) filter (where f.status <> 'cancelada'))
      into v_prog from public.tarefas f where f.parent_id = t.id;
  end if;
  return jsonb_build_object(
    'id', t.id, 'titulo', t.titulo, 'descricao', t.descricao, 'status', t.status, 'prioridade', t.prioridade,
    'vencimento_em', t.vencimento_em,
    'data_local', to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'hora_local', to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
    'dia_inteiro', coalesce(t.dia_inteiro, false),
    'lista', v_lista,
    'responsavel', public.maria_agenda_pessoa_json(t.responsavel_id),
    'destinatarios', v_dest,
    'rotina_id', t.rotina_id, 'competencia', t.competencia, 'parent_id', t.parent_id,
    'vinculo_tipo', t.vinculo_tipo, 'vinculo_id', t.vinculo_id,
    'progresso_pai', v_prog,
    'concluida_por', public.maria_agenda_pessoa_json(t.concluida_por),
    'data_conclusao', t.data_conclusao
  );
end $$;

-- Molde de rotina com filhas.
create or replace function public.maria_agenda_rotina_json(p_rotina_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.agenda_rotinas%rowtype; v_filhas jsonb; v_lista jsonb;
begin
  select * into r from public.agenda_rotinas where id = p_rotina_id;
  if not found then return null; end if;
  select jsonb_build_object('id', l.id, 'nome', l.nome) into v_lista from public.tarefas_listas l where l.id = r.lista_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'titulo', f.titulo, 'dia_mes', f.dia_mes, 'ultimo_dia', f.ultimo_dia,
           'se_cair_fim_de_semana', f.se_cair_fim_de_semana, 'hora', to_char(f.hora, 'HH24:MI'), 'dia_inteiro', f.dia_inteiro,
           'prioridade', f.prioridade, 'responsavel', public.maria_agenda_pessoa_json(f.responsavel_id),
           'status', f.status, 'vigencia_inicio', f.vigencia_inicio) order by f.ordem, f.titulo), '[]'::jsonb)
    into v_filhas from public.agenda_rotinas f where f.parent_rotina_id = r.id;
  return jsonb_build_object(
    'id', r.id, 'titulo', r.titulo, 'descricao', r.descricao, 'lista', v_lista, 'parent_rotina_id', r.parent_rotina_id,
    'frequencia', r.frequencia, 'dia_mes', r.dia_mes, 'ultimo_dia', r.ultimo_dia,
    'se_cair_fim_de_semana', r.se_cair_fim_de_semana, 'hora', to_char(r.hora, 'HH24:MI'), 'dia_inteiro', r.dia_inteiro,
    'prioridade', r.prioridade, 'responsavel', public.maria_agenda_pessoa_json(r.responsavel_id),
    'status', r.status, 'vigencia_inicio', r.vigencia_inicio, 'encerrada_em', r.encerrada_em, 'observacao', r.observacao,
    'filhas', v_filhas
  );
end $$;

-- Auditoria (mesma tabela das maria_contas_*). origem = 'agenda'.
create or replace function public.maria_agenda_audit(
  p_actor public.maria_whatsapp_atores, p_ator_numero text, p_canal text, p_texto_original text, p_motivo text,
  p_tabela text, p_entidade_tipo text, p_entidade_id uuid, p_operacao text, p_antes jsonb, p_depois jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4, papel, origem, canal, invoker_role,
    tabela, entidade_tipo, entidade_id, operacao, antes, depois, motivo, texto_original
  ) values (
    p_actor.nome, public.maria_normalizar_numero(p_ator_numero), p_actor.numero_hash, p_actor.numero_last4, p_actor.papel,
    'agenda', coalesce(nullif(p_canal, ''), 'whatsapp'),
    coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text),
    p_tabela, p_entidade_tipo, p_entidade_id, p_operacao, p_antes, p_depois, p_motivo, p_texto_original
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.maria_agenda_hoje() from public, anon, authenticated;
revoke all on function public.maria_agenda_papeis_escrita() from public, anon, authenticated;
revoke all on function public.maria_agenda_papeis_leitura() from public, anon, authenticated;
revoke all on function public.maria_agenda_assert(text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.maria_agenda_listas_permitidas(public.maria_whatsapp_atores) from public, anon, authenticated;
revoke all on function public.maria_agenda_pessoa_json(uuid) from public, anon, authenticated;
revoke all on function public.maria_agenda_item_json(uuid) from public, anon, authenticated;
revoke all on function public.maria_agenda_rotina_json(uuid) from public, anon, authenticated;
revoke all on function public.maria_agenda_audit(public.maria_whatsapp_atores, text, text, text, text, text, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
```

- [ ] **Step 5: Teste estático** — bloco `base:` PASS.

- [ ] **Step 6: Aplicar via MCP e espelhar** — `apply_migration(name = maria_agenda_base)`; versão; renomear. Verificar `proacl` dos 9 helpers: `{postgres=X/postgres}` (não nulo; **sem** service_role, anon, authenticated).

- [ ] **Step 7: Fragmento de atores + teste comportamental**

Criar `supabase/tests/agenda/_atores_sinteticos.sql` (conteúdo do bloco "Fragmento de atores sintéticos" acima, precedido do `update … set user_id = null` dos 3 atores reais).

Criar `supabase/tests/agenda/10_assert.sql`:

```sql
-- Rodar via MCP execute_sql. Esperado: 'PASS: 10_assert'.
begin;
-- <<< colar aqui o conteudo de _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_rh uuid; v_a public.maria_whatsapp_atores%rowtype; v_ok boolean; v_perm uuid[];
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  select id into v_rh  from public.tarefas_listas where lower(nome)='rh' and coalesce(is_smart,false)=false order by ordem limit 1;

  -- owner passa em tudo
  v_a := public.maria_agenda_assert('9900000000001', 'owner_full', v_rh, true);
  assert v_a.papel = 'owner_full', 'owner';
  assert public.maria_agenda_listas_permitidas(v_a) is null, 'owner ve todas';

  -- Rose (finance_ops) escreve em Financeiro, nao em RH
  v_a := public.maria_agenda_assert('9900000000002', 'finance_ops_write_safe', v_fin, true);
  v_ok := false;
  begin perform public.maria_agenda_assert('9900000000002', 'finance_ops_write_safe', v_rh, true);
  exception when others then v_ok := sqlstate = '42501' and sqlerrm like 'ator nao e membro da lista%'; end;
  assert v_ok, 'Rose em RH deveria ser recusada';
  v_perm := public.maria_agenda_listas_permitidas(v_a);
  assert v_fin = any(v_perm) and not (v_rh = any(v_perm)), 'permitidas da Rose = so Financeiro';

  -- Ana (assistant) escreve em RH e Financeiro
  perform public.maria_agenda_assert('9900000000003', 'finance_assistant_write_safe', v_rh, true);
  perform public.maria_agenda_assert('9900000000003', 'finance_assistant_write_safe', v_fin, true);

  -- Leitor sem user_id: le (qualquer lista), nao escreve
  v_a := public.maria_agenda_assert('9900000000004', 'strategic_read_prepare', v_fin, false);
  assert public.maria_agenda_listas_permitidas(v_a) is null, 'leitor sem user_id le tudo';
  v_ok := false;
  begin perform public.maria_agenda_assert('9900000000004', 'strategic_read_prepare', v_fin, true);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'leitor nao deveria escrever (papel)';

  -- Gov le
  perform public.maria_agenda_assert('9900000000005', 'gov_agent_tecnico', null, false);
  v_ok := false;
  begin perform public.maria_agenda_assert('9900000000005', 'gov_agent_tecnico', v_fin, true);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'gov nao escreve';

  -- papel nao confere / sender desconhecido
  v_ok := false;
  begin perform public.maria_agenda_assert('9900000000002', 'owner_full', v_fin, true);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'papel diferente do cadastrado deveria falhar';
  v_ok := false;
  begin perform public.maria_agenda_assert('9900000000099', 'owner_full', v_fin, false);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'sender desconhecido deveria falhar';
end $t$;
rollback;
select 'PASS: 10_assert' as resultado;
```

Run via MCP. Expected: `PASS: 10_assert`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_maria_agenda_base.sql supabase/migrations/agenda_fase_b2.test.mjs supabase/tests/agenda/_atores_sinteticos.sql supabase/tests/agenda/10_assert.sql
git commit -m "feat(agenda): base das RPCs da Maria — assert em duas portas, item/rotina json, auditoria"
```

---

### Task 2: Leitura — `listar`, `detalhar`, `rotinas_listar`

**Files:**
- Create: `supabase/migrations/20260902100100_maria_agenda_leitura.sql`
- Create: `supabase/tests/agenda/11_leitura.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `maria_agenda_listar(p_ator_numero text, p_papel text, p_escopo text, p_data date default null, p_data_fim date default null, p_lista_id uuid default null, p_responsavel_id uuid default null, p_busca text default null, p_incluir_concluidas boolean default false, p_canal text default 'whatsapp') returns jsonb` → `{success, escopo, data_inicio, data_fim, total, itens[], resumo}`.
  - `maria_agenda_detalhar(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_canal text default 'whatsapp') returns jsonb` → `{success, tarefa, filhas[], resumo}`.
  - `maria_agenda_rotinas_listar(p_ator_numero text, p_papel text, p_lista_id uuid default null, p_status text default null, p_canal text default 'whatsapp') returns jsonb` → `{success, total, rotinas[]}`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — leitura. Plano: pai e filhas com parent_id. Lista fora das permitidas nao aparece.

create or replace function public.maria_agenda_listar(
  p_ator_numero text, p_papel text, p_escopo text,
  p_data date default null, p_data_fim date default null, p_lista_id uuid default null,
  p_responsavel_id uuid default null, p_busca text default null, p_incluir_concluidas boolean default false,
  p_canal text default 'whatsapp'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_perm uuid[]; v_hoje date := public.maria_agenda_hoje();
  v_ini date; v_fim date; v_ini_ts timestamptz; v_fim_ts timestamptz;
  v_itens jsonb; v_total int; v_atr int;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, false);
  v_perm := public.maria_agenda_listas_permitidas(v_actor);
  if p_escopo not in ('dia','semana','atrasadas','periodo') then
    raise exception 'escopo invalido: use dia, semana, atrasadas ou periodo.' using errcode = '22023';
  end if;
  v_ini := coalesce(p_data, v_hoje);
  v_fim := case p_escopo when 'dia' then v_ini when 'semana' then v_ini + 6 when 'periodo' then coalesce(p_data_fim, v_ini) else v_hoje - 1 end;
  if p_escopo = 'periodo' and p_data_fim is null then
    raise exception 'periodo exige p_data_fim.' using errcode = '22023';
  end if;
  if v_fim < v_ini then raise exception 'data_fim anterior a data.' using errcode = '22023'; end if;
  v_ini_ts := (v_ini::timestamp) at time zone 'America/Sao_Paulo';
  v_fim_ts := ((v_fim + 1)::timestamp) at time zone 'America/Sao_Paulo';

  with base as (
    select t.*
      from public.tarefas t
     where (v_perm is null or t.lista_id = any(v_perm) or (t.lista_id is null and t.created_by = v_actor.user_id))
       and (p_lista_id is null or t.lista_id = p_lista_id)
       and (p_responsavel_id is null or t.responsavel_id = p_responsavel_id)
       and (p_busca is null or t.titulo ilike '%' || p_busca || '%')
       and t.vencimento_em is not null
       and case when p_escopo = 'atrasadas'
                then t.vencimento_em < v_ini_ts and t.status in ('pendente','em_andamento','adiada')
                else t.vencimento_em >= v_ini_ts and t.vencimento_em < v_fim_ts
                     and (p_incluir_concluidas or t.status in ('pendente','em_andamento','adiada')) end
  )
  select coalesce(jsonb_agg(public.maria_agenda_item_json(b.id) order by b.vencimento_em, b.titulo), '[]'::jsonb), count(*),
         count(*) filter (where b.vencimento_em < (v_hoje::timestamp at time zone 'America/Sao_Paulo') and b.status in ('pendente','em_andamento','adiada'))
    into v_itens, v_total, v_atr
    from base b;

  return jsonb_build_object(
    'success', true, 'escopo', p_escopo, 'data_inicio', v_ini, 'data_fim', v_fim, 'total', v_total, 'itens', v_itens,
    'resumo', format('%s tarefa(s) — escopo %s de %s a %s%s', v_total, p_escopo, to_char(v_ini,'DD/MM'), to_char(v_fim,'DD/MM'),
                     case when p_escopo <> 'atrasadas' and v_atr > 0 then format(' (%s atrasada(s))', v_atr) else '' end)
  );
end $$;

create or replace function public.maria_agenda_detalhar(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_canal text default 'whatsapp')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; t public.tarefas%rowtype; v_filhas jsonb;
begin
  select * into t from public.tarefas where id = p_tarefa_id;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, t.lista_id, false);
  select coalesce(jsonb_agg(public.maria_agenda_item_json(f.id) order by f.vencimento_em, f.titulo), '[]'::jsonb) into v_filhas
    from public.tarefas f where f.parent_id = t.id;
  return jsonb_build_object('success', true, 'tarefa', public.maria_agenda_item_json(t.id), 'filhas', v_filhas,
    'resumo', format('%s — %s, %s%s', t.titulo, t.status, to_char(t.vencimento_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
                     case when jsonb_array_length(v_filhas) > 0 then format(' (%s filhas)', jsonb_array_length(v_filhas)) else '' end));
end $$;

create or replace function public.maria_agenda_rotinas_listar(p_ator_numero text, p_papel text, p_lista_id uuid default null, p_status text default null, p_canal text default 'whatsapp')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_perm uuid[]; v_rot jsonb; v_total int;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, false);
  v_perm := public.maria_agenda_listas_permitidas(v_actor);
  if p_status is not null and p_status not in ('ativa','pausada','encerrada') then
    raise exception 'status invalido: use ativa, pausada ou encerrada.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(public.maria_agenda_rotina_json(r.id) order by r.ordem, r.titulo), '[]'::jsonb), count(*)
    into v_rot, v_total
    from public.agenda_rotinas r
   where r.parent_rotina_id is null
     and (v_perm is null or r.lista_id = any(v_perm))
     and (p_lista_id is null or r.lista_id = p_lista_id)
     and (p_status is null or r.status = p_status);
  return jsonb_build_object('success', true, 'total', v_total, 'rotinas', v_rot);
end $$;

revoke all on function public.maria_agenda_listar(text, text, text, date, date, uuid, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_listar(text, text, text, date, date, uuid, uuid, text, boolean, text) to service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_agenda_detalhar(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_detalhar(text, text, uuid, text) to service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_agenda_rotinas_listar(text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotinas_listar(text, text, uuid, text, text) to service_role, maria_operacional, maria_leitura;
```

- [ ] **Step 2: Teste estático** — `leitura:` PASS. **Step 3: Aplicar via MCP e espelhar** (`maria_agenda_leitura`); `proacl` das 3 = `{postgres, service_role, maria_operacional, maria_leitura}`.

- [ ] **Step 4: Teste comportamental**

Criar `supabase/tests/agenda/11_leitura.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_rh uuid; v_hoje date := public.maria_agenda_hoje(); v_meio timestamptz; v_r jsonb; v_t1 uuid; v_t2 uuid; v_ok boolean;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  select id into v_rh  from public.tarefas_listas where lower(nome)='rh' and coalesce(is_smart,false)=false order by ordem limit 1;
  v_meio := (v_hoje::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo';
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro) values ('L Conciliar 8641', 'pendente', v_fin, v_meio, true) returning id into v_t1;
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro) values ('L Entrevista', 'pendente', v_rh, v_meio, true) returning id into v_t2;
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro) values ('L Atrasada', 'pendente', v_fin, v_meio - interval '3 days', true);

  -- Rose: dia -> ve so Financeiro
  v_r := public.maria_agenda_listar('9900000000002', 'finance_ops_write_safe', 'dia', v_hoje);
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo','L Conciliar 8641')), 'Rose ve Conciliar';
  assert not ((v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo','L Entrevista'))), 'Rose nao ve RH';
  assert (v_r->>'resumo') like '%atrasada%', 'resumo cita atrasadas';
  -- busca
  v_r := public.maria_agenda_listar('9900000000002', 'finance_ops_write_safe', 'semana', v_hoje, null, null, null, '8641');
  assert (v_r->>'total')::int = 1, 'busca 8641 = 1';
  -- atrasadas
  v_r := public.maria_agenda_listar('9900000000002', 'finance_ops_write_safe', 'atrasadas');
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo','L Atrasada')), 'atrasadas';
  -- periodo exige fim
  v_ok := false;
  begin perform public.maria_agenda_listar('9900000000002', 'finance_ops_write_safe', 'periodo', v_hoje);
  exception when others then v_ok := sqlstate = '22023'; end;
  assert v_ok, 'periodo sem fim -> 22023';
  -- Ana ve as duas listas; leitor sem user_id ve tudo; Rose pedindo lista RH -> 42501
  v_r := public.maria_agenda_listar('9900000000003', 'finance_assistant_write_safe', 'dia', v_hoje);
  assert (v_r->>'total')::int >= 2, 'Ana ve Financeiro e RH';
  v_r := public.maria_agenda_listar('9900000000004', 'strategic_read_prepare', 'dia', v_hoje);
  assert (v_r->>'total')::int >= 2, 'leitor ve tudo';
  v_ok := false;
  begin perform public.maria_agenda_listar('9900000000002', 'finance_ops_write_safe', 'dia', v_hoje, null, v_rh);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'Rose pedindo RH -> 42501';
  -- detalhar traz destinatarios com nome
  v_r := public.maria_agenda_detalhar('9900000000002', 'finance_ops_write_safe', v_t1);
  assert jsonb_array_length(v_r->'tarefa'->'destinatarios') = 2, 'destinatarios Rose+Ana';
  assert (v_r->'tarefa'->'destinatarios'->0) ? 'nome', 'destinatario com nome';
  -- rotinas_listar
  v_r := public.maria_agenda_rotinas_listar('9900000000002', 'finance_ops_write_safe', v_fin, 'ativa');
  assert (v_r->>'total')::int = 10, 'rotinas ativas do Financeiro = 10';
  assert (v_r->'rotinas'->0) ? 'filhas', 'rotina com filhas';
end $t$;
rollback;
select 'PASS: 11_leitura' as resultado;
```

Run via MCP. Expected: `PASS: 11_leitura`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs de leitura da Maria — listar, detalhar, rotinas_listar`.

---

### Task 3: Tarefa — `criar`, `editar`

**Files:**
- Create: `supabase/migrations/20260902100200_maria_agenda_tarefa_criar_editar.sql`
- Create: `supabase/tests/agenda/12_criar_editar.sql`

**Interfaces:**
- Produces:
  - `maria_agenda_criar(p_ator_numero text, p_papel text, p_titulo text, p_lista_id uuid, p_data date, p_dia_inteiro boolean default true, p_hora time default '09:00', p_prioridade text default 'media', p_responsavel_id uuid default null, p_descricao text default null, p_parent_id uuid default null, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null) returns jsonb`
  - `maria_agenda_editar(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_titulo text default null, p_descricao text default null, p_prioridade text default null, p_lista_id uuid default null, p_responsavel_id uuid default null, p_limpar_responsavel boolean default false, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null) returns jsonb`

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — criar/editar tarefa manual. Idempotencia por (mensagem_origem_id, titulo).

create or replace function public.maria_agenda_criar(
  p_ator_numero text, p_papel text, p_titulo text, p_lista_id uuid, p_data date,
  p_dia_inteiro boolean default true, p_hora time default '09:00', p_prioridade text default 'media',
  p_responsavel_id uuid default null, p_descricao text default null, p_parent_id uuid default null,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_id uuid; v_titulo text := nullif(btrim(p_titulo), ''); v_venc timestamptz; v_pai public.tarefas%rowtype;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);
  if v_titulo is null then raise exception 'titulo obrigatorio.' using errcode = '22023'; end if;
  if p_data is null then raise exception 'data invalida.' using errcode = '22023'; end if;
  if p_prioridade not in ('baixa','media','alta','urgente') then raise exception 'prioridade invalida.' using errcode = '22023'; end if;
  if not exists (select 1 from public.tarefas_listas where id = p_lista_id) then raise exception 'lista nao encontrada.' using errcode = 'P0001'; end if;
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles where id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = 'P0001';
  end if;
  if p_parent_id is not null then
    select * into v_pai from public.tarefas where id = p_parent_id;
    if not found then raise exception 'pai nao encontrado.' using errcode = 'P0001'; end if;
    if v_pai.parent_id is not null then raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001'; end if;
    if v_pai.vinculo_tipo = 'conta_pagar' then raise exception 'espelho de conta a pagar nao pode ser pai.' using errcode = 'P0001'; end if;
  end if;
  -- idempotencia
  if p_mensagem_origem_id is not null then
    select id into v_id from public.tarefas where mensagem_origem_id = p_mensagem_origem_id and titulo = v_titulo
      and coalesce(parent_id::text,'') = coalesce(p_parent_id::text,'') order by created_at limit 1;
    if v_id is not null then
      return jsonb_build_object('success', true, 'id', v_id, 'idempotente', true, 'tarefa', public.maria_agenda_item_json(v_id),
        'resumo', format('Ja existia: %s', v_titulo));
    end if;
  end if;
  v_venc := (p_data::timestamp + coalesce(p_hora, time '09:00')) at time zone 'America/Sao_Paulo';
  insert into public.tarefas (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
                              responsavel_id, parent_id, lembrete_minutos, ordem, mensagem_origem_id, created_by)
  values (v_titulo, p_descricao, p_lista_id, 'geral', p_prioridade, array['maria'], v_venc, coalesce(p_dia_inteiro, true), 'pendente',
          p_responsavel_id, p_parent_id, array[30], 0, p_mensagem_origem_id, v_actor.user_id)
  returning id into v_id;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_id, 'agenda_criar', null, public.maria_agenda_item_json(v_id));
  return jsonb_build_object('success', true, 'id', v_id, 'tarefa', public.maria_agenda_item_json(v_id),
    'resumo', format('Criada: %s em %s%s', v_titulo, to_char(p_data,'DD/MM'), case when p_parent_id is not null then ' (filha de ' || v_pai.titulo || ')' else '' end));
end $$;

create or replace function public.maria_agenda_editar(
  p_ator_numero text, p_papel text, p_tarefa_id uuid,
  p_titulo text default null, p_descricao text default null, p_prioridade text default null,
  p_lista_id uuid default null, p_responsavel_id uuid default null, p_limpar_responsavel boolean default false,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype; v_after public.tarefas%rowtype;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if p_lista_id is not null and p_lista_id <> v_before.lista_id then
    perform public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);   -- precisa poder na lista destino
  end if;
  if p_prioridade is not null and p_prioridade not in ('baixa','media','alta','urgente') then raise exception 'prioridade invalida.' using errcode = '22023'; end if;
  if v_before.vinculo_tipo = 'conta_pagar' and (p_titulo is not null or p_descricao is not null or p_prioridade is not null or p_lista_id is not null) then
    raise exception 'campo gerido pela conta: em espelho de conta a pagar so o responsavel pode ser editado.' using errcode = 'P0001',
      hint = 'maria_contas_* para alterar a conta';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles where id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = 'P0001';
  end if;
  update public.tarefas set
    titulo = coalesce(nullif(btrim(p_titulo), ''), titulo),
    descricao = coalesce(p_descricao, descricao),
    prioridade = coalesce(p_prioridade, prioridade),
    lista_id = coalesce(p_lista_id, lista_id),
    responsavel_id = case when p_limpar_responsavel then null else coalesce(p_responsavel_id, responsavel_id) end,
    updated_at = now()
  where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_after.id, 'agenda_editar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'tarefa', public.maria_agenda_item_json(v_after.id), 'resumo', format('Editada: %s', v_after.titulo));
end $$;

revoke all on function public.maria_agenda_criar(text, text, text, uuid, date, boolean, time, text, uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_criar(text, text, text, uuid, date, boolean, time, text, uuid, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_editar(text, text, uuid, text, text, text, uuid, uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_editar(text, text, uuid, text, text, text, uuid, uuid, boolean, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `tarefa: criar/editar` PASS; aplicar (`maria_agenda_tarefa_criar_editar`); `proacl` das 2 = E.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/12_criar_editar.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_rh uuid; v_hoje date := public.maria_agenda_hoje(); v_r jsonb; v_id uuid; v_id2 uuid; v_ok boolean; v_esp uuid; v_audit_antes int;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  select id into v_rh  from public.tarefas_listas where lower(nome)='rh' and coalesce(is_smart,false)=false order by ordem limit 1;
  select count(*) into v_audit_antes from public.maria_audit_log where origem = 'agenda';

  -- criar + idempotencia
  v_r := public.maria_agenda_criar('9900000000002','finance_ops_write_safe','C Pedir extrato', v_fin, v_hoje + 2, true, null, 'alta', null, null, null, 'whatsapp', 'cria pedir extrato', null, 'msg-001');
  v_id := (v_r->>'id')::uuid;
  assert (v_r->>'success')::boolean and (v_r->'tarefa'->>'titulo') = 'C Pedir extrato', 'criar';
  assert (v_r->'tarefa'->>'data_local') = to_char(v_hoje + 2, 'YYYY-MM-DD'), 'data_local';
  v_r := public.maria_agenda_criar('9900000000002','finance_ops_write_safe','C Pedir extrato', v_fin, v_hoje + 2, true, null, 'alta', null, null, null, 'whatsapp', 'reenvio', null, 'msg-001');
  assert (v_r->>'idempotente')::boolean and (v_r->>'id')::uuid = v_id, 'idempotente devolve o existente';
  assert (select count(*) from public.tarefas where titulo = 'C Pedir extrato') = 1, 'nao duplicou';
  -- filha manual + profundidade
  v_r := public.maria_agenda_criar('9900000000002','finance_ops_write_safe','C filha', v_fin, v_hoje + 2, true, null, 'media', null, null, v_id);
  v_id2 := (v_r->>'id')::uuid;
  v_ok := false;
  begin perform public.maria_agenda_criar('9900000000002','finance_ops_write_safe','C neta', v_fin, v_hoje + 2, true, null, 'media', null, null, v_id2);
  exception when others then v_ok := sqlerrm like 'profundidade maxima 1%'; end;
  assert v_ok, 'neta recusada';
  -- Rose nao cria em RH
  v_ok := false;
  begin perform public.maria_agenda_criar('9900000000002','finance_ops_write_safe','C rh', v_rh, v_hoje);
  exception when others then v_ok := sqlstate = '42501'; end;
  assert v_ok, 'Rose em RH -> 42501';
  -- editar: limpar responsavel e flag
  v_r := public.maria_agenda_editar('9900000000002','finance_ops_write_safe', v_id, null, null, 'urgente', null, 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4');
  assert (v_r->'tarefa'->'responsavel'->>'nome') is not null and (v_r->'tarefa'->>'prioridade') = 'urgente', 'editar prioridade+responsavel';
  v_r := public.maria_agenda_editar('9900000000002','finance_ops_write_safe', v_id, null, null, null, null, null, true);
  assert (v_r->'tarefa'->'responsavel') = 'null'::jsonb, 'limpar responsavel';
  -- espelho: so responsavel
  select id into v_esp from public.tarefas where vinculo_tipo = 'conta_pagar' and lista_id = v_fin limit 1;
  if v_esp is not null then
    v_ok := false;
    begin perform public.maria_agenda_editar('9900000000002','finance_ops_write_safe', v_esp, 'novo titulo');
    exception when others then v_ok := sqlerrm like 'campo gerido pela conta%'; end;
    assert v_ok, 'espelho: titulo recusado';
    v_r := public.maria_agenda_editar('9900000000002','finance_ops_write_safe', v_esp, null, null, null, null, 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4');
    assert (v_r->'tarefa'->'responsavel'->>'id') = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', 'espelho: responsavel ok';
  end if;
  -- auditoria gravada
  assert (select count(*) from public.maria_audit_log where origem = 'agenda') >= v_audit_antes + 4, 'audit';
end $t$;
rollback;
select 'PASS: 12_criar_editar' as resultado;
```

Run via MCP. Expected: `PASS: 12_criar_editar`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs criar/editar da Maria (idempotencia por mensagem; espelho so responsavel)`.

---

### Task 4: Tarefa — `remarcar`, `concluir`, `reabrir`

**Files:**
- Create: `supabase/migrations/20260902100300_maria_agenda_tarefa_estado.sql`
- Create: `supabase/tests/agenda/13_estado.sql`

**Interfaces:**
- Produces: `maria_agenda_remarcar(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_nova_data date, p_hora time default null, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_concluir(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_reabrir(…mesma assinatura de concluir…)`. Todas `returns jsonb`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — remarcar/concluir/reabrir. Espelho conta_pagar e intocavel; pai nao auto-conclui; sem cascata.

create or replace function public.maria_agenda_recusar_espelho(p_t public.tarefas, p_acao text) returns void
language plpgsql immutable as $$
begin
  if p_t.vinculo_tipo = 'conta_pagar' then
    if p_acao = 'concluir' then
      raise exception 'tarefa vinculada a conta a pagar: conclua pela baixa da conta.' using errcode = 'P0001',
        hint = format('maria_contas_dar_baixa(p_conta_id=%s)', p_t.vinculo_id);
    else
      raise exception 'espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.' using errcode = 'P0001',
        hint = format('maria_contas_* (conta %s)', p_t.vinculo_id);
    end if;
  end if;
end $$;

create or replace function public.maria_agenda_remarcar(
  p_ator_numero text, p_papel text, p_tarefa_id uuid, p_nova_data date, p_hora time default null,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype; v_after public.tarefas%rowtype; v_hora time;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  perform public.maria_agenda_recusar_espelho(v_before, 'remarcar');
  if p_nova_data is null then raise exception 'data invalida.' using errcode = '22023'; end if;
  v_hora := coalesce(p_hora, (v_before.vencimento_em at time zone 'America/Sao_Paulo')::time, time '09:00');
  -- So vencimento_em. competencia e rotina_id intocados. Pai nao arrasta filhas.
  update public.tarefas set vencimento_em = (p_nova_data::timestamp + v_hora) at time zone 'America/Sao_Paulo', updated_at = now()
   where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_after.id, 'agenda_remarcar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'tarefa', public.maria_agenda_item_json(v_after.id),
    'resumo', format('Remarcada: %s de %s para %s', v_after.titulo, to_char(v_before.vencimento_em at time zone 'America/Sao_Paulo','DD/MM'), to_char(p_nova_data,'DD/MM')));
end $$;

create or replace function public.maria_agenda_concluir(
  p_ator_numero text, p_papel text, p_tarefa_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype; v_after public.tarefas%rowtype; v_pend text; v_item jsonb;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  perform public.maria_agenda_recusar_espelho(v_before, 'concluir');
  if v_before.status = 'concluida' then
    return jsonb_build_object('success', true, 'id', v_before.id, 'idempotente', true, 'tarefa', public.maria_agenda_item_json(v_before.id), 'resumo', format('Ja estava concluida: %s', v_before.titulo));
  end if;
  select string_agg(f.titulo, ', ' order by f.vencimento_em) into v_pend from public.tarefas f
   where f.parent_id = v_before.id and f.status in ('pendente','em_andamento','adiada');
  if v_pend is not null then
    raise exception 'pai com filhas pendentes: %.', v_pend using errcode = 'P0001', hint = 'conclua ou cancele as filhas';
  end if;
  update public.tarefas set status = 'concluida', data_conclusao = now(), concluida_por = v_actor.user_id, updated_at = now()
   where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_after.id, 'agenda_concluir', to_jsonb(v_before), to_jsonb(v_after));
  v_item := public.maria_agenda_item_json(v_after.id);
  return jsonb_build_object('success', true, 'id', v_after.id, 'tarefa', v_item,
    'progresso_pai', case when v_after.parent_id is not null then public.maria_agenda_item_json(v_after.parent_id)->'progresso_pai' end,
    'resumo', format('Concluída: %s%s', v_after.titulo,
      case when v_after.parent_id is not null then format(' — pai %s %s/%s', (select titulo from public.tarefas where id = v_after.parent_id),
        (public.maria_agenda_item_json(v_after.parent_id)->'progresso_pai'->>'feitas'), (public.maria_agenda_item_json(v_after.parent_id)->'progresso_pai'->>'total')) else '' end));
end $$;

create or replace function public.maria_agenda_reabrir(
  p_ator_numero text, p_papel text, p_tarefa_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype; v_after public.tarefas%rowtype; v_pai_status text;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  perform public.maria_agenda_recusar_espelho(v_before, 'reabrir');
  if v_before.status not in ('concluida','cancelada') then
    raise exception 'tarefa nao esta concluida nem cancelada.' using errcode = 'P0001';
  end if;
  if v_before.parent_id is not null then
    select status into v_pai_status from public.tarefas where id = v_before.parent_id;
    if v_pai_status = 'concluida' then
      raise exception 'filha de pai concluido: reabra o pai primeiro.' using errcode = 'P0001', hint = format('maria_agenda_reabrir(%s)', v_before.parent_id);
    end if;
  end if;
  update public.tarefas set status = 'pendente', data_conclusao = null, concluida_por = null, updated_at = now()
   where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_after.id, 'agenda_reabrir', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'tarefa', public.maria_agenda_item_json(v_after.id), 'resumo', format('Reaberta: %s', v_after.titulo));
end $$;

revoke all on function public.maria_agenda_recusar_espelho(public.tarefas, text) from public, anon, authenticated;
revoke all on function public.maria_agenda_remarcar(text, text, uuid, date, time, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_remarcar(text, text, uuid, date, time, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_concluir(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_concluir(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_reabrir(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_reabrir(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `tarefa: remarcar/concluir/reabrir` PASS; aplicar (`maria_agenda_tarefa_estado`); `proacl`.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/13_estado.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_hoje date := public.maria_agenda_hoje(); v_r jsonb; v_pai uuid; v_f1 uuid; v_f2 uuid; v_ok boolean; v_esp uuid; v_rot uuid; v_inst uuid;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  v_pai := (public.maria_agenda_criar('9900000000002','finance_ops_write_safe','E Pacote', v_fin, v_hoje + 5)->>'id')::uuid;
  v_f1  := (public.maria_agenda_criar('9900000000002','finance_ops_write_safe','E filha 1', v_fin, v_hoje + 1, true, null, 'media', null, null, v_pai)->>'id')::uuid;
  v_f2  := (public.maria_agenda_criar('9900000000002','finance_ops_write_safe','E filha 2', v_fin, v_hoje + 3, true, null, 'media', null, null, v_pai)->>'id')::uuid;

  -- concluir pai com filhas pendentes -> recusa listando
  v_ok := false;
  begin perform public.maria_agenda_concluir('9900000000002','finance_ops_write_safe', v_pai);
  exception when others then v_ok := sqlerrm like 'pai com filhas pendentes: E filha 1, E filha 2%'; end;
  assert v_ok, 'pai com filhas pendentes recusado com lista';
  -- concluir filha -> progresso 1/2, concluida_por = Rose
  v_r := public.maria_agenda_concluir('9900000000002','finance_ops_write_safe', v_f1);
  assert (v_r->'progresso_pai'->>'feitas')::int = 1 and (v_r->'progresso_pai'->>'total')::int = 2, 'progresso 1/2';
  assert (v_r->'tarefa'->'concluida_por'->>'id') = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', 'concluida_por Rose';
  assert (v_r->>'resumo') like 'Concluída: E filha 1 — pai E Pacote 1/2', 'resumo: ' || (v_r->>'resumo');
  -- remarcar o pai nao arrasta filha
  v_r := public.maria_agenda_remarcar('9900000000002','finance_ops_write_safe', v_pai, v_hoje + 10);
  assert (v_r->'tarefa'->>'data_local') = to_char(v_hoje + 10,'YYYY-MM-DD'), 'pai remarcado';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where id = v_f2) = v_hoje + 3, 'filha nao arrastada';
  -- concluir tudo; reabrir filha sob pai concluido -> recusa; reabrir pai -> ok; depois filha ok
  perform public.maria_agenda_concluir('9900000000002','finance_ops_write_safe', v_f2);
  perform public.maria_agenda_concluir('9900000000002','finance_ops_write_safe', v_pai);
  v_ok := false;
  begin perform public.maria_agenda_reabrir('9900000000002','finance_ops_write_safe', v_f1);
  exception when others then v_ok := sqlerrm like 'filha de pai concluido%'; end;
  assert v_ok, 'reabrir filha sob pai concluido recusado';
  perform public.maria_agenda_reabrir('9900000000002','finance_ops_write_safe', v_pai);
  v_r := public.maria_agenda_reabrir('9900000000002','finance_ops_write_safe', v_f1);
  assert (v_r->'tarefa'->>'status') = 'pendente' and (v_r->'tarefa'->'concluida_por') = 'null'::jsonb, 'reaberta limpa';
  -- espelho: concluir/remarcar recusam com hint da baixa
  select id into v_esp from public.tarefas where vinculo_tipo='conta_pagar' and status='pendente' and lista_id = v_fin limit 1;
  if v_esp is not null then
    v_ok := false;
    begin perform public.maria_agenda_concluir('9900000000002','finance_ops_write_safe', v_esp);
    exception when others then v_ok := sqlerrm like 'tarefa vinculada a conta a pagar%'; end;
    assert v_ok, 'espelho: concluir recusado';
    v_ok := false;
    begin perform public.maria_agenda_remarcar('9900000000002','finance_ops_write_safe', v_esp, v_hoje + 1);
    exception when others then v_ok := sqlerrm like 'espelho de conta a pagar%'; end;
    assert v_ok, 'espelho: remarcar recusado';
  end if;
  -- instancia de rotina: remarcar mantem competencia e rotina_id
  select t.id, t.rotina_id into v_inst, v_rot from public.tarefas t where t.rotina_id is not null and t.status = 'pendente' and t.lista_id = v_fin order by t.vencimento_em limit 1;
  if v_inst is not null then
    v_r := public.maria_agenda_remarcar('9900000000002','finance_ops_write_safe', v_inst, v_hoje + 20);
    assert (v_r->'tarefa'->>'rotina_id')::uuid = v_rot, 'rotina_id preservado';
    assert (select competencia from public.tarefas where id = v_inst) = (select competencia from public.tarefas where id = v_inst), 'competencia intocada';
  end if;
end $t$;
rollback;
select 'PASS: 13_estado' as resultado;
```

Run via MCP. Expected: `PASS: 13_estado`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs remarcar/concluir/reabrir (espelho recusa; pai nao auto-conclui; sem cascata)`.

---

### Task 5: Tarefa — `cancelar`, `excluir`

**Files:**
- Create: `supabase/migrations/20260902100400_maria_agenda_tarefa_cancelar_excluir.sql`
- Create: `supabase/tests/agenda/14_cancelar_excluir.sql`

**Interfaces:**
- Produces: `maria_agenda_cancelar(p_ator_numero text, p_papel text, p_tarefa_id uuid, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_excluir(…mesma…)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — cancelar (soft-delete de instancia de rotina; chave fica ocupada) e excluir (so manual).

create or replace function public.maria_agenda_cancelar(
  p_ator_numero text, p_papel text, p_tarefa_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype; v_after public.tarefas%rowtype;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  perform public.maria_agenda_recusar_espelho(v_before, 'cancelar');
  if exists (select 1 from public.tarefas f where f.parent_id = v_before.id and f.status in ('pendente','em_andamento','adiada')) then
    raise exception 'pai com filha ativa nao pode ser excluido/cancelado.' using errcode = 'P0001', hint = 'cancele ou conclua as filhas';
  end if;
  if v_before.status = 'cancelada' then
    return jsonb_build_object('success', true, 'id', v_before.id, 'idempotente', true, 'tarefa', public.maria_agenda_item_json(v_before.id), 'resumo', format('Ja estava cancelada: %s', v_before.titulo));
  end if;
  update public.tarefas set status = 'cancelada', updated_at = now() where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_after.id, 'agenda_cancelar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'tarefa', public.maria_agenda_item_json(v_after.id), 'resumo', format('Cancelada: %s', v_after.titulo));
end $$;

create or replace function public.maria_agenda_excluir(
  p_ator_numero text, p_papel text, p_tarefa_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.tarefas%rowtype;
begin
  select * into v_before from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  perform public.maria_agenda_recusar_espelho(v_before, 'excluir');
  if v_before.rotina_id is not null then
    raise exception 'instancia de rotina nao se exclui: use cancelar.' using errcode = 'P0001', hint = format('maria_agenda_cancelar(%s)', v_before.id);
  end if;
  if exists (select 1 from public.tarefas f where f.parent_id = v_before.id and f.status in ('pendente','em_andamento','adiada')) then
    raise exception 'pai com filha ativa nao pode ser excluido/cancelado.' using errcode = 'P0001', hint = 'cancele ou conclua as filhas';
  end if;
  -- Audit ANTES do delete: e o unico rastro.
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'tarefas', 'tarefa', v_before.id, 'agenda_excluir', to_jsonb(v_before), null);
  delete from public.tarefas where id = v_before.id;
  return jsonb_build_object('success', true, 'id', v_before.id, 'resumo', format('Excluída: %s', v_before.titulo));
end $$;

revoke all on function public.maria_agenda_cancelar(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_cancelar(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_excluir(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_excluir(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `tarefa: cancelar/excluir` PASS; aplicar (`maria_agenda_tarefa_cancelar_excluir`); `proacl`.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/14_cancelar_excluir.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_hoje date := public.maria_agenda_hoje(); v_r jsonb; v_pai uuid; v_f uuid; v_ok boolean; v_inst uuid; v_rot uuid; v_comp date;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  v_pai := (public.maria_agenda_criar('9900000000002','finance_ops_write_safe','X pai', v_fin, v_hoje + 5)->>'id')::uuid;
  v_f   := (public.maria_agenda_criar('9900000000002','finance_ops_write_safe','X filha', v_fin, v_hoje + 1, true, null, 'media', null, null, v_pai)->>'id')::uuid;
  -- excluir pai com filha ativa -> recusa; cancelar pai idem
  v_ok := false;
  begin perform public.maria_agenda_excluir('9900000000002','finance_ops_write_safe', v_pai);
  exception when others then v_ok := sqlerrm like 'pai com filha ativa%'; end;
  assert v_ok, 'excluir pai com filha ativa recusado';
  -- cancelar filha; depois excluir filha (manual) e pai
  v_r := public.maria_agenda_cancelar('9900000000002','finance_ops_write_safe', v_f);
  assert (v_r->'tarefa'->>'status') = 'cancelada', 'filha cancelada';
  v_r := public.maria_agenda_excluir('9900000000002','finance_ops_write_safe', v_f);
  assert not exists (select 1 from public.tarefas where id = v_f), 'filha excluida';
  assert exists (select 1 from public.maria_audit_log where origem='agenda' and operacao='agenda_excluir' and entidade_id = v_f), 'audit da exclusao';
  perform public.maria_agenda_excluir('9900000000002','finance_ops_write_safe', v_pai);
  -- instancia de rotina: excluir recusa; cancelar ocupa a chave (materializar nao recria)
  select t.id, t.rotina_id, t.competencia into v_inst, v_rot, v_comp from public.tarefas t where t.rotina_id is not null and t.status='pendente' and t.lista_id = v_fin and t.parent_id is not null order by t.vencimento_em limit 1;
  if v_inst is not null then
    v_ok := false;
    begin perform public.maria_agenda_excluir('9900000000002','finance_ops_write_safe', v_inst);
    exception when others then v_ok := sqlerrm like 'instancia de rotina nao se exclui%'; end;
    assert v_ok, 'instancia: excluir recusado';
    perform public.maria_agenda_cancelar('9900000000002','finance_ops_write_safe', v_inst);
    perform public.agenda_rotinas_materializar(v_comp, 'manual');
    assert (select count(*) from public.tarefas where rotina_id = v_rot and competencia = v_comp) = 1, 'cancelada nao ressuscita';
    assert (select status from public.tarefas where id = v_inst) = 'cancelada', 'status cancelada';
  end if;
end $t$;
rollback;
select 'PASS: 14_cancelar_excluir' as resultado;
```

Run via MCP. Expected: `PASS: 14_cancelar_excluir`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs cancelar (soft-delete de instancia) e excluir (so manual)`.

---

### Task 6: Rotina — `rotina_criar`, `rotina_editar`

**Files:**
- Create: `supabase/migrations/20260902100500_maria_agenda_rotina_criar_editar.sql`
- Create: `supabase/tests/agenda/15_rotina_criar_editar.sql`

**Interfaces:**
- Consumes: `agenda_materializar_corrente_e_proximo(text)` (B1).
- Produces: `maria_agenda_rotina_criar(p_ator_numero text, p_papel text, p_titulo text, p_lista_id uuid, p_dia_mes integer default null, p_ultimo_dia boolean default false, p_se_cair_fim_de_semana text default 'manter', p_hora time default '09:00', p_dia_inteiro boolean default true, p_prioridade text default 'media', p_responsavel_id uuid default null, p_descricao text default null, p_vigencia_inicio date default null, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_rotina_editar(p_ator_numero text, p_papel text, p_rotina_id uuid, p_titulo text default null, p_descricao text default null, p_dia_mes integer default null, p_ultimo_dia boolean default null, p_se_cair_fim_de_semana text default null, p_hora time default null, p_dia_inteiro boolean default null, p_prioridade text default null, p_responsavel_id uuid default null, p_limpar_responsavel boolean default false, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — molde: criar/editar. Criar materializa corrente+proximo na hora. Editar muda o futuro.

create or replace function public.maria_agenda_validar_rotina(p_dia_mes integer, p_ultimo_dia boolean, p_regra text, p_prioridade text) returns void
language plpgsql immutable as $$
begin
  if not coalesce(p_ultimo_dia, false) and p_dia_mes is null then raise exception 'informe dia_mes ou ultimo_dia.' using errcode = '22023'; end if;
  if p_dia_mes is not null and (p_dia_mes < 1 or p_dia_mes > 31) then raise exception 'dia_mes fora de 1..31.' using errcode = '22023'; end if;
  if p_regra is not null and p_regra not in ('manter','proximo_dia_util','dia_util_anterior') then raise exception 'regra de fim de semana invalida.' using errcode = '22023'; end if;
  if p_prioridade is not null and p_prioridade not in ('baixa','media','alta','urgente') then raise exception 'prioridade invalida.' using errcode = '22023'; end if;
end $$;

create or replace function public.maria_agenda_rotina_criar(
  p_ator_numero text, p_papel text, p_titulo text, p_lista_id uuid,
  p_dia_mes integer default null, p_ultimo_dia boolean default false, p_se_cair_fim_de_semana text default 'manter',
  p_hora time default '09:00', p_dia_inteiro boolean default true, p_prioridade text default 'media',
  p_responsavel_id uuid default null, p_descricao text default null, p_vigencia_inicio date default null,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_id uuid; v_titulo text := nullif(btrim(p_titulo), ''); v_mat jsonb; v_lista_cat text;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);
  if v_titulo is null then raise exception 'titulo obrigatorio.' using errcode = '22023'; end if;
  perform public.maria_agenda_validar_rotina(p_dia_mes, p_ultimo_dia, p_se_cair_fim_de_semana, p_prioridade);
  if not exists (select 1 from public.tarefas_listas where id = p_lista_id) then raise exception 'lista nao encontrada.' using errcode = 'P0001'; end if;
  if p_mensagem_origem_id is not null then
    select id into v_id from public.agenda_rotinas where mensagem_origem_id = p_mensagem_origem_id and titulo = v_titulo and parent_rotina_id is null order by created_at limit 1;
    if v_id is not null then
      return jsonb_build_object('success', true, 'id', v_id, 'idempotente', true, 'rotina', public.maria_agenda_rotina_json(v_id), 'resumo', format('Ja existia: %s', v_titulo));
    end if;
  end if;
  v_lista_cat := case when (select lower(nome) from public.tarefas_listas where id = p_lista_id) = 'rh' then 'rh' else 'financeiro' end;
  insert into public.agenda_rotinas (titulo, descricao, lista_id, categoria, prioridade, responsavel_id, dia_mes, ultimo_dia, se_cair_fim_de_semana,
                                     hora, dia_inteiro, status, vigencia_inicio, ordem, mensagem_origem_id, created_by)
  values (v_titulo, p_descricao, p_lista_id, v_lista_cat, coalesce(p_prioridade,'media'), p_responsavel_id, p_dia_mes, coalesce(p_ultimo_dia,false), coalesce(p_se_cair_fim_de_semana,'manter'),
          coalesce(p_hora, time '09:00'), coalesce(p_dia_inteiro, true), 'ativa', coalesce(p_vigencia_inicio, public.maria_agenda_hoje()),
          (select coalesce(max(ordem),0)+10 from public.agenda_rotinas where lista_id = p_lista_id), p_mensagem_origem_id, v_actor.user_id)
  returning id into v_id;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina', v_id, 'agenda_rotina_criar', null, public.maria_agenda_rotina_json(v_id));
  return jsonb_build_object('success', true, 'id', v_id, 'rotina', public.maria_agenda_rotina_json(v_id), 'materializacao', v_mat,
    'resumo', format('Rotina criada: %s (dia %s)', v_titulo, case when coalesce(p_ultimo_dia,false) then 'último' else p_dia_mes::text end));
end $$;

create or replace function public.maria_agenda_rotina_editar(
  p_ator_numero text, p_papel text, p_rotina_id uuid,
  p_titulo text default null, p_descricao text default null, p_dia_mes integer default null, p_ultimo_dia boolean default null,
  p_se_cair_fim_de_semana text default null, p_hora time default null, p_dia_inteiro boolean default null, p_prioridade text default null,
  p_responsavel_id uuid default null, p_limpar_responsavel boolean default false,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype; v_mat jsonb;
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if v_before.status = 'encerrada' then raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar'; end if;
  perform public.maria_agenda_validar_rotina(coalesce(p_dia_mes, v_before.dia_mes), coalesce(p_ultimo_dia, v_before.ultimo_dia), p_se_cair_fim_de_semana, p_prioridade);
  update public.agenda_rotinas set
    titulo = coalesce(nullif(btrim(p_titulo), ''), titulo), descricao = coalesce(p_descricao, descricao),
    dia_mes = case when coalesce(p_ultimo_dia, ultimo_dia) then null else coalesce(p_dia_mes, dia_mes) end,
    ultimo_dia = coalesce(p_ultimo_dia, ultimo_dia),
    se_cair_fim_de_semana = coalesce(p_se_cair_fim_de_semana, se_cair_fim_de_semana),
    hora = coalesce(p_hora, hora), dia_inteiro = coalesce(p_dia_inteiro, dia_inteiro), prioridade = coalesce(p_prioridade, prioridade),
    responsavel_id = case when p_limpar_responsavel then null else coalesce(p_responsavel_id, responsavel_id) end
  where id = v_before.id returning * into v_after;
  -- Molde muda o futuro: instancias existentes nao se movem (ON CONFLICT DO NOTHING no materializador). Mes corrente = remarcar.
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina', v_after.id, 'agenda_rotina_editar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'rotina', public.maria_agenda_rotina_json(v_after.id), 'materializacao', v_mat,
    'resumo', format('Rotina editada: %s (vale para os proximos meses)', v_after.titulo));
end $$;
-- lista_id nao e editavel por desenho (encerre e crie outra):
comment on function public.maria_agenda_rotina_editar(text, text, uuid, text, text, integer, boolean, text, time, boolean, text, uuid, boolean, text, text, text, text, text)
  is 'lista da rotina nao e editavel: encerre e crie outra.';

revoke all on function public.maria_agenda_validar_rotina(integer, boolean, text, text) from public, anon, authenticated;
revoke all on function public.maria_agenda_rotina_criar(text, text, text, uuid, integer, boolean, text, time, boolean, text, uuid, text, date, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_criar(text, text, text, uuid, integer, boolean, text, time, boolean, text, uuid, text, date, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_rotina_editar(text, text, uuid, text, text, integer, boolean, text, time, boolean, text, uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_editar(text, text, uuid, text, text, integer, boolean, text, time, boolean, text, uuid, boolean, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `rotina: criar/editar` PASS; aplicar (`maria_agenda_rotina_criar_editar`); `proacl`.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/15_rotina_criar_editar.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_hoje date := public.maria_agenda_hoje(); v_comp date := date_trunc('month', public.maria_agenda_hoje())::date; v_r jsonb; v_id uuid; v_ok boolean; v_venc date;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  -- criar: materializa corrente+proximo na hora; vigencia = hoje (nominal 28 >= hoje? depende do dia — usar ultimo_dia)
  v_r := public.maria_agenda_rotina_criar('9900000000002','finance_ops_write_safe','R Fechar caixa', v_fin, null, true, 'dia_util_anterior', '09:00', true, 'alta', null, null, null, 'whatsapp', 'cria rotina', null, 'msg-rot-1');
  v_id := (v_r->>'id')::uuid;
  assert (v_r->'rotina'->>'status') = 'ativa' and (v_r->'rotina'->>'ultimo_dia')::boolean, 'rotina criada';
  assert exists (select 1 from public.tarefas where rotina_id = v_id and competencia = v_comp), 'instancia do mes corrente criada na hora';
  assert exists (select 1 from public.tarefas where rotina_id = v_id and competencia = (v_comp + interval '1 month')::date), 'instancia do proximo mes';
  -- idempotente
  v_r := public.maria_agenda_rotina_criar('9900000000002','finance_ops_write_safe','R Fechar caixa', v_fin, null, true, 'dia_util_anterior', '09:00', true, 'alta', null, null, null, 'whatsapp', 'reenvio', null, 'msg-rot-1');
  assert (v_r->>'idempotente')::boolean and (v_r->>'id')::uuid = v_id, 'idempotente';
  -- validacao
  v_ok := false;
  begin perform public.maria_agenda_rotina_criar('9900000000002','finance_ops_write_safe','R sem dia', v_fin);
  exception when others then v_ok := sqlerrm like 'informe dia_mes ou ultimo_dia%'; end;
  assert v_ok, 'sem dia -> 22023';
  -- editar: muda dia pra 10 -> instancia existente do mes corrente NAO se move
  select (vencimento_em at time zone 'America/Sao_Paulo')::date into v_venc from public.tarefas where rotina_id = v_id and competencia = v_comp;
  v_r := public.maria_agenda_rotina_editar('9900000000002','finance_ops_write_safe', v_id, null, null, 10, false, 'manter');
  assert (v_r->'rotina'->>'dia_mes')::int = 10 and not (v_r->'rotina'->>'ultimo_dia')::boolean, 'editada';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_id and competencia = v_comp) = v_venc, 'instancia existente nao se move';
  -- encerrar e tentar editar -> recusa (usa update direto; a RPC de encerrar e da Task 8)
  update public.agenda_rotinas set status = 'encerrada', encerrada_em = now() where id = v_id;
  v_ok := false;
  begin perform public.maria_agenda_rotina_editar('9900000000002','finance_ops_write_safe', v_id, 'x');
  exception when others then v_ok := sqlerrm like 'rotina encerrada nao aceita%'; end;
  assert v_ok, 'encerrada recusa edicao';
end $t$;
rollback;
select 'PASS: 15_rotina_criar_editar' as resultado;
```

Run via MCP. Expected: `PASS: 15_rotina_criar_editar`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs rotina_criar/rotina_editar (materializa na hora; molde muda o futuro)`.

---

### Task 7: Rotina — `rotina_filha_adicionar`, `rotina_filha_editar`, `rotina_filha_remover`

**Files:**
- Create: `supabase/migrations/20260902100600_maria_agenda_rotina_filhas.sql`
- Create: `supabase/tests/agenda/16_rotina_filhas.sql`

**Interfaces:**
- Produces: `maria_agenda_rotina_filha_adicionar(p_ator_numero text, p_papel text, p_rotina_pai_id uuid, p_titulo text, p_dia_mes integer default null, p_ultimo_dia boolean default false, p_se_cair_fim_de_semana text default null, p_prioridade text default null, p_responsavel_id uuid default null, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_rotina_filha_editar(p_ator_numero text, p_papel text, p_rotina_filha_id uuid, p_titulo text default null, p_dia_mes integer default null, p_ultimo_dia boolean default null, p_se_cair_fim_de_semana text default null, p_prioridade text default null, p_responsavel_id uuid default null, p_limpar_responsavel boolean default false, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_rotina_filha_remover(p_ator_numero text, p_papel text, p_rotina_filha_id uuid, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — filhas do molde. adicionar copia do pai; editar preserva rotina_id; remover = encerrar (historico fica).

create or replace function public.maria_agenda_rotina_filha_adicionar(
  p_ator_numero text, p_papel text, p_rotina_pai_id uuid, p_titulo text,
  p_dia_mes integer default null, p_ultimo_dia boolean default false, p_se_cair_fim_de_semana text default null,
  p_prioridade text default null, p_responsavel_id uuid default null,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_pai public.agenda_rotinas%rowtype; v_id uuid; v_titulo text := nullif(btrim(p_titulo), ''); v_mat jsonb;
begin
  select * into v_pai from public.agenda_rotinas where id = p_rotina_pai_id for update;
  if not found then raise exception 'rotina pai nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_pai.lista_id, true);
  if v_pai.parent_rotina_id is not null then raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001'; end if;
  if v_pai.status = 'encerrada' then raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001'; end if;
  if v_titulo is null then raise exception 'titulo obrigatorio.' using errcode = '22023'; end if;
  perform public.maria_agenda_validar_rotina(p_dia_mes, p_ultimo_dia, p_se_cair_fim_de_semana, p_prioridade);
  if p_mensagem_origem_id is not null then
    select id into v_id from public.agenda_rotinas where mensagem_origem_id = p_mensagem_origem_id and titulo = p_titulo and parent_rotina_id = p_rotina_pai_id order by created_at limit 1;
    if v_id is not null then
      return jsonb_build_object('success', true, 'id', v_id, 'idempotente', true, 'rotina', public.maria_agenda_rotina_json(v_pai.id), 'resumo', format('Ja existia: %s', v_titulo));
    end if;
  end if;
  insert into public.agenda_rotinas (titulo, lista_id, categoria, prioridade, responsavel_id, dia_mes, ultimo_dia, se_cair_fim_de_semana, hora, dia_inteiro,
                                     status, vigencia_inicio, ordem, parent_rotina_id, mensagem_origem_id, created_by)
  values (v_titulo, v_pai.lista_id, v_pai.categoria, coalesce(p_prioridade, v_pai.prioridade), p_responsavel_id, p_dia_mes, coalesce(p_ultimo_dia,false),
          coalesce(p_se_cair_fim_de_semana, v_pai.se_cair_fim_de_semana), v_pai.hora, v_pai.dia_inteiro,
          'ativa', greatest(public.maria_agenda_hoje(), v_pai.vigencia_inicio),
          (select coalesce(max(ordem),0)+1 from public.agenda_rotinas where parent_rotina_id = v_pai.id), v_pai.id, p_mensagem_origem_id, v_actor.user_id)
  returning id into v_id;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina_filha', v_id, 'agenda_rotina_filha_adicionar', null, public.maria_agenda_rotina_json(v_pai.id));
  return jsonb_build_object('success', true, 'id', v_id, 'pai_id', v_pai.id, 'rotina', public.maria_agenda_rotina_json(v_pai.id), 'materializacao', v_mat,
    'resumo', format('Filha adicionada: %s em %s (dia %s)', v_titulo, v_pai.titulo, case when coalesce(p_ultimo_dia,false) then 'último' else p_dia_mes::text end));
end $$;

create or replace function public.maria_agenda_rotina_filha_editar(
  p_ator_numero text, p_papel text, p_rotina_filha_id uuid,
  p_titulo text default null, p_dia_mes integer default null, p_ultimo_dia boolean default null, p_se_cair_fim_de_semana text default null,
  p_prioridade text default null, p_responsavel_id uuid default null, p_limpar_responsavel boolean default false,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype; v_mat jsonb;
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_filha_id for update;
  if not found or v_before.parent_rotina_id is null then raise exception 'rotina filha nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if v_before.status = 'encerrada' then raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_validar_rotina(coalesce(p_dia_mes, v_before.dia_mes), coalesce(p_ultimo_dia, v_before.ultimo_dia), p_se_cair_fim_de_semana, p_prioridade);
  -- Preserva o id (a identidade da chave (rotina_id, competencia)); remover+adicionar abriria duplicata.
  update public.agenda_rotinas set
    titulo = coalesce(nullif(btrim(p_titulo), ''), titulo),
    dia_mes = case when coalesce(p_ultimo_dia, ultimo_dia) then null else coalesce(p_dia_mes, dia_mes) end,
    ultimo_dia = coalesce(p_ultimo_dia, ultimo_dia),
    se_cair_fim_de_semana = coalesce(p_se_cair_fim_de_semana, se_cair_fim_de_semana),
    prioridade = coalesce(p_prioridade, prioridade),
    responsavel_id = case when p_limpar_responsavel then null else coalesce(p_responsavel_id, responsavel_id) end
  where id = v_before.id returning * into v_after;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina_filha', v_after.id, 'agenda_rotina_filha_editar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'pai_id', v_after.parent_rotina_id, 'rotina', public.maria_agenda_rotina_json(v_after.parent_rotina_id), 'materializacao', v_mat,
    'resumo', format('Filha editada: %s (vale para os proximos meses)', v_after.titulo));
end $$;

create or replace function public.maria_agenda_rotina_filha_remover(
  p_ator_numero text, p_papel text, p_rotina_filha_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype; v_canc int;
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_filha_id for update;
  if not found or v_before.parent_rotina_id is null then raise exception 'rotina filha nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  -- Remover = encerrar a filha (FK restrict: instancias passadas referenciam). Pendentes de competencia futura -> canceladas.
  update public.agenda_rotinas set status = 'encerrada', encerrada_em = now() where id = v_before.id returning * into v_after;
  update public.tarefas set status = 'cancelada', updated_at = now()
   where rotina_id = v_before.id and status in ('pendente','em_andamento','adiada')
     and competencia > date_trunc('month', public.maria_agenda_hoje())::date;
  get diagnostics v_canc = row_count;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina_filha', v_after.id, 'agenda_rotina_filha_remover', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'pai_id', v_after.parent_rotina_id, 'rotina', public.maria_agenda_rotina_json(v_after.parent_rotina_id),
    'instancias_futuras_canceladas', v_canc, 'resumo', format('Filha removida (encerrada): %s; %s instancia(s) futura(s) cancelada(s)', v_after.titulo, v_canc));
end $$;

revoke all on function public.maria_agenda_rotina_filha_adicionar(text, text, uuid, text, integer, boolean, text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_filha_adicionar(text, text, uuid, text, integer, boolean, text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_rotina_filha_editar(text, text, uuid, text, integer, boolean, text, text, uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_filha_editar(text, text, uuid, text, integer, boolean, text, text, uuid, boolean, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_rotina_filha_remover(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_filha_remover(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `rotina: filhas` PASS; aplicar (`maria_agenda_rotina_filhas`); `proacl`.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/16_rotina_filhas.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_comp date := date_trunc('month', public.maria_agenda_hoje())::date; v_prox date; v_r jsonb; v_pai uuid; v_f uuid; v_ok boolean; v_inst uuid;
begin
  v_prox := (v_comp + interval '1 month')::date;
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  v_pai := (public.maria_agenda_rotina_criar('9900000000002','finance_ops_write_safe','F Pacote', v_fin, 5, false, 'proximo_dia_util')->>'id')::uuid;
  -- adicionar filha: copia lista/regra/hora do pai; materializa
  v_r := public.maria_agenda_rotina_filha_adicionar('9900000000002','finance_ops_write_safe', v_pai, 'F filha 20', 20, false, null, null, null, 'whatsapp', null, null, 'msg-f-1');
  v_f := (v_r->>'id')::uuid;
  assert (select se_cair_fim_de_semana from public.agenda_rotinas where id = v_f) = 'proximo_dia_util', 'regra copiada do pai';
  assert exists (select 1 from public.tarefas where rotina_id = v_f and competencia = v_prox), 'filha materializada no proximo mes';
  -- idempotente por (msg, titulo, pai)
  v_r := public.maria_agenda_rotina_filha_adicionar('9900000000002','finance_ops_write_safe', v_pai, 'F filha 20', 20, false, null, null, null, 'whatsapp', null, null, 'msg-f-1');
  assert (v_r->>'idempotente')::boolean and (v_r->>'id')::uuid = v_f, 'idempotente';
  -- filha de filha -> recusa
  v_ok := false;
  begin perform public.maria_agenda_rotina_filha_adicionar('9900000000002','finance_ops_write_safe', v_f, 'F neta', 21);
  exception when others then v_ok := sqlerrm like 'profundidade maxima 1%'; end;
  assert v_ok, 'neta recusada';
  -- editar filha preserva id; instancia existente do proximo mes nao se move
  select id into v_inst from public.tarefas where rotina_id = v_f and competencia = v_prox;
  v_r := public.maria_agenda_rotina_filha_editar('9900000000002','finance_ops_write_safe', v_f, null, 25);
  assert (v_r->>'id')::uuid = v_f, 'id preservado';
  assert (select id from public.tarefas where rotina_id = v_f and competencia = v_prox) = v_inst, 'instancia existente mantida';
  -- remover = encerrar; instancia futura cancelada; molde continua existindo
  v_r := public.maria_agenda_rotina_filha_remover('9900000000002','finance_ops_write_safe', v_f);
  assert (select status from public.agenda_rotinas where id = v_f) = 'encerrada', 'filha encerrada';
  assert (select status from public.tarefas where id = v_inst) = 'cancelada', 'instancia futura cancelada';
  assert (v_r->>'instancias_futuras_canceladas')::int >= 1, 'contagem';
  assert exists (select 1 from public.agenda_rotinas where id = v_f), 'molde nao apagado';
end $t$;
rollback;
select 'PASS: 16_rotina_filhas' as resultado;
```

Run via MCP. Expected: `PASS: 16_rotina_filhas`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs de filhas da rotina (adicionar copia do pai; editar preserva id; remover = encerrar)`.

---

### Task 8: Rotina — `rotina_pausar`, `rotina_reativar`, `rotina_encerrar`

**Files:**
- Create: `supabase/migrations/20260902100700_maria_agenda_rotina_ciclo.sql`
- Create: `supabase/tests/agenda/17_rotina_ciclo.sql`

**Interfaces:**
- Produces: `maria_agenda_rotina_pausar(p_ator_numero text, p_papel text, p_rotina_id uuid, p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null, p_mensagem_origem_id text default null, p_canal_origem text default null)`; `maria_agenda_rotina_reativar(…mesma…)`; `maria_agenda_rotina_encerrar(…mesma…)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fase B2 — ciclo do molde. Pausar/reativar (pai = pacote inteiro; filha = so ela). Encerrar nunca apaga.

create or replace function public.maria_agenda_rotina_pausar(
  p_ator_numero text, p_papel text, p_rotina_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype;
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if v_before.status = 'encerrada' then raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001'; end if;
  if v_before.status = 'pausada' then
    return jsonb_build_object('success', true, 'id', v_before.id, 'idempotente', true, 'rotina', public.maria_agenda_rotina_json(coalesce(v_before.parent_rotina_id, v_before.id)), 'resumo', format('Ja estava pausada: %s', v_before.titulo));
  end if;
  update public.agenda_rotinas set status = 'pausada' where id = v_before.id returning * into v_after;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina', v_after.id, 'agenda_rotina_pausar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'rotina', public.maria_agenda_rotina_json(coalesce(v_after.parent_rotina_id, v_after.id)),
    'resumo', format('Pausada: %s%s', v_after.titulo, case when v_after.parent_rotina_id is null then ' (pacote inteiro deixa de materializar)' else '' end));
end $$;

create or replace function public.maria_agenda_rotina_reativar(
  p_ator_numero text, p_papel text, p_rotina_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype; v_mat jsonb;
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if v_before.status = 'encerrada' then raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar'; end if;
  if v_before.status = 'ativa' then
    return jsonb_build_object('success', true, 'id', v_before.id, 'idempotente', true, 'rotina', public.maria_agenda_rotina_json(coalesce(v_before.parent_rotina_id, v_before.id)), 'resumo', format('Ja estava ativa: %s', v_before.titulo));
  end if;
  update public.agenda_rotinas set status = 'ativa' where id = v_before.id returning * into v_after;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina', v_after.id, 'agenda_rotina_reativar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'rotina', public.maria_agenda_rotina_json(coalesce(v_after.parent_rotina_id, v_after.id)), 'materializacao', v_mat, 'resumo', format('Reativada: %s', v_after.titulo));
end $$;

create or replace function public.maria_agenda_rotina_encerrar(
  p_ator_numero text, p_papel text, p_rotina_id uuid,
  p_canal text default 'whatsapp', p_texto_original text default null, p_motivo text default null,
  p_mensagem_origem_id text default null, p_canal_origem text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_before public.agenda_rotinas%rowtype; v_after public.agenda_rotinas%rowtype; v_canc int; v_ids uuid[];
begin
  select * into v_before from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, v_before.lista_id, true);
  if v_before.status = 'encerrada' then
    return jsonb_build_object('success', true, 'id', v_before.id, 'idempotente', true, 'rotina', public.maria_agenda_rotina_json(coalesce(v_before.parent_rotina_id, v_before.id)), 'resumo', format('Ja estava encerrada: %s', v_before.titulo));
  end if;
  -- Nunca apaga: encerra o molde (e as filhas, se for pai); cancela so instancias pendentes de competencia FUTURA.
  select array_agg(id) into v_ids from public.agenda_rotinas where id = v_before.id or parent_rotina_id = v_before.id;
  update public.agenda_rotinas set status = 'encerrada', encerrada_em = now() where id = any(v_ids) and status <> 'encerrada';
  select * into v_after from public.agenda_rotinas where id = v_before.id;
  update public.tarefas set status = 'cancelada', updated_at = now()
   where rotina_id = any(v_ids) and status in ('pendente','em_andamento','adiada')
     and competencia > date_trunc('month', public.maria_agenda_hoje())::date;
  get diagnostics v_canc = row_count;
  perform public.maria_agenda_audit(v_actor, p_ator_numero, p_canal, p_texto_original, p_motivo, 'agenda_rotinas', 'rotina', v_after.id, 'agenda_rotina_encerrar', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', v_after.id, 'rotina', public.maria_agenda_rotina_json(coalesce(v_after.parent_rotina_id, v_after.id)),
    'instancias_futuras_canceladas', v_canc, 'resumo', format('Encerrada: %s; %s instancia(s) futura(s) cancelada(s); historico preservado', v_after.titulo, v_canc));
end $$;

revoke all on function public.maria_agenda_rotina_pausar(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_pausar(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_rotina_reativar(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_reativar(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
revoke all on function public.maria_agenda_rotina_encerrar(text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.maria_agenda_rotina_encerrar(text, text, uuid, text, text, text, text, text) to service_role, maria_operacional;
```

- [ ] **Step 2–3:** estático `rotina: pausar/reativar/encerrar` PASS (e agora **todos** os blocos, inclusive `arquivos existem`); aplicar (`maria_agenda_rotina_ciclo`); `proacl`.

- [ ] **Step 4: Teste comportamental** — `supabase/tests/agenda/17_rotina_ciclo.sql`:

```sql
begin;
-- <<< colar _atores_sinteticos.sql >>>
do $t$
declare v_fin uuid; v_comp date := date_trunc('month', public.maria_agenda_hoje())::date; v_prox date; v_r jsonb; v_pai uuid; v_f uuid; v_ok boolean; v_futuro date;
begin
  v_prox := (v_comp + interval '1 month')::date; v_futuro := (v_comp + interval '2 month')::date;
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  v_pai := (public.maria_agenda_rotina_criar('9900000000002','finance_ops_write_safe','P Pacote', v_fin, 3)->>'id')::uuid;
  v_f := (public.maria_agenda_rotina_filha_adicionar('9900000000002','finance_ops_write_safe', v_pai, 'P filha', 15)->>'id')::uuid;
  -- pausar pai -> materializar mes +2 nao cria nada do pacote
  v_r := public.maria_agenda_rotina_pausar('9900000000002','finance_ops_write_safe', v_pai);
  assert (v_r->'rotina'->>'status') = 'pausada', 'pausada';
  perform public.agenda_rotinas_materializar(v_futuro, 'manual');
  assert not exists (select 1 from public.tarefas where rotina_id in (v_pai, v_f) and competencia = v_futuro), 'pacote pausado nao materializa';
  -- reativar -> materializa corrente+proximo (ja existiam); mes +2 so no cron -> continua sem
  v_r := public.maria_agenda_rotina_reativar('9900000000002','finance_ops_write_safe', v_pai);
  assert (v_r->'rotina'->>'status') = 'ativa' and (v_r ? 'materializacao'), 'reativada';
  -- pausar so a filha: pai continua
  perform public.maria_agenda_rotina_pausar('9900000000002','finance_ops_write_safe', v_f);
  perform public.agenda_rotinas_materializar(v_futuro, 'manual');
  assert exists (select 1 from public.tarefas where rotina_id = v_pai and competencia = v_futuro), 'pai materializa com filha pausada';
  assert not exists (select 1 from public.tarefas where rotina_id = v_f and competencia = v_futuro), 'filha pausada nao';
  perform public.maria_agenda_rotina_reativar('9900000000002','finance_ops_write_safe', v_f);
  -- encerrar: cancela pendentes de competencia futura (proximo e +2), mantem corrente; molde e filhas encerrados; nada apagado
  v_r := public.maria_agenda_rotina_encerrar('9900000000002','finance_ops_write_safe', v_pai);
  assert (select status from public.agenda_rotinas where id = v_pai) = 'encerrada' and (select status from public.agenda_rotinas where id = v_f) = 'encerrada', 'molde+filha encerrados';
  assert (select count(*) from public.tarefas where rotina_id in (v_pai, v_f) and competencia > v_comp and status <> 'cancelada') = 0, 'futuras canceladas';
  assert (select count(*) from public.tarefas where rotina_id = v_pai and competencia = v_comp and status = 'pendente') = 1, 'corrente preservada';
  assert (v_r->>'instancias_futuras_canceladas')::int >= 2, 'contagem futuras';
  assert exists (select 1 from public.agenda_rotinas where id = v_pai), 'nunca apaga';
  -- encerrada: reativar recusa; encerrar de novo e idempotente
  v_ok := false;
  begin perform public.maria_agenda_rotina_reativar('9900000000002','finance_ops_write_safe', v_pai);
  exception when others then v_ok := sqlerrm like 'rotina encerrada nao aceita%'; end;
  assert v_ok, 'reativar encerrada recusado';
  v_r := public.maria_agenda_rotina_encerrar('9900000000002','finance_ops_write_safe', v_pai);
  assert (v_r->>'idempotente')::boolean, 'encerrar idempotente';
end $t$;
rollback;
select 'PASS: 17_rotina_ciclo' as resultado;
```

Run via MCP. Expected: `PASS: 17_rotina_ciclo`.

- [ ] **Step 5: Commit** — `feat(agenda): RPCs pausar/reativar/encerrar (pacote inteiro; futuras canceladas; nunca apaga)`.

---

### Task 9: Verificação final, `proacl`, `npm test` e handoff PRONTO

**Files:**
- Modify: `package.json` (`npm test` inclui `agenda_fase_b2.test.mjs`)
- Modify: `Docs/handoffs/2026-09-01-agenda-maria.md` (STATUS → PRONTO; §4 assinaturas finais; §9 saída real; §14 checklist)

- [ ] **Step 1: `proacl` das 18 + helpers (produção)**

```sql
select p.proname, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'maria\_agenda\_%' escape '\'
 order by p.proname;
```

Expected: **27 linhas** (18 RPCs + 9 helpers: `hoje, papeis_escrita, papeis_leitura, assert, listas_permitidas, pessoa_json, item_json, rotina_json, audit, recusar_espelho, validar_rotina` — são 11 helpers; total **29**). Todas com `proacl` **não nulo**: RPCs E = `{postgres=X/postgres,service_role=X/postgres,maria_operacional=X/postgres}`; RPCs L = E + `maria_leitura=X/postgres`; helpers = `{postgres=X/postgres}`. **Nenhuma** entrada `=X/` sem nome, `anon` ou `authenticated`. Colar a saída no handoff §9.

- [ ] **Step 2: Assinaturas finais (produção)**

```sql
select p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as retorno
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'maria\_agenda\_%' escape '\'
   and p.proname not in ('maria_agenda_hoje','maria_agenda_papeis_escrita','maria_agenda_papeis_leitura','maria_agenda_assert','maria_agenda_listas_permitidas','maria_agenda_pessoa_json','maria_agenda_item_json','maria_agenda_rotina_json','maria_agenda_audit','maria_agenda_recusar_espelho','maria_agenda_validar_rotina')
 order by p.proname;
```

Expected: 18 linhas. Colar no handoff §4 como "Assinaturas finais (produção)".

- [ ] **Step 3: Fuso + varredura**

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and (proname like 'agenda\_%' escape '\' or proname like 'maria\_agenda\_%' escape '\')
   and (prosrc ~* '\mcurrent_date\M' or prosrc ~* 'now\(\)::date');
```
Expected: 0 linhas.

- [ ] **Step 4: Suíte** — `package.json`: acrescentar `supabase/migrations/agenda_fase_b2.test.mjs` ao script `test`. `npm test` → tudo verde (49 + blocos da B2). `npm run typecheck` limpo. Rodar de novo, via MCP, os 8 comportamentais 10–17 (todos `PASS`).

- [ ] **Step 5: Handoff → PRONTO**

Em `Docs/handoffs/2026-09-01-agenda-maria.md`:
- Banner: `> **STATUS: PRONTO — <data>.**` + "As 18 RPCs existem em produção com os grants abaixo; pode inscrever na allowlist." (substituir o parágrafo "Nada abaixo existe no banco ainda…").
- §4: acrescentar subseção **4.7 Assinaturas finais (produção)** com a saída do Step 2 (uma linha por RPC, `proname(args) returns jsonb`), e a nota sobre a ordem (ator primeiro, domínio, depois `p_canal`, `p_texto_original`, `p_motivo`, `p_mensagem_origem_id`, `p_canal_origem`; chamada por nome).
- §3: nota "porta fina: ator **sem** `user_id` lê tudo e não escreve" (já está) + `gov_agent_tecnico` leitura (já está).
- §9: colar a saída real do `proacl` (Step 1).
- §14: marcar os checkboxes: status PRONTO; assinaturas; `proacl`; migrations (`<versões>` das 8 da B2 + as 5 da B1); evidência (`npm test` totais; `PASS` dos 8 SQL); contagens em produção (0 duplicatas em `(rotina_id, competencia)` e `(vinculo_tipo, vinculo_id)`; instâncias set+out; `agenda_materializacoes` sem erros). O item "Financeiro Grupo LA Music recebeu o digest" fica pro lado da Maria marcar.
- §12: "Seed aplicado na B1" com as contagens (10/22/4).

Commit: `docs(agenda): handoff PRONTO — 18 RPCs maria_agenda_* em producao, assinaturas e proacl reais`.

- [ ] **Step 6: Fechar a branch** — `superpowers:finishing-a-development-branch` (merge é decisão do Alf). Após o merge, enviar o handoff PRONTO ao Alf (SendUserFile) — o lado da Maria copia.

---

## Self-review

**Cobertura do contrato (handoff §4–§6) e da spec §7:** as 18 RPCs nomeadas — leitura (T2), tarefa criar/editar (T3), remarcar/concluir/reabrir (T4), cancelar/excluir (T5), rotina_criar/editar (T6), filha_adicionar/editar/remover (T7), pausar/reativar/encerrar (T8) — com os parâmetros de domínio do handoff (§4.3–4.5), `busca` + `periodo` em `listar`, idempotência por `(mensagem_origem_id, titulo[, pai])` (T3, T6, T7), retornos com `{id,nome}` e `resumo` (helpers T1), catálogo de erros §6 (mensagens e hints verbatim; `22023` `escopo invalido`/`data invalida`/`dia_mes fora de 1..31`/`regra de fim de semana invalida`/`informe dia_mes ou ultimo_dia`; `P0001` os 8 do catálogo; `42501` os 3), autorização §3 (T1), grants §4.2 e `proacl` §9 (cada task + T9), varredura de fuso (T9), handoff PRONTO §14 (T9). Requisitos do Alf: espelho `conta_pagar` recusa concluir/cancelar/excluir/remarcar com hint `maria_contas_dar_baixa` (T4/T5 via `maria_agenda_recusar_espelho`); piso de 30 d intocado (nenhuma task toca `agenda_resumo_usuario`).

**Decisões que o plano fixa e o handoff precisa refletir (T9):** ordem dos parâmetros (ator → domínio → canal/contexto), `p_incluir_concluidas` em `listar`, `maria_agenda_listas_permitidas` (ator sem `user_id` lê tudo), `rotina_editar` não aceita `lista_id` (não há parâmetro; a mensagem do catálogo fica no `comment on function`), `filha_remover` e `encerrar` cancelam só instâncias pendentes de **competência futura** (mês corrente fica), `criar` recusa `parent_id` apontando pra espelho, `categoria` da rotina derivada da lista (`rh` → `rh`, senão `financeiro`).

**Placeholders:** `<<< colar _atores_sinteticos.sql >>>` nos testes é instrução de montagem (o fragmento está definido no plano); `<data>`/`<versões>` em T9 são slots de execução.

**Consistência de nomes/assinaturas:** as assinaturas de grant/revoke em cada migration batem com os `create function` (mesma lista de tipos, na mesma ordem) e com as regex do teste estático (T1 Step 2) — `listar(text, text, text, date, date, uuid, uuid, text, boolean, text)`, `detalhar(text, text, uuid, text)`, `rotinas_listar(text, text, uuid, text, text)`, `criar(text, text, text, uuid, date, boolean, time, text, uuid, text, uuid, text, text, text, text, text)`, `editar(text, text, uuid, text, text, text, uuid, uuid, boolean, text, text, text, text, text)`, `remarcar(text, text, uuid, date, time, text, text, text, text, text)`, `concluir/reabrir/cancelar/excluir/rotina_pausar/rotina_reativar/rotina_encerrar/rotina_filha_remover(text, text, uuid, text, text, text, text, text)`, `rotina_criar(text, text, text, uuid, integer, boolean, text, time, boolean, text, uuid, text, date, text, text, text, text, text)`, `rotina_editar(text, text, uuid, text, text, integer, boolean, text, time, boolean, text, uuid, boolean, text, text, text, text, text)`, `rotina_filha_adicionar(text, text, uuid, text, integer, boolean, text, text, uuid, text, text, text, text, text)`, `rotina_filha_editar(text, text, uuid, text, integer, boolean, text, text, uuid, boolean, text, text, text, text, text)`. Helpers: `maria_agenda_recusar_espelho(public.tarefas, text)` (T4) é usado em T5; `maria_agenda_validar_rotina(integer, boolean, text, text)` (T6) é usado em T7; `agenda_materializar_corrente_e_proximo(text)` (B1) é chamado em T6/T7/T8 com `'rpc'`.
