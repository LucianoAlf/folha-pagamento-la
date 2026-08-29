# Recorrência Semanal em Contas a Pagar — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Permitir contas a pagar recorrentes **semanais** (hoje só mensais), incluindo a RPC da Maria e um handoff para o chat que cuida dela.

**Architecture:** A identidade de instância recorrente passa de `(modelo, competência-mês)` para `(modelo, data_vencimento)`. O materializador continua "por mês", mas modelos semanais **abrem em leque** nas datas +7 dentro do mês. A lógica existe em dois runtimes (edge Deno em `_shared/` e front em `services/`) e ambos mudam com semântica idêntica.

**Tech Stack:** Supabase (Postgres) via MCP `apply_migration`/`execute_sql`; Edge Functions Deno; React 19 + Vite; testes `node --test` (`.mjs`/`.ts`).

**Spec:** `Docs/superpowers/specs/2026-08-29-recorrencia-semanal-design.md`

## Global Constraints

- Idioma do domínio em português; commits em português, sem acento, prefixo convencional (`feat:`/`fix:`/`docs:`/`test:`).
- `npm run typecheck` deve passar limpo. `deno check` nas edge functions tocadas não deve introduzir erro novo além do genérico do SDK (`TS2345 SupabaseClient ... "public" ... never`, 3 ocorrências pré-existentes por função).
- Migrations aplicadas via MCP `apply_migration` **e** espelhadas em `supabase/migrations/<version>_<name>.sql` (usar o `version` retornado) para o repo ficar reproduzível.
- Frequências válidas: **apenas** `'mensal'` e `'semanal'`. Sem data-fim. Data-âncora (`data_vencimento` do modelo) define o dia da semana.
- Branch: `feat/recorrencia-semanal`. Não tocar em nada da Maria na VPS; a RPC (banco) muda aqui, o handoff vai para o repo `maria-backup` (nunca no repo do TOM).
- Zona de dedup/materialização vive em DOIS arquivos que devem permanecer com semântica idêntica: `supabase/functions/_shared/recorrentesMes.ts` (edge) e `services/contasPagarService.ts` (front).

---

## File Structure

- `supabase/migrations/<v>_recorrencia_semanal_schema.sql` — coluna `recorrente_frequencia` + índice único parcial `(recorrente_modelo_id, data_vencimento)`.
- `supabase/migrations/<v>_maria_contas_recorrente_criar_frequencia.sql` — RPC com `p_frequencia`.
- `supabase/functions/_shared/recorrentesMes.ts` — materializador weekly-aware (helper `ocorrenciasSemanaisNoMes`).
- `supabase/functions/_shared/recorrentesMes.test.mjs` — testes do materializador.
- `supabase/functions/_shared/relatorioContasDia.ts` — `dedupeRecorrentesVisao` por data.
- `supabase/functions/_shared/relatorioContasDia.test.mjs` — teste do dedup semanal.
- `supabase/functions/contas-pagar-dia-gerar/index.ts` — materializar o mês corrente antes de gerar (paridade no preview).
- `services/contasPagarService.ts` — espelha materializador + dedup por data.
- `types/contasPagar.ts` — campo `recorrente_frequencia` em `ContaPagar`.
- `components/contas/NovaContaModal.tsx` — toggle Mensal/Semanal + rótulo do dia + payload.
- `components/contas/EditarContaModal.tsx` — exibir frequência (read-only).
- `maria-backup` (repo separado) — documento de handoff.

---

## Task 1: Schema — coluna de frequência + índice único por data

**Files:**
- Create: `supabase/migrations/<v>_recorrencia_semanal_schema.sql` (espelho do apply_migration)

**Interfaces:**
- Produces: coluna `contas_pagar.recorrente_frequencia text NOT NULL DEFAULT 'mensal'` (check `mensal|semanal`); índice único `contas_pagar_modelo_venc_uniq (recorrente_modelo_id, data_vencimento) WHERE recorrente_modelo_id IS NOT NULL`.

- [ ] **Step 1: Confirmar ausência de duplicatas antes do índice**

`execute_sql` (project `ubdvtjbitozhkuvvqkxj`):
```sql
select recorrente_modelo_id, data_vencimento, count(*)
from public.contas_pagar
where recorrente_modelo_id is not null
group by 1,2 having count(*)>1 limit 5;
```
Esperado: 0 linhas. (Já verificado em 2026-08-29; reconfirmar por segurança.) Se vier linha, PARAR e tratar antes do índice.

