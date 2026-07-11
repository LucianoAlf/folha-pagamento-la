# Folha por Conta Pagadora - Fatia A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (<code>- [ ]</code>) syntax for tracking.

**Goal:** Criar a fundacao segura para reconciliar cada fatia mensal da folha com uma conta pagadora, com preflight read-only e salvamento atomico, sem alterar a UI principal nem gerar Contas a Pagar.

**Architecture:** A conta pagadora passa a pertencer a <code>lancamentos_folha</code>, que ja contem as fatias financeiras mensais. Uma migration corretiva remove o campo vazio do cadastro fixo do colaborador, adiciona a FK mensal e protege a coerencia conta-empresa-centro-unidade. Duas RPCs SECURITY DEFINER fornecem preflight e escrita atomica, preservando totais, categorias e metadados antes de qualquer frontend da Fatia B.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL SECURITY DEFINER, Supabase JS client, TypeScript, Node test runner, Vite.

---

## Scope e sequencia

Este plano cobre apenas a **Fatia A** da especificacao aprovada:

- historico correto da migration ja aplicada;
- remocao corretiva de <code>colaboradores.conta_pagadora_id</code>;
- <code>lancamentos_folha.conta_pagadora_id</code>;
- coerencia e porta unica para alteracao da conta;
- preflight read-only;
- RPC atomica de rateio;
- tipos e service para a Fatia B;
- testes estaticos, unitarios e smoke transacional.

Nao entram:

- lista consolidada e modal matriz;
- fechamento/reabertura;
- geracao de <code>contas_pagar</code>;
- integracao da Maria;
- alteracao das Edge Functions.

Depois da auditoria desta fatia, escrever planos separados para B, C e D. Nao iniciar B no mesmo PR.

## Mapa de arquivos

**Preservar sem editar:**

- <code>supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql</code>
  - Copia exata da migration ja aplicada no banco vivo e hoje presente apenas na branch antiga.

**Criar:**

- <code>supabase/migrations/20260710_2_folha_rateio_conta_pagadora_model.sql</code>
  - Corrige o campo do colaborador, adiciona a FK mensal, indices, unicidade parcial e trigger de coerencia/porta unica.
- <code>supabase/migrations/20260710_3_folha_rateio_preflight.sql</code>
  - RPC read-only que mede pendencias, incoerencias, duplicidades e totais por conta.
- <code>supabase/migrations/20260710_4_folha_rateio_salvar.sql</code>
  - RPC transacional para substituir as fatias de uma pessoa sem mudar seus totais.
- <code>supabase/migrations/folha_rateio_contas_model.test.mjs</code>
  - Teste estatico das migrations de modelo.
- <code>supabase/migrations/folha_rateio_preflight.test.mjs</code>
  - Teste estatico da RPC read-only e seus grants.
- <code>supabase/migrations/folha_rateio_salvar.test.mjs</code>
  - Teste estatico da RPC de escrita, anti-spoof, auditoria e invariantes.
- <code>types/folhaRateio.ts</code>
  - Contratos de preflight, fatias e respostas.
- <code>services/folhaRateioService.ts</code>
  - Cliente Supabase das duas RPCs e lookup das contas ativas.
- <code>services/folhaRateioService.test.ts</code>
  - Testes do normalizador e do contrato seguro do service.
- <code>services/api.folhaRateio.test.ts</code>
  - Regressao garantindo que duplicar competencia nao copie conta pagadora.

**Modificar:**

- <code>types.ts</code>
  - Adiciona somente <code>conta_pagadora_id?: string | null</code> em <code>Lancamento</code>.

Nenhum componente React e nenhum arquivo de Contas a Pagar e alterado nesta fatia.

---

### Task 1: Preservar o historico e criar a migration do modelo mensal

**Files:**
- Create: <code>supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql</code>
- Create: <code>supabase/migrations/20260710_2_folha_rateio_conta_pagadora_model.sql</code>
- Create: <code>supabase/migrations/folha_rateio_contas_model.test.mjs</code>

- [ ] **Step 1: Copiar a migration ja aplicada sem alterar um byte**

Run:

~~~powershell
git restore --source d0adea41a0c1836e78c931fdc16a6af29a585121 -- supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql
$expected = '720b38f7177c3a97a6e37af0c3950e69fac998ad'
$actual = git hash-object supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql
if ($actual -ne $expected) { throw "migration historica divergiu: $actual != $expected" }
~~~

Expected: sem diferenca. Nao editar essa migration para corrigir o desenho.

- [ ] **Step 2: Escrever primeiro o teste estatico do modelo**

Create <code>supabase/migrations/folha_rateio_contas_model.test.mjs</code>:

~~~javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const legacy = readFileSync(
  new URL('./20260710_1_colaboradores_conta_pagadora.sql', import.meta.url),
  'utf8'
);
const model = readFileSync(
  new URL('./20260710_2_folha_rateio_conta_pagadora_model.sql', import.meta.url),
  'utf8'
);

test('keeps the already-applied collaborator migration unchanged in history', () => {
  assert.match(legacy, /alter table public\.colaboradores[\s\S]*add column if not exists conta_pagadora_id uuid/i);
  assert.match(legacy, /references public\.financeiro_contas_bancarias\(id\)/i);
});

test('moves payer account from collaborator master to monthly payroll slices', () => {
  assert.match(model, /recusa remover colaboradores\.conta_pagadora_id/i);
  assert.match(model, /where conta_pagadora_id is not null/i);
  assert.match(model, /drop column if exists conta_pagadora_id/i);
  assert.match(model, /alter table public\.lancamentos_folha[\s\S]*add column if not exists conta_pagadora_id uuid/i);
  assert.match(model, /foreign key \(conta_pagadora_id\)[\s\S]*financeiro_contas_bancarias\(id\)/i);
  assert.doesNotMatch(model, /update\s+public\.lancamentos_folha[\s\S]*set\s+conta_pagadora_id/i);
});

test('creates lookup and canonical partial-unique indexes', () => {
  assert.match(model, /create index if not exists lancamentos_folha_folha_conta_pagadora_idx/i);
  assert.match(model, /create unique index if not exists lancamentos_folha_rateio_canonico_uidx/i);
  assert.match(model, /\(folha_id,\s*colaborador_id,\s*categoria,\s*conta_pagadora_id\)/i);
  assert.match(model, /where conta_pagadora_id is not null/i);
});

