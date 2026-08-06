# Memória operacional de variações de Contas a Pagar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário explique uma variação de Contas a Pagar no próprio alerta, reutilizar notas humanas como contexto da IA e oferecer rascunhos editáveis sem alterar os números determinísticos.

**Architecture:** O comparador determinístico continuará produzindo identidade, valores e percentuais. Uma tabela já existente (`contas_anomalia_notas`) será ampliada apenas para guardar identidade recorrente e status operacional; uma camada de serviço React fará leitura/upsert explícitos. As duas Edge Functions incorporarão notas específicas e gerais no hash/prompt e devolverão `sugestao_justificativa` transitória; um componente de alerta reutilizável renderizará a matemática, nota, status e rascunho.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase/Postgres migrations and RLS, Supabase Edge Functions/Deno, Gemini via `callGeminiWithFallback`, Node `node:test`, Playwright.

---

## Mapa de arquivos

| Arquivo | Responsabilidade no plano |
| --- | --- |
| `shared/contasVariationMemory.ts` | Tipos, chaves estáveis, normalização de status e limites de texto sem dependência de browser/Deno. |
| `shared/contasVariationMemory.test.ts` | Testes puros de identidade, compatibilidade e rascunho. |
| `services/contasAnomaliaMemory.ts` | Leitura/upsert autenticado de notas específicas para o frontend. |
| `services/contasAnomaliaMemory.test.ts` | Testes de contrato do serviço com mock do cliente Supabase. |
| `supabase/migrations/20260806_contas_anomalia_memoria_operacional.sql` | Colunas de identidade recorrente, status compatível, índices e RLS sem apagar dados. |
| `supabase/functions/ai-contas-comparativo/index.ts` | Chaves recorrentes, consulta de notas, hash, prompt, fallback e `sugestao_justificativa`. |
| `supabase/functions/ai-contas-auditoria/index.ts` | Mesma memória específica no caminho de auditoria e saída de rascunho para anomalias. |
| `components/contas/ContasVariationAlertCard.tsx` | Cartão inline reutilizável para matemática, texto livre, status e rascunho editável. |
| `components/contas/ContasVariationAlertCard.test.ts` | Renderização e interação básica do cartão em Vite SSR/browser harness. |
| `components/contas/ContasPagarPage.tsx` | Integração do cartão nos alertas do dashboard/comparativo e manutenção do modal de auditoria usando o serviço novo. |
| `package.json` | Scripts explícitos dos testes de memória. |
| `Docs/superpowers/specs/2026-08-06-contas-pagar-variacoes-memoria-design.md` | Decisões já aprovadas; não alterar sem nova revisão. |

## Regras de implementação que não podem mudar

- Valores `prev`, `curr`, `diff`, `perc`, competência, unidade e status `NOVO`/`SAIU`/`RECORRENTE` continuam vindos do cálculo determinístico.
- A nota humana só entra na memória após clique explícito em salvar. Um rascunho da IA nunca é salvo automaticamente.
- Uma nota recorrente só acompanha a ocorrência pelo `recorrente_modelo_id` + unidade + plano; descrição alterada sozinha não autoriza reaproveitamento.
- Uma ocorrência sem correspondência inequívoca fica sem nota anterior; não usar similaridade fuzzy.
- Gemini indisponível retorna o cálculo e a UI manual normalmente, sem rascunho.
- O status é operacional: `pendente`, `justificada`, `corrigir_lancamento` ou `monitorar`; `verificado` permanece legível como legado e é mostrado como `Justificada`.
- Texto humano tem limite de 2.000 caracteres; rascunho de IA, 600 caracteres.
- Nenhuma migration desta fase apaga cache, nota, lançamento ou histórico existente.

### Task 1: Fixar o contrato puro de identidade, status e limites

**Files:**
- Create: `shared/contasVariationMemory.ts`
- Test: `shared/contasVariationMemory.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Escrever os testes que falham para as regras puras**

Criar `shared/contasVariationMemory.test.ts` com `node:test` e cobrir os casos abaixo:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_HUMAN_NOTE_LENGTH,
  MAX_AI_DRAFT_LENGTH,
  buildVariationKey,
  normalizeMemoryStatus,
  truncateAiDraft,
  chooseMatchingNote,
} from './contasVariationMemory.ts';

test('usa o modelo recorrente como identidade estável', () => {
  assert.equal(
    buildVariationKey({ unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: 'modelo-1', descricao: 'Energia janeiro' }),
    'cg|plano-1|modelo:modelo-1',
  );
  assert.equal(
    buildVariationKey({ unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: null, descricao: ' Conta de Luz  ÁGUA ' }),
    'cg|plano-1|desc:conta de luz agua',
  );
});

test('não herda nota por descrição quando identidade recorrente não bate', () => {
  const note = { anomaly_key: 'cg|plano-1|modelo:modelo-antigo', unidade: 'cg', plano_conta_id: 'plano-1', recorrente_modelo_id: 'modelo-antigo', conta_id: null, nota: 'reajuste', status: 'justificada' as const };
  assert.equal(chooseMatchingNote([note], { anomalyKey: 'cg|plano-1|desc:energia', unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: 'modelo-novo', contaId: null }), null);
});

test('status legado vira justificada sem invalidar o valor armazenado', () => {
  assert.equal(normalizeMemoryStatus('verificado'), 'justificada');
  assert.equal(normalizeMemoryStatus('corrigir_lancamento'), 'corrigir_lancamento');
  assert.equal(normalizeMemoryStatus(null), null);
});

test('limites protegem nota humana e rascunho da IA', () => {
  assert.equal('x'.repeat(MAX_HUMAN_NOTE_LENGTH + 1).length, 2001);
  assert.equal(truncateAiDraft('x'.repeat(MAX_AI_DRAFT_LENGTH + 20)).length, MAX_AI_DRAFT_LENGTH);
  assert.equal(truncateAiDraft('   '), null);
});
```

