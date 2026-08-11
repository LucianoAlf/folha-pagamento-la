# Compras recorrentes nas faturas de cartão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que Rose registre uma compra recorrente na fatura atual, gere previsões idempotentes para as faturas seguintes e confirme manualmente a correspondência com o extrato sem alterar os totais financeiros antes da confirmação.

**Architecture:** A recorrência e suas previsões serão tabelas próprias, separadas de `financeiro_cartao_transacoes`. Isso mantém previsão fora de `valor_total`, Contas a Pagar, DRE e conciliação por construção. Uma RPC atômica grava a compra real atual e a regra; um helper interno idempotente gera snapshots de previsão ao abrir cada fatura; uma RPC distinta exige decisão explícita de Rose para vincular uma transação real à previsão.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Supabase/PostgreSQL, Node test runner, Docker/PostgreSQL 17 para fixture descartável.

---

## Estrutura de arquivos e contratos

| Arquivo | Responsabilidade depois da implementação |
| --- | --- |
| `supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql` | Schema aditivo, RLS, RPCs, auditoria, geração idempotente e novo corpo de `financeiro_cartao_fatura_abrir`. |
| `supabase/migrations/financeiro_cartoes_backend.test.mjs` | Guardrails estáticos: tabelas, índices, assinaturas, grants, chamada do gerador e ausência de previsão nos somatórios financeiros. |
| `supabase/tests/financeiro_cartao_recorrencias_fixture.sql` | Cenários comportamentais locais/CI, sempre dentro de `BEGIN … ROLLBACK`. |
| `supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs` | Sobe PostgreSQL 17 efêmero, aplica o schema mínimo e a migration real, executa a fixture e remove o container mesmo em falha. |
| `types/cartoes.ts` | Tipos da regra, previsão, decisão de vínculo e respostas RPC. |
| `services/cartoesService.ts` | Leitura em lote de regras/previsões e chamadas tipadas para as quatro RPCs públicas. |
| `components/cartoes/cartoesFaturasSelectors.ts` | Validação pura do formulário e sugestão determinística de previsão candidata; não confirma nada. |
| `components/cartoes/cartoesFaturasSelectors.test.ts` | Regressões dos contratos puros de UI e matching. |
| `components/cartoes/ImportarTransacaoFaturaForm.tsx` | Toggle “Repetir todo mês”, exclusão mútua com parcela e chamada da porta atômica. |
| `components/cartoes/FaturasCartaoPage.tsx` | Badge `PREVISÃO`, card de recorrências ativas, modais de editar/pausar/encerrar e decisão manual de vínculo. |

## Invariantes que cada tarefa deve preservar

1. A transação de extrato/manual é o único item que muda o valor oficial da fatura. Previsões nunca são inseridas em `financeiro_cartao_transacoes`.
2. Uma previsão é única por `(recorrencia_id, competencia)`; reabrir ou repetir a ação não duplica linhas.
3. Apenas `compra` pode originar recorrência; `is_parcela` e `is_recorrente` nunca são verdadeiros ao mesmo tempo.
4. Previsões em fatura `fechada`, `paga` ou `cancelada` não são criadas nem reescritas.
5. A sugestão é determinística e somente visual. Só a RPC de decisão pode marcar uma previsão como `confirmada` ou `dispensada`.
6. Toda escrita usa o resolvedor de ator, `security definer`, `search_path = public`, auditoria e revogação explícita de `PUBLIC`/`anon`.
7. O módulo é Financeiro: textos operacionais referem-se a **Rose**, nunca a Ana.

### Task 1: Fixar os contratos com testes vermelhos