test('guards account writes and validates account-company-center-unit coherence', () => {
  assert.match(model, /create or replace function public\.folha_lancamento_valida_conta_pagadora/i);
  assert.match(model, /current_setting\('app\.folha_rateio_rpc', true\)/i);
  assert.match(model, /alteracao de conta pagadora exige a RPC de rateio/i);
  assert.match(model, /from public\.financeiro_contas_bancarias b/i);
  assert.match(model, /join public\.financeiro_empresas e/i);
  assert.match(model, /join public\.centros_custo cc/i);
  assert.match(model, /new\.unidade is distinct from v_unidade/i);
  assert.match(model, /before insert or update of conta_pagadora_id, unidade/i);
});
~~~

- [ ] **Step 3: Rodar o teste e confirmar a falha esperada**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_contas_model.test.mjs
~~~

Expected: FAIL porque <code>20260710_2_folha_rateio_conta_pagadora_model.sql</code> ainda nao existe.

- [ ] **Step 4: Criar a migration corretiva e aditiva**

Create <code>supabase/migrations/20260710_2_folha_rateio_conta_pagadora_model.sql</code>:

~~~sql
-- Fase 5 / Fatia A: conta pagadora pertence a fatia mensal, nao ao cadastro fixo.
-- Sem backfill: toda reconciliacao e humana e por competencia.

do $$
begin
  if exists (
    select 1
    from public.colaboradores
    where conta_pagadora_id is not null
  ) then
    raise exception 'recusa remover colaboradores.conta_pagadora_id: existem atribuicoes preenchidas.';
  end if;
end
$$;

drop index if exists public.colaboradores_conta_pagadora_id_idx;

alter table public.colaboradores
  drop constraint if exists colaboradores_conta_pagadora_id_fkey;

alter table public.colaboradores
  drop column if exists conta_pagadora_id;

alter table public.lancamentos_folha
  add column if not exists conta_pagadora_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.lancamentos_folha'::regclass
       and conname = 'lancamentos_folha_conta_pagadora_id_fkey'
  ) then
    alter table public.lancamentos_folha
      add constraint lancamentos_folha_conta_pagadora_id_fkey
      foreign key (conta_pagadora_id)
      references public.financeiro_contas_bancarias(id);
  end if;
end
$$;

create index if not exists lancamentos_folha_folha_conta_pagadora_idx
  on public.lancamentos_folha (folha_id, conta_pagadora_id);

create unique index if not exists lancamentos_folha_rateio_canonico_uidx
  on public.lancamentos_folha (
    folha_id,
    colaborador_id,
    categoria,
    conta_pagadora_id
  )
  where conta_pagadora_id is not null;

create or replace function public.folha_lancamento_valida_conta_pagadora()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade text;
  v_role text;
  v_rpc_marker text;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  v_rpc_marker := coalesce(current_setting('app.folha_rateio_rpc', true), '');

  if (
    (tg_op = 'INSERT' and new.conta_pagadora_id is not null)
    or
    (tg_op = 'UPDATE' and new.conta_pagadora_id is distinct from old.conta_pagadora_id)
  ) and v_role = 'authenticated' and v_rpc_marker <> 'on' then
    raise exception 'alteracao de conta pagadora exige a RPC de rateio.'
      using errcode = '42501';
  end if;

  if new.conta_pagadora_id is null then
    return new;
  end if;

  select cc.codigo
    into v_unidade
    from public.financeiro_contas_bancarias b
    join public.financeiro_empresas e
      on e.id = b.empresa_id
     and e.ativo = true
    join public.centros_custo cc
      on cc.id = e.unidade_id
     and cc.ativo = true
   where b.id = new.conta_pagadora_id
     and b.ativo = true;

  if v_unidade is null then
    raise exception 'conta_pagadora_id nao encontrada, inativa ou sem unidade ativa.';
  end if;

  if v_unidade not in ('cg', 'rec', 'bar') then
    raise exception 'unidade derivada da conta pagadora e invalida: %', v_unidade;
  end if;

  if new.unidade is distinct from v_unidade then
    raise exception 'unidade % nao corresponde a unidade % da conta pagadora.',
      new.unidade, v_unidade;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_folha_lancamento_valida_conta_pagadora
  on public.lancamentos_folha;

create trigger trg_folha_lancamento_valida_conta_pagadora
  before insert or update of conta_pagadora_id, unidade
  on public.lancamentos_folha
  for each row
  execute function public.folha_lancamento_valida_conta_pagadora();

revoke all on function public.folha_lancamento_valida_conta_pagadora()
  from public, anon, authenticated, maria_operacional, maria_leitura;
~~~

- [ ] **Step 5: Rodar o teste do modelo**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_contas_model.test.mjs
~~~

Expected: 4 tests, 4 pass.

- [ ] **Step 6: Verificar que a migration antiga continua byte a byte igual**

Run:

~~~powershell
$expected = '720b38f7177c3a97a6e37af0c3950e69fac998ad'
$actual = git hash-object supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql
if ($actual -ne $expected) { throw "migration historica divergiu: $actual != $expected" }
~~~

Expected: sem diff.

- [ ] **Step 7: Commit**

~~~powershell
git add supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql supabase/migrations/20260710_2_folha_rateio_conta_pagadora_model.sql supabase/migrations/folha_rateio_contas_model.test.mjs
git commit -m "feat(folha): mover conta pagadora para fatias mensais"
~~~

---

### Task 2: Criar a RPC read-only de preflight

**Files:**
- Create: <code>supabase/migrations/20260710_3_folha_rateio_preflight.sql</code>
- Create: <code>supabase/migrations/folha_rateio_preflight.test.mjs</code>

- [ ] **Step 1: Escrever o teste estatico da RPC de preflight**

Create <code>supabase/migrations/folha_rateio_preflight.test.mjs</code>:

~~~javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const preflight = readFileSync(
  new URL('./20260710_3_folha_rateio_preflight.sql', import.meta.url),
  'utf8'
);
test('preflight is read-only and returns reconciliation diagnostics', () => {
  assert.match(preflight, /create or replace function public\.folha_rateio_contas_preflight\(p_folha_id integer\)/i);
  assert.match(preflight, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(preflight, /fatias_sem_conta/i);
  assert.match(preflight, /incoerencias_fiscais/i);
  assert.match(preflight, /conflitos_chave/i);
  assert.match(preflight, /pessoas_pendentes/i);
  assert.match(preflight, /totais_por_conta/i);
  assert.match(preflight, /total_folha/i);
  assert.doesNotMatch(preflight, /\b(insert|update|delete)\s+(into|public\.|from)/i);
});

test('preflight grants execute only to authenticated and service role', () => {
  assert.match(preflight, /revoke all on function public\.folha_rateio_contas_preflight\(integer\) from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(preflight, /grant execute on function public\.folha_rateio_contas_preflight\(integer\) to authenticated, service_role/i);
});

~~~

- [ ] **Step 2: Rodar apenas o teste do preflight e confirmar a falha**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_preflight.test.mjs
~~~

Expected: FAIL porque M3 ainda nao existe.

- [ ] **Step 3: Criar a RPC de preflight**

Create <code>supabase/migrations/20260710_3_folha_rateio_preflight.sql</code>:

~~~sql
-- Fase 5 / Fatia A: diagnostico read-only da reconciliacao por conta pagadora.

create or replace function public.folha_rateio_contas_preflight(p_folha_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_folha numeric;
  v_total_lancamentos numeric;
  v_pessoas_total integer;
  v_pessoas_pendentes integer;
  v_sem_conta integer;
  v_incoerentes integer;
  v_conflitos integer;
  v_totais_por_conta jsonb;
  v_problemas jsonb;
begin
  select f.total_geral
    into v_total_folha
    from public.folhas_mensais f
   where f.id = p_folha_id;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  with base as (
    select
      lf.id,
      lf.colaborador_id,
      lf.categoria,
      lf.conta_pagadora_id,
      lf.unidade,
      lf.total,
      b.id as conta_id,
      b.ativo as conta_ativa,
      e.id as empresa_id,
      e.ativo as empresa_ativa,
      cc.id as centro_id,
      cc.codigo as unidade_esperada,
      cc.ativo as centro_ativo
    from public.lancamentos_folha lf
    left join public.financeiro_contas_bancarias b on b.id = lf.conta_pagadora_id
    left join public.financeiro_empresas e on e.id = b.empresa_id
    left join public.centros_custo cc on cc.id = e.unidade_id
    where lf.folha_id = p_folha_id
  ),
  duplicadas as (
    select colaborador_id, categoria, conta_pagadora_id
    from base
    where conta_pagadora_id is not null
    group by colaborador_id, categoria, conta_pagadora_id
    having count(*) > 1
  ),
  marcadas as (
    select
      b.*,
      (
        b.conta_pagadora_id is null
        or b.conta_id is null
        or b.conta_ativa is distinct from true
        or b.empresa_id is null
        or b.empresa_ativa is distinct from true
        or b.centro_id is null
        or b.centro_ativo is distinct from true
        or b.unidade is distinct from b.unidade_esperada
        or exists (
          select 1 from duplicadas d
          where d.colaborador_id = b.colaborador_id
            and d.categoria = b.categoria
            and d.conta_pagadora_id = b.conta_pagadora_id
        )
      ) as pendente
    from base b
  )
  select
    coalesce(sum(total), 0),
    count(distinct colaborador_id),
    count(distinct colaborador_id) filter (where pendente),
    count(*) filter (where conta_pagadora_id is null),
    count(*) filter (
      where conta_pagadora_id is not null
        and (
          conta_id is null
          or conta_ativa is distinct from true
          or empresa_id is null
          or empresa_ativa is distinct from true
          or centro_id is null
          or centro_ativo is distinct from true
          or unidade is distinct from unidade_esperada
        )
    )
    into
      v_total_lancamentos,
      v_pessoas_total,
      v_pessoas_pendentes,
      v_sem_conta,
      v_incoerentes
  from marcadas;

  select count(*)
    into v_conflitos
    from (
      select colaborador_id, categoria, conta_pagadora_id
      from public.lancamentos_folha
      where folha_id = p_folha_id
        and conta_pagadora_id is not null
      group by colaborador_id, categoria, conta_pagadora_id
      having count(*) > 1
    ) conflitos;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'conta_pagadora_id', x.conta_pagadora_id,
        'conta_apelido', x.conta_apelido,
        'empresa', x.empresa,
        'unidade', x.unidade,
        'valor', x.valor
      )
      order by x.empresa, x.conta_apelido
    ),
    '[]'::jsonb
  )
  into v_totais_por_conta
  from (
    select
      lf.conta_pagadora_id,
      b.apelido as conta_apelido,
      coalesce(e.label_operacional, e.nome_fantasia, e.razao_social) as empresa,
      cc.codigo as unidade,
      coalesce(sum(lf.total), 0) as valor
    from public.lancamentos_folha lf
    join public.financeiro_contas_bancarias b on b.id = lf.conta_pagadora_id
    join public.financeiro_empresas e on e.id = b.empresa_id
    join public.centros_custo cc on cc.id = e.unidade_id
    where lf.folha_id = p_folha_id
    group by
      lf.conta_pagadora_id,
      b.apelido,
      e.label_operacional,
      e.nome_fantasia,
      e.razao_social,
      cc.codigo
  ) x;

  select coalesce(
    jsonb_agg(jsonb_build_object('codigo', p.codigo, 'quantidade', p.quantidade)),
    '[]'::jsonb
  )
  into v_problemas
  from (
    select 'fatias_sem_conta'::text as codigo, v_sem_conta as quantidade
    union all select 'incoerencias_fiscais', v_incoerentes
    union all select 'conflitos_chave', v_conflitos
    union all select
      'total_geral_divergente',
      case when v_total_lancamentos is distinct from v_total_folha then 1 else 0 end
  ) p
  where p.quantidade > 0;

  return jsonb_build_object(
    'folha_id', p_folha_id,
    'pronto',
      v_sem_conta = 0
      and v_incoerentes = 0
      and v_conflitos = 0
      and v_total_lancamentos is not distinct from v_total_folha,
    'pessoas_total', v_pessoas_total,
    'pessoas_pendentes', v_pessoas_pendentes,
    'fatias_sem_conta', v_sem_conta,
    'incoerencias_fiscais', v_incoerentes,
    'conflitos_chave', v_conflitos,
    'total_folha', v_total_folha,
    'total_lancamentos', v_total_lancamentos,
    'diferenca', v_total_lancamentos - v_total_folha,
    'totais_por_conta', v_totais_por_conta,
    'problemas', v_problemas
  );
end;
$$;

revoke all on function public.folha_rateio_contas_preflight(integer)
  from public, anon, authenticated, maria_operacional, maria_leitura;

grant execute on function public.folha_rateio_contas_preflight(integer)
  to authenticated, service_role;
~~~

- [ ] **Step 4: Rodar o teste filtrado**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_preflight.test.mjs
~~~

Expected: 2 tests, 2 pass.

- [ ] **Step 5: Commit**

~~~powershell
git add supabase/migrations/20260710_3_folha_rateio_preflight.sql supabase/migrations/folha_rateio_preflight.test.mjs
git commit -m "feat(folha): adicionar preflight de contas pagadoras"
~~~