- [ ] **Step 2: Rodar somente os testes para confirmar a falha**

Run: `node --test --experimental-strip-types shared/contasVariationMemory.test.ts`
Expected: FAIL porque `shared/contasVariationMemory.ts` ainda não existe.

- [ ] **Step 3: Implementar o módulo puro mínimo**

Criar `shared/contasVariationMemory.ts` sem importar React, Supabase ou APIs de Deno:

```ts
export const MAX_HUMAN_NOTE_LENGTH = 2_000;
export const MAX_AI_DRAFT_LENGTH = 600;

export type MemoryStatus = 'pendente' | 'justificada' | 'corrigir_lancamento' | 'monitorar';
export type StoredMemoryStatus = MemoryStatus | 'verificado' | null;

export type VariationIdentityInput = {
  unidade: string | null | undefined;
  planoContaId: string | null | undefined;
  recorrenteModeloId: string | null | undefined;
  descricao: string | null | undefined;
};

export type VariationIdentity = VariationIdentityInput & {
  anomalyKey: string;
  contaId: string | null;
};

export type MemoryNoteLike = {
  anomaly_key: string;
  unidade: string;
  plano_conta_id?: string | null;
  recorrente_modelo_id?: string | null;
  conta_id?: string | null;
  nota: string;
  status: StoredMemoryStatus;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function buildVariationKey(input: VariationIdentityInput): string {
  const unidade = input.unidade || 'todas';
  const plano = input.planoContaId || 'sem_plano';
  const recorrente = input.recorrenteModeloId;
  return `${unidade}|${plano}|${recorrente ? `modelo:${recorrente}` : `desc:${normalizeText(input.descricao)}`}`;
}

export function normalizeMemoryStatus(status: StoredMemoryStatus | string | undefined): MemoryStatus | null {
  if (status === 'verificado') return 'justificada';
  if (status === 'pendente' || status === 'justificada' || status === 'corrigir_lancamento' || status === 'monitorar') return status;
  return null;
}

export function truncateAiDraft(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= MAX_AI_DRAFT_LENGTH) return text;
  return `${text.slice(0, MAX_AI_DRAFT_LENGTH - 1).trimEnd()}…`;
}

export function chooseMatchingNote(notes: MemoryNoteLike[], identity: VariationIdentity): MemoryNoteLike | null {
  const exact = notes.find((note) => note.anomaly_key === identity.anomalyKey && note.unidade === (identity.unidade || 'todas'));
  if (exact) return exact;
  if (!identity.recorrenteModeloId) return null;
  return notes.find((note) =>
    note.unidade === (identity.unidade || 'todas') &&
    note.recorrente_modelo_id === identity.recorrenteModeloId &&
    note.plano_conta_id === (identity.planoContaId || null)
  ) || null;
}
```

- [ ] **Step 4: Adicionar comando de teste e confirmar PASS**

Adicionar ao objeto `scripts` de `package.json`:

```json
"test:contas-memoria": "node --test --experimental-strip-types shared/contasVariationMemory.test.ts"
```

Run: `npm run test:contas-memoria`
Expected: PASS com quatro testes.

- [ ] **Step 5: Commitar o contrato puro**

```bash
git add shared/contasVariationMemory.ts shared/contasVariationMemory.test.ts package.json
git commit -m "test: fixar contrato da memoria de variacoes"
```

### Task 2: Aplicar migration compatível e testar o schema

**Files:**
- Create: `supabase/migrations/20260806_contas_anomalia_memoria_operacional.sql`
- Test: `supabase/migrations/contas_anomalia_memoria_operacional.test.mjs`

- [ ] **Step 1: Escrever o teste de contrato da migration**

Criar um teste Node que leia o SQL e exija, sem executar produção, as cláusulas de compatibilidade:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260806_contas_anomalia_memoria_operacional.sql', import.meta.url), 'utf8');

