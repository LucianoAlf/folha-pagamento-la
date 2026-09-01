# Agenda × Maria — Fase A (fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o espelho "Pagar:" pro servidor (plpgsql + pg_cron + índice único), criar a hierarquia pai/filha com guardas em trigger, e tornar as notificações da Agenda multiusuário (responsável = membros da lista, `agenda_destinatarios` como ponto único, janela de silêncio, resumo completo) — sem quebrar nada que a Ana recebe hoje.

**Architecture:** Toda regra de negócio nova nasce em **plpgsql** no banco (uma implementação: `agenda_sync_contas_pagar`, `agenda_destinatarios`, `agenda_momento_lembrete`, `agenda_lembretes_devidos`, `agenda_resumo_usuario`), agendada por `pg_cron` em SQL direto. As duas edge functions de WhatsApp viram consumidoras finas dessas funções e iteram **todas** as `notificacao_config` ativas. O cliente perde o sync de contas (fica só o de Folha). Invariantes de `tarefas` (profundidade ≤ 1, delete de pai) vão pra trigger porque a tabela tem dois escritores.

**Tech Stack:** Postgres 17 (Supabase, projeto `ubdvtjbitozhkuvvqkxj`), plpgsql, pg_cron, Edge Functions (Deno) deployadas com `npx supabase functions deploy <fn> --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt`, React 19 + TS (`npm run typecheck`), testes `node --test --experimental-strip-types`, SQL comportamental via MCP `execute_sql` em `begin … rollback`.

**Spec:** `Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md` (§4.1, §4.3–4.5, §4.7–4.8, §5.4–5.5, §6, §10, §11 fase A).

## Global Constraints