**Files:**
- Create: `supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql` via `npx supabase migration new financeiro_cartao_recorrencias` (criar vazio; não aplicar ainda)
- Modify: `supabase/migrations/financeiro_cartoes_backend.test.mjs`
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`
- Modify: `components/cartoes/cartoesFaturasSelectors.ts`

- [ ] **Step 1: Criar o arquivo de migration pelo CLI e registrar o nome real no commit**

Run:

```powershell
npx supabase migration new financeiro_cartao_recorrencias
```

Expected: o CLI cria exatamente um arquivo novo em `supabase/migrations/` com o sufixo `financeiro_cartao_recorrencias.sql`. Antes de escrever SQL, renomear somente esse arquivo recém-gerado para `20260810_1_financeiro_cartao_recorrencias.sql`, seguindo a convenção de data e sufixo já usada neste repositório. Não usar `db push`, `apply_migration` ou SQL remoto nesta etapa.

- [ ] **Step 2: Escrever o teste estático da migration ainda vazia**

No topo de `financeiro_cartoes_backend.test.mjs`, ler a migration recém-gerada como `m18`. Adicionar este teste antes da implementação:

```js
test('M18 models recurring card purchases as forecasts outside financial transactions', () => {
  assert.match(m18, /create table if not exists public\.financeiro_cartao_recorrencias/i);
  assert.match(m18, /create table if not exists public\.financeiro_cartao_recorrencia_previsoes/i);
  assert.match(m18, /unique\s*\(recorrencia_id,\s*competencia\)/i);
  assert.match(m18, /status\s+text\s+not null default 'prevista'/i);
  assert.match(m18, /financeiro_cartao_recorrencia_criar\(payload jsonb, ator jsonb/i);
  assert.match(m18, /financeiro_cartao_recorrencia_previsao_decidir_vinculo\(payload jsonb, ator jsonb/i);
  assert.match(m18, /financeiro_cartao_recorrencias_gerar_previsoes\(p_fatura_id uuid, p_ator jsonb/i);
  assert.match(m18, /perform public\.financeiro_cartao_recorrencias_gerar_previsoes\(v_fatura\.id, v_actor\)/i);
  assert.match(m18, /where t\.fatura_id = p_fatura_id/i);
  assert.doesNotMatch(m18, /insert into public\.financeiro_cartao_transacoes[\s\S]*previs/i);
});
```

Também exigir RLS, `revoke all`, grants somente nas RPCs públicas e ausência de `CASCADE`:

```js
for (const table of ['financeiro_cartao_recorrencias', 'financeiro_cartao_recorrencia_previsoes']) {
  assert.match(m18, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(m18, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
}
assert.match(m18, /grant execute on function public\.financeiro_cartao_recorrencia_criar\(jsonb, jsonb\) to authenticated, service_role/i);
assert.doesNotMatch(m18, /cascade/i);
```

- [ ] **Step 3: Escrever os testes puros de formulário e matching**

Acrescentar em `cartoesFaturasSelectors.test.ts` casos que descrevem os dois contratos de UI:

```ts
assert.equal(
  validateTransacaoImportadaInput({
    descricao: 'Assinatura', data_compra: '2026-08-17', valor: 49.9,
    tipo_transacao: 'compra', is_parcela: true, is_recorrente: true,
  } as any),
  'Uma compra não pode ser parcelada e recorrente ao mesmo tempo.'
);

assert.equal(
  validateTransacaoImportadaInput({
    descricao: 'Tarifa', data_compra: '2026-08-17', valor: 49.9,
    tipo_transacao: 'tarifa', is_recorrente: true,
  } as any),
  'Recorrência está disponível somente para compras.'
);

assert.deepEqual(
  getPrevisaoCandidata(transacaoReal, [previsaoMesmoCartaoMesmoValor, previsaoOutroValor]),
  previsaoMesmoCartaoMesmoValor
);
assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoOutroCartao]), null);
```

O fixture local do teste deve usar o mesmo `fatura_id`, `cartao_id`, valor em centavos e descrições normalizadas (`OpenAI, Inc.` versus `openai inc`). Não aceitar aproximação de valor nesta primeira versão.

- [ ] **Step 4: Rodar RED e preservar a regressão existente**

Run:

```powershell
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs
```

Expected: falha porque a migration não contém schema/RPCs e os novos seletores ainda não existem. Os testes legados devem continuar executando; não remover nenhuma asserção de parcelas, fechamento ou classificação.

- [ ] **Step 5: Commit do contrato vermelho**

```powershell
git add supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql supabase/migrations/financeiro_cartoes_backend.test.mjs components/cartoes/cartoesFaturasSelectors.test.ts
git commit -m "test: definir contratos de recorrencia de cartao"
```

### Task 2: Criar o schema aditivo e as barreiras de acesso

**Files:**
- Modify: `supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql`
- Test: `supabase/migrations/financeiro_cartoes_backend.test.mjs`

- [ ] **Step 1: Criar as duas tabelas sem alterar `financeiro_cartao_transacoes`**

Escrever o schema abaixo no arquivo gerado. Os snapshots copiam os dados de classificação para exibição, mas não possuem gatilho de totalização e nunca são usados por `financeiro_cartao_fatura_fechar`.

```sql
create table if not exists public.financeiro_cartao_recorrencias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  transacao_origem_id uuid not null unique references public.financeiro_cartao_transacoes(id),
  data_inicio date not null,
  dia_base smallint not null check (dia_base between 1 and 31),
  descricao text not null check (btrim(descricao) <> ''),
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'encerrada')),
  pausada_em timestamptz null,
  encerrada_em timestamptz null,
  motivo_status text null,
  ator_tipo text null,
  ator_ref text null,
  created_by uuid null
);

create table if not exists public.financeiro_cartao_recorrencia_previsoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recorrencia_id uuid not null references public.financeiro_cartao_recorrencias(id),
  fatura_id uuid not null references public.financeiro_cartao_faturas(id),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  competencia date not null,
  data_compra date not null,
  descricao text not null,
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'prevista'
    check (status in ('prevista', 'confirmada', 'dispensada')),
  transacao_confirmada_id uuid null references public.financeiro_cartao_transacoes(id),
  decidida_em timestamptz null,
  decidida_por text null,
  motivo_decisao text null,
  unique (recorrencia_id, competencia)
);

create unique index if not exists financeiro_cartao_recorrencia_previsoes_transacao_uidx
  on public.financeiro_cartao_recorrencia_previsoes (transacao_confirmada_id)
  where transacao_confirmada_id is not null;