- [ ] **Step 2: Aplicar a migration**

`apply_migration` name `recorrencia_semanal_schema`:
```sql
alter table public.contas_pagar
  add column if not exists recorrente_frequencia text not null default 'mensal'
  check (recorrente_frequencia in ('mensal','semanal'));

comment on column public.contas_pagar.recorrente_frequencia is
  'Frequência de um lançamento recorrente: mensal (default) ou semanal. Relevante no modelo (recorrente_modelo_id null); instâncias herdam por cópia.';

create unique index if not exists contas_pagar_modelo_venc_uniq
  on public.contas_pagar (recorrente_modelo_id, data_vencimento)
  where recorrente_modelo_id is not null;
```

- [ ] **Step 3: Verificar**

`execute_sql`:
```sql
select column_name, column_default from information_schema.columns
 where table_schema='public' and table_name='contas_pagar' and column_name='recorrente_frequencia';
select indexname from pg_indexes where tablename='contas_pagar' and indexname='contas_pagar_modelo_venc_uniq';
```
Esperado: a coluna com default `'mensal'::text` e o índice presente.

- [ ] **Step 4: Espelhar a migration no repo e commit**

Escrever `supabase/migrations/<version>_recorrencia_semanal_schema.sql` com o mesmo SQL (usar o `version` retornado pelo apply_migration). Então:
```bash
git add supabase/migrations/*_recorrencia_semanal_schema.sql
git commit -m "feat: coluna recorrente_frequencia e indice unico por data em contas_pagar"
```

---

## Task 2: Materializador weekly-aware (edge `_shared`)

**Files:**
- Modify: `supabase/functions/_shared/recorrentesMes.ts`
- Test: `supabase/functions/_shared/recorrentesMes.test.mjs`

**Interfaces:**
- Consumes: tabela `contas_pagar` com `recorrente_frequencia` (Task 1).
- Produces:
  - `export function ocorrenciasSemanaisNoMes(anchorYmd: string, alvoYM: string): string[]` — datas `YYYY-MM-DD` das ocorrências semanais no mês, a partir da âncora, **excluindo** a âncora.
  - `ensureRecorrentesInstancias(admin, 'YYYY-MM'): Promise<{ criadas: number }>` — agora gera 1/mês para mensal e leque semanal para semanal; dedup por `(recorrente_modelo_id, data_vencimento)`.

- [ ] **Step 1: Escrever o teste do helper de datas (falha)**

Adicionar em `recorrentesMes.test.mjs`:
```js
import { ocorrenciasSemanaisNoMes } from './recorrentesMes.ts';

test('ocorrenciasSemanaisNoMes: leque no mesmo mes exclui a ancora', () => {
  // ancora sexta 2026-08-07; agosto tem sextas 07,14,21,28
  assert.deepEqual(
    ocorrenciasSemanaisNoMes('2026-08-07', '2026-08'),
    ['2026-08-14', '2026-08-21', '2026-08-28']
  );
});

test('ocorrenciasSemanaisNoMes: mes seguinte inclui todas as ocorrencias', () => {
  // ancora 2026-08-07; em setembro: 04,11,18,25
  assert.deepEqual(
    ocorrenciasSemanaisNoMes('2026-08-07', '2026-09'),
    ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']
  );
});

test('ocorrenciasSemanaisNoMes: mes anterior a ancora e vazio', () => {
  assert.deepEqual(ocorrenciasSemanaisNoMes('2026-08-07', '2026-07'), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/recorrentesMes.test.mjs`
Expected: FAIL (`ocorrenciasSemanaisNoMes is not a function`).

- [ ] **Step 3: Implementar o helper**