- **Fuso:** toda decisão de "hoje", janela e `vencimento_em` usa `(now() at time zone 'America/Sao_Paulo')`. **`current_date` e `now()::date` são proibidos** em qualquer função `agenda_%` (teste estático + varredura de `pg_proc.prosrc`).
- **Índices únicos não-parciais**, sem filtro de status (`NULL` é distinto; `ON CONFLICT (cols)` sem `WHERE` só infere não-parcial).
- **Guardas em trigger + mensagem legível**; RPCs (fase B) pré-checam.
- **Grants:** funções internas → `revoke all … from public, anon, authenticated` + `grant execute … to service_role`. **`proacl` nulo é falha.**
- **Migrations:** aplicar via MCP `apply_migration(project_id, name, query)`; o servidor gera a versão. Espelhar localmente como `supabase/migrations/<versão-do-servidor>_<name>.sql` (a versão vem de `select version from supabase_migrations.schema_migrations where name = '<name>'`). Testes estáticos localizam o arquivo pelo **sufixo** `_<name>.sql`, então o rename não quebra nada.
- **Sem telefone em migration** (iria pro GitHub). **Nada é escrito em `maria-backup`.**
- **Ordem de deploy:** o cron `agenda-sync-contas-10min` sobe e **roda** (Task 4) **antes** de o cliente perder o sync de contas (Task 5).
- **Mensagens de erro em português com `errcode`** (`P0001` regra, `22023` parâmetro, `42501` auth).
- **Sync é dono só de:** `titulo, descricao, lista_id, prioridade, tags, unidade, vencimento_em, status, data_conclusao, updated_at`. Nunca toca `responsavel_id`, `parent_id`, `concluida_por`; `lembrete_minutos` e `ordem` só no insert.
- **Órfã** = conta inexistente, `cancelado` ou `finalizado`. Sair da janela −90/+45 **não** é órfã.
- Commits pequenos, mensagens no padrão do repo (`feat:`/`fix:`/`test:`/`docs:` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

**Desvio deliberado da spec (§6.4):** a chave de idempotência dos lembretes usa o índice **já existente** `lembretes_log_idempotency_uq (canal, tipo, coalesce(tarefa_id), coalesce(conta_pagar_id), scheduled_for, coalesce(destinatario))` — que já inclui `destinatario` — com `scheduled_for` **determinístico** (calculado do vencimento, não de `now()`), em vez de `date_trunc('hour', scheduled_for)` num índice: `date_trunc` sobre `timestamptz` é STABLE e não pode ir em expressão de índice. O efeito pedido ("dois jobs a 5 min não mandam duas vezes") vale igual, porque runs diferentes calculam o mesmo `scheduled_for`. O que **sai** é `unique_lembrete_envio (tarefa_id, canal, tipo, scheduled_for)` — sem `destinatario`, dedupicaria a segunda pessoa pela primeira.

**Execução (decisão do Alf, 01/09):** Subagent-Driven. **Tasks 1–4** (escrevem no banco de produção) com **Opus**; Tasks 5–7 podem ser Sonnet; **nunca Haiku**. **A primeira execução real de `agenda_sync_contas_pagar()` (Task 4 Step 6) e o gate da Task 5 Step 1 são rodados e lidos pelo orquestrador desta sessão, não delegados** — é o único momento da fase A que toca os 532 espelhos de produção de uma vez. O subagente da Task 4 entrega a função aplicada e testada em rollback (Steps 1–5) e **para**; o orquestrador roda o Step 6.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<v>_agenda_fase_a_schema.sql` | colunas em `tarefas`, `tarefas_listas_membros`, `maria_whatsapp_atores.user_id`, índices, triggers, seed de membros/atores |
| `supabase/migrations/<v>_notificacao_config_rls_por_usuario.sql` | RLS `user_id = auth.uid()`; drop de `unique_lembrete_envio` |
| `supabase/migrations/<v>_agenda_destinatarios_lembretes.sql` | `agenda_destinatarios`, `agenda_momento_lembrete`, `agenda_lembretes_devidos`, `agenda_resumo_usuario` + grants |
| `supabase/migrations/<v>_agenda_sync_contas_pagar.sql` | `agenda_brl`, `agenda_sync_contas_pagar`, cron `agenda-sync-contas-10min` + grants |
| `supabase/migrations/agenda_fase_a.test.mjs` | testes estáticos (regex) sobre os 4 SQLs — padrão da casa (`rh_onboarding_operacoes.test.mjs`) |
| `supabase/tests/agenda/*.sql` | testes comportamentais `begin … rollback` (rodar via MCP `execute_sql`) |
| `services/agendaIntegrations.ts` | **remove** sync de contas; mantém Folha |
| `types/agenda.ts` | `Tarefa` ganha `parent_id`, `responsavel_id`, `concluida_por`, `mensagem_origem_id` |
| `scripts/reset-contas-pagar-data.sql:33` | comentário aponta pro cron |
| `supabase/functions/_shared/agendaLembretes.ts` (+ `.test.mjs`) | planejamento puro dos pings (quem, quando, texto) |
| `supabase/functions/_shared/agendaResumo.ts` (+ `.test.mjs`) | formatação pura do resumo individual completo |
| `supabase/functions/whatsapp-agenda-lembretes/index.ts` | consome `agenda_lembretes_devidos`; multiusuário |
| `supabase/functions/whatsapp-agenda-resumo/index.ts` | consome `agenda_resumo_usuario`; multiusuário; sem truncar |

---

### Task 1: Branch + migration de schema da fase A (item 3 + parte do 4)

**Files:**
- Create: `supabase/migrations/20260901200000_agenda_fase_a_schema.sql` (renomear pro sufixo com a versão do servidor após aplicar)
- Create: `supabase/migrations/agenda_fase_a.test.mjs`
- Create: `supabase/tests/agenda/01_schema_guardas.sql`

**Interfaces:**
- Produces: colunas `tarefas.parent_id uuid`, `tarefas.responsavel_id uuid`, `tarefas.concluida_por uuid`, `tarefas.mensagem_origem_id text`; tabela `tarefas_listas_membros(lista_id, user_id)`; coluna `maria_whatsapp_atores.user_id uuid`; índice único `tarefas_vinculo_uniq (vinculo_tipo, vinculo_id)`; triggers `tarefas_guard_parent`, `tarefas_guard_delete`.

- [ ] **Step 1: Criar a branch**

```bash
cd "D:/2025/CURSO_VIBE_CODING/dash-folha-pagamento" && git switch -c feat/agenda-fase-a
```

- [ ] **Step 2: Escrever o teste estático (falha porque o SQL não existe)**

Criar `supabase/migrations/agenda_fase_a.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
function readBySuffix(suffix) {
  const f = readdirSync(dir).find((n) => n.endsWith(suffix));
  return f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
}
const schema = readBySuffix('_agenda_fase_a_schema.sql');
const rls = readBySuffix('_notificacao_config_rls_por_usuario.sql');
const dest = readBySuffix('_agenda_destinatarios_lembretes.sql');
const sync = readBySuffix('_agenda_sync_contas_pagar.sql');
const todos = [schema, rls, dest, sync].join('\n');

test('schema: colunas, membros, ator.user_id, indice unico de vinculo nao-parcial', () => {
  assert.match(schema, /add column if not exists parent_id uuid null references public\.tarefas\(id\) on delete set null/i);
  assert.match(schema, /add column if not exists responsavel_id uuid null references public\.user_profiles\(id\)/i);
  assert.match(schema, /add column if not exists concluida_por uuid null references public\.user_profiles\(id\)/i);
  assert.match(schema, /add column if not exists mensagem_origem_id text null/i);
  assert.match(schema, /create unique index if not exists tarefas_vinculo_uniq on public\.tarefas \(vinculo_tipo, vinculo_id\);/i);
  assert.doesNotMatch(schema, /tarefas_vinculo_uniq[^;]*where/i);
  assert.match(schema, /create table if not exists public\.tarefas_listas_membros/i);
  assert.match(schema, /primary key \(lista_id, user_id\)/i);
  assert.match(schema, /alter table public\.maria_whatsapp_atores add column if not exists user_id uuid null references public\.user_profiles\(id\)/i);
});

test('schema: triggers de profundidade e de delete', () => {
  assert.match(schema, /create trigger tarefas_guard_parent before insert or update of parent_id on public\.tarefas/i);
  assert.match(schema, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(schema, /create trigger tarefas_guard_delete before delete on public\.tarefas/i);
  assert.match(schema, /pai com filha ativa nao pode ser excluido\./);
});

test('schema: membros — leitura pra logados, escrita so admin (fonte de autorizacao da Maria)', () => {
  assert.match(schema, /create policy listas_membros_select on public\.tarefas_listas_membros\s+for select using \(\(select auth\.role\(\)\) = 'authenticated'\)/i);
  assert.match(schema, /create policy listas_membros_insert_admin on public\.tarefas_listas_membros\s+for insert with check \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create policy listas_membros_update_admin on public\.tarefas_listas_membros\s+for update using \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create policy listas_membros_delete_admin on public\.tarefas_listas_membros\s+for delete using \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.doesNotMatch(schema, /tarefas_listas_membros\s+for all using/i);
});

test('schema: seed de membros e atores sem telefone', () => {
  assert.match(schema, /cf0e4bf0-d056-4b55-83c1-92b81f6be9c4/); // Rose
  assert.match(schema, /81305959-dc68-4f8e-b54f-dd055dabcfd4/); // Ana
  assert.match(schema, /41351a8b-68bf-48d5-a5d1-69c1a2848f5d/); // Luciano
  assert.doesNotMatch(schema, /whatsapp_numero/i);
  assert.doesNotMatch(schema, /\b55\d{10,11}\b/);
});

test('rls: notificacao_config por usuario e drop do indice sem destinatario', () => {
  assert.match(rls, /drop policy if exists auth_config on public\.notificacao_config/i);
  assert.match(rls, /for insert with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(rls, /for select using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(rls, /drop index if exists public\.unique_lembrete_envio/i);
});

test('funcoes: destinatarios, momento (janela 07:30-21:00), devidos, resumo_usuario + grants fechados', () => {
  assert.match(dest, /function public\.agenda_destinatarios\(p_tarefa_id uuid\)/i);
  assert.match(dest, /function public\.agenda_momento_lembrete\(p_vencimento timestamptz, p_dia_inteiro boolean, p_minutos integer\)/i);
  assert.match(dest, /time '07:30'/);
  assert.match(dest, /time '21:00'/);
  assert.match(dest, /function public\.agenda_lembretes_devidos\(p_ate timestamptz\)/i);
  assert.match(dest, /function public\.agenda_resumo_usuario\(p_user_id uuid, p_data date, p_dias integer/i);
  for (const fn of ['agenda_destinatarios(uuid)', 'agenda_momento_lembrete(timestamptz, boolean, integer)', 'agenda_lembretes_devidos(timestamptz)', 'agenda_resumo_usuario(uuid, date, integer)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(dest, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(dest, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
});

test('sync: funcao, cron *\\/10, colunas de dono, orfa so por conta invalida, grants fechados', () => {
  assert.match(sync, /function public\.agenda_sync_contas_pagar\(\)/i);
  assert.match(sync, /function public\.agenda_brl\(p numeric\)\s+returns text language sql stable/i);
  assert.doesNotMatch(sync, /agenda_brl\(p numeric\)\s+returns text language sql immutable/i);
  assert.match(sync, /on conflict \(vinculo_tipo, vinculo_id\) do update set/i);
  assert.doesNotMatch(sync, /do update set[\s\S]*?responsavel_id\s*=/i);
  assert.doesNotMatch(sync, /do update set[\s\S]*?parent_id\s*=/i);
  assert.match(sync, /c\.status not in \('cancelado','finalizado'\)/i);
  assert.match(sync, /'agenda-sync-contas-10min'/);
  assert.match(sync, /'\*\/10 \* \* \* \*'/);
  assert.match(sync, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
  assert.match(sync, /grant execute on function public\.agenda_sync_contas_pagar\(\) to service_role/i);
});

test('fuso: nenhuma funcao agenda_% usa current_date ou now()::date', () => {
  assert.doesNotMatch(todos, /\bcurrent_date\b/i);
  assert.doesNotMatch(todos, /now\(\)::date/i);
  assert.match(todos, /at time zone 'America\/Sao_Paulo'/);
});

test('arquivos existem', () => {
  for (const [nome, txt] of Object.entries({ schema, rls, dest, sync })) assert.ok(txt.length > 0, `${nome} vazio/ausente`);
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs`
Expected: FAIL — `arquivos existem` e os demais falham porque os SQLs ainda não existem (strings vazias).

- [ ] **Step 4: Escrever a migration de schema**

Criar `supabase/migrations/20260901200000_agenda_fase_a_schema.sql`:

```sql
-- Agenda fase A (item 3 + 4): pacote pai/filha, responsavel, membros da lista, guardas.
-- Spec: Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md §4.1, §4.3, §4.4, §4.7, §4.8.

alter table public.tarefas
  add column if not exists parent_id uuid null references public.tarefas(id) on delete set null,
  add column if not exists responsavel_id uuid null references public.user_profiles(id),
  add column if not exists concluida_por uuid null references public.user_profiles(id),
  add column if not exists mensagem_origem_id text null;

create index if not exists idx_tarefas_parent on public.tarefas (parent_id);
create index if not exists idx_tarefas_responsavel on public.tarefas (responsavel_id);
create index if not exists idx_tarefas_mensagem_origem on public.tarefas (mensagem_origem_id);

-- 1 espelho por vinculo. Nao-parcial: NULL e distinto, e ON CONFLICT (cols) so infere nao-parcial.
-- Verificado em 01/09: 0 duplicatas em (vinculo_tipo, vinculo_id) — entra sem limpeza.
create unique index if not exists tarefas_vinculo_uniq on public.tarefas (vinculo_tipo, vinculo_id);

-- A lista e o grupo (A1): serve lembrete (responsavel nulo = membros) e autorizacao (fase B).
create table if not exists public.tarefas_listas_membros (
  lista_id uuid not null references public.tarefas_listas(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lista_id, user_id)
);
alter table public.tarefas_listas_membros enable row level security;
-- Fonte de autorizacao da Maria (porta fina, fase B): leitura livre pra logados, escrita so admin.
-- Com `for all authenticated`, qualquer logado se adicionaria a qualquer lista e passaria a opera-la.
-- financeiro_cartoes_is_admin() e a checagem de admin da casa (user_profiles.role = 'admin').
drop policy if exists auth_listas_membros on public.tarefas_listas_membros;
drop policy if exists listas_membros_select on public.tarefas_listas_membros;
drop policy if exists listas_membros_insert_admin on public.tarefas_listas_membros;
drop policy if exists listas_membros_update_admin on public.tarefas_listas_membros;
drop policy if exists listas_membros_delete_admin on public.tarefas_listas_membros;
create policy listas_membros_select on public.tarefas_listas_membros
  for select using ((select auth.role()) = 'authenticated');
create policy listas_membros_insert_admin on public.tarefas_listas_membros
  for insert with check (public.financeiro_cartoes_is_admin());
create policy listas_membros_update_admin on public.tarefas_listas_membros
  for update using (public.financeiro_cartoes_is_admin()) with check (public.financeiro_cartoes_is_admin());
create policy listas_membros_delete_admin on public.tarefas_listas_membros
  for delete using (public.financeiro_cartoes_is_admin());

-- Ator da Maria -> usuario do app (autorizacao por lista na fase B).
alter table public.maria_whatsapp_atores add column if not exists user_id uuid null references public.user_profiles(id);
create unique index if not exists maria_whatsapp_atores_user_id_uniq on public.maria_whatsapp_atores (user_id);

-- Guarda 1: profundidade maxima 1 (vale pro app e pras RPCs — tarefas tem dois escritores).
create or replace function public.tarefas_guard_parent()
returns trigger language plpgsql set search_path = public as $$
declare v_pai_parent uuid;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'tarefa nao pode ser pai de si mesma.' using errcode = 'P0001';
  end if;
  select parent_id into v_pai_parent from public.tarefas where id = new.parent_id;
  if not found then
    raise exception 'pai nao encontrado.' using errcode = 'P0001';
  end if;
  if v_pai_parent is not null then
    raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tarefas where parent_id = new.id) then
    raise exception 'profundidade maxima 1: tarefa com filhas nao pode virar filha.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_guard_parent on public.tarefas;
create trigger tarefas_guard_parent before insert or update of parent_id on public.tarefas
  for each row execute function public.tarefas_guard_parent();

-- Guarda 2: pai com filha ativa nao se apaga (on delete set null e so rede de seguranca).
create or replace function public.tarefas_guard_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.tarefas
     where parent_id = old.id and status in ('pendente', 'em_andamento', 'adiada')
  ) then
    raise exception 'pai com filha ativa nao pode ser excluido.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists tarefas_guard_delete on public.tarefas;
create trigger tarefas_guard_delete before delete on public.tarefas
  for each row execute function public.tarefas_guard_delete();

-- Seed: listas Financeiro/RH (por nome, criadas se faltarem), membros, atores -> user_id.
-- Mapa ator -> user_id verificado pelo chat da Maria em 01/09 (nao casado por nome).
do $seed$
declare v_fin uuid; v_rh uuid;
begin
  select id into v_fin from public.tarefas_listas
   where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_fin is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('Financeiro', '#8b5cf6', '💰', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_fin;
  end if;

  select id into v_rh from public.tarefas_listas
   where lower(nome) = 'rh' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_rh is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('RH', '#a78bfa', '👩‍💼', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_rh;
  end if;

  insert into public.tarefas_listas_membros (lista_id, user_id) values
    (v_fin, 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'),   -- Rose
    (v_fin, '81305959-dc68-4f8e-b54f-dd055dabcfd4'),   -- Ana
    (v_rh,  '81305959-dc68-4f8e-b54f-dd055dabcfd4')    -- Ana
  on conflict do nothing;

  update public.maria_whatsapp_atores set user_id = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'
   where id = 'c67a8e42-05cf-499b-a249-a34d29c6479f' and user_id is null;   -- Rose
  update public.maria_whatsapp_atores set user_id = '81305959-dc68-4f8e-b54f-dd055dabcfd4'
   where id = '316f156b-3be7-4c44-af16-259f0db7adc3' and user_id is null;   -- Ana
  update public.maria_whatsapp_atores set user_id = '41351a8b-68bf-48d5-a5d1-69c1a2848f5d'
   where id = 'b7f8dbda-1d4c-484e-859c-c33c8cfb2b29' and user_id is null;   -- Luciano Alf
end $seed$;
```

- [ ] **Step 5: Rodar o teste estático — só os blocos de `schema` passam**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs`
Expected: `schema: …` (3 testes) PASS; `rls`, `funcoes`, `sync`, `arquivos existem` ainda FAIL (arquivos das Tasks 2–4).

- [ ] **Step 6: Aplicar em produção via MCP e espelhar a versão**

Via MCP `apply_migration` com `project_id = ubdvtjbitozhkuvvqkxj`, `name = agenda_fase_a_schema`, `query = <conteúdo do arquivo>`.
Depois, via MCP `execute_sql`:

```sql
select version from supabase_migrations.schema_migrations where name = 'agenda_fase_a_schema';
```

Renomear o arquivo local para `supabase/migrations/<version>_agenda_fase_a_schema.sql`.

- [ ] **Step 7: Verificar em produção**

Via MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name='tarefas' and column_name in ('parent_id','responsavel_id','concluida_por','mensagem_origem_id')) as colunas_4,
  (select count(*) from pg_indexes where indexname='tarefas_vinculo_uniq' and indexdef not ilike '%where%') as idx_vinculo_nao_parcial_1,
  (select count(*) from pg_trigger where tgname in ('tarefas_guard_parent','tarefas_guard_delete')) as triggers_2,
  (select count(*) from tarefas_listas_membros) as membros_3,
  (select count(*) from pg_policies where tablename='tarefas_listas_membros') as politicas_membros_4,
  (select count(*) from maria_whatsapp_atores where user_id is not null) as atores_com_user_3;
```

Expected: `4, 1, 2, 3, 4, 3`.

- [ ] **Step 8: Teste comportamental das guardas (rollback)**

Criar `supabase/tests/agenda/01_schema_guardas.sql`:

```sql
-- Rodar via MCP execute_sql. Esperado: sem erro e a ultima linha 'PASS: 01_schema_guardas'.
begin;
do $t$
declare v_pai uuid; v_filha uuid; v_ok boolean;
begin
  insert into public.tarefas (titulo, status) values ('T pai', 'pendente') returning id into v_pai;
  insert into public.tarefas (titulo, status, parent_id) values ('T filha', 'pendente', v_pai) returning id into v_filha;

  -- filha de filha -> recusa
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, parent_id) values ('T neta', 'pendente', v_filha);
  exception when others then
    v_ok := sqlerrm like 'profundidade maxima 1%';
  end;
  assert v_ok, 'neta deveria ser recusada por profundidade';

  -- delete de pai com filha ativa -> recusa
  v_ok := false;
  begin
    delete from public.tarefas where id = v_pai;
  exception when others then
    v_ok := sqlerrm like 'pai com filha ativa%';
  end;
  assert v_ok, 'delete de pai com filha ativa deveria ser recusado';

  -- filha concluida -> pai pode ser excluido
  update public.tarefas set status = 'concluida' where id = v_filha;
  delete from public.tarefas where id = v_pai;
  assert (select parent_id from public.tarefas where id = v_filha) is null, 'on delete set null falhou';
end $t$;
rollback;
select 'PASS: 01_schema_guardas' as resultado;
```

Run: via MCP `execute_sql` com o conteúdo do arquivo.
Expected: última linha `PASS: 01_schema_guardas`, sem erro.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/*_agenda_fase_a_schema.sql supabase/migrations/agenda_fase_a.test.mjs supabase/tests/agenda/01_schema_guardas.sql
git commit -m "feat(agenda): schema fase A — parent_id, responsavel, membros da lista, guardas em trigger, indice unico de vinculo"
```

---

### Task 2: RLS de `notificacao_config` por usuário + índice de lembretes com destinatário

**Files:**
- Create: `supabase/migrations/20260901200100_notificacao_config_rls_por_usuario.sql`
- Create: `supabase/tests/agenda/02_rls_notificacao_config.sql`

**Interfaces:**
- Consumes: nada.
- Produces: políticas `notificacao_config_{select,insert,update,delete}_own`; índice `unique_lembrete_envio` removido (fica `lembretes_log_idempotency_uq`, que tem `destinatario`).

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260901200100_notificacao_config_rls_por_usuario.sql`:

```sql
-- notificacao_config: de `authenticated ALL` para `user_id = auth.uid()`.
-- Corrige a raiz do `.maybeSingle()` sem filtro (2 linhas = PGRST116) e do "Somente Ana" nos jobs.
-- service_role continua vendo todas (bypass RLS) — os jobs iteram por usuario.
-- upsertNotificacaoConfig (services/agendaService.ts) ja envia user_id no insert; o with_check exige isso.

drop policy if exists auth_config on public.notificacao_config;
drop policy if exists notificacao_config_select_own on public.notificacao_config;
drop policy if exists notificacao_config_insert_own on public.notificacao_config;
drop policy if exists notificacao_config_update_own on public.notificacao_config;
drop policy if exists notificacao_config_delete_own on public.notificacao_config;

create policy notificacao_config_select_own on public.notificacao_config
  for select using (user_id = (select auth.uid()));
create policy notificacao_config_insert_own on public.notificacao_config
  for insert with check (user_id = (select auth.uid()));
create policy notificacao_config_update_own on public.notificacao_config
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notificacao_config_delete_own on public.notificacao_config
  for delete using (user_id = (select auth.uid()));

-- lembretes_log: a chave sem destinatario dedupicaria a segunda pessoa pela primeira.
-- Fica lembretes_log_idempotency_uq (canal, tipo, tarefa, conta, scheduled_for, destinatario).
drop index if exists public.unique_lembrete_envio;
```

- [ ] **Step 2: Teste estático**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs`
Expected: `rls: …` PASS (além dos de `schema`).

- [ ] **Step 3: Aplicar via MCP e espelhar a versão**

MCP `apply_migration(name = notificacao_config_rls_por_usuario)`; depois `select version … where name = 'notificacao_config_rls_por_usuario'` e renomear o arquivo.

- [ ] **Step 4: Teste comportamental do `with_check` (usuário sem linha = a Rose)**

Criar `supabase/tests/agenda/02_rls_notificacao_config.sql`:

```sql
-- Rodar via MCP execute_sql. Simula a Rose (sem linha) inserindo a propria config, e a Ana lendo so a dela.
begin;
select set_config('request.jwt.claim.sub', 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', true),
       set_config('request.jwt.claims', '{"sub":"cf0e4bf0-d056-4b55-83c1-92b81f6be9c4","role":"authenticated"}', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- insert da propria linha passa o with_check (sem telefone: whatsapp_numero fica nulo)
insert into public.notificacao_config (user_id, whatsapp_ativo, resumo_diario_ativo)
values ('cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', false, true);

do $t$
begin
  assert (select count(*) from public.notificacao_config) = 1, 'Rose deveria ver exatamente 1 linha (a dela)';
  assert (select user_id from public.notificacao_config limit 1) = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', 'linha visivel nao e da Rose';
end $t$;

-- insert em nome de outro usuario e recusado
do $t$
declare v_ok boolean := false;
begin
  begin
    insert into public.notificacao_config (user_id) values ('81305959-dc68-4f8e-b54f-dd055dabcfd4');
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  assert v_ok, 'insert em nome da Ana deveria falhar com 42501';
end $t$;

reset role;
rollback;
select 'PASS: 02_rls_notificacao_config' as resultado;
```

Run: via MCP `execute_sql`.
Expected: `PASS: 02_rls_notificacao_config`. Se `set local role authenticated` falhar por permissão, rodar o mesmo bloco com `set local role postgres` **não** vale — reportar; a verificação alternativa é o Step 5.

- [ ] **Step 5: Verificação em produção (política + índice)**

```sql
select
  (select count(*) from pg_policies where tablename='notificacao_config' and policyname like 'notificacao_config_%_own') as politicas_4,
  (select count(*) from pg_policies where tablename='notificacao_config' and policyname='auth_config') as antiga_0,
  (select count(*) from pg_indexes where indexname='unique_lembrete_envio') as idx_sem_destinatario_0,
  (select count(*) from pg_indexes where indexname='lembretes_log_idempotency_uq') as idx_com_destinatario_1;
```

Expected: `4, 0, 0, 1`. Abrir a tela **Configurações da Agenda** logado como Ana: carrega a config dela normalmente (`fetchNotificacaoConfig` continua `.maybeSingle()` — agora a RLS devolve só a linha dela).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_notificacao_config_rls_por_usuario.sql supabase/tests/agenda/02_rls_notificacao_config.sql
git commit -m "fix(agenda): RLS de notificacao_config por usuario; remove indice de lembretes sem destinatario"
```

---

### Task 3: Funções de notificação — `agenda_destinatarios`, `agenda_momento_lembrete`, `agenda_lembretes_devidos`, `agenda_resumo_usuario`

**Files:**
- Create: `supabase/migrations/20260901200200_agenda_destinatarios_lembretes.sql`
- Create: `supabase/tests/agenda/03_destinatarios_momento.sql`

**Interfaces:**
- Consumes: `tarefas.responsavel_id`, `tarefas_listas_membros` (Task 1); `notificacao_config` por usuário (Task 2).
- Produces (assinaturas exatas, usadas pelas edges nas Tasks 6–7):
  - `agenda_destinatarios(p_tarefa_id uuid) returns table (user_id uuid, nome text)`
  - `agenda_momento_lembrete(p_vencimento timestamptz, p_dia_inteiro boolean, p_minutos integer) returns timestamptz` — `null` quando `p_dia_inteiro`; janela 07:30–21:00 SP.
  - `agenda_lembretes_devidos(p_ate timestamptz) returns table (tarefa_id uuid, titulo text, descricao text, prioridade text, categoria text, vencimento_em timestamptz, momento timestamptz, user_id uuid, nome text, whatsapp_numero text, whatsapp_ativo boolean, agenda_lembrete_tarefas_ativo boolean)`
  - `agenda_resumo_usuario(p_user_id uuid, p_data date, p_dias integer default 1) returns jsonb` → `{ nome, itens: [{id,titulo,prioridade,vencimento_em,dia_inteiro,parent_id}], atrasadas: [{id,titulo,prioridade,vencimento_em}], pagar: {n,total}, pagar_atrasadas: {n,total} }`

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260901200200_agenda_destinatarios_lembretes.sql`:

```sql
-- Ponto unico da cascata de destinatarios (spec §6.1) e do momento do lembrete (§6.2).
-- Ninguem reimplementa a cascata: jobs, listar/detalhar (fase B) e resumo leem daqui.

-- responsavel_id definido -> so ele; senao lista com membros -> membros; senao created_by.
create or replace function public.agenda_destinatarios(p_tarefa_id uuid)
returns table (user_id uuid, nome text)
language plpgsql stable security definer set search_path = public as $$
declare v public.tarefas%rowtype;
begin
  select * into v from public.tarefas where id = p_tarefa_id;
  if not found then return; end if;

  if v.responsavel_id is not null then
    return query select p.id, p.nome from public.user_profiles p where p.id = v.responsavel_id;
    return;
  end if;

  if v.lista_id is not null
     and exists (select 1 from public.tarefas_listas_membros m where m.lista_id = v.lista_id) then
    return query
      select p.id, p.nome
        from public.tarefas_listas_membros m
        join public.user_profiles p on p.id = m.user_id
       where m.lista_id = v.lista_id
       order by p.nome;
    return;
  end if;

  if v.created_by is not null then
    return query select p.id, p.nome from public.user_profiles p where p.id = v.created_by;
  end if;
end $$;

-- dia_inteiro = true -> sem ping proprio (coberta pelo resumo). Fora de 07:30-21:00 SP -> adia pro
-- inicio da proxima janela. Vale pros dois jobs e pro digest da Maria.
create or replace function public.agenda_momento_lembrete(p_vencimento timestamptz, p_dia_inteiro boolean, p_minutos integer)
returns timestamptz
language plpgsql stable set search_path = public as $$
declare
  v_local timestamp;
  v_dia date;
  v_hora time;
  v_ini constant time := time '07:30';
  v_fim constant time := time '21:00';
begin
  if p_vencimento is null or coalesce(p_dia_inteiro, false) then
    return null;
  end if;
  v_local := (p_vencimento at time zone 'America/Sao_Paulo')
             - make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_dia := v_local::date;
  v_hora := v_local::time;
  if v_hora < v_ini then
    v_local := v_dia + v_ini;
  elsif v_hora > v_fim then
    v_local := (v_dia + 1) + v_ini;
  end if;
  return v_local at time zone 'America/Sao_Paulo';
end $$;

-- Pings devidos: tarefas com hora (dia_inteiro=false), pendentes, vencendo ate p_ate
-- (com 12h de lookback pra cobrir o adiamento da janela de silencio), x destinatarios x config.
-- LEFT JOIN na config: usuario sem config volta com whatsapp_numero nulo (o job conta como skipped).
create or replace function public.agenda_lembretes_devidos(p_ate timestamptz)
returns table (
  tarefa_id uuid, titulo text, descricao text, prioridade text, categoria text,
  vencimento_em timestamptz, momento timestamptz,
  user_id uuid, nome text,
  whatsapp_numero text, whatsapp_ativo boolean, agenda_lembrete_tarefas_ativo boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.titulo, t.descricao, t.prioridade, t.categoria, t.vencimento_em,
         public.agenda_momento_lembrete(
           t.vencimento_em, t.dia_inteiro,
           coalesce(t.lembrete_minutos[1], nc.lembrete_padrao_minutos, 30)
         ) as momento,
         d.user_id, d.nome,
         nc.whatsapp_numero, coalesce(nc.whatsapp_ativo, false), coalesce(nc.agenda_lembrete_tarefas_ativo, true)
    from public.tarefas t
    cross join lateral public.agenda_destinatarios(t.id) d
    left join public.notificacao_config nc on nc.user_id = d.user_id
   where t.vencimento_em is not null
     and coalesce(t.dia_inteiro, false) = false
     and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em <= p_ate
     and t.vencimento_em >= now() - interval '12 hours'
   order by t.vencimento_em, d.nome;
$$;

-- Resumo individual completo (§6.5): itens (nao-espelho) e atrasadas um a um; "Pagar:" agregadas.
create or replace function public.agenda_resumo_usuario(p_user_id uuid, p_data date, p_dias integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini timestamptz := (p_data::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := ((p_data + greatest(coalesce(p_dias, 1), 1))::timestamp) at time zone 'America/Sao_Paulo';
  v_itens jsonb; v_atr jsonb; v_pagar jsonb; v_pagar_atr jsonb; v_nome text;
begin
  select nome into v_nome from public.user_profiles where id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'titulo', t.titulo, 'prioridade', t.prioridade,
           'vencimento_em', t.vencimento_em, 'dia_inteiro', t.dia_inteiro, 'parent_id', t.parent_id
         ) order by t.vencimento_em, t.titulo), '[]'::jsonb)
    into v_itens
    from public.tarefas t
   where t.status in ('pendente', 'em_andamento')
     and t.vencimento_em >= v_ini and t.vencimento_em < v_fim
     and coalesce(t.vinculo_tipo, '') <> 'conta_pagar'
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'titulo', t.titulo, 'prioridade', t.prioridade, 'vencimento_em', t.vencimento_em
         ) order by t.vencimento_em), '[]'::jsonb)
    into v_atr
    from public.tarefas t
   where t.status in ('pendente', 'em_andamento')
     and t.vencimento_em < v_ini
     and coalesce(t.vinculo_tipo, '') <> 'conta_pagar'
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.valor), 0))
    into v_pagar
    from public.tarefas t join public.contas_pagar c on c.id = t.vinculo_id
   where t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em >= v_ini and t.vencimento_em < v_fim
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.valor), 0))
    into v_pagar_atr
    from public.tarefas t join public.contas_pagar c on c.id = t.vinculo_id
   where t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em < v_ini
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  return jsonb_build_object(
    'nome', v_nome, 'itens', v_itens, 'atrasadas', v_atr,
    'pagar', v_pagar, 'pagar_atrasadas', v_pagar_atr
  );
end $$;

-- Grants: so service_role (as duas de lembrete devolvem whatsapp_numero).
revoke all on function public.agenda_destinatarios(uuid) from public, anon, authenticated;
grant execute on function public.agenda_destinatarios(uuid) to service_role;
revoke all on function public.agenda_momento_lembrete(timestamptz, boolean, integer) from public, anon, authenticated;
grant execute on function public.agenda_momento_lembrete(timestamptz, boolean, integer) to service_role;
revoke all on function public.agenda_lembretes_devidos(timestamptz) from public, anon, authenticated;
grant execute on function public.agenda_lembretes_devidos(timestamptz) to service_role;
revoke all on function public.agenda_resumo_usuario(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.agenda_resumo_usuario(uuid, date, integer) to service_role;
```

- [ ] **Step 2: Teste estático**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs`
Expected: `funcoes: …` e `fuso: …` PASS.

- [ ] **Step 3: Aplicar via MCP e espelhar a versão**

MCP `apply_migration(name = agenda_destinatarios_lembretes)`; `select version … where name = 'agenda_destinatarios_lembretes'`; renomear.

- [ ] **Step 4: Teste comportamental (cascata + janela de silêncio + resumo)**

Criar `supabase/tests/agenda/03_destinatarios_momento.sql`:

```sql
-- Rodar via MCP execute_sql. Usa a lista Financeiro (Rose+Ana) semeada na Task 1.
begin;
do $t$
declare
  v_fin uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_n int; v_m timestamptz; v_r jsonb;
  c_rose constant uuid := 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4';
  c_ana  constant uuid := '81305959-dc68-4f8e-b54f-dd055dabcfd4';
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  assert v_fin is not null, 'lista Financeiro ausente';

  -- 1) responsavel nulo + lista com membros -> Rose e Ana
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro)
  values ('T grupo', 'pendente', v_fin, now() + interval '1 hour', false) returning id into v_t1;
  select count(*) into v_n from public.agenda_destinatarios(v_t1);
  assert v_n = 2, 'esperava 2 destinatarios (membros), veio ' || v_n;

  -- 2) responsavel definido -> so ele
  insert into public.tarefas (titulo, status, lista_id, responsavel_id, vencimento_em, dia_inteiro)
  values ('T rose', 'pendente', v_fin, c_rose, now() + interval '1 hour', false) returning id into v_t2;
  assert (select count(*) from public.agenda_destinatarios(v_t2)) = 1, 'responsavel definido deveria ser 1';
  assert (select user_id from public.agenda_destinatarios(v_t2)) = c_rose, 'destinatario deveria ser a Rose';

  -- 3) sem lista e sem responsavel -> created_by
  insert into public.tarefas (titulo, status, created_by, vencimento_em, dia_inteiro)
  values ('T avulsa', 'pendente', c_ana, now() + interval '1 hour', false) returning id into v_t3;
  assert (select user_id from public.agenda_destinatarios(v_t3)) = c_ana, 'fallback created_by falhou';

  -- 4) momento: dia_inteiro -> null
  assert public.agenda_momento_lembrete(now(), true, 30) is null, 'dia_inteiro deveria dar null';
  -- 5) 10:00 SP com 30 min -> 09:30 SP (dentro da janela)
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 10:00:00-03', false, 30);
  assert v_m = timestamptz '2026-09-02 09:30:00-03', 'dentro da janela deveria manter 09:30, veio ' || v_m;
  -- 6) 07:00 SP com 60 min -> 06:00 -> adia pra 07:30 do mesmo dia
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 07:00:00-03', false, 60);
  assert v_m = timestamptz '2026-09-02 07:30:00-03', 'antes da janela deveria ir pra 07:30, veio ' || v_m;
  -- 7) 22:30 SP com 30 min -> 22:00 -> adia pra 07:30 do dia seguinte
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 22:30:00-03', false, 30);
  assert v_m = timestamptz '2026-09-03 07:30:00-03', 'depois da janela deveria ir pro dia seguinte, veio ' || v_m;

  -- 8) lembretes_devidos: T grupo aparece 2x (Rose e Ana), T rose 1x
  select count(*) into v_n from public.agenda_lembretes_devidos(now() + interval '2 hours') where tarefa_id = v_t1;
  assert v_n = 2, 'T grupo deveria render 2 linhas, veio ' || v_n;
  select count(*) into v_n from public.agenda_lembretes_devidos(now() + interval '2 hours') where tarefa_id = v_t2;
  assert v_n = 1, 'T rose deveria render 1 linha, veio ' || v_n;

  -- 9) resumo da Rose no dia de hoje (SP) inclui T grupo e T rose, nao inclui T avulsa (da Ana)
  v_r := public.agenda_resumo_usuario(c_rose, (now() at time zone 'America/Sao_Paulo')::date, 1);
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T grupo')), 'resumo da Rose sem T grupo';
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T rose')), 'resumo da Rose sem T rose';
  assert not ((v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T avulsa'))), 'resumo da Rose nao deveria ter T avulsa';
  assert (v_r->>'nome') is not null, 'nome ausente no resumo';
end $t$;
rollback;
select 'PASS: 03_destinatarios_momento' as resultado;
```

Run: via MCP `execute_sql`.
Expected: `PASS: 03_destinatarios_momento`. (Se o teste 9 falhar por hora do dia — tarefa `now()+1h` cruzando meia-noite SP — rodar de novo antes das 23:00 SP.)

- [ ] **Step 5: Verificação de `proacl` em produção**

```sql
select p.proname, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('agenda_destinatarios','agenda_momento_lembrete','agenda_lembretes_devidos','agenda_resumo_usuario')
 order by 1;
```

Expected: 4 linhas, **nenhuma com `proacl` nulo**, cada uma com `service_role=X/postgres` e sem `anon`, `authenticated` nem entrada `=X/` sem nome.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_agenda_destinatarios_lembretes.sql supabase/tests/agenda/03_destinatarios_momento.sql
git commit -m "feat(agenda): agenda_destinatarios, agenda_momento_lembrete (janela 07:30-21:00), lembretes_devidos e resumo_usuario"
```

---

### Task 4: `agenda_sync_contas_pagar` em plpgsql + cron (item 1) — **sobe e roda antes da Task 5**

**Files:**
- Create: `supabase/migrations/20260901200300_agenda_sync_contas_pagar.sql`
- Create: `supabase/tests/agenda/04_sync_contas_pagar.sql`

**Interfaces:**
- Consumes: `tarefas_vinculo_uniq` (Task 1); `tarefas_guard_delete` (órfãs são espelhos sem filhas).
- Produces: `agenda_brl(numeric) returns text`; `agenda_sync_contas_pagar() returns jsonb` → `{inseridas, atualizadas, orfas_removidas, hoje, janela}`; cron `agenda-sync-contas-10min`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260901200300_agenda_sync_contas_pagar.sql`:

```sql
-- Espelho "Pagar:" no servidor (spec §5.4). Port set-based de services/agendaIntegrations.ts
-- syncContasAsAgendaTasks. Uma implementacao; o cliente deixa de sincronizar contas (Task 5).

-- 'R$ 1.234,56' — pattern com separadores literais (',' e '.'), independente de lc_numeric.
-- stable, nao immutable: to_char(numeric, text) depende de lc_numeric (immutable seria mentira pequena
-- que so doi se um dia entrar em indice).
create or replace function public.agenda_brl(p numeric)
returns text language sql stable as $$
  select 'R$ ' || replace(replace(replace(
           to_char(coalesce(p, 0), 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.');
$$;

create or replace function public.agenda_sync_contas_pagar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini  date := v_hoje - 90;
  v_fim  date := v_hoje + 45;
  v_lista uuid;
  v_ins int := 0; v_upd int := 0; v_del int := 0;
begin
  -- Lista Financeiro por nome (nao-smart), criada se faltar — mesmo criterio de ensureListByName.
  select id into v_lista from public.tarefas_listas
   where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_lista is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('Financeiro', '#8b5cf6', '💰', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_lista;
  end if;

  with contas as (
    select c.id, c.descricao, c.unidade, c.valor, c.data_vencimento, c.status,
           c.data_pagamento, c.metodo_pagamento,
           pc.codigo as pc_codigo, pc.nome as pc_nome, cc.nome as cc_nome,
           (c.data_vencimento - v_hoje) as dd
      from public.contas_pagar c
      left join public.plano_contas pc on pc.id = c.plano_conta_id
      left join public.centros_custo cc on cc.id = c.centro_custo_id
     where c.status not in ('cancelado','finalizado')
       and c.data_vencimento between v_ini and v_fim
  ), src as (
    select id as vinculo_id,
           'Pagar: ' || descricao as titulo,
           concat_ws(E'\n',
             case when pc_codigo is not null and pc_nome is not null then 'Plano: ' || pc_codigo || ' ' || pc_nome end,
             'Valor: ' || public.agenda_brl(valor),
             case when cc_nome is not null then 'Centro de custo: ' || cc_nome
                  when unidade is not null then 'Centro de custo: ' || upper(unidade) end,
             case when metodo_pagamento is not null then 'Metodo: ' || metodo_pagamento end,
             'Origem: Contas a Pagar (tarefa automatica)'
           ) as descricao,
           case when status = 'pago' then 'baixa'
                when dd < 0 then 'urgente'
                when dd = 0 then 'alta'
                when dd <= 3 then 'media'
                else 'baixa' end as prioridade,
           case when status = 'pago' then 'concluida' else 'pendente' end as st,
           case when status = 'pago' then coalesce(data_pagamento, now()) end as data_conclusao,
           ((data_vencimento::timestamp + time '09:00') at time zone 'America/Sao_Paulo') as vencimento_em,
           unidade
      from contas
  ), upserted as (
    insert into public.tarefas
      (titulo, descricao, lista_id, categoria, prioridade, tags, unidade, vencimento_em, dia_inteiro,
       status, data_conclusao, vinculo_tipo, vinculo_id, lembrete_minutos, ordem)
    select titulo, descricao, v_lista, 'financeiro', prioridade, array['contas-a-pagar','auto'], unidade,
           vencimento_em, true, st, data_conclusao, 'conta_pagar', vinculo_id, array[30], 10
      from src
    on conflict (vinculo_tipo, vinculo_id) do update set
      titulo = excluded.titulo,
      descricao = excluded.descricao,
      lista_id = excluded.lista_id,
      prioridade = excluded.prioridade,
      tags = excluded.tags,
      unidade = excluded.unidade,
      vencimento_em = excluded.vencimento_em,
      status = excluded.status,
      data_conclusao = excluded.data_conclusao,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ins, v_upd
    from upserted;

  -- Orfa = conta inexistente, cancelada ou finalizada. Sair da janela NAO e orfa (historico fica).
  delete from public.tarefas t
   where t.vinculo_tipo = 'conta_pagar' and t.vinculo_id is not null
     and not exists (
       select 1 from public.contas_pagar c
        where c.id = t.vinculo_id and c.status not in ('cancelado','finalizado')
     );
  get diagnostics v_del = row_count;

  return jsonb_build_object(
    'inseridas', v_ins, 'atualizadas', v_upd, 'orfas_removidas', v_del,
    'hoje', v_hoje, 'janela', jsonb_build_array(v_ini, v_fim)
  );
end $$;

revoke all on function public.agenda_brl(numeric) from public, anon, authenticated;
grant execute on function public.agenda_brl(numeric) to service_role;
revoke all on function public.agenda_sync_contas_pagar() from public, anon, authenticated;
grant execute on function public.agenda_sync_contas_pagar() to service_role;

-- Cron em SQL direto (sem net.http_post): a cada 10 min. As 08:00 o espelho tem <= 10 min.
create extension if not exists pg_cron;
do $do$
declare jid integer;
begin
  select jobid into jid from cron.job where jobname = 'agenda-sync-contas-10min' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'agenda-sync-contas-10min',
    '*/10 * * * *',
    $cmd$ select public.agenda_sync_contas_pagar(); $cmd$
  );