test('migration preserva legado e cria identidade recorrente', () => {
  assert.match(sql, /add column if not exists recorrente_modelo_id uuid/i);
  assert.match(sql, /add column if not exists plano_conta_id uuid/i);
  assert.match(sql, /drop constraint if exists contas_anomalia_notas_status_check/i);
  assert.match(sql, /pendente.*justificada.*corrigir_lancamento.*monitorar.*verificado/is);
  assert.match(sql, /create unique index if not exists contas_anomalia_notas_unique/i);
  assert.match(sql, /enable row level security/i);
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `node --test supabase/migrations/contas_anomalia_memoria_operacional.test.mjs`
Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Escrever a migration idempotente**

Criar o arquivo com esta ordem:

```sql
alter table public.contas_anomalia_notas
  add column if not exists recorrente_modelo_id uuid null,
  add column if not exists plano_conta_id uuid null;

alter table public.contas_anomalia_notas
  alter column status drop not null;

alter table public.contas_anomalia_notas
  drop constraint if exists contas_anomalia_notas_status_check;

alter table public.contas_anomalia_notas
  add constraint contas_anomalia_notas_status_check
  check (status is null or status in ('pendente', 'justificada', 'corrigir_lancamento', 'monitorar', 'verificado'));

create index if not exists contas_anomalia_notas_recorrente_idx
  on public.contas_anomalia_notas (competencia_ym, unidade, recorrente_modelo_id, plano_conta_id)
  where recorrente_modelo_id is not null;

create index if not exists contas_anomalia_notas_conta_idx
  on public.contas_anomalia_notas (competencia_ym, unidade, conta_id)
  where conta_id is not null;

alter table public.contas_anomalia_notas enable row level security;
```

Não remover nem recriar o índice único existente `(competencia_ym, unidade, anomaly_key)`, não fazer backfill de causa e não inserir dados de fixture.

- [ ] **Step 4: Validar localmente e por inspeção**

Run: `node --test supabase/migrations/contas_anomalia_memoria_operacional.test.mjs`
Expected: PASS.

Run: `supabase db lint`
Expected: sem erro de sintaxe/ordenação de migration. Se o ambiente local não tiver banco iniciado, registrar o bloqueio e validar com `supabase migration list` + revisão SQL; não aplicar nada remoto neste passo.

- [ ] **Step 5: Commitar somente a migration e o teste**

```bash
git add supabase/migrations/20260806_contas_anomalia_memoria_operacional.sql supabase/migrations/contas_anomalia_memoria_operacional.test.mjs
git commit -m "feat: ampliar memoria operacional das anomalias"
```

### Task 3: Encapsular leitura e gravação segura no frontend

**Files:**
- Create: `services/contasAnomaliaMemory.ts`
- Test: `services/contasAnomaliaMemory.test.ts`

- [ ] **Step 1: Escrever testes de normalização e contrato do serviço**

O teste deve usar `node:test` e um mock in-memory do encadeamento Supabase para confirmar que:

- leitura seleciona `id,competencia_ym,unidade,anomaly_key,conta_id,recorrente_modelo_id,plano_conta_id,nota,status,updated_at`;
- upsert envia `competencia_ym`, `unidade`, `anomaly_key`, `conta_id`, `recorrente_modelo_id`, `plano_conta_id`, `nota`, `status` e `created_by`;
- texto acima de 2.000 caracteres é rejeitado antes da chamada;
- status legado lido como `verificado` é exposto como `justificada` para a UI;
- conflito usa `competencia_ym,unidade,anomaly_key` e não cria duplicata.

O caso de erro deve verificar que a promessa rejeita e não transforma falha de rede em “salvo”.

O mock será injetado pela fábrica do serviço, evitando rede real no teste:

```ts
const calls: any[] = [];
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  from: (table: string) => {
    calls.push({ table });
    return {
      select: (fields: string) => ({
        eq: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      }),
      upsert: (payload: unknown, options: unknown) => ({
        select: () => ({ single: async () => ({ data: { ...payload as object, id: 'note-1', updated_at: '2026-08-06T00:00:00Z' }, error: null, options }) }),
      }),
    };
  },
} as any;

const api = createContasAnomaliaMemoryApi(fakeClient);
await api.upsertContasAnomaliaNota({
  competenciaYM: '2026-08', unidade: 'cg', anomalyKey: 'cg|plano|modelo:m1',
  contaId: 'conta-1', recorrenteModeloId: 'm1', planoContaId: 'plano', nota: 'reajuste', status: 'justificada',
});
assert.equal(calls[0].table, 'contas_anomalia_notas');
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `node --test --experimental-strip-types services/contasAnomaliaMemory.test.ts`
Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar tipos e funções de serviço**

O módulo deve importar apenas `supabase` de `services/supabase.ts` e os helpers puros do contrato. Expor uma fábrica `createContasAnomaliaMemoryApi(client = supabase)` para os testes e exportar as funções da instância padrão. O núcleo do upsert deve ter esta forma:

```ts
export type ContasAnomaliaNotaStatus = 'pendente' | 'justificada' | 'corrigir_lancamento' | 'monitorar';

export type ContasAnomaliaNota = {
  id: string;
  competencia_ym: string;
  unidade: string;
  anomaly_key: string;
  conta_id: string | null;
  recorrente_modelo_id: string | null;
  plano_conta_id: string | null;
  nota: string;
  status: ContasAnomaliaNotaStatus | null;
  updated_at: string;
};

const NOTE_SELECT = 'id,competencia_ym,unidade,anomaly_key,conta_id,recorrente_modelo_id,plano_conta_id,nota,status,updated_at';

export async function fetchContasAnomaliaNotas(competenciaYM: string, unidade: string): Promise<Record<string, ContasAnomaliaNota>> {
  const { data, error } = await supabase
    .from('contas_anomalia_notas')
    .select(NOTE_SELECT)
    .eq('competencia_ym', competenciaYM)
    .eq('unidade', unidade)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return Object.fromEntries((data || []).map((row: any) => [row.anomaly_key, {
    ...row,
    status: normalizeMemoryStatus(row.status),
  }]));
}

export async function upsertContasAnomaliaNota(input: {
  competenciaYM: string;
  unidade: string;
  anomalyKey: string;
  contaId: string | null;
  recorrenteModeloId: string | null;
  planoContaId: string | null;
  nota: string;
  status: ContasAnomaliaNotaStatus | null;
}): Promise<ContasAnomaliaNota> {
  if (input.nota.length > MAX_HUMAN_NOTE_LENGTH) throw new Error('A justificativa pode ter no máximo 2.000 caracteres.');
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('contas_anomalia_notas')
    .upsert({
      competencia_ym: input.competenciaYM,
      unidade: input.unidade,
      anomaly_key: input.anomalyKey,
      conta_id: input.contaId,
      recorrente_modelo_id: input.recorrenteModeloId,
      plano_conta_id: input.planoContaId,
      nota: input.nota,
      status: input.status,
      created_by: userData.user?.id || null,
    }, { onConflict: 'competencia_ym,unidade,anomaly_key' })
    .select(NOTE_SELECT)
    .single();
  if (error) throw error;
  return { ...data, status: normalizeMemoryStatus(data.status) } as ContasAnomaliaNota;
}
```

Dentro da fábrica, as funções acima devem usar o argumento `client`; fora dela, exportar:

```ts
export const { fetchContasAnomaliaNotas, upsertContasAnomaliaNota } = createContasAnomaliaMemoryApi();
```

- [ ] **Step 4: Rodar os testes e typecheck**

Run: `node --test --experimental-strip-types services/contasAnomaliaMemory.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS; o novo módulo não pode introduzir import circular com `ContasPagarPage.tsx`.

- [ ] **Step 5: Commitar o serviço**

```bash
git add services/contasAnomaliaMemory.ts services/contasAnomaliaMemory.test.ts
git commit -m "feat: encapsular notas de anomalias de contas"
```

### Task 4: Tornar a identidade recorrente determinística no cálculo

**Files:**
- Modify: `components/contas/ContasPagarPage.tsx:1327-1429`
- Modify: `supabase/functions/ai-contas-comparativo/index.ts:103-205`
- Modify: `supabase/functions/ai-contas-auditoria/index.ts` nos tipos/queries/candidatos determinísticos
- Test: `shared/contasVariationMemory.test.ts`

- [ ] **Step 1: Adicionar casos de recorrente, novo/removido e diacríticos aos testes**

Acrescentar aos testes puros:

```ts
test('chave sem modelo permanece exata para item novo/removido', () => {
  const janeiro = buildVariationKey({ unidade: 'rec', planoContaId: 'plano-2', recorrenteModeloId: null, descricao: 'Internet Fibra' });
  const fevereiro = buildVariationKey({ unidade: 'rec', planoContaId: 'plano-2', recorrenteModeloId: null, descricao: 'Internet Fibra Empresas' });
  assert.notEqual(janeiro, fevereiro);
});

test('modelo recorrente ignora apenas a mudança de descrição', () => {
  const anterior = buildVariationKey({ unidade: 'bar', planoContaId: 'plano-3', recorrenteModeloId: 'modelo-3', descricao: 'Energia julho' });
  const atual = buildVariationKey({ unidade: 'bar', planoContaId: 'plano-3', recorrenteModeloId: 'modelo-3', descricao: 'Energia agosto' });
  assert.equal(anterior, atual);
});
```

- [ ] **Step 2: Rodar os testes para confirmar a falha do novo contrato**

Run: `npm run test:contas-memoria`
Expected: FAIL apenas se a implementação ainda não usar o contrato comum; corrigir o teste/módulo antes de seguir.

- [ ] **Step 3: Usar o helper comum no frontend e na comparação Edge**

Na `ContasPagarPage.tsx`, substituir a função local `keyFor` por `buildVariationKey` e acrescentar `recorrente_modelo_id`/`plano_conta_id` ao objeto da variação. A mesma chave deve ser usada para `anomalies` e para o cartão.

Na `ai-contas-comparativo/index.ts`, incluir `recorrente_modelo_id` nos selects de ambos os meses e substituir `buildKey` por:

```ts
function buildKey(c: ContaRow): string {
  return buildVariationKey({
    unidade: c.unidade,
    planoContaId: c.plano_conta_id,
    recorrenteModeloId: c.recorrente_modelo_id,
    descricao: c.descricao,
  });
}
```

Cada `Variation` precisa manter `contaId`, `recorrenteModeloId` e `planoContaId` do `sample`, sem alterar os totais agregados.

Na `ai-contas-auditoria/index.ts`, incluir `recorrente_modelo_id` no select e construir a chave de recorrente com o modelo quando existir; duplicidade, falta de plano e atraso continuam com chave determinística própria. Adicionar `recorrente_modelo_id` e `plano_conta_id` em `meta`/saída da anomalia para o upsert.

- [ ] **Step 4: Verificar que os números não mudaram**

Run: `npm run test:contas-memoria`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: build Vite concluído; nenhuma alteração de chave pode quebrar o dashboard.

- [ ] **Step 5: Commitar a identidade determinística**

```bash
git add shared/contasVariationMemory.test.ts components/contas/ContasPagarPage.tsx supabase/functions/ai-contas-comparativo/index.ts supabase/functions/ai-contas-auditoria/index.ts
git commit -m "fix: estabilizar identidade das variacoes recorrentes"
```

### Task 5: Integrar memória e rascunho na Edge Function de comparativo

**Files:**
- Modify: `supabase/functions/ai-contas-comparativo/index.ts`
- Test: `supabase/functions/ai-contas-comparativo/contasComparativoMemory.test.ts`

- [ ] **Step 1: Escrever testes de contrato da função**

O teste deve ler o source e validar que o input/hash/prompt/output têm os contratos abaixo:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('comparativo consulta notas específicas e inclui no hash', () => {
  assert.match(source, /from\("contas_anomalia_notas"\)/);
  assert.match(source, /recorrente_modelo_id/);
  assert.match(source, /notas_anomalias/);
  assert.match(source, /inputHash = await sha256Hex\(JSON\.stringify\(inputObject\)\)/);
});

test('contrato de saída aceita rascunho nullable e chave estável', () => {
  assert.match(source, /sugestao_justificativa/);
  assert.match(source, /chave_referencia/);
  assert.match(source, /MAX_AI_DRAFT_LENGTH|truncateAiDraft/);
});

test('fallback não inventa justificativa', () => {
  assert.match(source, /sugestao_justificativa:\s*null/);
});
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `node --test --experimental-strip-types supabase/functions/ai-contas-comparativo/contasComparativoMemory.test.ts`
Expected: FAIL porque o Edge Function ainda não consulta notas específicas nem declara o novo campo.

- [ ] **Step 3: Consultar as notas da competência atual e base**

Depois de validar `competenciaYM`/`baseYM`, executar duas queries administrativas com o mesmo recorte de unidade:

```ts
const loadNotes = async (competencia: string) => {
  const { data, error } = await supabase
    .from('contas_anomalia_notas')
    .select('anomaly_key,unidade,conta_id,recorrente_modelo_id,plano_conta_id,nota,status,updated_at')
    .eq('competencia_ym', competencia)
    .eq('unidade', unidade)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const [notasAtual, notasBase] = await Promise.all([loadNotes(competenciaYM), loadNotes(baseYM)]);
```

No filtro `unidade === 'todas'`, buscar todas as unidades e deixar a correspondência exigir a mesma unidade da variação. Nunca enviar nota de uma unidade para outra.

- [ ] **Step 4: Incluir memória, status e identidade no hash/prompt**

O `inputObject` deve conter `memoria.notas_mes_atual`, `memoria.notas_mes_base`, `memoria.notas_anomalias_atual` e `memoria.notas_anomalias_base`. O `top_mudancas` deve incluir `conta_id`, `recorrente_modelo_id` e `plano_conta_id`.

Atualizar o prompt para exigir:

```json
{
  "analise_executiva": "string",
  "insights_detalhados": [
    {
      "titulo": "string",
      "categoria": "string",
      "severidade": "alta|media|baixa",
      "descricao": "string",
      "impacto_financeiro": 123.45,
      "chave_referencia": "chave existente ou null",
      "sugestao_justificativa": "até 600 caracteres ou null"
    }
  ],
  "recomendacoes": ["string"]
}
```

As instruções devem dizer: usar somente a comparação e notas humanas fornecidas; se não houver base concreta, retornar `null`; não mudar números; não transformar `pendente`/`monitorar` em causa; não declarar que uma causa é certa.

- [ ] **Step 5: Normalizar a resposta e manter fallback determinístico**

Após parsear Gemini, aceitar apenas insights cuja `chave_referencia` exista no conjunto de variações. Para cada insight, preservar os campos numéricos determinísticos e aplicar `truncateAiDraft` ao campo de rascunho. O fallback deve construir cada insight com `sugestao_justificativa: null`.

Incrementar `ANALYSIS_VERSION` para `2`, mantendo cache antigo inelegível pelo novo hash/versão. Não apagar linhas de `contas_comparativo_ai_insights`.

- [ ] **Step 6: Rodar contrato, typecheck e build da função**

Run: `node --test --experimental-strip-types supabase/functions/ai-contas-comparativo/contasComparativoMemory.test.ts`
Expected: PASS.

Run: `deno check supabase/functions/ai-contas-comparativo/index.ts`
Expected: PASS.

- [ ] **Step 7: Commitar a memória do comparativo**

```bash
git add supabase/functions/ai-contas-comparativo/index.ts supabase/functions/ai-contas-comparativo/contasComparativoMemory.test.ts
git commit -m "feat: incluir memoria no comparativo de contas"
```

### Task 6: Integrar o mesmo contrato na auditoria

**Files:**
- Modify: `supabase/functions/ai-contas-auditoria/index.ts`
- Modify: `components/contas/ContasPagarPage.tsx` nos tipos da resposta de auditoria
- Test: `supabase/functions/ai-contas-auditoria/contasAuditoriaMemory.test.ts`

- [ ] **Step 1: Adicionar teste do contrato da auditoria**

O teste deve exigir que a função selecione `recorrente_modelo_id`/`plano_conta_id`, inclua notas específicas no `inputObject.memoria`, aceite `sugestao_justificativa` e retorne `null` no fallback.

```ts
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
test('auditoria preserva identidade e rascunho nullable', () => {
  assert.match(source, /recorrente_modelo_id/);
  assert.match(source, /plano_conta_id/);
  assert.match(source, /notas_anomalias/);
  assert.match(source, /sugestao_justificativa/);
  assert.match(source, /sugestao_justificativa:\s*null/);
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `node --test --experimental-strip-types supabase/functions/ai-contas-auditoria/contasAuditoriaMemory.test.ts`
Expected: FAIL antes da alteração da função.

- [ ] **Step 3: Implementar consulta, hash e contrato de saída**

Reutilizar `loadNotes` e a correspondência de identidade do helper comum. Incluir as notas específicas no hash já usado pela auditoria. Acrescentar `sugestao_justificativa` a cada anomalia e normalizar para `null` no fallback/erro de Gemini. A saída deve manter `key`, `conta_id` e impacto determinísticos.

- [ ] **Step 4: Rodar validações da auditoria**

Run: `node --test --experimental-strip-types supabase/functions/ai-contas-auditoria/contasAuditoriaMemory.test.ts`
Expected: PASS.

Run: `deno check supabase/functions/ai-contas-auditoria/index.ts`
Expected: PASS.

- [ ] **Step 5: Commitar a auditoria**

```bash
git add supabase/functions/ai-contas-auditoria/index.ts components/contas/ContasPagarPage.tsx supabase/functions/ai-contas-auditoria/contasAuditoriaMemory.test.ts
git commit -m "feat: levar memoria para auditoria de contas"
```

### Task 7: Criar o cartão inline de variação

**Files:**
- Create: `components/contas/ContasVariationAlertCard.tsx`
- Test: `components/contas/ContasVariationAlertCard.test.ts`

- [ ] **Step 1: Escrever testes de renderização e interação**

Usar `createServer({ middlewareMode: true })`/`ssrLoadModule` no mesmo padrão dos testes React existentes. Verificar:

- anterior, atual, diferença e percentual aparecem sem formatação vinda da IA;
- nota salva aparece com o rótulo `Justificativa`;
- status legado `verificado` aparece como `Justificada`;
- `Sugestão da IA` aparece como texto editável, nunca como nota salva;
- clicar em `Salvar justificativa` chama `onSave` com texto/status;
- texto com mais de 2.000 caracteres desabilita o save e mostra contador/erro;
- quando a IA não fornece rascunho, o bloco não é renderizado.

O teste de renderização deve importar o componente via `vite.ssrLoadModule` e exercitar o contrato com uma variação fixa:

```ts
const loaded = await vite.ssrLoadModule('/components/contas/ContasVariationAlertCard.tsx');
const card = loaded.ContasVariationAlertCard;
const onSave = async (input: { nota: string; status: string | null }) => saved.push(input);
const markup = renderToStaticMarkup(React.createElement(card, {
  data: {
    key: 'cg|plano|modelo:m1', titulo: 'Energia', descricao: 'Conta de energia', unidade: 'cg',
    prev: 100, curr: 161, diff: 61, perc: 61, statusVariacao: 'RECORRENTE',
    notaSalva: '', statusOperacional: null, sugestaoJustificativa: 'Leitura maior no período.',
  }, onSave,
}));
assert.match(markup, /R\$|61/);
assert.match(markup, /Sugestão da IA/);
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `node --test --experimental-strip-types components/contas/ContasVariationAlertCard.test.ts`
Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implementar props e markup do cartão**

O componente deve receber tipos explícitos, sem consultar Supabase diretamente:

```ts
export type VariationAlertCardData = {
  key: string;
  titulo: string;
  descricao: string;
  unidade: string;
  prev: number;
  curr: number;
  diff: number;
  perc: number;
  statusVariacao: 'NOVO' | 'SAIU' | 'RECORRENTE';
  notaSalva: string;
  statusOperacional: ContasAnomaliaNotaStatus | null;
  sugestaoJustificativa: string | null;
};

export function ContasVariationAlertCard({
  data,
  onSave,
}: {
  data: VariationAlertCardData;
  onSave: (input: { nota: string; status: ContasAnomaliaNotaStatus | null }) => Promise<void>;
}) {
  // Renderizar os números determinísticos em quatro células; texto e status abaixo.
}
```

O rascunho deve ter botão `Usar rascunho`, que copia o texto para o textarea, e a nota salva deve aparecer como leitura antes da edição. O `onSave` só dispara depois da validação local; o componente deve preservar o textarea em caso de rejeição da promessa.

- [ ] **Step 4: Rodar teste e typecheck**

Run: `node --test --experimental-strip-types components/contas/ContasVariationAlertCard.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commitar o componente**

```bash
git add components/contas/ContasVariationAlertCard.tsx components/contas/ContasVariationAlertCard.test.ts
git commit -m "feat: criar cartao inline de variacao"
```

### Task 8: Integrar o cartão e o serviço em Contas a Pagar

**Files:**
- Modify: `components/contas/ContasPagarPage.tsx:395-937,1255-1429,1653-1690,2032-2296,2962-3032`
- Modify: `services/contasAnomaliaMemory.ts`

- [ ] **Step 1: Migrar tipos e estado existentes**

Trocar `ContasAnomaliaNotaStatus = 'pendente' | 'verificado'` pelo tipo canônico do serviço. Manter conversão de dados legados pela função `normalizeMemoryStatus`. Adicionar estado `savingAnomaliaKey` e `localDrafts` por chave para impedir duplo clique e preservar texto quando o upsert falhar.

- [ ] **Step 2: Carregar notas quando alertas ou comparativo estiverem visíveis**

Expandir `loadAnomaliaNotas` para os modos `dashboard`, `comparativo` e `todas`, com cache por `${competenciaFiltro}|${unidadeFiltro}`. Usar `fetchContasAnomaliaNotas` e limpar o mapa quando competência/unidade mudar. A leitura do dashboard não pode bloquear os KPIs.

- [ ] **Step 3: Enriquecer o cálculo local do dashboard e comparativo**

Usar `buildVariationKey` em `dashboardData` e `comparativoData`. Cada variação/anomalia deve carregar `contaId`, `recorrenteModeloId`, `planoContaId`, `key`, `prev`, `curr`, `diff`, `perc`, `statusVariacao`. Os números precisam continuar exatamente iguais aos anteriores.

- [ ] **Step 4: Renderizar o cartão no expansor de alertas**

Substituir o `<div>` simples em `components/contas/ContasPagarPage.tsx:1674-1687` por `ContasVariationAlertCard`. O cartão recebe a nota indexada por `key`, calcula o título/descrição existentes e salva com:

```ts
await upsertContasAnomaliaNota({
  competenciaYM: competenciaFiltro,
  unidade: unidadeFiltro,
  anomalyKey: variation.key,
  contaId: variation.contaId,
  recorrenteModeloId: variation.recorrenteModeloId,
  planoContaId: variation.planoContaId,
  nota: input.nota,
  status: input.status,
});
await loadAnomaliaNotas(true);
```

Se o usuário estiver em `todas` (auditoria), preservar o modal existente, mas trocar o upsert direto pelo serviço e usar os quatro status operacionais. O modal deve exibir contador de 2.000 caracteres e mostrar `Justificada` para o legado.

- [ ] **Step 5: Mostrar rascunho da IA na área Comparativo**

Indexar `compAiRow.response_json.insights_detalhados` por `chave_referencia`. Para cada `comparativoData.anomalies`, renderizar o mesmo cartão abaixo do resumo de insights ou substituir a representação somente do alerta expandido; a tabela de detalhamento continua mostrando os valores. Passar `sugestao_justificativa || null`. Rascunho é local até `onSave`.

- [ ] **Step 6: Ajustar a mensagem da memória e feedback de erro**

Substituir “Suas notas ajudam a treinar a IA” por “Suas justificativas ficam disponíveis como contexto nas próximas análises.” Exibir toast de sucesso somente após o upsert; em erro, manter textarea/status e mostrar a mensagem sem marcar salvo.

- [ ] **Step 7: Rodar testes e build**

Run: `npm run test:contas-memoria`
Expected: PASS.

Run: `node --test --experimental-strip-types components/contas/ContasVariationAlertCard.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: build concluído sem classes Tailwind ausentes.

- [ ] **Step 8: Commitar a integração de tela**

```bash
git add components/contas/ContasPagarPage.tsx services/contasAnomaliaMemory.ts
git commit -m "feat: permitir justificar variacoes no alerta"
```

### Task 9: Validar falhas, RLS, cache e E2E sem dados permanentes

**Files:**
- Create: `scripts/contas-variacoes-e2e.mjs`
- Create: `scripts/contas-variacoes-fixture.sql`
- Modify: `package.json`

- [ ] **Step 1: Criar fixture reversível e explicitamente isolada**

A fixture deve inserir duas competências de uma conta recorrente com o mesmo `recorrente_modelo_id`, uma conta de descrição alterada sem modelo e um item novo/removido. O script deve guardar IDs gerados e executar cleanup em `finally`; se o cleanup falhar, abortar o E2E e imprimir os IDs para remoção manual antes de qualquer publicação.

O SQL de fixture deve usar prefixo de descrição `TEST_CONTAS_MEMORIA_20260806`, competência de teste e uma unidade válida, sem tocar linhas de produção não pertencentes ao prefixo.

O arquivo SQL deve conter o cleanup delimitado pelo prefixo:

```sql
delete from public.contas_pagar
where descricao like 'TEST_CONTAS_MEMORIA_20260806%';
```

O executor cria os três lançamentos via cliente Supabase administrativo, consultando um `plano_conta_id` ativo e gerando um `recorrente_modelo_id` UUID para as duas linhas recorrentes. O cleanup SQL é executado em `finally` e não é enviado diretamente para produção.

- [ ] **Step 2: Criar teste Playwright autenticado**

`scripts/contas-variacoes-e2e.mjs` deve:

1. iniciar Vite/preview conforme o harness existente;
2. abrir `Contas a Pagar` autenticado na sessão de QA;
3. escolher a competência fixture e unidade;
4. abrir alertas e preencher uma justificativa manual;
5. salvar e verificar texto/status na mesma tela;
6. recarregar e confirmar persistência;
7. abrir Comparativo, forçar atualização e verificar que o rascunho/nota específica aparece quando a base existir;
8. interceptar a resposta para garantir que `prev`, `curr`, `diff`, `perc` não mudaram;
9. simular falha/timeout de Edge Function e confirmar que o cartão manual continua salvável;
10. remover fixture em `finally` e confirmar ausência por query autenticada.

O esqueleto de cleanup deve ser obrigatório, mesmo se uma asserção falhar:

```js
let fixtureIds = [];
try {
  fixtureIds = await createFixture(supabaseAdmin);
  await page.goto(`${baseUrl}/?module=contas&page=comparativo`);
  await page.getByText('Alertas Detectados').click();
  await page.getByLabel('Justificativa').fill('Reajuste confirmado no contrato.');
  await page.getByRole('button', { name: 'Salvar justificativa' }).click();
  await expect(page.getByText('Reajuste confirmado no contrato.')).toBeVisible();
} finally {
  await deleteFixture(supabaseAdmin, fixtureIds);
  assert.equal(await countFixtureRows(supabaseAdmin), 0);
}
```

- [ ] **Step 3: Cobrir RLS e concorrência**

Adicionar ao script/SQL verificações de que:

- usuário não autorizado não lê/grava a tabela;
- usuário autorizado não consegue upsertar outra unidade/competência sem a linha correspondente;
- duas gravações consecutivas com a mesma chave resultam em uma linha e no último estado.

Se o ambiente de QA não permitir dois tokens, cobrir a unicidade com duas chamadas sequenciais ao mesmo upsert e verificar uma linha.

- [ ] **Step 4: Adicionar comando de E2E**

Adicionar ao `package.json`:

```json
"test:e2e:contas-memoria": "node scripts/contas-variacoes-e2e.mjs"
```

- [ ] **Step 5: Rodar a bateria completa antes de publicação**

Run: `npm run test:contas-memoria`
Expected: PASS.

Run: `node --test --experimental-strip-types shared/contasVariationMemory.test.ts services/contasAnomaliaMemory.test.ts components/contas/ContasVariationAlertCard.test.ts`
Expected: PASS em todos os testes.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Run: `npm run test:e2e:contas-memoria`
Expected: PASS e fixture ausente no banco ao finalizar.

- [ ] **Step 6: Commitar os testes de integração**

```bash
git add scripts/contas-variacoes-e2e.mjs scripts/contas-variacoes-fixture.sql package.json
git commit -m "test: cobrir fluxo e2e de memoria financeira"
```

### Task 10: Auditoria, preview e gate de publicação

**Files:**
- Review only: todos os arquivos das Tasks 1–9
- Evidence: `Docs/superpowers/specs/2026-08-06-contas-pagar-variacoes-memoria-design.md`

- [ ] **Step 1: Revisar linha a linha contra a especificação aprovada**

Conferir explicitamente: texto livre no alerta, status opcional, nota geral separada, identidade recorrente, ausência de fuzzy matching, rascunho não persistido, limite de texto, fallback sem Gemini, hash com memória, RLS e preservação dos números.

- [ ] **Step 2: Auditar a migration no alvo antes de aplicar**

Usar `information_schema.columns`, `pg_constraint`, `pg_indexes` e `pg_policies` em leitura para confirmar que `recorrente_modelo_id`/`plano_conta_id` são UUID, que o índice único existente permanece e que RLS continua habilitado. Aplicar a migration apenas após essa leitura e depois reler o schema.

- [ ] **Step 3: Validar as Edge Functions no ambiente controlado**

Executar `deno check`, invocar comparativo/auditoria com fixture e confirmar:

- primeira execução pode gerar IA ou fallback;
- segunda execução com o mesmo hash retorna cache;
- salvar nota/status muda o hash;
- timeout retorna determinístico sem rascunho;
- nenhum log contém prompt completo, nota completa ou segredo.

- [ ] **Step 4: Carregar preview e fazer QA visual**

Abrir preview local, verificar claro/escuro, desktop/mobile, dashboard alertas, Comparativo e Auditoria. Clicar para expandir, escrever, usar rascunho, salvar, editar, recarregar e confirmar que o cartão não fica excessivamente alto nem esconde a matemática.

- [ ] **Step 5: Parar para auditoria Claude e QA do Alf**

Não fazer merge nem deploy antes de entregar evidências dos testes, do schema, da ausência de fixture e do preview. Registrar qualquer contraponto encontrado como mudança no plano ou nova decisão antes de codar mais.

- [ ] **Step 6: Commitar somente após todos os gates**

```bash
git status --short
git diff --check
git log -5 --oneline
```

Expected: working tree limpo após o commit final, todos os testes PASS e nenhum arquivo de fixture de runtime sobrando.

## Self-review do plano

- **Cobertura da especificação:** há tarefas para alerta inline, nota geral, status operacional, identidade recorrente, migration compatível, rascunho IA nullable, hash/cache, fallback, RLS, limites, E2E e gate de preview/auditoria.
- **Consistência de tipos:** `MemoryStatus`, `ContasAnomaliaNotaStatus`, `recorrente_modelo_id`, `plano_conta_id`, `anomaly_key` e `sugestao_justificativa` mantêm os mesmos nomes em frontend, Edge Functions, migration e testes.
- **Compatibilidade:** `verificado` não é apagado; a UI o normaliza para `Justificada`; a tabela continua com o índice único existente.
- **Ausência de lacunas:** o plano não depende de “depois decidir”, não manda implementar algo genérico e define comandos/saídas para cada gate.
- **Risco explicitamente tratado:** o E2E usa fixture prefixada e cleanup em `finally`, e nenhum dado real é usado como prova de uma justificativa que hoje não existe.