Adicionar em `recorrentesMes.ts` (antes de `ensureRecorrentesInstancias`):
```ts
const DIA_MS = 86400000;
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function ymdUTC(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Datas YYYY-MM-DD das ocorrencias semanais (a cada 7 dias a partir da ancora) que caem
 *  no mes alvoYM (YYYY-MM), EXCLUINDO a propria ancora (o modelo ja a representa). */
export function ocorrenciasSemanaisNoMes(anchorYmd: string, alvoYM: string): string[] {
  const a = toDateOnly(anchorYmd);
  const m = String(alvoYM || '').match(/^(\d{4})-(\d{2})$/);
  if (!a || !m) return [];
  const [ay, am, ad] = a.split('-').map(Number);
  const anchor = Date.UTC(ay, am - 1, ad);
  const ty = Number(m[1]); const tm = Number(m[2]);
  const monthStart = Date.UTC(ty, tm - 1, 1);
  const monthEnd = Date.UTC(ty, tm, 0); // ultimo dia do mes alvo
  let d = anchor;
  if (d < monthStart) {
    const steps = Math.ceil((monthStart - d) / (7 * DIA_MS));
    d = anchor + steps * 7 * DIA_MS;
  }
  const out: string[] = [];
  for (; d <= monthEnd; d += 7 * DIA_MS) {
    if (d <= anchor) continue; // exclui a ancora e datas anteriores
    out.push(ymdUTC(d));
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/_shared/recorrentesMes.test.mjs`
Expected: PASS (os 3 novos testes).

- [ ] **Step 5: Escrever teste de fan-out do ensureRecorrentesInstancias (falha)**

Adicionar teste com um fake admin. O fake precisa suportar a cadeia `.from().select().eq().neq().neq().is()` (modelos), `.from().select().eq().not()` (existentes) e `.from().upsert()` (captura). Modelar 1 modelo semanal (âncora 2026-08-07) e 1 mensal:
```js
import { ensureRecorrentesInstancias } from './recorrentesMes.ts';

function fakeAdmin({ modelos, existentes }) {
  const inseridos = [];
  return {
    inseridos,
    from() {
      const q = {
        _table: 'contas_pagar', _sel: null,
        select(s){ this._sel = s; return this; },
        eq(){ return this; }, neq(){ return this; },
        is(){ return this; }, not(){ return this; },
        then(res){ // permite await na query
          const data = this._sel && this._sel.includes('recorrente_modelo_id') && this._selExist
            ? existentes : modelos;
          return Promise.resolve(res({ data, error: null }));
        },
        upsert(rows){ inseridos.push(...rows); return Promise.resolve({ error: null }); },
      };
      return q;
    },
  };
}
```
(NOTA: se essa modelagem de fake ficar frágil, trocar por dois handlers de `select` distinguidos pela presença de `.not(...)`. O objetivo do teste é só verificar as datas geradas.)
```js
test('ensureRecorrentesInstancias: modelo semanal gera as demais semanas do mes', async () => {
  const admin = fakeAdmin({
    modelos: [{ id: 'm1', tipo_lancamento: 'recorrente', recorrente_modelo_id: null,
      recorrente_frequencia: 'semanal', competencia: '2026-08-01', data_vencimento: '2026-08-07',
      status: 'pendente', descricao: 'Faxina', valor: 150 }],
    existentes: [],
  });
  const r = await ensureRecorrentesInstancias(admin, '2026-08');
  const datas = admin.inseridos.map(i => i.data_vencimento).sort();
  assert.deepEqual(datas, ['2026-08-14','2026-08-21','2026-08-28']);
  assert.equal(admin.inseridos.every(i => i.recorrente_modelo_id === 'm1'), true);
  assert.equal(admin.inseridos.every(i => i.competencia === '2026-08-01'), true);
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/recorrentesMes.test.mjs`
Expected: FAIL (hoje o materializador ignora frequência e usa lógica mensal).

- [ ] **Step 7: Reescrever `ensureRecorrentesInstancias` weekly-aware**