end $do$;
```

- [ ] **Step 2: Teste estático**

Run: `node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs`
Expected: **todos** os testes PASS (inclusive `arquivos existem`).

- [ ] **Step 3: Teste comportamental ANTES de aplicar em produção (rollback)**

Aplicar primeiro **só as funções** dentro de uma transação de teste é o mesmo que aplicar a migration — então a ordem é: aplicar (Step 4) e testar (Step 5) em rollback. Nada do teste persiste.

- [ ] **Step 4: Aplicar via MCP e espelhar a versão**

MCP `apply_migration(name = agenda_sync_contas_pagar)`; `select version … where name = 'agenda_sync_contas_pagar'`; renomear.

- [ ] **Step 5: Teste comportamental (rollback)**

Criar `supabase/tests/agenda/04_sync_contas_pagar.sql`:

```sql
-- Rodar via MCP execute_sql. Cria contas ficticias, roda o sync, verifica, e desfaz tudo.
begin;
do $t$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_t1 uuid; v_r jsonb; v_n int;
  c_rose constant uuid := 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4';
begin
  -- c1: pendente, vence em 2 dias -> espelho 'media'
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento)
  values ('TESTE SYNC c1', 'rec', 123.45, v_hoje, v_hoje + 2, date_trunc('month', v_hoje)::date, 'pendente', 'unica')
  returning id into v_c1;
  -- c2: paga ha 100 dias (fora da janela) com espelho ja existente -> espelho FICA
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento, data_pagamento)
  values ('TESTE SYNC c2', 'bar', 50, v_hoje - 100, v_hoje - 100, date_trunc('month', v_hoje - 100)::date, 'pago', 'unica', (v_hoje - 100)::timestamptz)
  returning id into v_c2;
  insert into public.tarefas (titulo, status, vinculo_tipo, vinculo_id, vencimento_em, dia_inteiro)
  values ('Pagar: TESTE SYNC c2', 'concluida', 'conta_pagar', v_c2, ((v_hoje - 100)::timestamp + time '09:00') at time zone 'America/Sao_Paulo', true);
  -- c3: cancelada com espelho existente -> espelho SAI
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento)
  values ('TESTE SYNC c3', 'cg', 10, v_hoje, v_hoje + 1, date_trunc('month', v_hoje)::date, 'cancelado', 'unica')
  returning id into v_c3;
  insert into public.tarefas (titulo, status, vinculo_tipo, vinculo_id, vencimento_em, dia_inteiro)
  values ('Pagar: TESTE SYNC c3', 'pendente', 'conta_pagar', v_c3, now(), true);

  v_r := public.agenda_sync_contas_pagar();

  select id into v_t1 from public.tarefas where vinculo_tipo = 'conta_pagar' and vinculo_id = v_c1;
  assert v_t1 is not null, 'espelho de c1 nao foi criado';
  assert (select prioridade from public.tarefas where id = v_t1) = 'media', 'prioridade de c1 deveria ser media';
  assert (select titulo from public.tarefas where id = v_t1) = 'Pagar: TESTE SYNC c1', 'titulo do espelho errado';
  assert (select descricao from public.tarefas where id = v_t1) like '%Valor: R$ 123,45%', 'agenda_brl errado: ' || (select descricao from public.tarefas where id = v_t1);
  assert (select lista_id from public.tarefas where id = v_t1) is not null, 'espelho sem lista Financeiro';
  assert exists (select 1 from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c2), 'espelho de conta paga ha 100d NAO deveria ser removido';
  assert not exists (select 1 from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c3), 'espelho de conta cancelada deveria ser removido';

  -- responsavel setado pela Rose sobrevive ao proximo sync; conta paga -> concluida
  update public.tarefas set responsavel_id = c_rose where id = v_t1;
  update public.contas_pagar set status = 'pago', data_pagamento = now() where id = v_c1;
  v_r := public.agenda_sync_contas_pagar();
  assert (select responsavel_id from public.tarefas where id = v_t1) = c_rose, 'sync sobrescreveu responsavel_id';
  assert (select status from public.tarefas where id = v_t1) = 'concluida', 'conta paga deveria concluir o espelho';
  assert (select data_conclusao from public.tarefas where id = v_t1) is not null, 'data_conclusao ausente';

  -- rodar duas vezes nao duplica
  v_r := public.agenda_sync_contas_pagar();
  select count(*) into v_n from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c1;
  assert v_n = 1, 'espelho duplicado: ' || v_n;