---

### Task 3: Criar a RPC atomica de rateio

**Files:**
- Create: <code>supabase/migrations/20260710_4_folha_rateio_salvar.sql</code>
- Create: <code>supabase/migrations/folha_rateio_salvar.test.mjs</code>

- [ ] **Step 1: Escrever o teste da RPC de escrita**

Create <code>supabase/migrations/folha_rateio_salvar.test.mjs</code>:

~~~javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const save = readFileSync(
  new URL('./20260710_4_folha_rateio_salvar.sql', import.meta.url),
  'utf8'
);

test('save RPC is secure, atomic and anti-spoof', () => {
  assert.match(save, /create or replace function public\.folha_rateio_contas_salvar/i);
  assert.match(save, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(save, /if v_role = 'authenticated' then[\s\S]*v_ator_tipo := 'web'/i);
  assert.match(save, /v_ator_ref := auth\.uid\(\)::text/i);
  assert.match(save, /v_role in \('service_role', 'postgres'\)/i);
  assert.match(save, /set_config\('app\.folha_rateio_rpc', 'on', true\)/i);
  assert.match(save, /for update/i);
  assert.match(save, /totais por categoria e componente nao conferem/i);
  assert.match(save, /total geral da folha mudou durante o rateio/i);
});

test('save RPC preserves structured metadata and uses a single audit trail', () => {
  assert.match(save, /detalhamento estruturado exige preservacao/i);
  assert.match(save, /insert into public\.maria_audit_log/i);
  assert.match(save, /'folha'/i);
  assert.match(save, /'RATEIO_CONTAS'/i);
});

test('save RPC exposes no direct table DML grant', () => {
  assert.match(save, /grant execute on function public\.folha_rateio_contas_salvar\(integer, integer, jsonb, jsonb\) to authenticated, service_role/i);
  assert.doesNotMatch(save, /grant\s+(insert|update|delete|all)\s+on\s+public\.lancamentos_folha/i);
});
~~~

- [ ] **Step 2: Confirmar que os testes da escrita falham**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_salvar.test.mjs
~~~

Expected: FAIL porque M4 ainda nao existe.

- [ ] **Step 3: Criar a RPC de escrita**

Create <code>supabase/migrations/20260710_4_folha_rateio_salvar.sql</code>:

~~~sql
-- Fase 5 / Fatia A: substitui atomicamente as fatias mensais de uma pessoa.
-- A UI envia todos os componentes; o banco deriva unidade e preserva totais.

create or replace function public.folha_rateio_contas_salvar(
  p_folha_id integer,
  p_colaborador_id integer,
  p_fatias jsonb,
  p_ator jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_before jsonb;
  v_after jsonb;
  v_total_geral_antes numeric;
  v_total_geral_depois numeric;
  v_input_count integer;
  v_current_count integer;
  v_audit_id uuid;
  v_numero_hash text;
  v_last4 text;
  v_row record;
begin
  if jsonb_typeof(p_fatias) <> 'array' or jsonb_array_length(p_fatias) = 0 then
    raise exception 'p_fatias deve ser um array nao vazio.';
  end if;

  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_ator_ref := auth.uid()::text;
    if v_ator_ref is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role in ('service_role', 'postgres') then
    v_ator_tipo := coalesce(nullif(p_ator->>'tipo', ''), 'sistema');
    if v_ator_tipo <> 'sistema' then
      raise exception 'ator.tipo nao permitido para service_role nesta fatia.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
  else
    raise exception 'papel nao autorizado para rateio da folha: %', v_role
      using errcode = '42501';
  end if;

  select total_geral
    into v_total_geral_antes
    from public.folhas_mensais
   where id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  perform 1
    from public.lancamentos_folha
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id
   for update;

  get diagnostics v_current_count = row_count;
  if v_current_count = 0 then
    raise exception 'colaborador_id % nao possui lancamentos na folha %.',
      p_colaborador_id, p_folha_id;
  end if;

  select jsonb_agg(to_jsonb(lf) order by lf.id)
    into v_before
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

  drop table if exists pg_temp.folha_rateio_input;

  create temporary table pg_temp.folha_rateio_input (
    ordem integer not null,
    lancamento_id integer null,
    categoria text null,
    conta_pagadora_id uuid null,
    salario numeric not null,
    bonus numeric not null,
    comissao numeric not null,
    passagem numeric not null,
    reembolso numeric not null,
    inss numeric not null,
    descontos numeric not null,
    unidade text null
  ) on commit drop;

  insert into pg_temp.folha_rateio_input (
    ordem, lancamento_id, categoria, conta_pagadora_id,
    salario, bonus, comissao, passagem, reembolso, inss, descontos
  )
  select
    ordinality::integer,
    nullif(item->>'lancamento_id', '')::integer,
    nullif(trim(item->>'categoria'), ''),
    nullif(item->>'conta_pagadora_id', '')::uuid,
    coalesce((item->>'salario')::numeric, 0),
    coalesce((item->>'bonus')::numeric, 0),
    coalesce((item->>'comissao')::numeric, 0),
    coalesce((item->>'passagem')::numeric, 0),
    coalesce((item->>'reembolso')::numeric, 0),
    coalesce((item->>'inss')::numeric, 0),
    coalesce((item->>'descontos')::numeric, 0)
  from jsonb_array_elements(p_fatias) with ordinality as x(item, ordinality);

  get diagnostics v_input_count = row_count;
  if v_input_count <> jsonb_array_length(p_fatias) then
    raise exception 'nem todas as fatias foram carregadas.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where categoria is null
       or conta_pagadora_id is null
       or salario < 0
       or bonus < 0
       or comissao < 0
       or passagem < 0
       or reembolso < 0
       or inss < 0
       or descontos < 0
  ) then
    raise exception 'categoria, conta e componentes nao negativos sao obrigatorios.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    group by categoria, conta_pagadora_id
    having count(*) > 1
  ) then
    raise exception 'conta pagadora repetida dentro da mesma categoria.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where lancamento_id is not null
    group by lancamento_id
    having count(*) > 1
  ) then
    raise exception 'lancamento_id nao pode ser reutilizado em duas fatias.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input i
    where not exists (
      select 1
      from public.lancamentos_folha lf
      where lf.folha_id = p_folha_id
        and lf.colaborador_id = p_colaborador_id
        and lf.categoria = i.categoria
    )
  ) then
    raise exception 'categoria enviada nao pertence ao colaborador nesta folha.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input i
    where i.lancamento_id is not null
      and not exists (
        select 1
        from public.lancamentos_folha lf
        where lf.id = i.lancamento_id
          and lf.folha_id = p_folha_id
          and lf.colaborador_id = p_colaborador_id
          and lf.categoria = i.categoria
      )
  ) then
    raise exception 'lancamento_id nao pertence a pessoa, folha e categoria informadas.';
  end if;

  update pg_temp.folha_rateio_input i
     set unidade = cc.codigo
    from public.financeiro_contas_bancarias b
    join public.financeiro_empresas e
      on e.id = b.empresa_id
     and e.ativo = true
    join public.centros_custo cc
      on cc.id = e.unidade_id
     and cc.ativo = true
   where b.id = i.conta_pagadora_id
     and b.ativo = true;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where unidade is null or unidade not in ('cg', 'rec', 'bar')
  ) then
    raise exception 'conta pagadora inativa, inexistente ou sem unidade operacional.';
  end if;

  if exists (
    with antes as (
      select
        categoria,
        coalesce(sum(salario), 0) as salario,
        coalesce(sum(bonus), 0) as bonus,
        coalesce(sum(comissao), 0) as comissao,
        coalesce(sum(passagem), 0) as passagem,
        coalesce(sum(reembolso), 0) as reembolso,
        coalesce(sum(inss), 0) as inss,
        coalesce(sum(descontos), 0) as descontos
      from public.lancamentos_folha
      where folha_id = p_folha_id and colaborador_id = p_colaborador_id
      group by categoria
    ),
    depois as (
      select
        categoria,
        coalesce(sum(salario), 0) as salario,
        coalesce(sum(bonus), 0) as bonus,
        coalesce(sum(comissao), 0) as comissao,
        coalesce(sum(passagem), 0) as passagem,
        coalesce(sum(reembolso), 0) as reembolso,
        coalesce(sum(inss), 0) as inss,
        coalesce(sum(descontos), 0) as descontos
      from pg_temp.folha_rateio_input
      group by categoria
    )
    select 1
    from antes a
    full join depois d using (categoria)
    where a.categoria is null
       or d.categoria is null
       or a.salario is distinct from d.salario
       or a.bonus is distinct from d.bonus
       or a.comissao is distinct from d.comissao
       or a.passagem is distinct from d.passagem
       or a.reembolso is distinct from d.reembolso
       or a.inss is distinct from d.inss
       or a.descontos is distinct from d.descontos
  ) then
    raise exception 'totais por categoria e componente nao conferem.';
  end if;

  if exists (
    select 1
    from public.lancamentos_folha lf
    where lf.folha_id = p_folha_id
      and lf.colaborador_id = p_colaborador_id
      and not exists (
        select 1
        from pg_temp.folha_rateio_input i
        where i.lancamento_id = lf.id
      )
      and (
        coalesce(lf.detalhamento, '{}'::jsonb) <> '{}'::jsonb
        or nullif(trim(lf.observacoes), '') is not null
      )
  ) then
    raise exception 'detalhamento estruturado exige preservacao explicita da linha de origem.';
  end if;

  perform set_config('app.folha_rateio_rpc', 'on', true);

  delete from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id
     and not exists (
       select 1 from pg_temp.folha_rateio_input i
       where i.lancamento_id = lf.id
     );

  update public.lancamentos_folha lf
     set conta_pagadora_id = null,
         updated_at = now()
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id
     and exists (
       select 1 from pg_temp.folha_rateio_input i
       where i.lancamento_id = lf.id
     );

  for v_row in
    select * from pg_temp.folha_rateio_input order by ordem
  loop
    if v_row.lancamento_id is not null then
      update public.lancamentos_folha
         set unidade = v_row.unidade,
             categoria = v_row.categoria,
             conta_pagadora_id = v_row.conta_pagadora_id,
             salario = v_row.salario,
             bonus = v_row.bonus,
             comissao = v_row.comissao,
             passagem = v_row.passagem,
             reembolso = v_row.reembolso,
             inss = v_row.inss,
             descontos = v_row.descontos,
             updated_at = now()
       where id = v_row.lancamento_id;
    else
      insert into public.lancamentos_folha (
        folha_id, colaborador_id, unidade, categoria, conta_pagadora_id,
        salario, bonus, comissao, passagem, reembolso, inss, descontos,
        alert_checked, detalhamento, created_at, updated_at
      )
      values (
        p_folha_id, p_colaborador_id, v_row.unidade, v_row.categoria,
        v_row.conta_pagadora_id, v_row.salario, v_row.bonus,
        v_row.comissao, v_row.passagem, v_row.reembolso,
        v_row.inss, v_row.descontos, false, '{}'::jsonb, now(), now()
      );
    end if;
  end loop;

  perform public.recalc_folha_totais(p_folha_id);

  select total_geral
    into v_total_geral_depois
    from public.folhas_mensais
   where id = p_folha_id;

  if v_total_geral_depois is distinct from v_total_geral_antes then
    raise exception 'total geral da folha mudou durante o rateio: antes %, depois %.',
      v_total_geral_antes, v_total_geral_depois;
  end if;

  select jsonb_agg(to_jsonb(lf) order by lf.categoria, lf.conta_pagadora_id)
    into v_after
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

  v_numero_hash := encode(
    extensions.digest(coalesce(v_ator_ref, v_ator_tipo), 'sha256'),
    'hex'
  );
  v_last4 := right(regexp_replace(coalesce(v_ator_ref, ''), '\D', '', 'g'), 4);
  if v_last4 = '' then
    v_last4 := 'n/a';
  end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  )
  values (
    case when v_ator_tipo = 'web' then 'Super Folha Web' else 'Sistema' end,
    v_ator_ref, v_numero_hash, v_last4, v_ator_tipo, 'folha',
    v_ator_tipo, v_role, 'lancamentos_folha', 'folha_rateio_colaborador',
    null, 'RATEIO_CONTAS',
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'fatias', v_before
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'fatias', v_after
    ),
    null, null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'colaborador_id', p_colaborador_id,
    'audit_id', v_audit_id,
    'fatias', v_after,
    'preflight', public.folha_rateio_contas_preflight(p_folha_id)
  );
