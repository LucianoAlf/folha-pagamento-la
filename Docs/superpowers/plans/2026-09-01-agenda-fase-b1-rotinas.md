# Agenda × Maria — Fase B1 (rotinas mensais) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer as rotinas mensais do LA Organizer pra Agenda: molde `agenda_rotinas` (pai/filhas), materialização mensal por competência em plpgsql (cron 07:30 SP), seed dos 10 moldes ativos do grupo Financeiro, e registro de cada rodada em `agenda_materializacoes` — deixando o banco pronto pras 18 RPCs da fase B2.

**Architecture:** Uma tabela auto-referente de moldes (`agenda_rotinas`, profundidade 1) e instâncias em `tarefas` identificadas por `(rotina_id, competencia)` — índice único **não-parcial, sem filtro de status** (cancelada ocupa a chave; nunca ressuscita). Todo calendário passa por um ponto único (`agenda_ajustar_data`); a data **nominal** (`agenda_resolve_dia`) decide vigência e o vencimento do pai (= máximo das nominais do pacote), o ajuste de fim de semana vem depois. O materializador é idempotente, roda por pai em bloco `exception` (uma rotina ruim não derruba as outras), grava `agenda_materializacoes`, e é chamado pelo `pg_cron` (criado **inativo**; o orquestrador roda a 1ª materialização real, lê, e ativa) e, na B2, de dentro das RPCs.

**Tech Stack:** Postgres 17 (Supabase `ubdvtjbitozhkuvvqkxj`), plpgsql, pg_cron, MCP `apply_migration`/`execute_sql`, `node --test --experimental-strip-types` (testes estáticos), SQL comportamental `begin … rollback` via MCP, TypeScript (só tipos).

**Spec:** `Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md` — §3 (decisões), §4.1 (`rotina_id`, `competencia`), §4.2 (`agenda_rotinas`), §4.6 (`agenda_materializacoes`), §4.7 (índices), §5.1–5.3 (calendário e materializador), §5.5 (grants), §8 (seed), §9–§11, §14. Handoff: `Docs/handoffs/2026-09-01-agenda-maria.md` §2, §12.

## Global Constraints

- **Fuso:** toda decisão de "hoje", competência e `vencimento_em` usa `(now() at time zone 'America/Sao_Paulo')`. **`current_date` e `now()::date` são proibidos** em funções `agenda_%` (teste estático varre os SQLs; Task 7 varre `pg_proc.prosrc`).
- **Chave da recorrência = `UNIQUE (rotina_id, competencia)`**, não-parcial, **sem filtro de status** — cancelada ocupa a chave. `NULL` é distinto (tarefas sem rotina não conflitam).
- **Vigência compara a data NOMINAL** (`agenda_resolve_dia`), antes do ajuste de fim de semana; **por linha** (pai e cada filha). Pacote criado no dia 20 nasce com filhas parciais no 1º mês.
- **Vencimento do pai = `max(nominal do pai, nominal das filhas elegíveis)`**; `dia_mes` do pai é piso. O ajuste de FDS do pai aplica depois do max. Instância de pai existente **não** se move (molde muda o futuro).
- **Pai da competência `concluida`/`cancelada` não ganha filha nova** — pula e conta em `pulados`.
- **`pausada`** pula (existentes intocadas); **`encerrada`** pula (histórico fica).
- **Um só ponto de calendário:** `agenda_ajustar_data(data, regra)` — fim de semana hoje; `agenda_feriados` entra *dentro* dela depois. `agenda_resolve_dia` clampa `dia_mes` ao fim do mês.
- **Profundidade máxima 1** em `agenda_rotinas` — trigger **e** RPC (B2). Filha na mesma lista do pai.
- **Grants:** funções internas → `revoke all … from public, anon, authenticated` + `grant execute … to service_role`. **`proacl` nulo é falha.**
- **Migrations:** via MCP `apply_migration(project_id, name, query)`; espelhar como `supabase/migrations/<versão-do-servidor>_<name>.sql`; testes estáticos localizam por sufixo. Migration aplicada **nunca** se edita — correção = migration nova com `create or replace`.
- **Cron nasce inativo** (`cron.alter_job(job_id, active := false)` — `update cron.job` é negado ao `postgres`); bloco preserva `active` anterior em replay. **A 1ª materialização real e a ativação são do orquestrador** (Task 5), não do implementer.
- **Seed idempotente** (`where not exists` por título + lista + pai); **nunca instâncias**; sem telefone; **Light (Recreio) é registro `encerrada`**; regras de FDS por natureza (§8).
- **Piso de 30 dias das atrasadas fica** (fase A, R19). Guards `tarefas_guard_*` ficam SECURITY INVOKER (RLS de `tarefas` não muda). `recorrencia_pai_id` continua morta (sync já protege).
- Mensagens de erro em português com `errcode` (`P0001` regra, `22023` parâmetro).
- Commits pequenos, `feat:`/`fix:`/`test:`/`docs:` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; `git add` só dos arquivos da task.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<v>_agenda_rotinas_schema.sql` | `agenda_rotinas` (+ RLS, trigger de profundidade, updated_at), `tarefas.rotina_id`/`competencia` + CHECK + índices, `agenda_materializacoes` (+ RLS/grants) |
| `supabase/migrations/<v>_agenda_calendario.sql` | `agenda_resolve_dia`, `agenda_ajustar_data` |
| `supabase/migrations/<v>_agenda_rotinas_materializar.sql` | `agenda_rotinas_materializar`, `agenda_materializar_corrente_e_proximo`, cron inativo |
| `supabase/migrations/<v>_agenda_seed_rotinas_financeiro.sql` | seed idempotente (10 ativas + 22 filhas + 4 encerradas) |
| `supabase/migrations/<v>_agenda_sync_contas_pagar_v5.sql` | sync grava `agenda_materializacoes` (M-13) |
| `supabase/migrations/agenda_fase_b1.test.mjs` | testes estáticos (regex + fuso) dos 5 SQLs |
| `supabase/tests/agenda/05_rotinas_schema.sql` … `09_sync_materializacoes.sql` | comportamentais `begin … rollback` |
| `types/agenda.ts` | `Tarefa` ganha `rotina_id`, `competencia`; novo tipo `AgendaRotina` |
| `package.json` | `npm test` inclui `agenda_fase_b1.test.mjs` |
| `Docs/handoffs/2026-09-01-agenda-maria.md` §14 | nota "B1 entregue" (STATUS continua pré-implementação até a B2) |

---

### Task 1: Schema — `agenda_rotinas`, `tarefas.rotina_id`/`competencia`, `agenda_materializacoes`

**Files:**
- Create: `supabase/migrations/20260902090000_agenda_rotinas_schema.sql` (renomear pro sufixo com a versão do servidor)
- Create: `supabase/migrations/agenda_fase_b1.test.mjs`
- Create: `supabase/tests/agenda/05_rotinas_schema.sql`
- Modify: `types/agenda.ts` (interface `Tarefa`, após `mensagem_origem_id`; novo `AgendaRotina`)

**Interfaces:**
- Consumes: `tarefas_listas`, `user_profiles`, `tarefas` (fase A: `parent_id`, `responsavel_id`, `mensagem_origem_id`), `public.financeiro_cartoes_is_admin()`, `public.set_updated_at()`.
- Produces: tabela `agenda_rotinas` (colunas abaixo); `tarefas.rotina_id uuid`, `tarefas.competencia date`; índice único `tarefas_rotina_competencia_uniq (rotina_id, competencia)`; tabela `agenda_materializacoes`; trigger `agenda_rotinas_guard_parent`.

- [ ] **Step 1: Branch**

```bash
cd "D:/2025/CURSO_VIBE_CODING/dash-folha-pagamento" && git switch -c feat/agenda-fase-b1
```

- [ ] **Step 2: Teste estático (falha — SQLs não existem)**

Criar `supabase/migrations/agenda_fase_b1.test.mjs`:

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
const schema = readBySuffix('_agenda_rotinas_schema.sql');
const cal = readBySuffix('_agenda_calendario.sql');
const mat = readBySuffix('_agenda_rotinas_materializar.sql');
const seed = readBySuffix('_agenda_seed_rotinas_financeiro.sql');
const syncV5 = readBySuffix('_agenda_sync_contas_pagar_v5.sql');
const todos = [schema, cal, mat, seed, syncV5].join('\n');

test('schema: agenda_rotinas auto-referente com CHECKs da spec', () => {
  assert.match(schema, /create table if not exists public\.agenda_rotinas/i);
  assert.match(schema, /parent_rotina_id uuid null references public\.agenda_rotinas\(id\) on delete restrict/i);
  assert.match(schema, /frequencia text not null default 'mensal' check \(frequencia in \('mensal'\)\)/i);
  assert.match(schema, /dia_mes smallint null check \(dia_mes between 1 and 31\)/i);
  assert.match(schema, /se_cair_fim_de_semana text not null default 'manter'/i);
  assert.match(schema, /check \(se_cair_fim_de_semana in \('manter','proximo_dia_util','dia_util_anterior'\)\)/i);
  assert.match(schema, /status text not null default 'ativa' check \(status in \('ativa','pausada','encerrada'\)\)/i);
  assert.match(schema, /vigencia_inicio date not null default \(now\(\) at time zone 'America\/Sao_Paulo'\)::date/i);
  assert.match(schema, /constraint agenda_rotinas_dia_check check \(ultimo_dia or dia_mes is not null\)/i);
});

test('schema: tarefas.rotina_id/competencia, CHECK e indice unico nao-parcial sem status', () => {
  assert.match(schema, /add column if not exists rotina_id uuid null references public\.agenda_rotinas\(id\) on delete restrict/i);
  assert.match(schema, /add column if not exists competencia date null/i);
  assert.match(schema, /check \(rotina_id is null or competencia is not null\)/i);
  assert.match(schema, /create unique index if not exists tarefas_rotina_competencia_uniq on public\.tarefas \(rotina_id, competencia\);/i);
  assert.doesNotMatch(schema, /tarefas_rotina_competencia_uniq[^;]*where/i);
});

test('schema: guarda de profundidade e mesma lista em trigger', () => {
  assert.match(schema, /create trigger agenda_rotinas_guard_parent before insert or update of parent_rotina_id, lista_id on public\.agenda_rotinas/i);
  assert.match(schema, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(schema, /filha deve estar na mesma lista do pai\./);
});

test('schema: RLS — leitura pra logados, escrita so admin; materializacoes legivel pela Maria', () => {
  assert.match(schema, /create policy agenda_rotinas_select on public\.agenda_rotinas\s+for select using \(\(select auth\.role\(\)\) = 'authenticated'\)/i);
  assert.match(schema, /create policy agenda_rotinas_insert_admin on public\.agenda_rotinas\s+for insert with check \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create table if not exists public\.agenda_materializacoes/i);
  assert.match(schema, /origem text not null check \(origem in \('cron','rpc','sync','manual'\)\)/i);
  assert.match(schema, /grant select on public\.agenda_materializacoes to maria_leitura, maria_operacional, service_role/i);
  assert.doesNotMatch(schema, /whatsapp_numero|\b55\d{10,11}\b/);
});

test('calendario: resolve_dia immutable, ajustar_data stable, ponto unico de feriados', () => {
  assert.match(cal, /function public\.agenda_resolve_dia\(p_competencia date, p_dia_mes integer, p_ultimo_dia boolean\)\s+returns date language sql immutable/i);
  assert.match(cal, /function public\.agenda_ajustar_data\(p_data date, p_regra text\)\s+returns date/i);
  assert.match(cal, /language plpgsql stable/i);
  assert.match(cal, /agenda_feriados entra AQUI/);
  for (const fn of ['agenda_resolve_dia(date, integer, boolean)', 'agenda_ajustar_data(date, text)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(cal, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(cal, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
});

test('materializador: max(nominal), vigencia por linha, pai fechado, exception por pai, cron inativo', () => {
  assert.match(mat, /function public\.agenda_rotinas_materializar\(p_competencia date, p_origem text default 'rpc'\)/i);
  assert.match(mat, /v_nominal_pai < v_pai\.vigencia_inicio/);
  assert.match(mat, /v_nominal_f >= v_filha\.vigencia_inicio and v_nominal_f > v_nominal_max/);
  assert.match(mat, /agenda_ajustar_data\(v_nominal_max, v_pai\.se_cair_fim_de_semana\)/);
  assert.match(mat, /on conflict \(rotina_id, competencia\) do nothing/i);
  assert.match(mat, /v_pai_status in \('concluida','cancelada'\)/);
  assert.match(mat, /exception when others then/i);
  assert.match(mat, /insert into public\.agenda_materializacoes/i);
  assert.match(mat, /function public\.agenda_materializar_corrente_e_proximo\(p_origem text default 'cron'\)/i);
  assert.match(mat, /'agenda-rotinas-materializar-diario'/);
  assert.match(mat, /'30 10 \* \* \*'/);
  assert.match(mat, /cron\.alter_job\(job_id := jid, active := coalesce\(v_ativo_antes, false\)\)/i);
  for (const fn of ['agenda_rotinas_materializar(date, text)', 'agenda_materializar_corrente_e_proximo(text)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(mat, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(mat, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
});

test('seed: idempotente, 10 ativas + 4 encerradas, Light encerrada, sem instancias, FDS por natureza', () => {
  assert.match(seed, /where not exists/i);
  assert.match(seed, /Conciliação de Cartões/);
  assert.match(seed, /Pedir fatura ao Luciano/);
  assert.match(seed, /Depósito de Cheques/);
  assert.match(seed, /Repasses de Cartões – Maquininha/);
  assert.match(seed, /Cashbacks do mês aplicados/);
  assert.match(seed, /Faturamento Mensal/);
  assert.match(seed, /Conferir débito automático Light \(Recreio\)'[\s\S]{0,400}'encerrada'/);
  assert.match(seed, /Rose 01\/09: pode sair/);
  assert.doesNotMatch(seed, /insert into public\.tarefas/i);
  assert.match(seed, /vigencia_inicio[^;]*date '2026-09-01'/i);
  assert.doesNotMatch(seed, /\b55\d{10,11}\b/);
});

test('sync v5: grava agenda_materializacoes com origem sync', () => {
  assert.match(syncV5, /function public\.agenda_sync_contas_pagar\(\)/i);
  assert.match(syncV5, /insert into public\.agenda_materializacoes \(origem, competencia, duracao_ms, criados, atualizados, removidos, detalhes\)/i);
  assert.match(syncV5, /'sync'/);
  assert.match(syncV5, /is distinct from/i);
  assert.match(syncV5, /r\.recorrencia_pai_id = t\.id/i);
  assert.doesNotMatch(syncV5, /do update set[\s\S]*?responsavel_id\s*=/i);
  assert.match(syncV5, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
});

test('fuso: nenhum SQL da B1 usa current_date ou now()::date', () => {
  assert.doesNotMatch(todos, /\bcurrent_date\b/i);
  assert.doesNotMatch(todos, /now\(\)::date/i);
});

test('arquivos existem', () => {
  for (const [nome, txt] of Object.entries({ schema, cal, mat, seed, syncV5 })) assert.ok(txt.length > 0, `${nome} vazio/ausente`);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_b1.test.mjs`