end $t$;
rollback;
select 'PASS: 04_sync_contas_pagar' as resultado;
```

Run: via MCP `execute_sql`.
Expected: `PASS: 04_sync_contas_pagar`. Se o `insert into contas_pagar` falhar por coluna `not null` não listada, adicionar a coluna ao insert do teste com um valor neutro e reportar qual era (o fixture da casa `supabase/tests/run_contas_pagar_ajuste_pago_fixture.mjs` lista `descricao, valor, competencia, status` como obrigatórias).

- [ ] **Step 6: Primeira execução real + cron ativo (gate da Task 5) — ORQUESTRADOR, não subagente**

```sql
select public.agenda_sync_contas_pagar() as primeira_execucao;
select jobid, jobname, schedule, active from cron.job where jobname = 'agenda-sync-contas-10min';
```

Expected: JSON com `inseridas`/`atualizadas` (esperado `inseridas` ≈ 0 — o cliente já espelhava — e `atualizadas` ≈ número de contas na janela), e 1 linha do job com `active = true`. Depois de ≥ 10 min:

```sql
select status, start_time, return_message
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'agenda-sync-contas-10min')
 order by start_time desc limit 3;
```

Expected: pelo menos 1 linha `succeeded`. **Só então** a Task 5 pode começar.

- [ ] **Step 7: Verificação de integridade**

```sql
select
  (select count(*) from (select vinculo_tipo, vinculo_id from tarefas where vinculo_id is not null group by 1,2 having count(*) > 1) d) as duplicatas_0,
  (select count(*) from tarefas t where t.vinculo_tipo='conta_pagar' and not exists (select 1 from contas_pagar c where c.id = t.vinculo_id and c.status not in ('cancelado','finalizado'))) as orfas_0,
  (select count(*) from tarefas where vinculo_tipo='conta_pagar') as espelhos;