Substituir o corpo a partir da query `existentes` e do bloco `faltantes`/`novos` por:
```ts
  const { data: existentes, error: errEx } = await admin
    .from('contas_pagar')
    .select('recorrente_modelo_id, data_vencimento')
    .eq('competencia', alvo)
    .not('recorrente_modelo_id', 'is', null);
  if (errEx) throw errEx;

  const geradosPorData = new Set(
    (existentes || []).map((e: any) => `${e.recorrente_modelo_id}|${e.data_vencimento}`)
  );

  const makeInstancia = (modelo: ContaPagarRecorrente, venc: string) => {
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = modelo;
    return {
      ...rest,
      recorrente_modelo_id: modelo.id,
      competencia: competenciaPrimeiroDia(venc),
      data_vencimento: venc,
      status: 'pendente',
      data_pagamento: null,
      metodo_pagamento: null,
    };
  };

  const novos: any[] = [];
  for (const modelo of recorrentes as ContaPagarRecorrente[]) {
    const inicioYM = ymFromCompetencia(modelo.competencia);
    if (!inicioYM || alvoYM < inicioYM) continue;
    const freq = (modelo as any).recorrente_frequencia === 'semanal' ? 'semanal' : 'mensal';

    if (freq === 'semanal') {
      for (const venc of ocorrenciasSemanaisNoMes(modelo.data_vencimento, alvoYM)) {
        if (geradosPorData.has(`${modelo.id}|${venc}`)) continue;
        novos.push(makeInstancia(modelo, venc));
      }
    } else {
      if (alvoYM === inicioYM) continue; // modelo ja representa o mes de inicio
      const dataVencOriginal = new Date(`${modelo.data_vencimento}T00:00:00`);
      const dia = String(dataVencOriginal.getDate()).padStart(2, '0');
      const venc = `${yyyy}-${mm}-${dia}`;
      if (geradosPorData.has(`${modelo.id}|${venc}`)) continue;
      if (modelo.status === 'pago' && competenciaPrimeiroDia(modelo.competencia) === alvo) continue;
      novos.push(makeInstancia(modelo, venc));
    }
  }

  if (novos.length === 0) return { criadas: 0 };

  const { error: errIns } = await admin.from('contas_pagar').upsert(novos, {
    onConflict: 'recorrente_modelo_id,data_vencimento',
    ignoreDuplicates: true,
  });
  if (errIns) {
    if (!isMissingOnConflictConstraint(errIns)) throw errIns;
    const { error: errFallback } = await admin.from('contas_pagar').insert(novos);
    if (errFallback) throw errFallback;
  }
  return { criadas: novos.length };
```
Manter o topo da função (query de `recorrentes` com `.is('recorrente_modelo_id', null)`) igual.

- [ ] **Step 8: Rodar todos os testes do arquivo**

Run: `node --test supabase/functions/_shared/recorrentesMes.test.mjs`
Expected: PASS (novos + mensais existentes verdes).

- [ ] **Step 9: deno check + commit**

Run: `deno check supabase/functions/_shared/recorrentesMes.ts` (sem erro).
```bash
git add supabase/functions/_shared/recorrentesMes.ts supabase/functions/_shared/recorrentesMes.test.mjs
git commit -m "feat: materializador de recorrentes ciente de frequencia semanal"
```

---

## Task 3: Dedup por data no relatório (edge)

**Files:**
- Modify: `supabase/functions/_shared/relatorioContasDia.ts` (função `dedupeRecorrentesVisao`)
- Test: `supabase/functions/_shared/relatorioContasDia.test.mjs`

**Interfaces:**
- Produces: `dedupeRecorrentesVisao` que esconde o modelo apenas quando há instância na **mesma data** dele (chave por `data_vencimento`).

- [ ] **Step 1: Teste (falha) — 1ª ocorrência semanal não some**

Adicionar em `relatorioContasDia.test.mjs`:
```js
import { dedupeRecorrentesVisao } from './relatorioContasDia.ts';

test('dedupeRecorrentesVisao: modelo semanal (1a ocorrencia) nao e escondido pelas instancias do mes', () => {
  const modelo = { id: 'm1', tipo_lancamento: 'recorrente', recorrente_modelo_id: null,
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const inst = { id: 'i1', tipo_lancamento: 'recorrente', recorrente_modelo_id: 'm1',
    competencia: '2026-08-01', data_vencimento: '2026-08-14' };
  const out = dedupeRecorrentesVisao([modelo, inst]);
  assert.equal(out.length, 2); // ambos aparecem (datas diferentes)
});

test('dedupeRecorrentesVisao: esconde modelo quando ha instancia na MESMA data', () => {
  const modelo = { id: 'm1', tipo_lancamento: 'recorrente', recorrente_modelo_id: null,
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const dup = { id: 'i0', tipo_lancamento: 'recorrente', recorrente_modelo_id: 'm1',
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const out = dedupeRecorrentesVisao([modelo, dup]);
  assert.deepEqual(out.map(c => c.id), ['i0']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/relatorioContasDia.test.mjs`
Expected: FAIL no 1º teste (o dedup por mês esconde o modelo).