end;
$$;

revoke all on function public.folha_rateio_contas_salvar(integer, integer, jsonb, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;

grant execute on function public.folha_rateio_contas_salvar(integer, integer, jsonb, jsonb)
  to authenticated, service_role;
~~~

- [ ] **Step 4: Rodar os testes das RPCs**

Run:

~~~powershell
node --test supabase/migrations/folha_rateio_salvar.test.mjs
~~~

Expected: 3 tests, 3 pass.

- [ ] **Step 5: Revisar especificamente o risco de metadados**

Run:

~~~powershell
rg -n "detalhamento estruturado|lancamento_id|jsonb_agg|RATEIO_CONTAS" supabase/migrations/20260710_4_folha_rateio_salvar.sql
~~~

Expected:

- linha detalhada so pode desaparecer se estiver vazia;
- um ID nao pode ser usado duas vezes;
- antes/depois entram no audit log;
- nenhuma rotina sobrescreve <code>detalhamento</code> de linha retida.

- [ ] **Step 6: Commit**

~~~powershell
git add supabase/migrations/20260710_4_folha_rateio_salvar.sql supabase/migrations/folha_rateio_salvar.test.mjs
git commit -m "feat(folha): salvar rateio mensal de forma atomica"
~~~

---

### Task 4: Adicionar contratos TypeScript e cliente Supabase

**Files:**
- Create: <code>types/folhaRateio.ts</code>
- Create: <code>services/folhaRateioService.ts</code>
- Create: <code>services/folhaRateioService.test.ts</code>
- Create: <code>services/api.folhaRateio.test.ts</code>
- Modify: <code>types.ts</code>

- [ ] **Step 1: Escrever os testes antes dos tipos e do service**

Create <code>services/folhaRateioService.test.ts</code>:

~~~typescript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeFolhaRateioFatias } from './folhaRateioService.ts';