```

Expected: `0, 0, <≈ contas válidas na janela + históricas>`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_agenda_sync_contas_pagar.sql supabase/tests/agenda/04_sync_contas_pagar.sql
git commit -m "feat(agenda): espelho Pagar: gerado no servidor (agenda_sync_contas_pagar + cron 10min)"
```

---

### Task 5: Cliente deixa de sincronizar contas (mantém Folha) + tipos

**Files:**
- Modify: `services/agendaIntegrations.ts` (remover `ContaPagarRow`, `brl`, `diffDays`, `todayYmd`, `cleanupOrphanContaTasks`, `dedupeContaTasksByVinculo`, `pickPrimaryLinkedTask`, `syncContasAsAgendaTasks`, e a chamada em `syncAgendaIntegrations`)
- Modify: `types/agenda.ts:34-71` (interface `Tarefa`)
- Modify: `scripts/reset-contas-pagar-data.sql:33`

**Interfaces:**
- Consumes: cron `agenda-sync-contas-10min` **ativo e com ≥ 1 execução `succeeded`** (Task 4, Step 6).
- Produces: `Tarefa` com `parent_id?: string | null; responsavel_id?: string | null; concluida_por?: string | null; mensagem_origem_id?: string | null`.

- [ ] **Step 1: Confirmar o gate**

Run (MCP): a query de `cron.job_run_details` do Task 4 Step 6.
Expected: ≥ 1 `succeeded`. Se não, **parar** — não remover o sync do cliente.

- [ ] **Step 2: Tipos**

Em `types/agenda.ts`, dentro de `export interface Tarefa`, logo após `google_event_id?: string | null;`, adicionar:

```ts
  // Fase A (spec §4.1)
  parent_id?: string | null;           // filha -> tarefa-pai deste mês
  responsavel_id?: string | null;      // NULL = membros da lista
  concluida_por?: string | null;
  mensagem_origem_id?: string | null;  // idempotência das RPCs da Maria
```

- [ ] **Step 3: Remover o sync de contas do cliente**

Em `services/agendaIntegrations.ts`:

1. Apagar o tipo `ContaPagarRow` (linhas 9–20) e as funções `brl`, `diffDays`, `todayYmd` (64–84).
2. Apagar `cleanupOrphanContaTasks` (160–201), `dedupeContaTasksByVinculo` (203–239), `pickPrimaryLinkedTask` (241–253) e `syncContasAsAgendaTasks` (255–373) — o bloco inteiro entre os comentários `SYNC: Contas a Pagar -> Agenda` e `SYNC: Folha -> Agenda`.
3. Em `syncAgendaIntegrations` (492–549), substituir o miolo por:

```ts
export async function syncAgendaIntegrations(): Promise<void> {
  // Se nao tiver sessao, nao tenta (evita erros barulhentos no boot)
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    console.warn('[agendaIntegrations] No active session, skipping sync');
    return;
  }

  console.log('[agendaIntegrations] Starting sync (Folha; contas a pagar sao espelhadas pelo cron agenda-sync-contas-10min)...');

  const cfg = await fetchNotificacaoConfigSafe();

  const { data: listasData, error: listasErr } = await supabase
    .from('tarefas_listas')
    .select('*')
    .order('ordem', { ascending: true });

  if (listasErr) {
    console.error('[agendaIntegrations] Failed to fetch listas:', listasErr.message);
    throw listasErr;
  }

  const listas = (listasData || []) as TarefaLista[];

  const rh = await ensureListByName({
    listas,
    nome: 'RH',
    icone: '👩‍💼',
    cor: '#a78bfa',
  });

  try {
    await syncFolhaAsAgendaTasks({ listaRhId: rh.id, cfg });
  } catch (e: any) {
    console.error('[agendaIntegrations] syncFolha FAILED:', e?.message || e);
  }

  console.log('[agendaIntegrations] Sync complete');
}
```

4. Manter `fnv1a64`, `hex64`, `stableUuidFromString`, `chunk`, `toDueISO`, `monthLabelPt`, `fetchNotificacaoConfigSafe`, `ensureListByName`, `fetchExistingLinkedTasks`, `syncFolhaAsAgendaTasks` — a Folha continua no cliente (follow-up: spec §14).
5. Em `scripts/reset-contas-pagar-data.sql:33`, trocar o comentário por:
   `-- Pós-reset: o cron agenda-sync-contas-10min recria as tarefas "Pagar:" em até 10 min (ou rode: select public.agenda_sync_contas_pagar();).`