Expected: FAIL em todos (strings vazias).

- [ ] **Step 4: Escrever a migration de schema**

Criar `supabase/migrations/20260902090000_agenda_rotinas_schema.sql`:

```sql
-- Agenda fase B1 — molde de rotinas (spec §4.2), instancias (§4.1), registro de rodadas (§4.6).

-- ---------------------------------------------------------------- agenda_rotinas
create table if not exists public.agenda_rotinas (
  id uuid primary key default gen_random_uuid(),
  parent_rotina_id uuid null references public.agenda_rotinas(id) on delete restrict,   -- NULL = pai
  titulo text not null,
  descricao text null,
  lista_id uuid not null references public.tarefas_listas(id) on delete restrict,
  categoria text not null default 'geral',
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel_id uuid null references public.user_profiles(id),
  frequencia text not null default 'mensal' check (frequencia in ('mensal')),          -- semanal: so a coluna
  dia_mes smallint null check (dia_mes between 1 and 31),
  ultimo_dia boolean not null default false,
  se_cair_fim_de_semana text not null default 'manter'
    check (se_cair_fim_de_semana in ('manter','proximo_dia_util','dia_util_anterior')),
  hora time not null default '09:00',
  dia_inteiro boolean not null default true,
  status text not null default 'ativa' check (status in ('ativa','pausada','encerrada')),
  vigencia_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  encerrada_em timestamptz null,
  observacao text null,
  ordem integer not null default 0,
  mensagem_origem_id text null,
  created_by uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_rotinas_dia_check check (ultimo_dia or dia_mes is not null)
);

create index if not exists idx_agenda_rotinas_parent on public.agenda_rotinas (parent_rotina_id);
create index if not exists idx_agenda_rotinas_lista on public.agenda_rotinas (lista_id);
create index if not exists idx_agenda_rotinas_status on public.agenda_rotinas (status);
create index if not exists idx_agenda_rotinas_mensagem_origem on public.agenda_rotinas (mensagem_origem_id);

drop trigger if exists agenda_rotinas_updated on public.agenda_rotinas;
create trigger agenda_rotinas_updated before update on public.agenda_rotinas
  for each row execute function public.set_updated_at();

-- Guarda em trigger (a tabela tem dois escritores: RPCs da Maria e admin pelo app).
create or replace function public.agenda_rotinas_guard_parent()
returns trigger language plpgsql set search_path = public as $$
declare v_pai public.agenda_rotinas%rowtype;
begin
  if new.parent_rotina_id is null then return new; end if;
  if new.parent_rotina_id = new.id then
    raise exception 'rotina nao pode ser pai de si mesma.' using errcode = 'P0001';
  end if;
  select * into v_pai from public.agenda_rotinas where id = new.parent_rotina_id;
  if not found then
    raise exception 'rotina pai nao encontrada.' using errcode = 'P0001';
  end if;
  if v_pai.parent_rotina_id is not null then
    raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agenda_rotinas f where f.parent_rotina_id = new.id) then
    raise exception 'profundidade maxima 1: rotina com filhas nao pode virar filha.' using errcode = 'P0001';
  end if;
  if v_pai.lista_id <> new.lista_id then
    raise exception 'filha deve estar na mesma lista do pai.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists agenda_rotinas_guard_parent on public.agenda_rotinas;
create trigger agenda_rotinas_guard_parent before insert or update of parent_rotina_id, lista_id on public.agenda_rotinas
  for each row execute function public.agenda_rotinas_guard_parent();

alter table public.agenda_rotinas enable row level security;
drop policy if exists agenda_rotinas_select on public.agenda_rotinas;
drop policy if exists agenda_rotinas_insert_admin on public.agenda_rotinas;
drop policy if exists agenda_rotinas_update_admin on public.agenda_rotinas;
drop policy if exists agenda_rotinas_delete_admin on public.agenda_rotinas;
create policy agenda_rotinas_select on public.agenda_rotinas
  for select using ((select auth.role()) = 'authenticated');
create policy agenda_rotinas_insert_admin on public.agenda_rotinas
  for insert with check (public.financeiro_cartoes_is_admin());
create policy agenda_rotinas_update_admin on public.agenda_rotinas
  for update using (public.financeiro_cartoes_is_admin()) with check (public.financeiro_cartoes_is_admin());
create policy agenda_rotinas_delete_admin on public.agenda_rotinas
  for delete using (public.financeiro_cartoes_is_admin());

-- ---------------------------------------------------------------- tarefas: instancia -> molde
alter table public.tarefas
  add column if not exists rotina_id uuid null references public.agenda_rotinas(id) on delete restrict,
  add column if not exists competencia date null;          -- 1o dia do mes (SP)
alter table public.tarefas drop constraint if exists tarefas_rotina_competencia_check;
alter table public.tarefas add constraint tarefas_rotina_competencia_check
  check (rotina_id is null or competencia is not null);
-- A chave da recorrencia. Nao-parcial, sem status: cancelada ocupa a chave (licao de 29/08).
create unique index if not exists tarefas_rotina_competencia_uniq on public.tarefas (rotina_id, competencia);
create index if not exists idx_tarefas_competencia on public.tarefas (competencia);

-- ---------------------------------------------------------------- agenda_materializacoes
create table if not exists public.agenda_materializacoes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('cron','rpc','sync','manual')),
  competencia date null,
  executado_em timestamptz not null default now(),
  duracao_ms integer null,
  pais_criados integer not null default 0,
  filhas_criadas integer not null default 0,
  pulados integer not null default 0,
  criados integer not null default 0,
  atualizados integer not null default 0,
  removidos integer not null default 0,
  erros jsonb not null default '[]'::jsonb,
  detalhes jsonb not null default '{}'::jsonb
);
create index if not exists idx_agenda_materializacoes_exec on public.agenda_materializacoes (executado_em desc);
alter table public.agenda_materializacoes enable row level security;
drop policy if exists agenda_materializacoes_select_app on public.agenda_materializacoes;
drop policy if exists agenda_materializacoes_select_maria on public.agenda_materializacoes;
create policy agenda_materializacoes_select_app on public.agenda_materializacoes
  for select using ((select auth.role()) = 'authenticated');
create policy agenda_materializacoes_select_maria on public.agenda_materializacoes
  for select to maria_leitura, maria_operacional using (true);
-- Sem politica de escrita: so security definer / service_role escrevem.
grant select on public.agenda_materializacoes to maria_leitura, maria_operacional, service_role;
grant select on public.agenda_rotinas to maria_leitura, maria_operacional, service_role;
```