test('normalizes money to cents and keeps only the safe rateio contract', () => {
  const result = normalizeFolhaRateioFatias([
    {
      lancamento_id: 10,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'conta-emla',
      salario: 1250.005,
      bonus: 200,
      comissao: 0,
      passagem: 250,
      reembolso: 0,
      inss: 200.68,
      descontos: 0,
      unidade: 'bar',
      detalhamento: { nao_deve: 'vazar' },
    } as never,
  ]);

  assert.deepEqual(result, [
    {
      lancamento_id: 10,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'conta-emla',
      salario: 1250.01,
      bonus: 200,
      comissao: 0,
      passagem: 250,
      reembolso: 0,
      inss: 200.68,
      descontos: 0,
    },
  ]);
});

test('service calls only preflight and save RPCs and sends an empty actor for web', () => {
  const source = readFileSync(new URL('./folhaRateioService.ts', import.meta.url), 'utf8');
  assert.match(source, /\.rpc\('folha_rateio_contas_preflight'/);
  assert.match(source, /\.rpc\('folha_rateio_contas_salvar'/);
  assert.match(source, /p_ator:\s*\{\}/);
  assert.doesNotMatch(source, /\.from\('lancamentos_folha'\)\.(insert|update|delete)/);
});
~~~

Create <code>services/api.folhaRateio.test.ts</code>:

~~~typescript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const duplicateBody =
  source.match(/async duplicateLancamentos[\s\S]*?\n  },\n\n  async updateFolhaStatus/)?.[0] || '';

test('duplicating a competence never copies payer-account reconciliation', () => {
  assert.ok(duplicateBody, 'duplicateLancamentos body not found');
  assert.doesNotMatch(duplicateBody, /conta_pagadora_id/);
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run:

~~~powershell
node --test services/folhaRateioService.test.ts services/api.folhaRateio.test.ts
~~~

Expected: FAIL porque os tipos e o service ainda nao existem.

- [ ] **Step 3: Criar os tipos focados**

Create <code>types/folhaRateio.ts</code>:

~~~typescript
import type { CollaboratorDepartment } from '../types.ts';
import type { FinanceiroContaBancaria } from './contasPagar.ts';

export type FolhaRateioFatiaInput = {
  lancamento_id: number | null;
  categoria: CollaboratorDepartment;
  conta_pagadora_id: string;
  salario: number;
  bonus: number;
  comissao: number;
  passagem: number;
  reembolso: number;
  inss: number;
  descontos: number;
};

export type FolhaRateioProblema = {
  codigo:
    | 'fatias_sem_conta'
    | 'incoerencias_fiscais'
    | 'conflitos_chave'
    | 'total_geral_divergente';
  quantidade: number;
};

export type FolhaRateioTotalConta = {
  conta_pagadora_id: string;
  conta_apelido: string;
  empresa: string;
  unidade: 'cg' | 'rec' | 'bar';
  valor: number;
};

export type FolhaRateioPreflight = {
  folha_id: number;
  pronto: boolean;
  pessoas_total: number;
  pessoas_pendentes: number;
  fatias_sem_conta: number;
  incoerencias_fiscais: number;
  conflitos_chave: number;
  total_folha: number;
  total_lancamentos: number;
  diferenca: number;
  totais_por_conta: FolhaRateioTotalConta[];
  problemas: FolhaRateioProblema[];
};

export type FolhaRateioSaveResponse = {
  success: true;
  folha_id: number;
  colaborador_id: number;
  audit_id: string;
  fatias: Record<string, unknown>[];
  preflight: FolhaRateioPreflight;
};

export type FolhaContaPagadora = FinanceiroContaBancaria;
~~~

Modify <code>types.ts</code>, inside <code>Lancamento</code>:

~~~typescript
  conta_pagadora_id?: string | null;
~~~

- [ ] **Step 4: Criar o service**

Create <code>services/folhaRateioService.ts</code>:

~~~typescript
import { fetchFinanceiroContasBancarias } from './contasPagarService';
import { supabase } from './supabase';
import type {
  FolhaContaPagadora,
  FolhaRateioFatiaInput,
  FolhaRateioPreflight,
  FolhaRateioSaveResponse,
} from '../types/folhaRateio';

const money = (value: number): number =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizeFolhaRateioFatias(
  fatias: FolhaRateioFatiaInput[]
): FolhaRateioFatiaInput[] {
  return fatias.map((fatia) => ({
    lancamento_id: fatia.lancamento_id || null,
    categoria: fatia.categoria,
    conta_pagadora_id: String(fatia.conta_pagadora_id || '').trim(),
    salario: money(fatia.salario),
    bonus: money(fatia.bonus),
    comissao: money(fatia.comissao),
    passagem: money(fatia.passagem),
    reembolso: money(fatia.reembolso),
    inss: money(fatia.inss),
    descontos: money(fatia.descontos),
  }));
}

function folhaRateioError(error: unknown): Error {
  const message = String((error as { message?: string })?.message || '');
  if (/totais por categoria e componente nao conferem/i.test(message)) {
    return new Error('A divisao precisa manter o total de cada componente.');
  }
  if (/detalhamento estruturado exige preservacao/i.test(message)) {
    return new Error('Esta pessoa possui detalhes que precisam permanecer em uma das fatias.');
  }
  if (/conta pagadora repetida/i.test(message)) {
    return new Error('Use cada conta apenas uma vez dentro da mesma categoria.');
  }
  if (/conta pagadora inativa|sem unidade operacional/i.test(message)) {
    return new Error('Escolha uma conta pagadora ativa e vinculada a uma unidade.');
  }
  return new Error(message || 'Nao foi possivel salvar a divisao por conta.');
}

export async function fetchFolhaContasPagadoras(): Promise<FolhaContaPagadora[]> {
  const contas = await fetchFinanceiroContasBancarias();
  return contas.filter((conta) => conta.ativo && conta.empresa?.ativo);
}

export async function fetchFolhaRateioPreflight(
  folhaId: number
): Promise<FolhaRateioPreflight> {
  const { data, error } = await supabase.rpc('folha_rateio_contas_preflight', {
    p_folha_id: folhaId,
  });
  if (error) throw folhaRateioError(error);
  return data as FolhaRateioPreflight;
}

export async function saveFolhaRateio(input: {
  folhaId: number;
  colaboradorId: number;
  fatias: FolhaRateioFatiaInput[];
}): Promise<FolhaRateioSaveResponse> {
  const { data, error } = await supabase.rpc('folha_rateio_contas_salvar', {
    p_folha_id: input.folhaId,
    p_colaborador_id: input.colaboradorId,
    p_fatias: normalizeFolhaRateioFatias(input.fatias),
    p_ator: {},
  });
  if (error) throw folhaRateioError(error);
  return data as FolhaRateioSaveResponse;
}
~~~

- [ ] **Step 5: Rodar os testes focados**

Run:

~~~powershell
node --test services/folhaRateioService.test.ts services/api.folhaRateio.test.ts
~~~

Expected: 3 tests, 3 pass.

- [ ] **Step 6: Rodar typecheck**

Run:

~~~powershell
npm run typecheck
~~~

Expected: exit 0.

- [ ] **Step 7: Commit**

~~~powershell
git add types.ts types/folhaRateio.ts services/folhaRateioService.ts services/folhaRateioService.test.ts services/api.folhaRateio.test.ts
git commit -m "feat(folha): adicionar cliente do rateio por contas"
~~~

---

### Task 5: Rodar todos os gates antes de qualquer alteracao remota

**Files:**
- No code changes expected.

- [ ] **Step 1: Confirmar escopo do diff**

Run:

~~~powershell
git diff --name-only origin/main...HEAD
~~~

Expected: somente migrations/testes da Fatia A, <code>types.ts</code>, <code>types/folhaRateio.ts</code> e services/testes do rateio. Nenhum componente React, Edge Function ou arquivo de Contas a Pagar.

- [ ] **Step 2: Rodar suite completa**

Run:

~~~powershell
node --test
~~~

Expected: todos os testes passam; baseline de 149 mais os novos testes.

- [ ] **Step 3: Rodar typecheck e build**

Run:

~~~powershell
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
~~~

Expected: ambos exit 0. O warning conhecido de chunk grande nao bloqueia.

- [ ] **Step 4: Rodar diff check**

Run:

~~~powershell
git diff --check origin/main...HEAD
~~~

Expected: nenhum output.

- [ ] **Step 5: Parar para revisao pre-migration**

Entregar:

- diff das quatro migrations, incluindo a copia imutavel de M1;
- output dos testes;
- typecheck/build;
- confirmacao de zero frontend e zero Edge;
- lista das migrations ja registradas no banco.

Nao executar <code>apply_migration</code> antes da revisao.

---

### Task 6: Aplicar as migrations novas e executar smoke transacional

**Files:**
- No source changes expected.

**Precondition:** revisao pre-migration explicitamente aprovada.

- [ ] **Step 1: Confirmar o historico remoto**

Use MCP <code>list_migrations</code>.

Expected:

- <code>20260710173454 / 20260710_1_colaboradores_conta_pagadora</code> ja registrada;
- M2, M3 e M4 ainda ausentes.

Se M1 estiver ausente ou com nome diferente, parar. Nao reaplicar nem reparar historico sem auditoria.

Antes de aplicar M2, executar:

~~~sql
select count(*) as atribuicoes_legadas
from public.colaboradores
where conta_pagadora_id is not null;
~~~

Expected: 0. Se for maior que zero, parar e reportar; a propria migration tambem deve recusar o drop.

- [ ] **Step 2: Aplicar somente M2**

Use <code>apply_migration</code> com nome:

    20260710_2_folha_rateio_conta_pagadora_model

e o conteudo exato de <code>20260710_2_folha_rateio_conta_pagadora_model.sql</code>.

Expected: success.

- [ ] **Step 3: Auditar M2 em leitura**

Run via MCP <code>execute_sql</code>:

~~~sql
select jsonb_build_object(
  'colaborador_field_exists', exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='colaboradores'
      and column_name='conta_pagadora_id'
  ),
  'lancamento_field', (
    select jsonb_build_object('nullable', is_nullable, 'type', udt_name)
    from information_schema.columns
    where table_schema='public'
      and table_name='lancamentos_folha'
      and column_name='conta_pagadora_id'
  ),
  'assigned_rows', (
    select count(*) from public.lancamentos_folha
    where conta_pagadora_id is not null
  )
);
~~~

Expected:

- collaborator field false;
- launch field uuid and nullable YES;
- assigned rows 0;
- no backfill.

- [ ] **Step 4: Aplicar M3 e M4 em ordem**

Use <code>apply_migration</code>:

1. <code>20260710_3_folha_rateio_preflight</code>;
2. <code>20260710_4_folha_rateio_salvar</code>.

Expected: success para ambas. Parar no primeiro erro.

- [ ] **Step 5: Smoke read-only do preflight em uma folha real**

Run:

~~~sql
select
  public.folha_rateio_contas_preflight(17) as preflight,
  (select count(distinct colaborador_id)
     from public.lancamentos_folha
    where folha_id = 17) as pessoas_reais;
~~~

Expected:

- <code>pronto = false</code>;
- <code>pessoas_pendentes = pessoas_reais</code>;
- <code>fatias_sem_conta</code> igual ao numero de linhas da folha ainda nao reconciliadas;
- <code>total_lancamentos = total_folha</code>;
- nenhuma escrita.

Nao fixar 67 no teste automatizado; a producao pode ter mudado desde a auditoria.

- [ ] **Step 6: Smoke atomico integralmente dentro de rollback**

Run via MCP <code>execute_sql</code> como uma unica chamada:

~~~sql
begin;

do $$
declare
  v_folha_id integer;
  v_colaborador_id integer;
  v_emla uuid;
  v_recreio uuid;
  v_result jsonb;
  v_total_antes numeric;
  v_total_depois numeric;
begin
  select id into v_colaborador_id
  from public.colaboradores
  where ativo = true
  order by id
  limit 1;

  select b.id into v_emla
  from public.financeiro_contas_bancarias b
  join public.financeiro_empresas e on e.id=b.empresa_id
  where b.ativo=true and e.label_operacional='EMLA CG'
  limit 1;

  select b.id into v_recreio
  from public.financeiro_contas_bancarias b
  join public.financeiro_empresas e on e.id=b.empresa_id
  where b.ativo=true and e.label_operacional='Recreio'
  limit 1;

  insert into public.folhas_mensais (ano, mes, status)
  values (2099, 12, 'rascunho')
  returning id into v_folha_id;

  insert into public.lancamentos_folha (
    folha_id, colaborador_id, unidade, categoria,
    salario, bonus, comissao, passagem, reembolso, inss, descontos,
    detalhamento
  )
  values (
    v_folha_id, v_colaborador_id, 'cg', 'staff_rateado',
    1000, 300, 0, 100, 0, 80, 20,
    jsonb_build_object('salario', 'smoke preservado')
  );

  select total_geral into v_total_antes
  from public.folhas_mensais where id=v_folha_id;

  select public.folha_rateio_contas_salvar(
    v_folha_id,
    v_colaborador_id,
    jsonb_build_array(
      jsonb_build_object(
        'lancamento_id', (
          select id from public.lancamentos_folha
          where folha_id=v_folha_id limit 1
        ),
        'categoria', 'staff_rateado',
        'conta_pagadora_id', v_emla,
        'salario', 600,
        'bonus', 200,
        'comissao', 0,
        'passagem', 100,
        'reembolso', 0,
        'inss', 50,
        'descontos', 20
      ),
      jsonb_build_object(
        'lancamento_id', null,
        'categoria', 'staff_rateado',
        'conta_pagadora_id', v_recreio,
        'salario', 400,
        'bonus', 100,
        'comissao', 0,
        'passagem', 0,
        'reembolso', 0,
        'inss', 30,
        'descontos', 0
      )
    ),
    jsonb_build_object('tipo', 'sistema', 'ref', 'smoke-fatia-a')
  ) into v_result;

  if coalesce((v_result->>'success')::boolean, false) is not true then
    raise exception 'RPC nao retornou sucesso: %', v_result;
  end if;

  if (v_result->'preflight'->>'pronto')::boolean is not true then
    raise exception 'preflight sintetico deveria estar pronto: %', v_result;
  end if;

  select total_geral into v_total_depois
  from public.folhas_mensais where id=v_folha_id;

  if v_total_depois is distinct from v_total_antes then
    raise exception 'total mudou: antes %, depois %', v_total_antes, v_total_depois;
  end if;

  if (
    select count(*) from public.lancamentos_folha
    where folha_id=v_folha_id and conta_pagadora_id is not null
  ) <> 2 then
    raise exception 'esperadas duas fatias reconciliadas';
  end if;

  if not exists (
    select 1 from public.lancamentos_folha
    where folha_id=v_folha_id
      and detalhamento->>'salario'='smoke preservado'
  ) then
    raise exception 'detalhamento foi perdido';
  end if;
end
$$;

rollback;
~~~

Expected: success e rollback. Confirmar depois que nao existe folha 2099/12.

- [ ] **Step 7: Provar bloqueios com rollback**

Executar testes transacionais separados:

1. update direto de <code>conta_pagadora_id</code> como authenticated deve falhar com 42501;
2. payload com R$ 0,01 de diferenca deve falhar;
3. payload que omite uma linha com <code>detalhamento</code> deve falhar;
4. conta inativa ou unidade incoerente deve falhar;
5. mesma categoria+conta duas vezes deve falhar.

Cada teste termina em rollback e confirma contagens do baseline.

- [ ] **Step 8: Rodar advisors**

Use MCP <code>get_advisors</code> para security e performance.

Expected: nenhuma nova falha de RLS, search_path ou indice introduzida pelas migrations. Registrar avisos preexistentes separadamente.

---

### Task 7: Gates pos-migration, relatorio e parada obrigatoria

**Files:**
- No product changes.

- [ ] **Step 1: Reexecutar gates locais**

~~~powershell
node --test
npm run typecheck
npm run build
git diff --check origin/main...HEAD
~~~

Expected: tudo verde.

- [ ] **Step 2: Confirmar worktree limpa**

Run:

~~~powershell
git status --short --branch
~~~

Expected: branch da Fatia A limpa e commits locais intencionais.

- [ ] **Step 3: Preparar relatorio de auditoria**

Relatar:

- hashes dos commits;
- migrations aplicadas e versoes remotas;
- confirmacao de que M1 nao foi reaplicada;
- coluna removida de colaboradores;
- coluna nullable criada em lancamentos;
- zero backfill;
- resultado do preflight real;
- smoke sintetico e cinco bloqueios com rollback;
- contagens antes/depois;
- testes, typecheck, build e diff check;
- advisors;
- confirmacao de zero UI, zero Contas a Pagar e zero Edge.

- [ ] **Step 4: Parar**

Nao iniciar Fatia B, nao abrir modal e nao gerar obrigacao. Aguardar:

1. auditoria do banco vivo;
2. revisao do diff;
3. autorizacao explicita para escrever o plano/implementar a Fatia B.

---

## Checklist de cobertura da especificacao

- Campo mensal, nao fixo: Tasks 1 e 3.
- Quatro contas e unidade derivada: Tasks 1, 2 e 3.
- Sem backfill/inferencia: Tasks 1 e 6.
- Unicidade por folha+pessoa+categoria+conta: Task 1.
- Totais por categoria/componente: Task 3.
- Total geral imutavel: Task 3.
- Metadados e Bistro preservados: Task 3 e smoke da Task 6.
- Preflight read-only: Task 2.
- Duplicacao de mes nasce a conciliar: Task 4.
- Auditoria e anti-spoof: Task 3.
- UI consolidada/matriz: intencionalmente reservada para Fatia B.
- Fechamento/Contas a Pagar/anti-dupla-contagem: intencionalmente reservado para Fatia C.
- Maria: intencionalmente reservada para Fatia D.

## Comandos finais resumidos

~~~powershell
node --test
npm run typecheck
npm run build
git diff --check origin/main...HEAD
~~~

O baseline atual desta worktree e 149/149 testes antes da implementacao.