- [ ] **Step 4: Typecheck + confirmação de que nada mais referencia o que saiu**

Run: `npm run typecheck`
Expected: sem erros.
Run (Grep no repo): `syncContasAsAgendaTasks|cleanupOrphanContaTasks|dedupeContaTasksByVinculo|pickPrimaryLinkedTask`
Expected: 0 ocorrências fora de `Docs/`.

- [ ] **Step 5: Verificar no preview**

Abrir a Agenda (preview `dev-alt`, porta 3002) → lista **Financeiro** carrega com as "Pagar:" (agora vindas do cron); console sem `syncContas`. Criar uma conta nova em Contas a Pagar com vencimento amanhã → em até 10 min aparece em Financeiro sem reabrir a Agenda:

```sql
select titulo, status, prioridade from tarefas where vinculo_tipo='conta_pagar' order by created_at desc limit 3;
```

- [ ] **Step 6: Commit**

```bash
git add services/agendaIntegrations.ts types/agenda.ts scripts/reset-contas-pagar-data.sql
git commit -m "refactor(agenda): cliente deixa de espelhar contas (cron faz); tipos da fase A"
```

---

### Task 6: `whatsapp-agenda-lembretes` multiusuário (consome `agenda_lembretes_devidos`)

**Files:**
- Create: `supabase/functions/_shared/agendaLembretes.ts`
- Create: `supabase/functions/_shared/agendaLembretes.test.mjs`
- Modify: `supabase/functions/whatsapp-agenda-lembretes/index.ts:40-236`

**Interfaces:**
- Consumes: `agenda_lembretes_devidos(p_ate timestamptz)` (Task 3) — colunas exatas em `LinhaDevida`.
- Produces: `planejarEnvios(linhas, agora, force) => { envios: EnvioPlanejado[]; skipped: number }`; `formatLembrete(tarefa, agora) => string`.

- [ ] **Step 1: Escrever o teste do planejador (falha: módulo não existe)**

Criar `supabase/functions/_shared/agendaLembretes.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planejarEnvios, formatLembrete } from './agendaLembretes.ts';

const agora = new Date('2026-09-02T11:00:00Z'); // 08:00 SP
const base = {
  tarefa_id: 't1', titulo: 'Conciliar 8641', descricao: null, prioridade: 'alta', categoria: 'financeiro',
  vencimento_em: '2026-09-02T12:00:00Z', momento: '2026-09-02T11:30:00Z',
  whatsapp_ativo: true, agenda_lembrete_tarefas_ativo: true,
};

test('dois destinatarios da mesma tarefa geram dois envios, cada um pro seu numero', () => {
  const linhas = [
    { ...base, user_id: 'u-rose', nome: 'Rose', whatsapp_numero: '+55 (21) 99999-0001', momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u-ana', nome: 'Ana', whatsapp_numero: '5521999990002', momento: '2026-09-02T10:30:00Z' },
  ];
  const { envios, skipped } = planejarEnvios(linhas, agora, false);
  assert.equal(envios.length, 2);
  assert.deepEqual(envios.map((e) => e.numero).sort(), ['5521999990001', '5521999990002']);
  assert.equal(envios[0].tarefa_id, 't1');
  assert.equal(envios[0].scheduled_for, '2026-09-02T10:30:00.000Z');
  assert.equal(skipped, 0);
});

test('sem config, whatsapp desligado ou lembretes desativados -> skipped', () => {
  const linhas = [
    { ...base, user_id: 'u1', nome: 'A', whatsapp_numero: null, momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u2', nome: 'B', whatsapp_numero: '5521999990002', whatsapp_ativo: false, momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u3', nome: 'C', whatsapp_numero: '5521999990003', agenda_lembrete_tarefas_ativo: false, momento: '2026-09-02T10:30:00Z' },
  ];
  const { envios, skipped } = planejarEnvios(linhas, agora, false);
  assert.equal(envios.length, 0);
  assert.equal(skipped, 3);
});

test('momento no futuro -> skipped (sem force); com force envia', () => {
  const linhas = [{ ...base, user_id: 'u1', nome: 'A', whatsapp_numero: '5521999990001', momento: '2026-09-02T11:30:00Z' }];
  assert.equal(planejarEnvios(linhas, agora, false).envios.length, 0);
  assert.equal(planejarEnvios(linhas, agora, true).envios.length, 1);
});

test('momento nulo (dia inteiro) nunca vira ping', () => {
  const linhas = [{ ...base, user_id: 'u1', nome: 'A', whatsapp_numero: '5521999990001', momento: null }];
  assert.equal(planejarEnvios(linhas, agora, true).envios.length, 0);
});

test('formatLembrete mostra hora em SP e diz "Venceu" quando ja passou', () => {
  const futura = formatLembrete({ ...base, vencimento_em: '2026-09-02T12:00:00Z' }, agora);
  assert.match(futura, /Vence às 09:00/);
  const passada = formatLembrete({ ...base, vencimento_em: '2026-09-01T23:30:00Z' }, agora);
  assert.match(passada, /Venceu às 20:30/);
  assert.match(futura, /\*Conciliar 8641\*/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaLembretes.test.mjs`
Expected: FAIL — `Cannot find module './agendaLembretes.ts'`.

- [ ] **Step 3: Implementar o módulo puro**

Criar `supabase/functions/_shared/agendaLembretes.ts`:

```ts
// Planejamento puro dos pings individuais (spec §6.2, §6.4). Sem I/O: testavel com node --test.

export type LinhaDevida = {
  tarefa_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string | null;
  categoria: string | null;
  vencimento_em: string;
  momento: string | null;            // ja passou por agenda_momento_lembrete (janela de silencio)
  user_id: string;
  nome: string;
  whatsapp_numero: string | null;
  whatsapp_ativo: boolean;
  agenda_lembrete_tarefas_ativo: boolean;
};

export type EnvioPlanejado = {
  tarefa_id: string;
  user_id: string;
  numero: string;
  scheduled_for: string;             // ISO do momento (deterministico -> chave de idempotencia)
  mensagem: string;
};

const TZ = 'America/Sao_Paulo';

const prioridadeEmoji: Record<string, string> = { baixa: '⬇️', media: '➡️', alta: '⚠️', urgente: '🔴' };
const categoriaEmoji: Record<string, string> = { financeiro: '💵', rh: '👩‍💼', administrativo: '📋', pessoal: '🏠', geral: '📌' };

export function horaSp(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function soDigitos(numero: string | null | undefined): string {
  return String(numero || '').replace(/\D/g, '');
}

export function formatLembrete(t: Pick<LinhaDevida, 'titulo' | 'descricao' | 'prioridade' | 'categoria' | 'vencimento_em'>, agora: Date): string {
  const p = String(t.prioridade || 'media');
  const c = String(t.categoria || 'geral');
  const hora = horaSp(t.vencimento_em);
  const passou = new Date(t.vencimento_em).getTime() < agora.getTime();
  let msg = `🔔 *LEMBRETE*\n\n${prioridadeEmoji[p] || '📋'} *${t.titulo || 'Tarefa'}*\n\n`;
  msg += `${categoriaEmoji[c] || '📌'} ${c.toUpperCase()}\n`;
  msg += `⏰ ${hora ? `${passou ? 'Venceu' : 'Vence'} às ${hora}` : 'Hoje'}\n`;
  if (t.descricao) msg += `\n📝 ${t.descricao}\n`;
  msg += `\n_LA Music - Agenda_`;
  return msg;
}

/** Decide quem recebe o que agora. Uma linha por (tarefa, destinatario). */
export function planejarEnvios(linhas: LinhaDevida[], agora: Date, force: boolean): { envios: EnvioPlanejado[]; skipped: number } {
  const envios: EnvioPlanejado[] = [];
  let skipped = 0;
  for (const l of linhas) {
    if (!l.momento) { skipped++; continue; }                                  // dia inteiro: sem ping
    const numero = soDigitos(l.whatsapp_numero);
    if (!numero || !l.whatsapp_ativo || l.agenda_lembrete_tarefas_ativo === false) { skipped++; continue; }
    const momento = new Date(l.momento);
    if (!force && agora.getTime() < momento.getTime()) { skipped++; continue; }
    envios.push({
      tarefa_id: l.tarefa_id,
      user_id: l.user_id,
      numero,
      scheduled_for: momento.toISOString(),
      mensagem: formatLembrete(l, agora),
    });
  }
  return { envios, skipped };
}
```