- [ ] **Step 5: Tipos**

Em `types/agenda.ts`, dentro de `Tarefa`, logo após `mensagem_origem_id?: string | null;`:

```ts
  rotina_id?: string | null;           // instância → molde (agenda_rotinas)
  competencia?: string | null;         // 'YYYY-MM-01' (SP); NOT NULL quando rotina_id não é
```

E, após a interface `TarefaSubtarefa`, o molde:

```ts
export interface AgendaRotina {
  id: string;
  parent_rotina_id?: string | null;    // null = pai
  titulo: string;
  descricao?: string | null;
  lista_id: string;
  categoria: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  responsavel_id?: string | null;
  frequencia: 'mensal';
  dia_mes?: number | null;
  ultimo_dia: boolean;
  se_cair_fim_de_semana: 'manter' | 'proximo_dia_util' | 'dia_util_anterior';
  hora: string;                        // 'HH:MM:SS'
  dia_inteiro: boolean;
  status: 'ativa' | 'pausada' | 'encerrada';
  vigencia_inicio: string;             // 'YYYY-MM-DD'
  encerrada_em?: string | null;
  observacao?: string | null;
  ordem: number;
  mensagem_origem_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 6: Teste estático — os 4 blocos `schema:` passam**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_b1.test.mjs`
Expected: 4 `schema:` PASS; os demais ainda FAIL (arquivos das Tasks 2–6). `npm run typecheck` limpo.

- [ ] **Step 7: Aplicar via MCP e espelhar**

MCP `apply_migration(project_id = ubdvtjbitozhkuvvqkxj, name = agenda_rotinas_schema, query = <arquivo>)`. Depois `select version from supabase_migrations.schema_migrations where name = 'agenda_rotinas_schema'` → renomear o arquivo pra `<version>_agenda_rotinas_schema.sql`.

- [ ] **Step 8: Verificar em produção**

```sql
select
  (select count(*) from information_schema.columns where table_name='agenda_rotinas') as cols_rotinas_23,
  (select count(*) from information_schema.columns where table_name='tarefas' and column_name in ('rotina_id','competencia')) as cols_tarefas_2,
  (select count(*) from pg_indexes where indexname='tarefas_rotina_competencia_uniq' and indexdef not ilike '%where%') as idx_uniq_nao_parcial_1,
  (select count(*) from pg_trigger where tgname in ('agenda_rotinas_guard_parent','agenda_rotinas_updated')) as triggers_2,
  (select count(*) from pg_policies where tablename='agenda_rotinas') as politicas_rotinas_4,
  (select count(*) from pg_policies where tablename='agenda_materializacoes') as politicas_mat_2,
  (select count(*) from agenda_rotinas) as rotinas_0;
```

Expected: `23, 2, 1, 2, 4, 2, 0`.

- [ ] **Step 9: Teste comportamental (rollback)**

Criar `supabase/tests/agenda/05_rotinas_schema.sql`:

```sql
-- Rodar via MCP execute_sql. Esperado: sem erro e ultima linha 'PASS: 05_rotinas_schema'.
begin;
do $t$
declare v_fin uuid; v_rh uuid; v_pai uuid; v_filha uuid; v_ok boolean; v_t uuid;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  select id into v_rh  from public.tarefas_listas where lower(nome)='rh' and coalesce(is_smart,false)=false order by ordem limit 1;
  assert v_fin is not null and v_rh is not null, 'listas Financeiro/RH ausentes';

  insert into public.agenda_rotinas (titulo, lista_id, dia_mes) values ('R pai', v_fin, 10) returning id into v_pai;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R filha', v_fin, 12, v_pai) returning id into v_filha;

  -- filha de filha -> recusa
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R neta', v_fin, 13, v_filha);
  exception when others then v_ok := sqlerrm like 'profundidade maxima 1%'; end;
  assert v_ok, 'neta deveria ser recusada';

  -- filha em outra lista -> recusa
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R filha rh', v_rh, 13, v_pai);
  exception when others then v_ok := sqlerrm like 'filha deve estar na mesma lista%'; end;
  assert v_ok, 'filha em outra lista deveria ser recusada';

  -- sem dia_mes e sem ultimo_dia -> CHECK
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id) values ('R sem dia', v_fin);
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'rotina sem dia deveria violar o CHECK';

  -- frequencia semanal barrada
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, frequencia) values ('R sem', v_fin, 1, 'semanal');
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'frequencia semanal deveria ser barrada';

  -- instancia com rotina_id exige competencia; chave unica (rotina_id, competencia)
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, rotina_id) values ('T sem comp', 'pendente', v_pai);
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'instancia sem competencia deveria violar o CHECK';
  insert into public.tarefas (titulo, status, rotina_id, competencia) values ('T set', 'pendente', v_pai, date '2026-09-01') returning id into v_t;
  update public.tarefas set status = 'cancelada' where id = v_t;
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, rotina_id, competencia) values ('T set dup', 'pendente', v_pai, date '2026-09-01');
  exception when others then v_ok := sqlstate = '23505'; end;
  assert v_ok, 'cancelada deveria continuar ocupando a chave (rotina_id, competencia)';
end $t$;
rollback;
select 'PASS: 05_rotinas_schema' as resultado;
```