create index if not exists financeiro_cartao_recorrencias_cartao_status_idx
  on public.financeiro_cartao_recorrencias (cartao_id, status);
create index if not exists financeiro_cartao_recorrencia_previsoes_fatura_idx
  on public.financeiro_cartao_recorrencia_previsoes (fatura_id, status, data_compra);
```

- [ ] **Step 2: Aplicar os mesmos gatilhos de `updated_at`, RLS e leitura autorizada**

Criar os gatilhos `before update … public.set_updated_at()` nas duas tabelas. Habilitar RLS e criar somente política de leitura para `authenticated`; revogar DML direto e conceder `select` a `authenticated, service_role`:

```sql
alter table public.financeiro_cartao_recorrencias enable row level security;
alter table public.financeiro_cartao_recorrencia_previsoes enable row level security;

create policy financeiro_cartao_recorrencias_select_authenticated
  on public.financeiro_cartao_recorrencias for select to authenticated using (true);
create policy financeiro_cartao_recorrencia_previsoes_select_authenticated
  on public.financeiro_cartao_recorrencia_previsoes for select to authenticated using (true);

revoke all on public.financeiro_cartao_recorrencias from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on public.financeiro_cartao_recorrencia_previsoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_recorrencias to authenticated, service_role;
grant select on public.financeiro_cartao_recorrencia_previsoes to authenticated, service_role;
```

Criar políticas com `drop policy if exists` antes de cada `create policy` para a migration continuar reaplicável em banco local. Não dar `insert`, `update` nem `delete` ao browser.

- [ ] **Step 3: Rodar o teste estático até GREEN**

Run:

```powershell
node --test supabase/migrations/financeiro_cartoes_backend.test.mjs
```

Expected: PASS incluindo schema, constraints, RLS, grants e ausência de previsão na tabela financeira original.

- [ ] **Step 4: Commit do modelo de dados**

```powershell
git add supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql supabase/migrations/financeiro_cartoes_backend.test.mjs
git commit -m "feat: criar modelo de recorrencias de cartao"
```

### Task 3: Implementar RPCs atômicas, geração e decisão humana

**Files:**
- Modify: `supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql`
- Modify: `supabase/migrations/financeiro_cartoes_backend.test.mjs`

- [ ] **Step 1: Implementar o helper interno de geração idempotente**

Criar `public.financeiro_cartao_recorrencias_gerar_previsoes(p_fatura_id uuid, p_ator jsonb) returns integer` como `security definer` e **sem grant a `authenticated`**. Ela deve:

1. carregar e bloquear a fatura; retornar `0` se não estiver `aberta`;
2. iterar somente regras `ativa` do mesmo cartão;
3. calcular o dia da cobrança com `financeiro_cartao_clamp_dia`, procurando os meses `competencia - 1`, `competencia` e `competencia + 1` e escolhendo exclusivamente a data cujo `financeiro_cartao_ciclo(cartao_id, data).competencia` seja a competência da fatura;
4. ignorar ocorrência anterior a `data_inicio`;
5. inserir o snapshot com `on conflict (recorrencia_id, competencia) do nothing`;
6. auditar somente quando a inserção ocorrer.

O núcleo da inserção deve ter esta forma; ela prova que uma previsão não passa pela tabela de transações:

```sql
insert into public.financeiro_cartao_recorrencia_previsoes (
  recorrencia_id, fatura_id, cartao_id, competencia, data_compra,
  descricao, estabelecimento, valor, empresa_id, plano_conta_id,
  centro_custo_id, classificacao_status
)
values (
  v_recorrencia.id, v_fatura.id, v_fatura.cartao_id, v_fatura.competencia, v_data_ocorrencia,
  v_recorrencia.descricao, v_recorrencia.estabelecimento, v_recorrencia.valor,
  v_recorrencia.empresa_id, v_recorrencia.plano_conta_id,
  v_recorrencia.centro_custo_id, v_recorrencia.classificacao_status
)
on conflict (recorrencia_id, competencia) do nothing
returning * into v_previsao;
```

- [ ] **Step 2: Recriar somente `financeiro_cartao_fatura_abrir` para chamar o helper**

Copiar o corpo vigente de `20260630_12_financeiro_cartao_fatura_abrir.sql` para uma nova definição `create or replace`, preservando todos os cálculos, actor resolution, `on conflict`, retorno e grants. Depois de resolver `v_fatura`, inserir somente:

```sql
perform public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura.id, v_actor);
```

Colocar a chamada antes do `return`, para fatura recém-criada e fatura já existente. Não modificar `financeiro_cartao_faturas_recalcula_valor`, `financeiro_cartao_fatura_fechar` ou qualquer consulta DRE: como previsões estão em outra tabela, os somatórios existentes permanecem corretos.

- [ ] **Step 3: Implementar a porta atômica de criação**

Criar `financeiro_cartao_recorrencia_criar(payload jsonb, ator jsonb default '{}'::jsonb) returns jsonb`. Validar:

```sql
v_tipo = 'compra';
v_is_parcela is not true;
v_fatura.status = 'aberta';
v_descricao is not null;
v_valor > 0;
v_client_token is not null;
```

Ela chama `financeiro_cartao_transacao_registrar` para a compra real da fatura atual, usando o `id_externo` do formulário. Em seguida, cria uma única regra com `transacao_origem_id` igual ao id retornado. Para disponibilizar a próxima previsão imediatamente, calcular `v_proxima_data := (v_data_compra + interval '1 month')::date`, chamar `financeiro_cartao_fatura_abrir` para essa data e deixar o hook gerar a previsão. Retornar:

```sql
jsonb_build_object(
  'success', true,
  'transacao_id', v_transacao_id,
  'recorrencia_id', v_recorrencia.id,
  'previsao_id', v_previsao_id,
  'idempotent', v_idempotent
)
```

A criação de transação, regra, fatura seguinte e previsão ocorre na mesma chamada SQL; se qualquer validação posterior falhar, a transação toda reverte. Ao receber `id_externo` já existente, buscar a regra por `transacao_origem_id` e retornar a mesma recorrência, nunca criar segunda.

- [ ] **Step 4: Implementar manutenção da regra sem reescrever histórico**

Criar `financeiro_cartao_recorrencia_atualizar(payload, ator)` e `financeiro_cartao_recorrencia_alterar_status(payload, ator)`. A atualização aceita descrição, estabelecimento, valor, dia base e classificação opcional; exige a mesma tríade para `classificacao_status = 'confirmada'`. Atualizar apenas a regra e snapshots com:

```sql
where recorrencia_id = v_recorrencia.id
  and status = 'prevista'
  and fatura_id in (
    select id from public.financeiro_cartao_faturas
     where cartao_id = v_recorrencia.cartao_id
       and status = 'aberta'
       and competencia >= v_competencia_efetiva
  )