- [ ] **Step 3: Reescrever `dedupeRecorrentesVisao` por data**

```ts
export function dedupeRecorrentesVisao(contas: ContaPagar[]): ContaPagar[] {
  const instanciaPorModeloData = new Set(
    contas
      .filter((c) => c.recorrente_modelo_id && c.data_vencimento)
      .map((c) => `${c.recorrente_modelo_id}|${toDateOnly(c.data_vencimento)}`)
  );
  return contas.filter((c) => {
    if (c.tipo_lancamento !== 'recorrente' || c.recorrente_modelo_id) return true;
    const venc = toDateOnly(c.data_vencimento);
    if (!venc) return true;
    return !instanciaPorModeloData.has(`${c.id}|${venc}`);
  });
}
```

- [ ] **Step 4: Rodar todos os testes do arquivo**

Run: `node --test supabase/functions/_shared/relatorioContasDia.test.mjs`
Expected: PASS (novos + existentes, incluindo `buscarSaldosDoDia`).

- [ ] **Step 5: deno check + commit**

Run: `deno check supabase/functions/_shared/relatorioContasDia.ts`
```bash
git add supabase/functions/_shared/relatorioContasDia.ts supabase/functions/_shared/relatorioContasDia.test.mjs
git commit -m "fix: dedup de recorrentes por data no relatorio (suporta semanal)"
```

---

## Task 4: Materializar o mês no gerador on-demand (paridade no preview)

**Files:**
- Modify: `supabase/functions/contas-pagar-dia-gerar/index.ts`

**Interfaces:**
- Consumes: `ensureRecorrentesInstancias` (Task 2). O dispatcher das 08:00 já materializa; esta mudança dá paridade ao preview manual.

- [ ] **Step 1: Importar e chamar antes de gerar**

No topo, adicionar import:
```ts
import { ensureRecorrentesInstancias } from "../_shared/recorrentesMes.ts";
```
Logo após obter `dataRef` (antes de `gerarRelatorioContasDia`), adicionar (não pode derrubar o gerador se falhar):
```ts
    try {
      await ensureRecorrentesInstancias(supabaseAdmin, dataRef.slice(0, 7));
    } catch (e) {
      console.error("contas-pagar-dia-gerar: materializar recorrentes:", (e as any)?.message || e);
    }
```

- [ ] **Step 2: deno check**

Run: `deno check supabase/functions/contas-pagar-dia-gerar/index.ts`
Expected: apenas o TS2345 genérico do SDK.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/contas-pagar-dia-gerar/index.ts
git commit -m "feat: gerador on-demand materializa o mes antes do relatorio"
```

---

## Task 5: Front — espelhar materializador + dedup por data

**Files:**
- Modify: `services/contasPagarService.ts` (funções privadas `dedupeRecorrentesVisao` e `ensureRecorrentesInstancias`)

**Interfaces:**
- Produces: mesma semântica da Task 2/3 no runtime do browser. `ensureRecorrentesInstancias(YM): Promise<void>` (assinatura mantida).

- [ ] **Step 1: Reescrever `dedupeRecorrentesVisao` (linhas ~114-126) por data**

```ts
function dedupeRecorrentesVisao(contas: ContaPagar[]): ContaPagar[] {
  const instanciaPorModeloData = new Set(
    contas
      .filter((c) => c.recorrente_modelo_id && c.data_vencimento)
      .map((c) => `${c.recorrente_modelo_id}|${toDateOnly(c.data_vencimento)}`)
  );
  return contas.filter((c) => {
    if (c.tipo_lancamento !== 'recorrente' || c.recorrente_modelo_id) return true;
    const venc = toDateOnly(c.data_vencimento);
    if (!venc) return true;
    return !instanciaPorModeloData.has(`${c.id}|${venc}`);
  });
}
```

- [ ] **Step 2: Adicionar o helper `ocorrenciasSemanaisNoMes` (privado) no service**

Copiar o helper idêntico ao da Task 2 Step 3 (com `DIA_MS`, `pad2`, `ymdUTC`, `ocorrenciasSemanaisNoMes`) como funções de módulo em `contasPagarService.ts`, logo acima de `ensureRecorrentesInstancias`. Usar `toDateOnly` já importado no arquivo.

- [ ] **Step 3: Reescrever o miolo de `ensureRecorrentesInstancias` (linhas ~159-203)**

Trocar a query `existentes` para `select('recorrente_modelo_id, data_vencimento')`, construir `geradosPorData` (Set de `${modelo}|${venc}`), e substituir `faltantes`/`novos` pelo laço com branch semanal/mensal — idêntico à Task 2 Step 7, porém: usar `supabase` (não `admin`), a função retorna `void` (não `{criadas}`), e o `onConflict` = `'recorrente_modelo_id,data_vencimento'`. Sem o fallback de constraint ausente (o índice existe após a Task 1); manter `if (errIns) throw errIns;`.

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: EXIT 0.

- [ ] **Step 5: Verificação em runtime (preview real)**

Com o preview em `http://localhost:3002`, criar (ou via SQL) um modelo semanal e confirmar no banco que ao abrir Contas a Pagar as instâncias da semana aparecem:
```sql
select data_vencimento, recorrente_modelo_id from public.contas_pagar
 where recorrente_frequencia='semanal' or recorrente_modelo_id in
   (select id from public.contas_pagar where recorrente_frequencia='semanal')
 order by data_vencimento;
```
Esperado: as ocorrências +7 do mês corrente presentes.