- [ ] **Step 4: Rodar o teste — passa**

Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaLembretes.test.mjs`
Expected: 5/5 PASS.

- [ ] **Step 5: Reescrever a edge function**

Em `supabase/functions/whatsapp-agenda-lembretes/index.ts`, substituir **tudo a partir da linha 40** (`const prioridadeEmoji…`) até o fim por:

```ts
import { planejarEnvios, type LinhaDevida } from "../_shared/agendaLembretes.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const cronSecret = await getSecret(supabase, "WHATSAPP_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (!headerSecret || headerSecret !== cronSecret) {
      return json({ success: false, error: "Não autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;

    const uazapiUrl = await getSecret(supabase, "UAZAPI_URL");
    const uazapiToken = await getSecret(supabase, "UAZAPI_TOKEN");

    // Multiusuario: uma linha por (tarefa com hora, destinatario). Cascata e janela de silencio
    // vivem no banco (agenda_destinatarios / agenda_momento_lembrete) — aqui so entrega.
    const agora = new Date();
    const horizonMs = force ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const ate = new Date(agora.getTime() + horizonMs).toISOString();

    const { data: linhas, error: linhasErr } = await supabase.rpc("agenda_lembretes_devidos", { p_ate: ate });
    if (linhasErr) throw linhasErr;

    const { envios, skipped: skippedPlano } = planejarEnvios((linhas || []) as LinhaDevida[], agora, force);

    let enviados = 0;
    let erros = 0;
    let skipped = skippedPlano;

    for (const envio of envios) {
      try {
        // log + idempotencia por (canal, tipo, tarefa, scheduled_for, destinatario)
        const { data: logEntry, error: logErr } = await supabase
          .from("lembretes_log")
          .insert({
            user_id: envio.user_id,
            tarefa_id: envio.tarefa_id,
            canal: "whatsapp",
            tipo: "lembrete",
            scheduled_for: envio.scheduled_for,
            destinatario: envio.numero,
            mensagem: envio.mensagem,
            status: "pendente",
          })
          .select("id")
          .single();

        if (logErr) {
          if ((logErr as any).code === "23505") { skipped++; continue; }   // ja enviado a este destinatario
          throw logErr;
        }

        const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: uazapiToken },
          body: JSON.stringify({ number: envio.numero, text: envio.mensagem }),
        });
        const raw = await res.text();
        let parsed: any = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }

        if (res.ok) {
          await supabase.from("lembretes_log").update({
            status: "enviado",
            enviado_em: new Date().toISOString(),
            provider_message_id: parsed?.message_id || parsed?.id || null,
          }).eq("id", logEntry.id);
          enviados++;
        } else {
          await supabase.from("lembretes_log").update({
            status: "falhou",
            erro: parsed?.message || `Erro UAZAPI (${res.status})`,
          }).eq("id", logEntry.id);
          erros++;
        }
      } catch (e: any) {
        console.error("whatsapp-agenda-lembretes: envio", envio.tarefa_id, envio.user_id, e?.message || e);
        erros++;
      }
    }

    return json({ success: true, enviados, erros, skipped, candidatos: (linhas || []).length }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-lembretes:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
```

Mover a linha `import { planejarEnvios, type LinhaDevida } from "../_shared/agendaLembretes.ts";` para o topo do arquivo, logo após o import do `createClient` (linha 2). Apagar `prioridadeEmoji`, `categoriaEmoji`, `formatHoraPtBR`, `formatLembrete` antigos (agora vivem no `_shared`).

- [ ] **Step 6: Bundle local (checa tipos do Deno) e commit**

Run: `npx supabase functions deploy whatsapp-agenda-lembretes --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt --dry-run` — se `--dry-run` não existir na versão do CLI, pular: o deploy real é a Task 8.
Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaLembretes.test.mjs` (5/5).

```bash
git add supabase/functions/_shared/agendaLembretes.ts supabase/functions/_shared/agendaLembretes.test.mjs supabase/functions/whatsapp-agenda-lembretes/index.ts
git commit -m "feat(agenda): lembretes individuais multiusuario via agenda_lembretes_devidos (janela de silencio no banco)"
```

---

### Task 7: `whatsapp-agenda-resumo` multiusuário, completo, sem truncar

**Files:**
- Create: `supabase/functions/_shared/agendaResumo.ts`
- Create: `supabase/functions/_shared/agendaResumo.test.mjs`
- Modify: `supabase/functions/whatsapp-agenda-resumo/index.ts:90-471`

**Interfaces:**
- Consumes: `agenda_resumo_usuario(p_user_id uuid, p_data date, p_dias integer)` (Task 3); `agenda_momento_lembrete` via RPC pra aplicar a janela de silêncio ao horário configurado.
- Produces: `montarResumo(payload, opts) => string`.

- [ ] **Step 1: Teste do formatador (falha)**

Criar `supabase/functions/_shared/agendaResumo.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarResumo } from './agendaResumo.ts';

const payload = {
  nome: 'Rose',
  itens: Array.from({ length: 9 }, (_, i) => ({
    id: `t${i}`, titulo: `Rotina ${i + 1}`, prioridade: i === 0 ? 'urgente' : 'media',
    vencimento_em: '2026-09-02T12:00:00Z', dia_inteiro: true, parent_id: i === 1 ? 't0' : null,
  })),
  atrasadas: [
    { id: 'a1', titulo: 'Conciliar 8641', prioridade: 'alta', vencimento_em: '2026-08-17T12:00:00Z' },
    { id: 'a2', titulo: 'Relatório Mensal', prioridade: 'media', vencimento_em: '2026-08-05T12:00:00Z' },
  ],
  pagar: { n: 7, total: 4321.5 },
  pagar_atrasadas: { n: 2, total: 100 },
};

test('resumo diario lista TODAS as tarefas (sem "... e mais N") e agrega Pagar: numa linha', () => {
  const msg = montarResumo(payload, { tipo: 'diario', dataLabel: 'quarta-feira, 02 de setembro' });
  assert.match(msg, /BOM DIA, ROSE!/);
  for (let i = 1; i <= 9; i++) assert.match(msg, new RegExp(`Rotina ${i}\\b`));
  assert.doesNotMatch(msg, /e mais/);
  assert.match(msg, /• 9 tarefas para hoje/);
  assert.match(msg, /• 2 atrasadas/);
  assert.match(msg, /7 contas hoje — R\$\s?4\.321,50/);
  assert.match(msg, /detalhe no laudo/);
  assert.match(msg, /2 contas atrasadas — R\$\s?100,00/);
  assert.match(msg, /Conciliar 8641/);
  assert.match(msg, /Relatório Mensal/);
});

test('filha aparece indentada sob o pai', () => {
  const msg = montarResumo(payload, { tipo: 'diario', dataLabel: 'x' });
  assert.match(msg, /↳ Rotina 2/);
});

test('sem contas -> sem linha de contas; semanal usa cabecalho proprio', () => {
  const msg = montarResumo({ ...payload, pagar: { n: 0, total: 0 }, pagar_atrasadas: { n: 0, total: 0 } }, { tipo: 'semanal', dataLabel: 'x' });
  assert.doesNotMatch(msg, /contas hoje/);
  assert.match(msg, /RESUMO SEMANAL/);
  assert.match(msg, /PRÓXIMAS TAREFAS/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaResumo.test.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o formatador**

Criar `supabase/functions/_shared/agendaResumo.ts`:

```ts
// Resumo individual completo (spec §6.5): rotinas/manuais uma a uma, "Pagar:" agregadas.

export type ResumoItem = { id: string; titulo: string; prioridade: string | null; vencimento_em: string; dia_inteiro?: boolean | null; parent_id?: string | null };
export type ResumoPayload = {
  nome: string | null;
  itens: ResumoItem[];
  atrasadas: ResumoItem[];
  pagar: { n: number; total: number };
  pagar_atrasadas: { n: number; total: number };
};
export type ResumoOpts = { tipo: 'diario' | 'semanal'; dataLabel: string };

const TZ = 'America/Sao_Paulo';

export function brl(v: number): string {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const [i, d] = n.toFixed(2).split('.');
  return `R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}

function icone(p: string | null | undefined): string {
  return p === 'urgente' ? '🔴' : p === 'alta' ? '⚠️' : '•';
}

function horaSp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch { return ''; }
}

function diaSp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso));
  } catch { return ''; }
}

/** Pais primeiro, cada filha logo abaixo do seu pai com "↳". Filha orfã (pai fora da lista) vira linha normal. */
function ordenarComFilhas(itens: ResumoItem[]): Array<ResumoItem & { filha: boolean }> {
  const ids = new Set(itens.map((i) => i.id));
  const raiz = itens.filter((i) => !i.parent_id || !ids.has(i.parent_id));
  const out: Array<ResumoItem & { filha: boolean }> = [];
  for (const r of raiz) {
    out.push({ ...r, filha: false });
    for (const f of itens.filter((i) => i.parent_id === r.id)) out.push({ ...f, filha: true });
  }
  return out;
}

export function montarResumo(p: ResumoPayload, opts: ResumoOpts): string {
  const nome = (p.nome || '').trim().toUpperCase() || 'EQUIPE';
  const semanal = opts.tipo === 'semanal';
  let msg = semanal ? `📊 *RESUMO SEMANAL — AGENDA*\n` : `☀️ *BOM DIA, ${nome}!*\n`;
  msg += `📅 ${opts.dataLabel}\n\n`;
  msg += semanal ? `📊 *SUA SEMANA:*\n` : `📊 *SEU DIA:*\n`;
  msg += `• ${p.itens.length} tarefas ${semanal ? 'nos próximos 7 dias' : 'para hoje'}\n`;
  msg += `• ${p.atrasadas.length} atrasadas\n`;
  if (p.pagar.n > 0) msg += `• ${p.pagar.n} contas vencendo\n`;
  msg += `\n`;

  if (p.itens.length) {
    msg += semanal ? `📋 *PRÓXIMAS TAREFAS:*\n` : `📋 *TAREFAS (HOJE):*\n`;
    for (const t of ordenarComFilhas(p.itens)) {
      const quando = semanal ? diaSp(t.vencimento_em) : (t.dia_inteiro ? '' : horaSp(t.vencimento_em));
      msg += `${t.filha ? '   ↳' : icone(t.prioridade)} ${quando ? `${quando} - ` : ''}${t.titulo}\n`;
    }
    msg += `\n`;
  }

  if (p.atrasadas.length) {
    msg += `⚠️ *ATRASADAS:*\n`;
    for (const t of p.atrasadas) msg += `• ${diaSp(t.vencimento_em)} - ${t.titulo}\n`;
    msg += `\n`;
  }

  if (p.pagar.n > 0) msg += `💵 *CONTAS:* ${p.pagar.n} contas ${semanal ? 'na semana' : 'hoje'} — ${brl(p.pagar.total)} (detalhe no laudo)\n`;
  if (p.pagar_atrasadas.n > 0) msg += `💵 *CONTAS ATRASADAS:* ${p.pagar_atrasadas.n} contas atrasadas — ${brl(p.pagar_atrasadas.total)}\n`;
  if (p.pagar.n > 0 || p.pagar_atrasadas.n > 0) msg += `\n`;

  msg += `_LA Music - Agenda_`;
  return msg;
}
```

- [ ] **Step 4: Rodar o teste — passa**

Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaResumo.test.mjs`
Expected: 3/3 PASS.

- [ ] **Step 5: Reescrever a edge function**

Em `supabase/functions/whatsapp-agenda-resumo/index.ts`, manter as linhas 1–89 (helpers `json`, `getSecret`, `spParts`, `spDateString`, `parseTimeToHHMM`, `scheduledForIsoSp`, `withinWindow`; apagar `formatMoneyBRL`, 90–96) e substituir **tudo a partir de `Deno.serve`** por:

```ts
import { montarResumo, type ResumoPayload } from "../_shared/agendaResumo.ts";

type Cfg = {
  user_id: string;
  whatsapp_numero: string | null;
  whatsapp_ativo: boolean | null;
  resumo_diario_ativo: boolean | null;
  resumo_diario_hora: string | null;
  resumo_semanal_ativo: boolean | null;
  resumo_semanal_dia: string | null;
  resumo_semanal_hora: string | null;
};

async function enviarResumo(
  supabase: ReturnType<typeof createClient>,
  uazapi: { url: string; token: string },
  args: { cfg: Cfg; numero: string; tipo: "resumo_diario" | "resumo_semanal"; scheduledFor: string; dateStr: string; dias: number; dataLabel: string },
): Promise<boolean> {
  const { data: existing, error: exErr } = await supabase
    .from("lembretes_log")
    .select("id")
    .eq("canal", "whatsapp")
    .eq("tipo", args.tipo)
    .eq("scheduled_for", args.scheduledFor)
    .eq("destinatario", args.numero)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing?.id) return false;

  const { data: payload, error: pErr } = await supabase.rpc("agenda_resumo_usuario", {
    p_user_id: args.cfg.user_id,
    p_data: args.dateStr,
    p_dias: args.dias,
  });
  if (pErr) throw pErr;

  const msg = montarResumo(payload as ResumoPayload, { tipo: args.tipo === "resumo_diario" ? "diario" : "semanal", dataLabel: args.dataLabel });

  const { data: logEntry, error: logErr } = await supabase
    .from("lembretes_log")
    .insert({
      user_id: args.cfg.user_id,
      canal: "whatsapp",
      tipo: args.tipo,
      scheduled_for: args.scheduledFor,
      destinatario: args.numero,
      mensagem: msg,
      status: "pendente",
    })
    .select("id")
    .single();
  if (logErr) {
    if ((logErr as any).code === "23505") return false;   // race: outro run ja pegou
    throw logErr;
  }

  const res = await fetch(`${uazapi.url.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: uazapi.token },
    body: JSON.stringify({ number: args.numero, text: msg }),
  });
  const raw = await res.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }

  if (res.ok) {
    await supabase.from("lembretes_log").update({
      status: "enviado",
      enviado_em: new Date().toISOString(),
      provider_message_id: parsed?.message_id || parsed?.id || null,
    }).eq("id", logEntry.id);
    return true;
  }
  await supabase.from("lembretes_log").update({
    status: "falhou",
    erro: parsed?.message || `Erro UAZAPI (${res.status})`,
  }).eq("id", logEntry.id);
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const cronSecret = await getSecret(supabase, "WHATSAPP_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (!headerSecret || headerSecret !== cronSecret) {
      return json({ success: false, error: "Não autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;

    const uazapi = { url: await getSecret(supabase, "UAZAPI_URL"), token: await getSecret(supabase, "UAZAPI_TOKEN") };

    // Multiusuario: todas as configs ativas (service_role ve todas). Sem config = opt-out normal.
    const { data: cfgs, error: cfgErr } = await supabase
      .from("notificacao_config")
      .select("user_id, whatsapp_numero, whatsapp_ativo, resumo_diario_ativo, resumo_diario_hora, resumo_semanal_ativo, resumo_semanal_dia, resumo_semanal_hora")
      .eq("whatsapp_ativo", true)
      .not("whatsapp_numero", "is", null)
      .not("user_id", "is", null);
    if (cfgErr) throw cfgErr;

    const now = new Date();
    const dateStr = spDateString(now);
    const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
    const weekdayKey: Record<string, string> = { Mon: "segunda", Tue: "terca", Wed: "quarta", Thu: "quinta", Fri: "sexta", Sat: "sabado", Sun: "domingo" };
    const todayKey = weekdayKey[weekdayShort] || "segunda";
    const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(now);
    const dataFormatada = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "long" }).format(now);
    const dataLabel = `${diaSemana}, ${dataFormatada}`;

    let enviados = 0;
    let erros = 0;
    let skipped = 0;
    const detalhes: Array<Record<string, unknown>> = [];

    for (const cfg of (cfgs || []) as Cfg[]) {
      try {
        const numero = String(cfg.whatsapp_numero || "").replace(/\D/g, "");
        if (!numero) { skipped++; continue; }

        // Janela de silencio (07:30-21:00 SP) aplicada ao horario configurado — ponto unico no banco.
        const { hh: dhh, mm: dmm } = parseTimeToHHMM(cfg.resumo_diario_hora || "08:00");
        const { data: schedDaily, error: e1 } = await supabase.rpc("agenda_momento_lembrete", {
          p_vencimento: scheduledForIsoSp(dateStr, dhh, dmm), p_dia_inteiro: false, p_minutos: 0,
        });
        if (e1) throw e1;
        const { hh: whh, mm: wmm } = parseTimeToHHMM(cfg.resumo_semanal_hora || "20:00");
        const { data: schedWeekly, error: e2 } = await supabase.rpc("agenda_momento_lembrete", {
          p_vencimento: scheduledForIsoSp(dateStr, whh, wmm), p_dia_inteiro: false, p_minutos: 0,
        });
        if (e2) throw e2;

        const scheduledDaily = new Date(String(schedDaily)).toISOString();
        const scheduledWeekly = new Date(String(schedWeekly)).toISOString();
        const sendDaily = !!cfg.resumo_diario_ativo && (force || withinWindow(now, scheduledDaily, 12));
        const sendWeekly = !!cfg.resumo_semanal_ativo && (force || (todayKey === String(cfg.resumo_semanal_dia || "domingo") && withinWindow(now, scheduledWeekly, 12)));

        if (sendDaily) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_diario", scheduledFor: scheduledDaily, dateStr, dias: 1, dataLabel });
          if (ok) enviados++;
        }
        if (sendWeekly) {
          const ok = await enviarResumo(supabase, uazapi, { cfg, numero, tipo: "resumo_semanal", scheduledFor: scheduledWeekly, dateStr, dias: 7, dataLabel });
          if (ok) enviados++;
        }
        detalhes.push({ user_id: cfg.user_id, sendDaily, sendWeekly, scheduledDaily, scheduledWeekly });
      } catch (e: any) {
        console.error("whatsapp-agenda-resumo: usuario", cfg.user_id, e?.message || e);
        erros++;
      }
    }

    return json({ success: true, enviados, erros, skipped, usuarios: (cfgs || []).length, detalhes }, 200);
  } catch (e: any) {
    console.error("❌ whatsapp-agenda-resumo:", e?.message || e);
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
```

Mover o `import { montarResumo, type ResumoPayload } …` para o topo (após o import do `createClient`).

- [ ] **Step 6: Testes + commit**

Run: `node --test --experimental-strip-types supabase/functions/_shared/agendaResumo.test.mjs` (3/3) e `node --test --experimental-strip-types supabase/functions/_shared/agendaLembretes.test.mjs` (5/5).

```bash
git add supabase/functions/_shared/agendaResumo.ts supabase/functions/_shared/agendaResumo.test.mjs supabase/functions/whatsapp-agenda-resumo/index.ts
git commit -m "feat(agenda): resumo individual multiusuario e completo (Pagar: agregadas) via agenda_resumo_usuario"
```

---

### Task 8: Deploy das edges, verificação em produção (§10) e fechamento da branch

**Files:**
- Modify: `Docs/handoffs/2026-09-01-agenda-maria.md` (só o checklist §14: marcar o que a fase A entregou)

**Interfaces:**
- Consumes: Tasks 1–7 commitadas; migrations aplicadas; cron do sync ativo.

- [ ] **Step 1: Deploy das duas funções**

```bash
cd "D:/2025/CURSO_VIBE_CODING/dash-folha-pagamento" && for fn in whatsapp-agenda-lembretes whatsapp-agenda-resumo; do npx supabase functions deploy "$fn" --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt | tail -3; done
```

Expected: `Deployed Functions.` para as duas. Se o bundle falhar por import do `_shared`, o caminho relativo é `../_shared/…` a partir de `<fn>/index.ts` (mesmo padrão de `contas-pagar-dia-gerar`).

- [ ] **Step 2: Esperar o cron (5 min) e conferir que os jobs rodaram sem erro**

```sql
select status, start_time, left(return_message, 200) as msg
  from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname in ('agenda-whatsapp-lembretes-5min','agenda-whatsapp-resumo-5min'))
 order by start_time desc limit 4;
```

Expected: `succeeded` nas últimas execuções (o `net.http_post` retorna 200; a função responde `{"success":true,…}`).

- [ ] **Step 3: Varredura de fuso em produção (§10)**

```sql
select proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (proname like 'agenda\_%' escape '\')
   and (prosrc ~* '\mcurrent_date\M' or prosrc ~* 'now\(\)::date');
```

Expected: **0 linhas**.

- [ ] **Step 4: `proacl` de todas as funções `agenda_%`**

```sql
select proname, proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname like 'agenda\_%' escape '\'
 order by proname;
```

Expected: 6 funções (`agenda_brl`, `agenda_destinatarios`, `agenda_lembretes_devidos`, `agenda_momento_lembrete`, `agenda_resumo_usuario`, `agenda_sync_contas_pagar`), todas com `proacl` **não nulo**, contendo `service_role=X/…`, sem `anon`, `authenticated` nem `=X/` sem nome.

- [ ] **Step 5: Verificação da manhã seguinte (02/09) — a Ana recebe o resumo completo**

Depois das 08:00 SP de 02/09:

```sql
select tipo, destinatario is not null as tem_destinatario, status, scheduled_for, length(mensagem) as tam, position('e mais' in mensagem) as truncou
  from lembretes_log
 where tipo in ('resumo_diario','lembrete') and created_at >= (date '2026-09-02')::timestamp at time zone 'America/Sao_Paulo'
 order by created_at desc limit 10;
```

Expected: 1 linha `resumo_diario` com `status = 'enviado'`, `truncou = 0`. Zero linhas `lembrete` pra tarefas dia-inteiro (só tarefas com hora geram ping). A Ana confirma que recebeu a lista completa (rotinas uma a uma, "CONTAS: N contas hoje — R$ X (detalhe no laudo)").

**Avisar a Ana — mudança de comportamento:** com o sync no servidor, marcar um "Pagar:" como concluído na tela **volta a pendente em ≤ 10 min** se a conta não foi baixada — o espelho segue a conta, por desenho (a fase B formaliza isso com `concluir` recusando espelho). "Pagar:" se fecha **dando baixa na conta**, não riscando a tarefa. Antes isso só acontecia quando ela reabria a Agenda; agora é a cada 10 min, sempre.

- [ ] **Step 6: Integridade final da fase A (§10)**

```sql
select
  (select count(*) from (select vinculo_tipo, vinculo_id from tarefas where vinculo_id is not null group by 1,2 having count(*) > 1) d) as dup_vinculo_0,
  (select count(*) from tarefas t where t.vinculo_tipo='conta_pagar' and not exists (select 1 from contas_pagar c where c.id=t.vinculo_id and c.status not in ('cancelado','finalizado'))) as orfas_0,
  (select count(*) from tarefas_listas_membros) as membros_3,
  (select count(*) from pg_policies where tablename='notificacao_config' and policyname like '%_own') as politicas_4,
  (select active from cron.job where jobname='agenda-sync-contas-10min') as cron_sync_true;
```

Expected: `0, 0, 3, 4, true`.

- [ ] **Step 7: Rodar a suíte inteira uma última vez**

```bash
node --test --experimental-strip-types supabase/migrations/agenda_fase_a.test.mjs supabase/functions/_shared/agendaLembretes.test.mjs supabase/functions/_shared/agendaResumo.test.mjs supabase/functions/_shared/recorrentesMes.test.mjs supabase/functions/_shared/relatorioContasDia.test.mjs && npm run typecheck
```

Expected: tudo PASS; typecheck limpo.

- [ ] **Step 8: Handoff — marcar o que a fase A entregou**

Em `Docs/handoffs/2026-09-01-agenda-maria.md`, §14, acrescentar abaixo do checklist:

```markdown
**Fase A entregue em <data>:** `tarefas.parent_id/responsavel_id/concluida_por/mensagem_origem_id`, `tarefas_listas_membros` (Financeiro ← Rose, Ana; RH ← Ana), `maria_whatsapp_atores.user_id` (3 atores), `agenda_destinatarios`, `agenda_momento_lembrete`, `agenda_sync_contas_pagar` + cron. Migrations: `<versões>`. Status geral continua **pré-implementação** até a fase B (RPCs).
```

Commit: `git commit -am "docs(agenda): handoff registra entrega da fase A"`.

- [ ] **Step 9: Fechar a branch**

Usar `superpowers:finishing-a-development-branch`: rebase/merge fast-forward em `main`, push, deletar `feat/agenda-fase-a` local e remoto. O Vercel rebuilda o front (Task 5) automaticamente.

---

## Self-review (feito ao escrever)

**Cobertura da spec (fase A, §11):** item 1 → Task 4 + 5; item 3 → Task 1 (colunas + triggers); item 4 → Tasks 1 (membros, atores.user_id, responsavel_id, concluida_por, mensagem_origem_id), 2 (RLS + índice de lembretes), 3 (`agenda_destinatarios`, `agenda_momento_lembrete` com janela, `agenda_resumo_usuario`), 6–7 (jobs multiusuário, resumo completo, chave por destinatário). §10 fase A: testes estáticos (Task 1), comportamentais (Tasks 1–4), edge (6–7), fuso (Task 1 estático + Task 8 live), `proacl` (3 e 8), produção (4, 5, 8). Ordem de deploy (§11): gate explícito na Task 5 Step 1. `upsertNotificacaoConfig` com `user_id` (§4.5): Task 2 Step 4. **Fora da fase A (fase B):** `rotina_id`, `competencia`, `agenda_rotinas`, materializador, seed, RPCs, `vigencia_inicio`, `agenda_materializacoes`.

**Placeholders:** nenhum `TBD/TODO`; todo passo de código tem o código. A única variável é `<versão do servidor>` no nome dos arquivos de migration, resolvida pelo `select version …` em cada task.

**Consistência de tipos/nomes:** `agenda_lembretes_devidos` devolve exatamente as colunas de `LinhaDevida` (Task 3 ↔ Task 6); `agenda_resumo_usuario` devolve exatamente `ResumoPayload` (Task 3 ↔ Task 7); `agenda_momento_lembrete(timestamptz, boolean, integer)` é chamada com `p_vencimento/p_dia_inteiro/p_minutos` (Task 7); índice `tarefas_vinculo_uniq` é o árbitro do `ON CONFLICT (vinculo_tipo, vinculo_id)` (Task 1 ↔ Task 4); nomes dos cron jobs existentes (`agenda-whatsapp-lembretes-5min`, `agenda-whatsapp-resumo-5min`) conferidos em `cron.job`.