```

`v_competencia_efetiva` é obrigatória no payload e a UI a envia como a competência da próxima previsão `prevista`. Se o novo `dia_base` passaria a pertencer a outra competência pelo ciclo do cartão, não mover a previsão já criada: manter o snapshot, atualizar a regra e gerar o novo dia somente em competências ainda inexistentes. Pausar e encerrar não apagam regra, previsão, transação ou auditoria; apenas bloqueiam novas gerações. Permitir retomar somente uma regra `pausada`, nunca uma `encerrada`.

- [ ] **Step 5: Implementar a decisão explícita da previsão candidata**

Criar `financeiro_cartao_recorrencia_previsao_decidir_vinculo(payload, ator)`. Carregar previsão e transação `for update`, validar mesmo cartão e mesma fatura e exigir previsão `prevista`. Os únicos valores de `payload->>'decisao'` são `confirmar` e `manter_separadas`:

```sql
if v_decisao = 'confirmar' then
  update public.financeiro_cartao_recorrencia_previsoes
     set status = 'confirmada', transacao_confirmada_id = v_transacao.id,
         decidida_em = now(), decidida_por = v_actor->>'ator_tipo',
         motivo_decisao = nullif(payload->>'motivo', '')
   where id = v_previsao.id;
else
  update public.financeiro_cartao_recorrencia_previsoes
     set status = 'dispensada', decidida_em = now(),
         decidida_por = v_actor->>'ator_tipo',
         motivo_decisao = coalesce(nullif(payload->>'motivo', ''), 'Mantidas separadas por decisão operacional.')
   where id = v_previsao.id;
end if;
```

Não atualizar `valor`, `classificacao_status`, `fatura_id` nem qualquer coluna da transação real. Registrar `antes` e `depois` em `financeiro_cartoes_audit_insert` para criação, edição, mudança de status e decisão.

- [ ] **Step 6: Aplicar privilégios exatos e ampliar os testes estáticos**

No fim da migration, revogar `public`, `anon`, `maria_operacional`, `maria_leitura` de todas as novas funções e conceder `authenticated, service_role` apenas para:

```sql
financeiro_cartao_recorrencia_criar(jsonb, jsonb)
financeiro_cartao_recorrencia_atualizar(jsonb, jsonb)
financeiro_cartao_recorrencia_alterar_status(jsonb, jsonb)
financeiro_cartao_recorrencia_previsao_decidir_vinculo(jsonb, jsonb)
```

O helper gerador deve permanecer sem grant público. Estender `financeiro_cartoes_backend.test.mjs` para exigir o bloqueio de `paga/cancelada`, `for update`, os dois resultados de decisão e o somatório de `financeiro_cartao_fatura_fechar` exclusivamente em `financeiro_cartao_transacoes`.

- [ ] **Step 7: Rodar os testes da migration**

Run:

```powershell
node --test supabase/migrations/financeiro_cartoes_backend.test.mjs
```

Expected: PASS. Uma mudança que faça previsão ir para `financeiro_cartao_transacoes`, dê execução do helper ao browser ou use `CASCADE` deve falhar.

- [ ] **Step 8: Commit das portas de banco**

```powershell
git add supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql supabase/migrations/financeiro_cartoes_backend.test.mjs
git commit -m "feat: adicionar RPCs de recorrencia de cartao"
```

### Task 4: Provar o comportamento em PostgreSQL descartável

**Files:**
- Create: `supabase/tests/financeiro_cartao_recorrencias_fixture.sql`
- Create: `supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs`
- Test: `supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql`

- [ ] **Step 1: Criar a fixture com guarda local/CI e rollback obrigatório**

O SQL deve começar e terminar assim:

```sql
\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_setting('app.cartao_recorrencia_fixture_guard', true) is distinct from 'local_ci_only' then
    raise exception 'REFUSED: app.cartao_recorrencia_fixture_guard=local_ci_only e obrigatorio.';
  end if;
  if current_database() is distinct from 'financeiro_cartao_recorrencias_fixture' then
    raise exception 'REFUSED: fixture nao pode rodar no banco %.', current_database();
  end if;