- [ ] **Step 6: Commit**

```bash
git add services/contasPagarService.ts
git commit -m "feat: front materializa e deduplica recorrentes por data (semanal)"
```

---

## Task 6: Tipos + UI (toggle Mensal/Semanal)

**Files:**
- Modify: `types/contasPagar.ts`
- Modify: `components/contas/NovaContaModal.tsx`
- Modify: `components/contas/EditarContaModal.tsx`

**Interfaces:**
- Consumes: coluna `recorrente_frequencia` (Task 1); `createContaPagar` faz passthrough do payload (`{ ...conta }`), então basta incluir o campo.
- Produces: modal envia `recorrente_frequencia: 'mensal' | 'semanal'` quando `tipo_lancamento==='recorrente'`.

- [ ] **Step 1: Tipo**

Em `types/contasPagar.ts`, na interface `ContaPagar`, após `recorrente_modelo_id?: string | null;`:
```ts
  recorrente_frequencia?: 'mensal' | 'semanal' | null;
```

- [ ] **Step 2: Estado + reset no NovaContaModal**

Adicionar estado (perto de `launchType`):
```ts
  const [recorrenteFrequencia, setRecorrenteFrequencia] = useState<'mensal' | 'semanal'>('mensal');
```
No `useEffect` de reset (após `setLaunchType('unica');`):
```ts
    setRecorrenteFrequencia('mensal');
```

- [ ] **Step 3: Helper de rótulo do dia da semana (topo do arquivo, fora do componente)**

```ts
const DIAS_SEMANA_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function diaDaSemanaLabel(ymd: string): string {
  const d = toDateOnly(ymd);
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  return DIAS_SEMANA_PT[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
}
```

- [ ] **Step 4: UI do toggle (dentro do bloco `<div>` de "Tipo de Lançamento", após o bloco `launchType === 'parcelada'`)**

```tsx
          {launchType === 'recorrente' && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">Frequência</label>
              <div className="flex items-center gap-2 bg-surface/40 border border-line rounded-2xl p-1 w-full md:w-[360px]">
                {([{ id: 'mensal', label: 'Mensal' }, { id: 'semanal', label: 'Semanal' }] as const).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRecorrenteFrequencia(f.id)}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all',
                      recorrenteFrequencia === f.id ? 'bg-surface-2 text-accent shadow-sm' : 'text-muted hover:text-secondary'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {recorrenteFrequencia === 'semanal' && vencimento && (
                <div className="mt-2 text-[10px] text-muted font-bold px-1">
                  Repete toda {diaDaSemanaLabel(vencimento)} a partir de {formatCompetenciaLabel(vencimento) ? toDateOnly(vencimento) : ''}.
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 5: Rótulo do campo Vencimento quando semanal**

Trocar o texto do label "Vencimento *" (linha ~598) para refletir o modo. Substituir `Vencimento *` por:
```tsx
{launchType === 'recorrente' && recorrenteFrequencia === 'semanal' ? '1ª ocorrência *' : 'Vencimento *'}
```

- [ ] **Step 6: Incluir no payload**

No objeto `payload` (após `tipo_lancamento: launchType,`):
```ts
                    recorrente_frequencia: launchType === 'recorrente' ? recorrenteFrequencia : null,