Run via MCP `execute_sql`. Expected: `PASS: 05_rotinas_schema`.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/*_agenda_rotinas_schema.sql supabase/migrations/agenda_fase_b1.test.mjs supabase/tests/agenda/05_rotinas_schema.sql types/agenda.ts
git commit -m "feat(agenda): schema B1 — agenda_rotinas, tarefas.rotina_id/competencia (chave unica), agenda_materializacoes"
```

---

### Task 2: Calendário — `agenda_resolve_dia` e `agenda_ajustar_data`

**Files:**
- Create: `supabase/migrations/20260902090100_agenda_calendario.sql`
- Create: `supabase/tests/agenda/06_calendario.sql`

**Interfaces:**
- Produces: `agenda_resolve_dia(p_competencia date, p_dia_mes integer, p_ultimo_dia boolean) returns date` (immutable; clampa ao fim do mês); `agenda_ajustar_data(p_data date, p_regra text) returns date` (stable; `manter` | `proximo_dia_util` | `dia_util_anterior`; **único** lugar que sabe de calendário).

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260902090100_agenda_calendario.sql`:

```sql
-- Calendario da Agenda (spec §5.1–5.2). agenda_ajustar_data e o UNICO ponto que sabe de calendario.

-- Data NOMINAL da ocorrencia no mes: ultimo dia, ou dia_mes clampado ao fim do mes (31 em fev = 28/29).
create or replace function public.agenda_resolve_dia(p_competencia date, p_dia_mes integer, p_ultimo_dia boolean)
returns date language sql immutable as $$
  select case
    when coalesce(p_ultimo_dia, false)
      then (date_trunc('month', p_competencia)::date + interval '1 month' - interval '1 day')::date
    else least(
      date_trunc('month', p_competencia)::date + (greatest(coalesce(p_dia_mes, 1), 1) - 1),
      (date_trunc('month', p_competencia)::date + interval '1 month' - interval '1 day')::date
    )
  end;
$$;

-- Ajuste de fim de semana. stable (nao immutable): quando agenda_feriados entrar AQUI, a funcao
-- passa a consultar tabela e a volatilidade ja estara certa.
create or replace function public.agenda_ajustar_data(p_data date, p_regra text)
returns date language plpgsql stable set search_path = public as $$
declare v date := p_data;
begin
  if p_data is null then return null; end if;
  if p_regra = 'proximo_dia_util' then
    while extract(isodow from v) in (6, 7) loop v := v + 1; end loop;     -- sab/dom -> proxima segunda
  elsif p_regra = 'dia_util_anterior' then
    while extract(isodow from v) in (6, 7) loop v := v - 1; end loop;     -- sab/dom -> sexta anterior
  end if;                                                                 -- 'manter' (ou nulo): nao mexe
  -- agenda_feriados entra AQUI (spec §5.1): apos o ajuste de fim de semana, repetir o mesmo laco
  -- enquanto v for feriado, na mesma direcao da regra.
  return v;
end $$;

revoke all on function public.agenda_resolve_dia(date, integer, boolean) from public, anon, authenticated;
grant execute on function public.agenda_resolve_dia(date, integer, boolean) to service_role;
revoke all on function public.agenda_ajustar_data(date, text) from public, anon, authenticated;
grant execute on function public.agenda_ajustar_data(date, text) to service_role;
```

- [ ] **Step 2: Teste estático** — Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_b1.test.mjs` → `calendario:` PASS.

- [ ] **Step 3: Aplicar via MCP e espelhar** — `apply_migration(name = agenda_calendario)`; versão; renomear.

- [ ] **Step 4: Teste comportamental**

Criar `supabase/tests/agenda/06_calendario.sql`:

```sql
-- Rodar via MCP execute_sql. Esperado: 'PASS: 06_calendario'.
begin;
do $t$
begin
  -- resolve_dia
  assert public.agenda_resolve_dia(date '2026-02-01', 31, false) = date '2026-02-28', 'clamp fev 31 -> 28';
  assert public.agenda_resolve_dia(date '2028-02-01', 31, false) = date '2028-02-29', 'clamp fev bissexto';
  assert public.agenda_resolve_dia(date '2026-09-15', 12, false) = date '2026-09-12', 'competencia nao-normalizada';
  assert public.agenda_resolve_dia(date '2026-09-01', null, true) = date '2026-09-30', 'ultimo dia set';
  assert public.agenda_resolve_dia(date '2026-04-01', 30, true) = date '2026-04-30', 'ultimo_dia prevalece';
  assert public.agenda_resolve_dia(date '2026-09-01', 1, false) = date '2026-09-01', 'dia 1';
  -- ajustar_data: 2026-09-05 sab, 09-06 dom, 09-07 seg, 09-04 sex
  assert public.agenda_ajustar_data(date '2026-09-05', 'proximo_dia_util') = date '2026-09-07', 'sab -> seg';
  assert public.agenda_ajustar_data(date '2026-09-06', 'proximo_dia_util') = date '2026-09-07', 'dom -> seg';
  assert public.agenda_ajustar_data(date '2026-09-05', 'dia_util_anterior') = date '2026-09-04', 'sab -> sex';
  assert public.agenda_ajustar_data(date '2026-09-06', 'dia_util_anterior') = date '2026-09-04', 'dom -> sex';
  assert public.agenda_ajustar_data(date '2026-09-05', 'manter') = date '2026-09-05', 'manter';
  assert public.agenda_ajustar_data(date '2026-09-07', 'proximo_dia_util') = date '2026-09-07', 'dia util fica';
  assert public.agenda_ajustar_data(null, 'manter') is null, 'null passa';
  -- sai do mes: sab 2026-10-31 + proximo_dia_util = seg 2026-11-02 (competencia fica em outubro no materializador)
  assert public.agenda_ajustar_data(date '2026-10-31', 'proximo_dia_util') = date '2026-11-02', 'ajuste pode sair do mes';
end $t$;
rollback;
select 'PASS: 06_calendario' as resultado;
```

Run via MCP. Expected: `PASS: 06_calendario`.

- [ ] **Step 5: `proacl`** — as 2 funções com `{postgres=X/postgres,service_role=X/postgres}`, `provolatile` `i` e `s` respectivamente.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_agenda_calendario.sql supabase/tests/agenda/06_calendario.sql
git commit -m "feat(agenda): calendario — agenda_resolve_dia (clamp) e agenda_ajustar_data (ponto unico de FDS/feriados)"
```

---

### Task 3: Materializador — `agenda_rotinas_materializar` + helper + cron inativo

**Files:**
- Create: `supabase/migrations/20260902090200_agenda_rotinas_materializar.sql`
- Create: `supabase/tests/agenda/07_materializar.sql`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `agenda_rotinas_materializar(p_competencia date, p_origem text default 'rpc') returns jsonb` → `{competencia, pais_criados, filhas_criadas, pulados, erros}`; `agenda_materializar_corrente_e_proximo(p_origem text default 'cron') returns jsonb` → `{corrente, proximo}` (também faz retenção de 60 d em `agenda_materializacoes`); cron `agenda-rotinas-materializar-diario` (`30 10 * * *` UTC = 07:30 SP), **inativo**.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260902090200_agenda_rotinas_materializar.sql`:

```sql
-- Materializador mensal (spec §5.3). Idempotente: ON CONFLICT (rotina_id, competencia) DO NOTHING.
-- Regras: vigencia por linha contra a data NOMINAL; vencimento do pai = max(nominal pai, nominais das
-- filhas elegiveis); ajuste de FDS depois do max; pai fechado nao ganha filha; exception por pai.

create or replace function public.agenda_rotinas_materializar(p_competencia date, p_origem text default 'rpc')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini timestamptz := clock_timestamp();
  v_comp date;
  v_pai public.agenda_rotinas%rowtype;
  v_filha public.agenda_rotinas%rowtype;
  v_nominal_pai date; v_nominal_f date; v_nominal_max date; v_data date; v_venc timestamptz;
  v_pai_id uuid; v_pai_status text;
  v_pais int := 0; v_filhas int := 0; v_pulados int := 0; v_ins int := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if p_competencia is null then
    raise exception 'competencia obrigatoria.' using errcode = '22023';
  end if;
  v_comp := date_trunc('month', p_competencia)::date;

  for v_pai in
    select * from public.agenda_rotinas
     where parent_rotina_id is null and status = 'ativa'
     order by ordem, titulo
  loop
    begin
      v_nominal_pai := public.agenda_resolve_dia(v_comp, v_pai.dia_mes, v_pai.ultimo_dia);
      if v_nominal_pai < v_pai.vigencia_inicio then          -- vigencia contra a NOMINAL
        v_pulados := v_pulados + 1;
        continue;
      end if;

      -- vencimento do pai = max(nominal pai, nominais das filhas elegiveis) — dia_mes do pai e piso
      v_nominal_max := v_nominal_pai;
      for v_filha in select * from public.agenda_rotinas where parent_rotina_id = v_pai.id and status = 'ativa' loop
        v_nominal_f := public.agenda_resolve_dia(v_comp, v_filha.dia_mes, v_filha.ultimo_dia);
        if v_nominal_f >= v_filha.vigencia_inicio and v_nominal_f > v_nominal_max then
          v_nominal_max := v_nominal_f;
        end if;
      end loop;

      v_data := public.agenda_ajustar_data(v_nominal_max, v_pai.se_cair_fim_de_semana);   -- pode sair do mes
      v_venc := (v_data::timestamp + v_pai.hora) at time zone 'America/Sao_Paulo';

      insert into public.tarefas
        (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
         rotina_id, competencia, responsavel_id, lembrete_minutos, ordem)
      values
        (v_pai.titulo, v_pai.descricao, v_pai.lista_id, v_pai.categoria, v_pai.prioridade, array['rotina'],
         v_venc, v_pai.dia_inteiro, 'pendente', v_pai.id, v_comp, v_pai.responsavel_id, array[30], v_pai.ordem)
      on conflict (rotina_id, competencia) do nothing;
      get diagnostics v_ins = row_count;
      v_pais := v_pais + v_ins;

      select id, status into v_pai_id, v_pai_status
        from public.tarefas where rotina_id = v_pai.id and competencia = v_comp;

      if v_pai_status in ('concluida','cancelada') then         -- pai fechado nao ganha filha nova
        select count(*) into v_ins
          from public.agenda_rotinas f
         where f.parent_rotina_id = v_pai.id and f.status = 'ativa'
           and not exists (select 1 from public.tarefas t where t.rotina_id = f.id and t.competencia = v_comp);
        v_pulados := v_pulados + v_ins;
        continue;
      end if;

      for v_filha in
        select * from public.agenda_rotinas
         where parent_rotina_id = v_pai.id and status = 'ativa'
         order by ordem, titulo
      loop
        v_nominal_f := public.agenda_resolve_dia(v_comp, v_filha.dia_mes, v_filha.ultimo_dia);
        if v_nominal_f < v_filha.vigencia_inicio then          -- vigencia por linha
          v_pulados := v_pulados + 1;
          continue;
        end if;
        v_data := public.agenda_ajustar_data(v_nominal_f, v_filha.se_cair_fim_de_semana);
        v_venc := (v_data::timestamp + v_filha.hora) at time zone 'America/Sao_Paulo';
        insert into public.tarefas
          (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
           rotina_id, competencia, parent_id, responsavel_id, lembrete_minutos, ordem)
        values
          (v_filha.titulo, v_filha.descricao, v_filha.lista_id, v_filha.categoria, v_filha.prioridade, array['rotina'],
           v_venc, v_filha.dia_inteiro, 'pendente', v_filha.id, v_comp, v_pai_id, v_filha.responsavel_id, array[30], v_filha.ordem)
        on conflict (rotina_id, competencia) do nothing;
        get diagnostics v_ins = row_count;
        v_filhas := v_filhas + v_ins;
      end loop;
    exception when others then
      v_erros := v_erros || jsonb_build_object('rotina_id', v_pai.id, 'titulo', v_pai.titulo, 'erro', sqlerrm, 'sqlstate', sqlstate);
      raise warning 'agenda_rotinas_materializar: % (%) — %', v_pai.titulo, v_pai.id, sqlerrm;
    end;
  end loop;

  insert into public.agenda_materializacoes (origem, competencia, duracao_ms, pais_criados, filhas_criadas, pulados, erros)
  values (coalesce(p_origem, 'rpc'), v_comp, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int, v_pais, v_filhas, v_pulados, v_erros);

  return jsonb_build_object('competencia', v_comp, 'pais_criados', v_pais, 'filhas_criadas', v_filhas, 'pulados', v_pulados, 'erros', v_erros);
end $$;

-- Mes corrente + proximo, com "hoje" em SP. Retencao de 60 dias em agenda_materializacoes.
create or replace function public.agenda_materializar_corrente_e_proximo(p_origem text default 'cron')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_a jsonb; v_b jsonb;
begin
  v_a := public.agenda_rotinas_materializar(date_trunc('month', v_hoje)::date, p_origem);
  v_b := public.agenda_rotinas_materializar((date_trunc('month', v_hoje) + interval '1 month')::date, p_origem);
  delete from public.agenda_materializacoes where executado_em < now() - interval '60 days';
  return jsonb_build_object('hoje', v_hoje, 'corrente', v_a, 'proximo', v_b);
end $$;

revoke all on function public.agenda_rotinas_materializar(date, text) from public, anon, authenticated;
grant execute on function public.agenda_rotinas_materializar(date, text) to service_role;
revoke all on function public.agenda_materializar_corrente_e_proximo(text) from public, anon, authenticated;
grant execute on function public.agenda_materializar_corrente_e_proximo(text) to service_role;

-- Cron diario 07:30 SP (10:30 UTC). Nasce INATIVO; o orquestrador roda a 1a materializacao real e ativa.
create extension if not exists pg_cron;
do $do$
declare jid bigint; v_ativo_antes boolean;
begin
  select jobid, active into jid, v_ativo_antes from cron.job where jobname = 'agenda-rotinas-materializar-diario' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
  jid := cron.schedule('agenda-rotinas-materializar-diario', '30 10 * * *', $cmd$ select public.agenda_materializar_corrente_e_proximo('cron'); $cmd$);
  perform cron.alter_job(job_id := jid, active := coalesce(v_ativo_antes, false));
end $do$;
```

- [ ] **Step 2: Teste estático** — `materializador:` PASS.

- [ ] **Step 3: Aplicar via MCP e espelhar** — `apply_migration(name = agenda_rotinas_materializar)`; versão; renomear. Confirmar `select jobid, active from cron.job where jobname = 'agenda-rotinas-materializar-diario'` → `active = false`. **Não** chamar o materializador fora de rollback; **não** ativar o cron.

- [ ] **Step 4: Teste comportamental (rollback, com moldes sintéticos — o seed ainda não existe)**

Criar `supabase/tests/agenda/07_materializar.sql`:

```sql
-- Rodar via MCP execute_sql. Cria moldes sinteticos, materializa set/2026 em rollback. Esperado: 'PASS: 07_materializar'.
begin;
do $t$
declare
  v_fin uuid; v_pac uuid; v_f12 uuid; v_f21 uuid; v_simples uuid; v_dom uuid; v_paus uuid; v_r jsonb;
  v_pai_t uuid; v_n int; c_rose constant uuid := 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4';
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;

  -- pacote: pai dia 6 (piso), filhas 12 e 21 -> vencimento do pai = 21 (2026-09-21 e segunda)
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, se_cair_fim_de_semana, vigencia_inicio) values ('X Pacote', v_fin, 6, 'proximo_dia_util', date '2026-01-01') returning id into v_pac;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 12', v_fin, 12, v_pac, date '2026-01-01') returning id into v_f12;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 21', v_fin, 21, v_pac, date '2026-01-01') returning id into v_f21;
  -- simples dia 30, vigencia set
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, vigencia_inicio) values ('X Simples', v_fin, 30, date '2026-09-01') returning id into v_simples;
  -- vigencia nominal vs ajustada: dia 1 de nov/2026 e domingo; dia_util_anterior -> 30/10; vigencia 2026-11-01
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, se_cair_fim_de_semana, vigencia_inicio) values ('X Dom', v_fin, 1, 'dia_util_anterior', date '2026-11-01') returning id into v_dom;
  -- pausada: nao materializa
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, status, vigencia_inicio) values ('X Pausada', v_fin, 5, 'pausada', date '2026-01-01') returning id into v_paus;

  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'pais_criados')::int = 2, 'esperava 2 pais (pacote + simples), veio ' || (v_r->>'pais_criados');
  assert (v_r->>'filhas_criadas')::int = 2, 'esperava 2 filhas, veio ' || (v_r->>'filhas_criadas');
  assert jsonb_array_length(v_r->'erros') = 0, 'erros: ' || (v_r->'erros')::text;

  -- pai = max(6, 12, 21) = 21/09 (segunda, sem ajuste); competencia 2026-09-01
  select id into v_pai_t from public.tarefas where rotina_id = v_pac and competencia = date '2026-09-01';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where id = v_pai_t) = date '2026-09-21', 'vencimento do pai deveria ser 21/09 (max das filhas)';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::time from public.tarefas where id = v_pai_t) = time '09:00', 'hora 09:00';
  -- filhas apontam pro pai e tem datas proprias
  assert (select count(*) from public.tarefas where parent_id = v_pai_t) = 2, 'filhas com parent_id';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = date '2026-09-12', 'filha 12';
  -- simples dia 30
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_simples and competencia = date '2026-09-01') = date '2026-09-30', 'simples 30';
  -- pausada e vigencia futura nao existem em set
  assert not exists (select 1 from public.tarefas where rotina_id in (v_paus, v_dom) and competencia = date '2026-09-01'), 'pausada/vigencia futura nao deveriam materializar';

  -- idempotente
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'pais_criados')::int = 0 and (v_r->>'filhas_criadas')::int = 0, '2a rodada deveria criar 0';

  -- vigencia compara a NOMINAL: nov/2026, X Dom nominal 01/11 (>= vigencia 01/11) -> cria, com vencimento ajustado 30/10 (competencia fica nov)
  v_r := public.agenda_rotinas_materializar(date '2026-11-01', 'manual');
  assert exists (select 1 from public.tarefas where rotina_id = v_dom and competencia = date '2026-11-01'), 'X Dom deveria existir em nov (vigencia pela nominal)';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_dom and competencia = date '2026-11-01') = date '2026-10-30', 'ajuste dia_util_anterior 01/11 dom -> 30/10';

  -- cancelada ocupa a chave: cancelar a filha 12 de set e rematerializar -> nao ressuscita
  update public.tarefas set status = 'cancelada' where rotina_id = v_f12 and competencia = date '2026-09-01';
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (select count(*) from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = 1, 'cancelada nao deveria ser recriada';
  assert (select status from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = 'cancelada', 'status cancelada preservado';

  -- pai fechado nao ganha filha nova: conclui filhas e pai de set; adiciona filha-molde nova; rematerializa -> pulada
  update public.tarefas set status = 'concluida' where parent_id = v_pai_t;
  update public.tarefas set status = 'concluida' where id = v_pai_t;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 25', v_fin, 25, v_pac, date '2026-01-01');
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'filhas_criadas')::int = 0, 'pai concluido nao deveria ganhar filha';
  assert (v_r->>'pulados')::int >= 1, 'filha sob pai fechado deveria contar em pulados';

  -- filha parcial no 1o mes: filha com vigencia 2026-09-20 e dia 12 -> em set pula (12 < 20); em out entra
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha tardia', v_fin, 12, v_simples, date '2026-09-20');
  -- (X Simples virou pai ao ganhar filha; seu vencimento em out = max(30, 12) = 30)
  v_r := public.agenda_rotinas_materializar(date '2026-10-01', 'manual');
  assert exists (select 1 from public.tarefas t join public.agenda_rotinas r on r.id = t.rotina_id where r.titulo = 'X filha tardia' and t.competencia = date '2026-10-01'), 'filha tardia em out';

  -- registro da rodada
  select count(*) into v_n from public.agenda_materializacoes where origem = 'manual' and competencia = date '2026-09-01';
  assert v_n >= 3, 'agenda_materializacoes deveria ter as rodadas de set';
end $t$;
rollback;
select 'PASS: 07_materializar' as resultado;
```

Run via MCP. Expected: `PASS: 07_materializar`.

- [ ] **Step 5: `proacl`** das 2 funções novas: `{postgres=X/postgres,service_role=X/postgres}`; `prosecdef = true`; cron `active = false`, 0 execuções.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_agenda_rotinas_materializar.sql supabase/tests/agenda/07_materializar.sql
git commit -m "feat(agenda): materializador mensal por competencia (max do pacote, vigencia nominal, pai fechado) + cron inativo"
```

---

### Task 4: Seed — 10 moldes ativos, 22 filhas, 4 registros encerrados

**Files:**
- Create: `supabase/migrations/20260902090300_agenda_seed_rotinas_financeiro.sql`
- Create: `supabase/tests/agenda/08_seed.sql`

**Interfaces:**
- Consumes: Task 1 (`agenda_rotinas`), lista `Financeiro` (existe).
- Produces: 36 linhas em `agenda_rotinas` (10 pais ativos + 22 filhas + 4 pais `encerrada`), nenhuma instância.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260902090300_agenda_seed_rotinas_financeiro.sql`:

```sql
-- Seed das rotinas do grupo Financeiro (catalogo do LA Organizer, spec §8). IDEMPOTENTE: where not exists
-- por (titulo, lista, pai) — replay em branch/restore nao duplica. NUNCA instancias (o cron materializa).
do $seed$
declare
  v_fin uuid;
  v_ord int := 0;

  -- pai ativo: devolve id (cria se faltar)
  function pai(p_titulo text, p_dia int, p_ultimo bool, p_fds text, p_desc text) returns uuid language plpgsql as $f$
  declare v uuid;
  begin
    select id into v from public.agenda_rotinas where lista_id = v_fin and parent_rotina_id is null and titulo = p_titulo;
    if v is null then
      v_ord := v_ord + 10;
      insert into public.agenda_rotinas (titulo, descricao, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
                                         hora, dia_inteiro, status, vigencia_inicio, ordem)
      values (p_titulo, p_desc, v_fin, 'financeiro', 'media', p_dia, p_ultimo, p_fds, time '09:00', true, 'ativa', date '2026-09-01', v_ord)
      returning id into v;
    end if;
    return v;
  end $f$;

  procedure filha(p_pai uuid, p_titulo text, p_dia int, p_ultimo bool, p_fds text) language plpgsql as $p$
  begin
    if not exists (select 1 from public.agenda_rotinas where parent_rotina_id = p_pai and titulo = p_titulo) then
      v_ord := v_ord + 1;
      insert into public.agenda_rotinas (titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
                                         hora, dia_inteiro, status, vigencia_inicio, ordem, parent_rotina_id)
      values (p_titulo, v_fin, 'financeiro', 'media', p_dia, p_ultimo, p_fds, time '09:00', true, 'ativa', date '2026-09-01', v_ord, p_pai);
    end if;
  end $p$;

  procedure encerrada(p_titulo text, p_dia int, p_obs text) language plpgsql as $e$
  begin
    if not exists (select 1 from public.agenda_rotinas where lista_id = v_fin and parent_rotina_id is null and titulo = p_titulo) then
      v_ord := v_ord + 10;
      insert into public.agenda_rotinas (titulo, lista_id, categoria, prioridade, dia_mes, ultimo_dia, se_cair_fim_de_semana,
                                         hora, dia_inteiro, status, encerrada_em, vigencia_inicio, ordem, observacao)
      values (p_titulo, v_fin, 'financeiro', 'media', p_dia, false, 'manter', time '09:00', true, 'encerrada', now(), date '2026-09-01', v_ord, p_obs);
    end if;
  end $e$;

  v uuid;
begin
  select id into v_fin from public.tarefas_listas where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_fin is null then
    raise exception 'lista Financeiro nao encontrada; seed abortado.' using errcode = 'P0001';
  end if;
  select coalesce(max(ordem), 0) into v_ord from public.agenda_rotinas where lista_id = v_fin;

  -- Pacotes (pai + filhas com dia proprio). FDS por natureza (proposta do chat da Maria, 01/09).
  v := pai('Conciliação de Cartões', 30, false, 'manter', null);
    call filha(v, 'Cartão 2270 EMLA', 12, false, 'manter');
    call filha(v, 'Cartão 8516 Barra', 12, false, 'manter');
    call filha(v, 'Cartão 8641 Recreio', 17, false, 'manter');
    call filha(v, 'Cartão 8434 Kids CG', 25, false, 'manter');
    call filha(v, 'Cartão 1074 Kids CG', 25, false, 'manter');
    call filha(v, 'Mercado Pago Barra', 27, false, 'manter');

  v := pai('Pedir fatura ao Luciano', 1, false, 'manter', null);
    call filha(v, 'Recreio 8641', 3, false, 'manter');
    call filha(v, 'Kids CG 1074', 14, false, 'manter');
    call filha(v, 'Kids CG 8434', 14, false, 'manter');
    call filha(v, 'Mercado Pago 4425', 20, false, 'manter');
    call filha(v, 'Barra 8516', 29, false, 'manter');
    call filha(v, 'EMLA CG 2270', 29, false, 'manter');

  v := pai('Depósito de Cheques', 6, false, 'proximo_dia_util', null);
    call filha(v, 'Venc 05 → prazo 06', 6, false, 'proximo_dia_util');
    call filha(v, 'Venc 08 → prazo 09', 9, false, 'proximo_dia_util');
    call filha(v, 'Venc 10 → prazo 11', 11, false, 'proximo_dia_util');
    call filha(v, 'Venc 20 → prazo 21', 21, false, 'proximo_dia_util');

  v := pai('Repasses de Cartões – Maquininha', null, true, 'proximo_dia_util', null);
    call filha(v, 'Repasse Recreio', null, true, 'proximo_dia_util');
    call filha(v, 'Repasse Barra', null, true, 'proximo_dia_util');
    call filha(v, 'Repasse CG', null, true, 'proximo_dia_util');

  v := pai('Cashbacks do mês aplicados', 1, false, 'proximo_dia_util', null);
    call filha(v, 'Cashback Barra', 3, false, 'proximo_dia_util');
    call filha(v, 'Cashback CG', 3, false, 'proximo_dia_util');
    call filha(v, 'Cashback Recreio', 3, false, 'proximo_dia_util');

  -- Simples
  perform pai('Dar baixa no prolabore/poupança/distribuição de lucros – conta cheques', 1, false, 'proximo_dia_util', null);
  perform pai('Fazer relação de previsão de cheques das escolas', 2, false, 'manter', null);
  perform pai('Listar valores repassados para Bistrô', 3, false, 'manter', null);
  perform pai('Relatório Mensal Financeiro (Grupo)', 5, false, 'manter', null);
  perform pai('Faturamento Mensal', 8, false, 'manter', 'indispensável para gerar o SIMPLES');

  -- Registro (encerradas): nao materializam; ninguem recria por engano.
  call encerrada('Conciliação Bancária mês anterior', 1, 'Encerrada no LA Organizer; nao migrada.');
  call encerrada('Enviar faturamento pro Geraldo/contador', 5, 'Encerrada no LA Organizer; nao migrada.');
  call encerrada('Planilha do financeiro por unidade', 5, 'Encerrada no LA Organizer; nao migrada.');
  call encerrada('Conferir débito automático Light (Recreio)', 1, 'Rose 01/09: pode sair — Light passou a débito automático.');
end $seed$;
```

> Nota de sintaxe: funções/procedures locais dentro de `do` não existem em plpgsql. **Implementer:** escreva o bloco com três funções auxiliares **temporárias** criadas antes do `do` e dropadas depois (`create function pg_temp.agenda_seed_pai(...)`, `pg_temp.agenda_seed_filha(...)`, `pg_temp.agenda_seed_encerrada(...)`, com `v_fin` e `v_ord` passados por parâmetro / devolvidos), mantendo **exatamente** os títulos, dias, `ultimo_dia`, regras de FDS, `vigencia_inicio = date '2026-09-01'`, `hora 09:00`, `dia_inteiro true`, `categoria 'financeiro'`, `prioridade 'media'`, e as observações acima. O teste estático confere títulos, `where not exists`, `vigencia_inicio … date '2026-09-01'`, a Light `encerrada` com "Rose 01/09: pode sair", e a ausência de `insert into public.tarefas`.

- [ ] **Step 2: Teste estático** — `seed:` PASS.

- [ ] **Step 3: Aplicar via MCP e espelhar** — `apply_migration(name = agenda_seed_rotinas_financeiro)`; versão; renomear.

- [ ] **Step 4: Verificar em produção**

```sql
select
  (select count(*) from agenda_rotinas where parent_rotina_id is null and status = 'ativa') as pais_ativos_10,
  (select count(*) from agenda_rotinas where parent_rotina_id is not null) as filhas_22,
  (select count(*) from agenda_rotinas where status = 'encerrada') as encerradas_4,
  (select count(*) from agenda_rotinas where titulo like 'Conferir débito automático Light%' and status = 'encerrada') as light_encerrada_1,
  (select count(*) from agenda_rotinas where se_cair_fim_de_semana = 'proximo_dia_util') as fds_proximo_15,
  (select count(*) from tarefas where rotina_id is not null) as instancias_0,
  (select count(*) from agenda_rotinas where vigencia_inicio <> date '2026-09-01') as vigencia_diferente_0;
```

Expected: `10, 22, 4, 1, 15, 0, 0` (`fds_proximo_15` = Depósito 1+4, Repasses 1+3, Cashbacks 1+3, Prolabore 1 = 15).

- [ ] **Step 5: Teste de idempotência (rollback)**

Criar `supabase/tests/agenda/08_seed.sql`:

```sql
-- Reaplica o corpo do seed dentro de rollback e confere que nada duplica.
begin;
do $t$
declare v_antes int; v_depois int;
begin
  select count(*) into v_antes from public.agenda_rotinas;
  -- replay: o implementer cola aqui o mesmo bloco da migration (funcoes pg_temp + do) verbatim
  -- <<< BLOCO DO SEED >>>
  select count(*) into v_depois from public.agenda_rotinas;
  assert v_depois = v_antes, 'seed reaplicado duplicou: ' || v_antes || ' -> ' || v_depois;
  assert (select count(*) from public.agenda_rotinas where parent_rotina_id is null and status='ativa') = 10, 'pais ativos <> 10';
  assert (select count(*) from public.agenda_rotinas where parent_rotina_id is not null) = 22, 'filhas <> 22';
  assert (select count(*) from public.tarefas where rotina_id is not null) = 0, 'seed nao pode criar instancias';
end $t$;
rollback;
select 'PASS: 08_seed' as resultado;
```

**Implementer:** substitua a linha `-- <<< BLOCO DO SEED >>>` pelo conteúdo do seed (as `create function pg_temp…` precisam vir **antes** do `do` do teste — então estruture o arquivo como: `begin;` → `create function pg_temp…` ×3 → `do $t$ … (chama o seed dentro) … $t$` → `rollback;` → `select 'PASS…'`). O teste passa quando a 2ª aplicação não muda a contagem.

Run via MCP. Expected: `PASS: 08_seed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_agenda_seed_rotinas_financeiro.sql supabase/tests/agenda/08_seed.sql
git commit -m "feat(agenda): seed idempotente das rotinas do Financeiro (10 ativas, 22 filhas, 4 registros encerrados)"
```

---

### Task 5: Primeira materialização real + ativação do cron — ORQUESTRADOR, não subagente

**Files:** nenhum (só produção e ledger).

**Interfaces:**
- Consumes: Tasks 1–4 aplicadas e revisadas.
- Produces: instâncias de set/2026 e out/2026; cron `agenda-rotinas-materializar-diario` ativo.

- [ ] **Step 1: Baseline (read-only)**

```sql
select
  (select count(*) from tarefas where rotina_id is not null) as instancias_0,
  (select count(*) from agenda_rotinas where status='ativa' and parent_rotina_id is null) as pais_10,
  (select count(*) from agenda_rotinas where status='ativa' and parent_rotina_id is not null) as filhas_22,
  (select jobid || ' active=' || active from cron.job where jobname='agenda-rotinas-materializar-diario') as cron;
```

Expected: `0, 10, 22, <jobid> active=false`. **Esperado da 1ª execução:** set/2026 → `pais_criados 10, filhas_criadas 22, pulados 0, erros []`; out/2026 → o mesmo. Total 64 instâncias. Todos os `vigencia_inicio` são 01/09 e todas as nominais de setembro são ≥ 01/09.

- [ ] **Step 2: Primeira execução real**

```sql
select public.agenda_materializar_corrente_e_proximo('manual') as primeira_materializacao;
```

Ler o JSON. Qualquer desvio (erros não vazios, contagens diferentes de 10/22) → **parar** e investigar antes de ativar.

- [ ] **Step 3: Integridade + amostra**

```sql
select
  (select count(*) from tarefas where rotina_id is not null) as instancias_64,
  (select count(*) from (select rotina_id, competencia from tarefas where rotina_id is not null group by 1,2 having count(*)>1) d) as dup_0,
  (select count(*) from tarefas t where t.rotina_id is not null and t.parent_id is null and exists (select 1 from agenda_rotinas r where r.id=t.rotina_id and r.parent_rotina_id is not null)) as filhas_sem_pai_0,
  (select string_agg(titulo || ' → ' || to_char(vencimento_em at time zone 'America/Sao_Paulo','DD/MM'), ' | ' order by vencimento_em)
     from tarefas where rotina_id is not null and parent_id is null and competencia = date '2026-09-01') as pais_setembro,
  (select count(*) from agenda_materializacoes where origem='manual') as rodadas_2;
```

Expected: `64, 0, 0, <10 pais com datas: Pedir fatura 29/09, Cashbacks 03/09, Depósito 21/09, Repasses 30/09, Conciliação 30/09, Prolabore 01/09, Previsão 02/09, Bistrô 03/09, Relatório 08/09 (05/09 é sábado → manter = 05/09; conferir), Faturamento 08/09>, 2`. Conferir o `max` do pacote: Pedir fatura deve mostrar **29/09** (não 01/09), Depósito **21/09**, Cashbacks **03/09**.

- [ ] **Step 4: Ativar o cron**

```sql
select cron.alter_job(job_id := (select jobid from cron.job where jobname='agenda-rotinas-materializar-diario'), active := true);
select jobid, schedule, active from cron.job where jobname='agenda-rotinas-materializar-diario';
```

Expected: `active = true`. O próximo tick é 07:30 SP do dia seguinte; a 2ª rodada deve reportar `0/0` criadas (idempotência em produção) — conferir em `agenda_materializacoes` no dia seguinte.

- [ ] **Step 5: Verificação no preview (Agenda)**

Abrir a Agenda (`dev-alt`, porta 3002) → lista Financeiro mostra as rotinas de setembro (ex.: "Conciliação de Cartões" 30/09 com filhas "Cartão 8641 Recreio" 17/09 etc.). Registrar no ledger.

---

### Task 6: Sync grava `agenda_materializacoes` (M-13) — `agenda_sync_contas_pagar_v5`

**Files:**
- Create: `supabase/migrations/20260902090400_agenda_sync_contas_pagar_v5.sql`
- Create: `supabase/tests/agenda/09_sync_materializacoes.sql`

**Interfaces:**
- Consumes: `agenda_sync_contas_pagar` v4 (fase A), `agenda_materializacoes` (Task 1).
- Produces: v5 — mesma função, mesmo retorno, mais 1 linha em `agenda_materializacoes` por rodada (`origem = 'sync'`, `criados`, `atualizados`, `removidos`, `detalhes = {hoje, janela}`).

- [ ] **Step 1: Escrever a migration**

`create or replace function public.agenda_sync_contas_pagar() returns jsonb …` com o **corpo verbatim da v4** (`supabase/migrations/20260902004547_agenda_sync_contas_pagar_v4.sql`), acrescentando (a) `v_ini timestamptz := clock_timestamp();` no `declare`, e (b) imediatamente antes do `return jsonb_build_object(...)`:

```sql
  insert into public.agenda_materializacoes (origem, competencia, duracao_ms, criados, atualizados, removidos, detalhes)
  values ('sync', null, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int, v_ins, v_upd, v_del,
          jsonb_build_object('hoje', v_hoje, 'janela', jsonb_build_array(v_ini_janela, v_fim)));
```

(**Atenção ao nome:** na v4 a variável da janela chama-se `v_ini` — renomeie-a para `v_ini_janela` nos dois usos, porque `v_ini` passa a ser o `clock_timestamp`.) Header comment: "v5 = v4 + registro em agenda_materializacoes (M-13). Sem bloco de cron." Re-declarar revoke/grant.

- [ ] **Step 2: Teste estático** — todos os 10 blocos de `agenda_fase_b1.test.mjs` PASS (inclusive `arquivos existem`).

- [ ] **Step 3: Aplicar via MCP e espelhar** — `apply_migration(name = agenda_sync_contas_pagar_v5)`; versão; renomear; `proacl`/`prosecdef` inalterados; `cron.job` 18 intocado (`active = true`).

- [ ] **Step 4: Teste comportamental**

Criar `supabase/tests/agenda/09_sync_materializacoes.sql`:

```sql
begin;
do $t$
declare v_antes int; v_r jsonb; v_row public.agenda_materializacoes%rowtype;
begin
  select count(*) into v_antes from public.agenda_materializacoes where origem = 'sync';
  v_r := public.agenda_sync_contas_pagar();
  select * into v_row from public.agenda_materializacoes where origem = 'sync' order by executado_em desc limit 1;
  assert (select count(*) from public.agenda_materializacoes where origem = 'sync') = v_antes + 1, 'sync deveria gravar 1 linha';
  assert v_row.criados = (v_r->>'inseridas')::int and v_row.atualizados = (v_r->>'atualizadas')::int and v_row.removidos = (v_r->>'orfas_removidas')::int, 'contagens divergem do retorno';
  assert v_row.detalhes ? 'janela', 'detalhes.janela ausente';
  assert v_row.competencia is null, 'sync nao tem competencia';
end $t$;
rollback;
select 'PASS: 09_sync_materializacoes' as resultado;
```

Run via MCP. Expected: `PASS: 09_sync_materializacoes`. (O teste roda o sync real sob rollback — como o 04.)

- [ ] **Step 5: `npm test` inclui a B1**

Em `package.json`, acrescentar `supabase/migrations/agenda_fase_b1.test.mjs` à lista do script `test`. Run: `npm test` → todos passando (39 + 10 = 49).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_agenda_sync_contas_pagar_v5.sql supabase/tests/agenda/09_sync_materializacoes.sql package.json
git commit -m "feat(agenda): sync registra cada rodada em agenda_materializacoes (M-13)"
```

---

### Task 7: Verificação §10 da B1 + nota no handoff

**Files:**
- Modify: `Docs/handoffs/2026-09-01-agenda-maria.md` §14 (nota "B1 entregue"; STATUS **continua** pré-implementação — o PRONTO é da B2)

- [ ] **Step 1: Varredura de fuso e `proacl` (produção)**

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and proname like 'agenda\_%' escape '\'
   and (prosrc ~* '\mcurrent_date\M' or prosrc ~* 'now\(\)::date');
```
Expected: 0 linhas.

```sql
select proname, proacl, prosecdef, provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and proname like 'agenda\_%' escape '\' order by proname;
```
Expected: 10 funções (`agenda_brl, agenda_destinatarios, agenda_lembretes_devidos, agenda_momento_lembrete, agenda_resumo_usuario, agenda_sync_contas_pagar, agenda_resolve_dia, agenda_ajustar_data, agenda_rotinas_materializar, agenda_materializar_corrente_e_proximo`), `proacl` não nulo em todas, só `postgres`/`service_role`.

- [ ] **Step 2: Integridade**

```sql
select
  (select count(*) from (select rotina_id, competencia from tarefas where rotina_id is not null group by 1,2 having count(*)>1) d) as dup_rotina_0,
  (select count(*) from (select vinculo_tipo, vinculo_id from tarefas where vinculo_id is not null group by 1,2 having count(*)>1) d) as dup_vinculo_0,
  (select count(*) from tarefas where rotina_id is not null) as instancias,
  (select count(*) from agenda_materializacoes where jsonb_array_length(erros) > 0) as rodadas_com_erro_0,
  (select active from cron.job where jobname='agenda-rotinas-materializar-diario') as cron_rotinas_true,
  (select active from cron.job where jobname='agenda-sync-contas-10min') as cron_sync_true;
```
Expected: `0, 0, 64 (+ o que o cron criar), 0, true, true`.

- [ ] **Step 3: Suíte + typecheck** — `npm test` (49/49) e `npm run typecheck`.

- [ ] **Step 4: Handoff** — em §14, abaixo do parágrafo "Fase A entregue…", acrescentar:

```markdown
**Fase B1 entregue em <data>:** `agenda_rotinas` (10 moldes ativos + 22 filhas + 4 registros encerrados), `tarefas.rotina_id/competencia` com `UNIQUE (rotina_id, competencia)`, `agenda_materializacoes` (o sync também grava, `origem='sync'`), `agenda_resolve_dia`, `agenda_ajustar_data`, `agenda_rotinas_materializar`, cron `agenda-rotinas-materializar-diario` 07:30 SP. Migrations: `<versões>`. As 18 RPCs (B2) vêm a seguir; **STATUS continua pré-implementação.**
```

Commit: `docs(agenda): handoff registra entrega da fase B1`.

- [ ] **Step 5: Fechar a branch** — `superpowers:finishing-a-development-branch` (merge é decisão do Alf).

---

## Self-review

**Cobertura da spec (B1):** §4.1 `rotina_id`/`competencia` → T1; §4.2 `agenda_rotinas` (todas as colunas, CHECKs, `vigencia_inicio`, `mensagem_origem_id`) → T1; §4.6 `agenda_materializacoes` → T1 (+ `criados/atualizados/removidos/detalhes` pra servir o sync, M-13 → T6); §4.7 `UNIQUE (rotina_id, competencia)` não-parcial + índice competência → T1; §4.8 (fase A) inalterado; §5.1 `agenda_ajustar_data` ponto único + gancho de feriados → T2; §5.2 `agenda_resolve_dia` → T2; §5.3 materializador (max, vigência nominal por linha, pai fechado, pausada/encerrada, exception por pai, `agenda_materializacoes`, cron corrente+próximo) → T3 + T5; §5.5 grants → T2/T3/T6; §8 seed (10 ativas, Light encerrada, 3 registros, FDS por natureza, `vigencia_inicio` 01/09, nunca instâncias, idempotente) → T4; §10 (fuso como teste, `proacl`, integridade, produção) → T1 estático + T7; §11 ordem (6 antes de 5) e gate (1ª materialização pelo orquestrador) → T5; §4.2 "profundidade 1 na RPC" reforçada em trigger (lição da fase A). **Fora da B1:** §6 (feito na A), §7 RPCs (B2), `maria_whatsapp_atores.user_id` (feito na A), membros (feito na A).

**Placeholders:** o seed usa duas marcas deliberadas de instrução ao implementer (`<<< BLOCO DO SEED >>>` no teste 08 e a nota de sintaxe sobre funções `pg_temp`) — não são "TBD": dizem exatamente o que colar e como estruturar. `<data>`/`<versões>` em T7 são slots preenchidos na execução, como na fase A.

**Consistência de nomes:** `agenda_resolve_dia(date, integer, boolean)` e `agenda_ajustar_data(date, text)` (T2) são as assinaturas chamadas em T3; `agenda_rotinas_materializar(date, text)` e `agenda_materializar_corrente_e_proximo(text)` (T3) são as chamadas em T5 e no cron; `agenda_materializacoes` (T1) tem `origem/competencia/duracao_ms/pais_criados/filhas_criadas/pulados/criados/atualizados/removidos/erros/detalhes` — T3 usa as 7 primeiras, T6 usa `origem, competencia, duracao_ms, criados, atualizados, removidos, detalhes`; o teste estático de T1 assere exatamente essas listas.