end;
$$;

-- cenários e asserções
rollback;
```

Inserir um cartão fixture, uma fatura aberta de agosto, uma fatura aberta de setembro e uma fatura fechada. Usar UUIDs sentinela que começam por `00000000-0000-0000-0000-00000000ca`.

- [ ] **Step 2: Cobrir criação, total financeiro e idempotência real**

Na fixture, chamar duas vezes a RPC de criação com o mesmo `client_token` e provar:

```sql
select count(*) = 1 as uma_regra
from public.financeiro_cartao_recorrencias
where transacao_origem_id = v_transacao_origem;

select count(*) = 1 as uma_previsao
from public.financeiro_cartao_recorrencia_previsoes
where recorrencia_id = v_recorrencia and competencia = date '2026-09-01';

select f.valor_total = 49.90 as total_so_real
from public.financeiro_cartao_faturas f
where f.id = v_fatura_agosto;
```

Executar também `financeiro_cartao_fatura_fechar(v_fatura_agosto, '{}')` e afirmar que `contas_pagar.valor` é `49.90`, não `99.80`.

- [ ] **Step 3: Cobrir pausa, encerramento, edição e decisão humana**

Criar previsões para outubro e novembro em faturas abertas. Pausar antes de abrir dezembro e provar ausência de dezembro; retomar e abrir dezembro para provar uma linha única. Encerrar e provar que janeiro não recebe linha. Editar uma regra ativa com `competencia_efetiva = date '2026-11-01'` e provar que outubro preserva o snapshot enquanto novembro aberto recebe o novo valor/classificação. Inserir uma transação de extrato de novembro e verificar, em duas chamadas distintas:

```sql
-- manter separadas: as duas linhas continuam existentes; previsão muda só para dispensada
select status = 'dispensada' from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_nov;

-- confirmar: a previsão aponta para a transação real, sem mudar valor da fatura
select status = 'confirmada' and transacao_confirmada_id = v_transacao_real
from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_dez;
```

Tentar gerar previsão em fatura fechada e inserir uma segunda previsão da mesma regra/competência; cada tentativa deve falhar ou resultar em contagem `1` conforme o contrato.

- [ ] **Step 4: Criar o runner PostgreSQL 17 que sempre limpa o container**

Basear o runner em `supabase/tests/run_dre_filtro_unidade_fixture.mjs`: usar `postgres:17.10-alpine`, nome contendo `financeiro-cartao-recorrencias-${process.pid}`, `try/finally`, handlers de `SIGINT`/`SIGTERM`, `--rm`, verificação de versão `^17\.` e falha fechada se o Docker não estiver disponível.

O `setupSql` precisa criar somente dependências mínimas: papéis Supabase, `auth.uid()` de teste, `set_updated_at`, `financeiro_cartoes_resolve_ator`, `financeiro_cartoes_audit_insert`, cartão/fatura/transação/conta a pagar e o helper de ciclo. Aplicar a migration real pelo conteúdo do arquivo, nunca uma cópia parcial. Depois da fixture, consultar as sentinelas em uma nova conexão e exigir `0`, comprovando o rollback.

- [ ] **Step 5: Executar a fixture comportamental**

Run:

```powershell
node supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs
```

Expected: `PASS: PostgreSQL 17` e `rollback_sentinel_rows=0`. Não apontar este runner para o projeto Supabase remoto e não criar dados de teste em produção.

- [ ] **Step 6: Commit da prova comportamental**

```powershell
git add supabase/tests/financeiro_cartao_recorrencias_fixture.sql supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs
git commit -m "test: validar recorrencias de cartao em postgres"
```

### Task 5: Propagar contratos ao TypeScript, serviço e seletores

**Files:**
- Modify: `types/cartoes.ts`
- Modify: `services/cartoesService.ts`
- Modify: `components/cartoes/cartoesFaturasSelectors.ts`
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`

- [ ] **Step 1: Declarar os tipos de domínio sem misturar previsão com transação**

Adicionar em `types/cartoes.ts`:

```ts
export type CartaoRecorrenciaStatus = 'ativa' | 'pausada' | 'encerrada';
export type CartaoRecorrenciaPrevisaoStatus = 'prevista' | 'confirmada' | 'dispensada';

export interface FinanceiroCartaoRecorrencia {
  id: string;
  cartao_id: string;
  transacao_origem_id: string;
  data_inicio: string;
  dia_base: number;
  descricao: string;
  estabelecimento: string | null;
  valor: number;
  empresa_id: string | null;
  plano_conta_id: string | null;
  centro_custo_id: string | null;
  classificacao_status: CartaoClassificacaoStatus | string;
  status: CartaoRecorrenciaStatus;
  motivo_status: string | null;
}

export interface FinanceiroCartaoRecorrenciaPrevisao {
  id: string;
  recorrencia_id: string;
  fatura_id: string;
  cartao_id: string;
  competencia: string;
  data_compra: string;
  descricao: string;
  estabelecimento: string | null;
  valor: number;
  status: CartaoRecorrenciaPrevisaoStatus;
  transacao_confirmada_id: string | null;
}
```

Estender `CartoesFaturasData` com `recorrencias` e `previsoes`; não acrescentar campos de previsão a `FinanceiroCartaoTransacao`.

- [ ] **Step 2: Criar a leitura em lote e os métodos de escrita do serviço**

Em `services/cartoesService.ts`, acrescentar `RECORRENCIA_SELECT` e `PREVISAO_SELECT`, recuperar regras pelo conjunto de cartões e previsões pelo conjunto de faturas, sem N+1. Criar funções que chamam somente RPCs:

```ts
export async function registrarTransacaoRecorrente(payload: FinanceiroCartaoRecorrenciaCriarPayload) {
  return callCartaoRpc('financeiro_cartao_recorrencia_criar', payload);
}
export async function atualizarRecorrenciaCartao(payload: FinanceiroCartaoRecorrenciaAtualizarPayload) {
  return callCartaoRpc('financeiro_cartao_recorrencia_atualizar', payload);
}
export async function alterarStatusRecorrenciaCartao(payload: FinanceiroCartaoRecorrenciaStatusPayload) {
  return callCartaoRpc('financeiro_cartao_recorrencia_alterar_status', payload);
}
export async function decidirVinculoPrevisaoCartao(payload: FinanceiroCartaoRecorrenciaDecisaoPayload) {
  return callCartaoRpc('financeiro_cartao_recorrencia_previsao_decidir_vinculo', payload);
}
```

`callCartaoRpc` é um helper privado que usa `supabase.rpc(nome, { payload, ator: {} })` e o mesmo `friendlyRpcError`; não inserir ou atualizar tabelas diretamente no cliente.

- [ ] **Step 3: Tornar a validação do formulário explícita e o matching somente sugestivo**

Adicionar `is_recorrente?: boolean` a `TransacaoImportadaInput`. Fazer `validateTransacaoImportadaInput` retornar, nesta ordem, os erros para tipo não compra e conflito com parcela. Criar:

```ts
export function normalizeRecorrenciaMatch(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getPrevisaoCandidata(
  transacao: Pick<FinanceiroCartaoTransacao, 'fatura_id' | 'cartao_id' | 'valor' | 'descricao' | 'estabelecimento'>,
  previsoes: FinanceiroCartaoRecorrenciaPrevisao[]
) {
  const needle = normalizeRecorrenciaMatch(transacao.estabelecimento || transacao.descricao);
  return previsoes.find((previsao) =>
    previsao.status === 'prevista' &&
    previsao.fatura_id === transacao.fatura_id &&
    previsao.cartao_id === transacao.cartao_id &&
    Math.round(Number(previsao.valor) * 100) === Math.round(Math.abs(Number(transacao.valor)) * 100) &&
    normalizeRecorrenciaMatch(previsao.estabelecimento || previsao.descricao) === needle
  ) || null;
}
```

Não chamar RPC, não guardar decisão e não sugerir quando valor, cartão, fatura ou texto normalizado divergirem.

- [ ] **Step 4: Rodar os contratos TypeScript**

Run:

```powershell
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts
npm run typecheck
```

Expected: PASS, inclusive com `CartoesFaturasData` contendo os dois novos arrays.

- [ ] **Step 5: Commit do contrato cliente**

```powershell
git add types/cartoes.ts services/cartoesService.ts components/cartoes/cartoesFaturasSelectors.ts components/cartoes/cartoesFaturasSelectors.test.ts
git commit -m "feat: consumir recorrencias nas faturas de cartao"
```

### Task 6: Adicionar o toggle no lançamento manual atual

**Files:**
- Modify: `components/cartoes/ImportarTransacaoFaturaForm.tsx`
- Test: `components/cartoes/cartoesFaturasSelectors.test.ts`

- [ ] **Step 1: Estender o estado e controlar a exclusão mútua**

Adicionar `is_recorrente: false` ao `ImportFormState` e ao estado inicial. No select de tipo, ao deixar de ser `compra`, limpar as duas flags. No toggle de parcela, ao ativar parcela, limpar recorrência. No novo toggle de recorrência, ao ativar, limpar parcela:

```tsx
onCheckedChange={(next) => setForm((current) => ({
  ...current,
  is_recorrente: next,
  is_parcela: next ? false : current.is_parcela,
}))}
```