```

- [ ] **Step 7: EditarContaModal — exibir frequência (read-only)**

Em `EditarContaModal.tsx`, onde o tipo recorrente é mostrado, exibir a frequência do registro (`conta.recorrente_frequencia === 'semanal' ? 'Semanal' : 'Mensal'`) como texto read-only. (Localizar o bloco que mostra `tipo_lancamento`/recorrente e adicionar uma linha; não adicionar edição.)

- [ ] **Step 8: typecheck + verificação visual**

Run: `npm run typecheck` (EXIT 0). No preview `http://localhost:3002`: abrir Nova Despesa → Recorrente → conferir toggle Mensal/Semanal, rótulo "1ª ocorrência", texto "Repete toda ...". Screenshot.

- [ ] **Step 9: Commit**

```bash
git add types/contasPagar.ts components/contas/NovaContaModal.tsx components/contas/EditarContaModal.tsx
git commit -m "feat: UI de recorrencia semanal (toggle mensal/semanal) em contas a pagar"
```

---

## Task 7: RPC `maria_contas_recorrente_criar` com `p_frequencia`

**Files:**
- Create: `supabase/migrations/<v>_maria_contas_recorrente_criar_frequencia.sql`

**Interfaces:**
- Produces: RPC com novo parâmetro final `p_frequencia text DEFAULT 'mensal'` (valida `mensal|semanal`), gravando `recorrente_frequencia`. Chamadas de 15 args seguem funcionando (bind na nova função, frequência = mensal).

- [ ] **Step 1: Capturar grants e definição atual**

`execute_sql`:
```sql
select grantee, privilege_type from information_schema.routine_privileges
 where routine_schema='public' and routine_name='maria_contas_recorrente_criar';
select pg_get_functiondef('public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text)'::regprocedure);
```
Anotar os grantees (esperado incluir `maria_operacional`, e possivelmente `service_role`/`authenticated`).

- [ ] **Step 2: Aplicar migration (drop 15-arg + create 16-arg + regrant)**

`apply_migration` name `maria_contas_recorrente_criar_frequencia`. A migration deve:
1. `drop function if exists public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text);`
2. `create or replace function public.maria_contas_recorrente_criar(<15 params originais>, p_frequencia text default 'mensal') returns jsonb language plpgsql security definer set search_path to 'public' as $function$ ... $function$;` — corpo **idêntico** ao capturado no Step 1, com **exatamente** estas duas mudanças:
   - Logo após a validação de `p_data_vencimento`, inserir:
     ```sql
     if p_frequencia is null or p_frequencia not in ('mensal','semanal') then
       raise exception 'frequencia invalida (use mensal ou semanal).';
     end if;
     ```
   - No `insert into public.contas_pagar (... tipo_lancamento, ...) values (... 'recorrente', ...)`, adicionar a coluna `recorrente_frequencia` na lista e `p_frequencia` no `values` (na posição correspondente).
   - (Opcional, recomendado) incluir `'frequencia', p_frequencia` no `jsonb_build_object` de retorno.
3. Re-conceder os grants capturados, ex.: `grant execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) to maria_operacional;` (repetir para cada grantee do Step 1, com a assinatura de **16** args).

- [ ] **Step 3: Verificar assinatura e ausência de overload duplicado**

`execute_sql`:
```sql
select pg_get_function_identity_arguments(oid)
 from pg_proc where proname='maria_contas_recorrente_criar' and pronamespace='public'::regnamespace;
```
Esperado: **uma** linha, terminando em `..., p_frequencia text`.

- [ ] **Step 4: Teste funcional real (semanal) e rollback do dado de teste**

`execute_sql` chamando a RPC com um ator/plano/centro válidos e `p_frequencia => 'semanal'` (usar dados reais mínimos; se não houver ator de teste seguro, PULAR a execução e validar só a assinatura no Step 3 — não inventar ator). Se executar, conferir que a linha criada tem `recorrente_frequencia='semanal'` e depois **cancelar/remover** a conta de teste (`update ... set status='cancelado'` ou delete se recém-criada), registrando o que foi feito.

- [ ] **Step 5: Espelhar migration no repo e commit**