Renderizar o toggle somente quando `form.tipo_transacao === 'compra'`, com texto: “Repetir todo mês” e explicação “Registra esta compra normalmente e cria uma previsão para a próxima fatura. A previsão não altera o total até o extrato ser confirmado.” Usar `Card`, `ToggleSwitch`, `Badge`, `bg-*`, `text-*` e `border-*` existentes; não criar cores nem componente novo.

- [ ] **Step 2: Exibir a data-base e reutilizar a classificação atual**

Com recorrência ativada, mostrar `DatePicker` “Data-base da cobrança” preenchido por `data_compra` e a linha “A classificação escolhida será copiada apenas para previsões futuras.” O campo é obrigatório e envia `dia_base` derivado de `data_compra`. A classificação atual continua registrando a transação real como pendente ou confirmada pelos fluxos já existentes.

- [ ] **Step 3: Ramificar somente a chamada de gravação**

No `submit`, construir o payload atual de `buildTransacaoImportadaPayload`. Quando `is_recorrente` for falso, manter `registrarTransacaoImportada(payload)` sem alterações. Quando for verdadeiro, chamar `registrarTransacaoRecorrente` com o mesmo payload e:

```ts
recorrencia: {
  data_inicio: form.data_compra,
  dia_base: Number(form.data_compra.slice(-2)),
  descricao: form.descricao.trim(),
  estabelecimento: form.estabelecimento.trim() || null,
  valor: Math.abs(Number(valor)),
  empresa_id: payload.empresa_id || null,
  centro_custo_id: payload.centro_custo_id || null,
  plano_conta_id: payload.plano_conta_id || null,
  classificacao_status: payload.classificacao_status || 'pendente',
}
```

No sucesso, exibir “Compra adicionada e recorrência prevista para a próxima fatura.” e executar o mesmo `onSuccess`/reload. O botão conserva a ação normal para as demais transações.

- [ ] **Step 4: Validar visualmente os dois estados**

Run:

```powershell
npm run typecheck
npm run build
```

No navegador, abrir uma fatura aberta e verificar desktop e mobile: compra comum; compra parcelada; compra recorrente; `tarifa`; `estorno`. Confirmar que o toggle não aparece nos três últimos e que ativar um modo desativa o outro.

- [ ] **Step 5: Commit do formulário**

```powershell
git add components/cartoes/ImportarTransacaoFaturaForm.tsx
git commit -m "feat: permitir compra recorrente na fatura"
```

### Task 7: Exibir previsões, controlar regras e pedir confirmação humana

**Files:**
- Modify: `components/cartoes/FaturasCartaoPage.tsx`
- Modify: `components/cartoes/cartoesFaturasSelectors.ts`
- Modify: `types/cartoes.ts`
- Modify: `services/cartoesService.ts`

- [ ] **Step 1: Manter os cálculos financeiros atuais restritos a transações**

Em `FaturasCartaoPage.tsx`, carregar `recorrencias` e `previsoes` junto do retorno do serviço, mas manter estas duas expressões usando exclusivamente `transacoes`:

```ts
const enrichedFaturas = useMemo(() => attachClassificacaoResumo(faturas, transacoes), [faturas, transacoes]);
const transacoesSelecionadas = useMemo(
  () => (selectedFatura ? getTransacoesDaFatura(transacoes, selectedFatura.id) : []),
  [selectedFatura, transacoes]
);
```

Não incluir previsão em `attachClassificacaoResumo`, em `getFaturaPendenciasClassificacao`, no aviso de DRE incompleto ou no card de valor total.

- [ ] **Step 2: Renderizar previsões como itens visuais separados**

Criar `PrevisaoRow` no mesmo arquivo, recebendo `FinanceiroCartaoRecorrenciaPrevisao`. Mostrar `Badge variant="purple">PREVISÃO</Badge>`, descrição, estabelecimento/data, valor e estado. Para `prevista`, usar uma frase curta: “Aguardando confirmação do extrato; não compõe o total da fatura.” Para `confirmada`, mostrar a transação vinculada; para `dispensada`, “Mantida separada por Rose”. Não renderizar botões de classificação fiscal, editar transação ou excluir nessa linha.

Ordenar uma lista de exibição por data, com transações reais antes de previsão na mesma data. A lista visual pode ser uma união local, mas os valores e contadores continuam nas coleções separadas.

- [ ] **Step 3: Mostrar o card compacto `Recorrências ativas`**

Filtrar as regras ativas de `selectedFatura.cartao_id`. Para cada uma, achar a primeira previsão `prevista` da regra e mostrar descrição, valor, próxima competência e botões `Editar`, `Pausar`, `Encerrar`. `Editar` abre um `Modal` com os mesmos campos de template e competência efetiva preenchida pela próxima previsão. `Pausar`/`Encerrar` usam `ConfirmDialog` e exigem motivo opcional. Nunca usar `window.confirm`.

Após qualquer sucesso, chamar `load()` e manter a fatura selecionada; uma falha deve preservar o estado atual e aparecer via toast.

- [ ] **Step 4: Exibir e decidir uma sugestão, sem automação**

Para cada `TransacaoRow`, calcular `const previsaoCandidata = getPrevisaoCandidata(transacao, previsoesDaFatura)`. Quando existir, mostrar botão secundário “Há uma previsão parecida”. Ao clicar, abrir `ConfirmDialog` que mostre transação e previsão lado a lado e ofereça exatamente:

```tsx
<Button variant="primary">Confirmar como mesma cobrança</Button>
<Button variant="outline">Manter separadas</Button>
```

Cada botão chama `decidirVinculoPrevisaoCartao({ previsao_id, transacao_id, decisao: 'confirmar' | 'manter_separadas' })`; nenhum render, import ou `load()` pode chamar essa RPC implicitamente. Após a decisão, recarregar os dados e mostrar toast coerente.

- [ ] **Step 5: Rodar regressões e smoke de interface**

Run:

```powershell
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts
npm run typecheck
npm run build
```

No preview, confirmar: badge de previsão; total inalterado; card ativo; editar; pausar; encerrar; sugestão; duas escolhas. Em light/dark e desktop/mobile, confirmar contraste por tokens semânticos e nenhum texto “Ana” no Financeiro.

- [ ] **Step 6: Commit da interface de operação**

```powershell
git add components/cartoes/FaturasCartaoPage.tsx components/cartoes/cartoesFaturasSelectors.ts types/cartoes.ts services/cartoesService.ts
git commit -m "feat: gerir previsoes recorrentes de cartao"
```

### Task 8: Aplicar com segurança, validar e publicar

**Files:**
- Verify: todos os arquivos modificados nesta planilha
- Reference: `Docs/superpowers/specs/2026-08-10-cartoes-recorrencias-design.md`

- [ ] **Step 1: Fazer a checagem pré-publicação**

Run:

```powershell
git pull --ff-only origin main
git status --short
npx supabase --version
npx supabase migration list --local
npm run typecheck
npm run build
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs
node supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs
git diff --check
```

Expected: árvore limpa antes da aplicação; migration nova aparece localmente; todos os comandos passam. Se a primeira linha trouxer commits remotos, rebasear/revisar antes de prosseguir; não aplicar migration contra um `HEAD` desatualizado.

- [ ] **Step 2: Revisar segurança antes de tocar no Supabase remoto**

Confirmar manualmente na migration: RLS ligado nas duas tabelas; nenhum DML direto de `authenticated`; `PUBLIC` e `anon` revogados das funções `security definer`; helper de geração sem grant público; todas as quatro RPCs públicas chamam `financeiro_cartoes_resolve_ator`; sem `CASCADE`; nenhuma alteração em `contas_pagar`, DRE ou nas tabelas de folha.

Executar o advisor disponível no CLI e tratar qualquer finding novo antes de aplicar:

```powershell
npx supabase db advisors --help
npx supabase db advisors
```

- [ ] **Step 3: Aplicar uma única migration e verificar somente leitura**

Depois de confirmar que o projeto linkado é `ubdvtjbitozhkuvvqkxj`, aplicar a migration pelo caminho oficialmente configurado no repositório. Em seguida, executar somente consultas de verificação:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('financeiro_cartao_recorrencias', 'financeiro_cartao_recorrencia_previsoes');

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name like 'financeiro_cartao_recorrencia%'
order by routine_name;
```

Esperado: ambas as tabelas têm RLS e as quatro portas públicas existem. Não criar registros sintéticos no banco produtivo como “teste”.

- [ ] **Step 4: Fazer o E2E operacional somente com autorização de Rose**

Antes de gravar uma compra real, Rose deve indicar uma assinatura existente, cartão e próxima cobrança que possa virar a primeira regra. Com esse dado real e consentimento explícito, executar no browser:

1. abrir a fatura aberta correta e registrar a compra marcando “Repetir todo mês”;
2. conferir compra real no total e `PREVISÃO` apenas na fatura seguinte;
3. recarregar e repetir a abertura da fatura, provando que não há segunda previsão;
4. editar uma regra, pausar, retomar e encerrar conforme os critérios; não usar dados fictícios;
5. ao chegar um extrato real correspondente, testar “Confirmar como mesma cobrança”; para uma divergência real, testar “Manter separadas”.

Enquanto não houver assinatura real autorizada, a fixture PostgreSQL é a prova comportamental e o ambiente produtivo fica apenas em smoke de leitura/UI.

- [ ] **Step 5: Commit, push em `main` e acompanhar o deploy**

```powershell
git status --short
git add supabase/migrations/20260810_1_financeiro_cartao_recorrencias.sql supabase/migrations/financeiro_cartoes_backend.test.mjs supabase/tests/financeiro_cartao_recorrencias_fixture.sql supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs types/cartoes.ts services/cartoesService.ts components/cartoes/cartoesFaturasSelectors.ts components/cartoes/cartoesFaturasSelectors.test.ts components/cartoes/ImportarTransacaoFaturaForm.tsx components/cartoes/FaturasCartaoPage.tsx
git commit -m "feat: adicionar compras recorrentes de cartao"
git push origin main
```

Confirmar o commit remoto e o deploy automático associado a `main`. Se a plataforma de deploy estiver limitada, informar a limitação como tal; não declarar a funcionalidade em produção até o build de produção estar concluído e a URL publicada responder com a versão nova.