Escrever `supabase/migrations/<version>_maria_contas_recorrente_criar_frequencia.sql` com o SQL aplicado. 
```bash
git add supabase/migrations/*_maria_contas_recorrente_criar_frequencia.sql
git commit -m "feat: rpc maria_contas_recorrente_criar aceita frequencia semanal"
```

---

## Task 8: Handoff para o chat da Maria (repo `maria-backup`)

**Files:**
- Create: `planejamento/openfinance/../recorrencia-semanal/HANDOFF-RECORRENCIA-SEMANAL.md` no repo **maria-backup** (caminho final a confirmar na estrutura de `planejamento/`).

**Interfaces:**
- Consumes: assinatura final da RPC (Task 7).

- [ ] **Step 1: Escrever o documento de handoff**

Conteúdo: (a) o conceito de `recorrente_frequencia` (mensal|semanal); (b) a **nova assinatura** da RPC `maria_contas_recorrente_criar` com `p_frequencia` (último arg, default `'mensal'`), e que para semanal `p_data_vencimento` é a **1ª ocorrência** (define o dia da semana); (c) como a Maria deve mapear a fala da Rose no WhatsApp — ex.: "faxina toda sexta R$150 no Recreio" → `p_frequencia='semanal'`, `p_data_vencimento`= próxima sexta; "toda semana a partir de amanhã" → próxima data; (d) que auditoria/confirmação/`maria_audit_log` seguem iguais; (e) que a materialização das ocorrências e o relatório das 08:00 são automáticos do lado do app — a Maria só cria o modelo. Incluir 1-2 exemplos de chamada.

- [ ] **Step 2: Commit e push no maria-backup**

Clonar/atualizar o repo `maria-backup` (deploy key / `gh`), adicionar o arquivo em `planejamento/`, commit em português e push. **Nunca** no repo do TOM. Entregar o link ao Alf.

---

## Task 9: Verificação final e push da branch

- [ ] **Step 1: Suíte + typecheck + deno check**

Run:
```bash
node --test supabase/functions/_shared/recorrentesMes.test.mjs
node --test supabase/functions/_shared/relatorioContasDia.test.mjs
npm run typecheck
deno check supabase/functions/_shared/recorrentesMes.ts supabase/functions/_shared/relatorioContasDia.ts supabase/functions/contas-pagar-dia-gerar/index.ts
```
Expected: testes verdes; typecheck EXIT 0; deno check só com o TS2345 genérico.

- [ ] **Step 2: Deploy das edge functions tocadas**

`contas-pagar-dia-gerar` (mudou) via `npx supabase functions deploy contas-pagar-dia-gerar --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt`. As `_shared/*` não têm deploy próprio — **redeployar quem as importa**: `contas-pagar-dia-gerar` e `whatsapp-grupo-dispatcher` (usa `recorrentesMes.ts` + `relatorioContasDia.ts`).

- [ ] **Step 3: Smoke test real do fluxo semanal**

Criar um modelo semanal de teste (via RPC ou SQL), rodar o dispatcher em `dryRun` se disponível ou chamar `contas-pagar-dia-gerar` para uma data de ocorrência, confirmar que a ocorrência aparece. Remover/cancelar o dado de teste depois.

- [ ] **Step 4: Push da branch**

```bash
git push -u origin feat/recorrencia-semanal
```

---

## Self-Review (feito pelo autor do plano)

- **Cobertura do spec:** schema (T1), materializador semanal (T2), dedup por data (T3 edge + T5 front), materialização no gerador (T4), UI (T6), RPC Maria (T7), handoff (T8), confiabilidade 08:00 (coberta pelo dispatcher; T4 dá paridade no preview). ✔
- **Duplicação de lógica** edge/front tratada em T2/T3 (edge) e T5 (front). ✔
- **Sem placeholders de código** nas partes críticas (helper, materializador, dedup, UI). A RPC (T7) usa "capturar def viva e aplicar 2 edições exatas" em vez de colar 120 linhas — mais fiel e menos sujeito a erro de transcrição. ✔
- **Consistência de nomes:** `ocorrenciasSemanaisNoMes`, `recorrente_frequencia`, `contas_pagar_modelo_venc_uniq`, `onConflict 'recorrente_modelo_id,data_vencimento'` usados de forma idêntica entre tarefas. ✔
