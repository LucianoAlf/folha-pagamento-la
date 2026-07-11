# Folha por Conta Pagadora - Fatia B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a experiencia mensal de conciliacao da folha por conta pagadora, com uma pessoa por linha, edicao lossless em desktop/mobile e progresso real vindo do preflight.

**Architecture:** A Fatia B e frontend puro sobre a fundacao da Fatia A. `App.tsx` hospeda um modo secundario `Folha | Contas pagadoras` dentro de Lancamentos; um painel focado carrega contas e preflight, seletores puros consolidam as fatias por pessoa e um modal responsivo edita a matriz sem alterar totais. Toda gravacao passa por `folha_rateio_contas_salvar`, preservando `lancamento_id`, metadados estruturados e observacoes; depois do save, a lista de lancamentos e o preflight sao recarregados.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Supabase JS RPC, componentes de `components/UI.tsx`, `node:test`, Agent Browser.

---

## Escopo travado

- Frontend puro. Nenhuma migration, trigger, RPC ou Edge Function.
- Contas pagadoras sao dinamicas, vindas de `financeiro_contas_bancarias` ativas. Existem quatro hoje, mas o codigo nao fixa esse numero.
- A experiencia usa os termos `A conciliar`, `Parcial` e `Conciliado`; nao chama a distribuicao de pagamento de rateio de custo/DRE.
- A matriz valida centavos por `categoria + componente`, nao apenas o total liquido da pessoa.
- `lancamento_id`, `detalhamento`, `observacao` e `__bistro` nunca sao descartados ou fundidos silenciosamente.
- Copia do mes anterior nao entra nesta entrega. Uma evolucao futura podera copiar proporcoes, nunca valores absolutos.
- Fechamento financeiro, Contas a Pagar e aviso WhatsApp permanecem fora de escopo.

## Estrutura de arquivos

- Create: `components/folha-rateio/folhaRateioSelectors.ts` - modelo de apresentacao, centavos, consolidacao, draft, validacao e payload lossless.
- Create: `components/folha-rateio/folhaRateioSelectors.test.ts` - provas de consolidacao, categorias multiplas, centavos, metadados e contas dinamicas.
- Create: `components/folha-rateio/FolhaRateioContasPanel.tsx` - progresso, busca, filtro e lista consolidada.
- Create: `components/folha-rateio/FolhaRateioContasModal.tsx` - matriz desktop, blocos mobile, ancoras protegidas e save.
- Create: `components/folha-rateio/FolhaRateioContasPanel.visual.test.ts` - contrato estatico de tokens, responsividade e porta unica.
- Modify: `services/folhaRateioService.ts` - completar mensagens amigaveis sem criar outra porta de escrita.
- Modify: `types/folhaRateio.ts` - tipos de UI compartilhados apenas quando usados por service e componentes.
- Modify: `App.tsx` - modo secundario dentro de Lancamentos e refresh apos save.

---

### Task 1: Especificar o dominio puro da conciliacao

**Files:**
- Create: `components/folha-rateio/folhaRateioSelectors.test.ts`
- Create: `components/folha-rateio/folhaRateioSelectors.ts`

- [ ] **Step 1: Escrever os testes que descrevem a lista consolidada**

Criar fixtures com Ana em tres fatias, Anne em duas categorias, Jeremias dividido entre EMLA/Kids e uma linha com `detalhamento.__bistro`.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFolhaRateioPessoas,
  buildFolhaRateioDraft,
  buildFolhaRateioPayload,
  validateFolhaRateioDraft,
} from './folhaRateioSelectors.ts';

const contas = [
  { id: 'emla', apelido: 'EMLA CG Santander 1534', ativo: true, empresa: { id: 'e1', nome: 'EMLA CG', ativo: true, unidade: { codigo: 'cg' } } },
  { id: 'kids', apelido: 'Kids CG Santander 1534', ativo: true, empresa: { id: 'e2', nome: 'Kids CG', ativo: true, unidade: { codigo: 'cg' } } },
  { id: 'rec', apelido: 'Recreio Santander 1534', ativo: true, empresa: { id: 'e3', nome: 'Recreio', ativo: true, unidade: { codigo: 'rec' } } },
  { id: 'bar', apelido: 'Barra Santander 1534', ativo: true, empresa: { id: 'e4', nome: 'Barra', ativo: true, unidade: { codigo: 'bar' } } },
] as any[];

const ana = [
  { id: 1, folha_id: 17, colaborador_id: 2, categoria: 'staff_rateado', unidade: 'rec', conta_pagadora_id: 'rec', salario: 800, bonus: 250, comissao: 0, passagem: 0, reembolso: 0, inss: 0, descontos: 0, total: 1050, colaboradores: { id: 2, nome: 'Ana Paula', funcao: 'RH/DP' } },
  { id: 2, folha_id: 17, colaborador_id: 2, categoria: 'staff_rateado', unidade: 'bar', conta_pagadora_id: 'bar', salario: 700, bonus: 250, comissao: 0, passagem: 0, reembolso: 0, inss: 0, descontos: 0, total: 950, colaboradores: { id: 2, nome: 'Ana Paula', funcao: 'RH/DP' } },
  { id: 3, folha_id: 17, colaborador_id: 2, categoria: 'staff_rateado', unidade: 'cg', conta_pagadora_id: null, salario: 1250, bonus: 200, comissao: 0, passagem: 250, reembolso: 0, inss: 200.68, descontos: 0, total: 1499.32, detalhamento: { __bistro: { valor: 0, ref_ym: '2026-07' } }, colaboradores: { id: 2, nome: 'Ana Paula', funcao: 'RH/DP' } },
] as any[];

test('consolida uma pessoa e calcula chips e estado parcial', () => {
  const [pessoa] = buildFolhaRateioPessoas(ana, contas);
  assert.equal(pessoa.nome, 'Ana Paula');
  assert.equal(pessoa.totalCentavos, 349932);
  assert.equal(pessoa.status, 'parcial');
  assert.deepEqual(pessoa.contas.map((item) => [item.contaId, item.totalCentavos]), [
    ['rec', 105000],
    ['bar', 95000],
  ]);
});

test('mantem categorias distintas da mesma pessoa', () => {
  const rows = [
    { ...ana[0], id: 10, colaborador_id: 9, categoria: 'staff_rateado', total: 100 },
    { ...ana[0], id: 11, colaborador_id: 9, categoria: 'equipe_operacional', total: 80 },
  ] as any[];
  const [pessoa] = buildFolhaRateioPessoas(rows, contas);
  assert.deepEqual(pessoa.categorias.map((item) => item.categoria), ['staff_rateado', 'equipe_operacional']);
});
```

- [ ] **Step 2: Rodar os testes e confirmar a falha inicial**

Run: `node --test components/folha-rateio/folhaRateioSelectors.test.ts`

Expected: FAIL porque o modulo ainda nao existe.

- [ ] **Step 3: Implementar tipos e consolidacao em centavos**

Implementar em `folhaRateioSelectors.ts`:

```ts
import type { Colaborador, CollaboratorDepartment, Lancamento } from '../../types.ts';
import type { FolhaContaPagadora, FolhaRateioFatiaInput } from '../../types/folhaRateio.ts';

export const RATEIO_COMPONENTES = [
  'salario', 'bonus', 'comissao', 'reembolso', 'passagem', 'inss', 'descontos',
] as const;

export type RateioComponente = (typeof RATEIO_COMPONENTES)[number];
export type FolhaRateioStatus = 'a_conciliar' | 'parcial' | 'conciliado';

export const toCents = (value: number) => Math.round((Number(value) || 0) * 100);
export const fromCents = (value: number) => value / 100;

export function hasProtectedRateioMetadata(lancamento: Lancamento): boolean {
  const detalhe = lancamento.detalhamento && Object.keys(lancamento.detalhamento).length > 0;
  return Boolean(detalhe || lancamento.observacao?.trim());
}
```

`buildFolhaRateioPessoas` deve:

1. agrupar por `colaborador_id`;
2. manter categorias separadas na ordem `staff_rateado`, `equipe_operacional`, `professores`;
3. somar todos os componentes em centavos;
4. montar chips apenas para contas atribuidas;
5. marcar `a_conciliar` quando nenhuma linha tem conta, `parcial` quando parte tem conta e `conciliado` quando todas tem conta ativa/coerente no lookup;
6. ordenar pessoas por nome sem acento.

- [ ] **Step 4: Rodar os testes de consolidacao**

Run: `node --test components/folha-rateio/folhaRateioSelectors.test.ts`

Expected: PASS nos testes de lista e categorias.

- [ ] **Step 5: Commitar o dominio de leitura**

```bash
git add components/folha-rateio/folhaRateioSelectors.ts components/folha-rateio/folhaRateioSelectors.test.ts
git commit -m "feat(folha): consolidar conciliacao por conta pagadora"
```

---

### Task 2: Construir draft e payload lossless

**Files:**
- Modify: `components/folha-rateio/folhaRateioSelectors.ts`
- Modify: `components/folha-rateio/folhaRateioSelectors.test.ts`

- [ ] **Step 1: Escrever testes para centavos, ancoras e conflitos de metadados**

Adicionar testes que provem:

```ts
test('bloqueia diferenca de um centavo por categoria e componente', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  draft.categorias[0].porConta.emla.salario = 274999;
  const validation = validateFolhaRateioDraft(draft);
  assert.equal(validation.valid, false);
  assert.equal(validation.diferencas[0].componente, 'salario');
  assert.equal(validation.diferencas[0].restanteCentavos, 1);
});

test('preserva lancamento protegido em uma conta escolhida e cria novas fatias sem id', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  draft.categorias[0].porConta.emla.salario = 125000;
  draft.categorias[0].porConta.emla.bonus = 20000;
  draft.categorias[0].porConta.emla.passagem = 25000;
  draft.categorias[0].porConta.emla.inss = 20068;
  draft.ancoras[3] = 'emla';
  const payload = buildFolhaRateioPayload(draft);
  assert.equal(payload.find((fatia) => fatia.conta_pagadora_id === 'emla')?.lancamento_id, 3);
});

test('bloqueia duas ancoras protegidas na mesma categoria e conta', () => {
  const protectedRows = [
    { ...ana[0], id: 20, conta_pagadora_id: null, observacao: 'origem A' },
    { ...ana[0], id: 21, conta_pagadora_id: null, detalhamento: { origem: 'B' } },
  ] as any[];
  const draft = buildFolhaRateioDraft(protectedRows, contas);
  draft.ancoras[20] = 'rec';
  draft.ancoras[21] = 'rec';
  assert.match(validateFolhaRateioDraft(draft).message || '', /detalhes.*mesma conta/i);
});

test('nao fixa quatro contas no draft', () => {
  const draft = buildFolhaRateioDraft(ana, contas.slice(0, 3));
  assert.deepEqual(Object.keys(draft.categorias[0].porConta), ['emla', 'kids', 'rec']);
});
```

- [ ] **Step 2: Rodar e confirmar que os novos testes falham**

Run: `node --test components/folha-rateio/folhaRateioSelectors.test.ts`

Expected: FAIL nas funcoes de draft ainda ausentes.

- [ ] **Step 3: Implementar a representacao lossless**

O draft deve guardar:

```ts
export type FolhaRateioDraft = {
  folhaId: number;
  colaboradorId: number;
  contas: FolhaContaPagadora[];
  categorias: Array<{
    categoria: CollaboratorDepartment;
    totais: Record<RateioComponente, number>;
    porConta: Record<string, Record<RateioComponente, number>>;
    sourceIds: number[];
  }>;
  ancoras: Record<number, string>;
  protegidos: Array<{ lancamentoId: number; categoria: CollaboratorDepartment; label: string }>;
};
```

Regras obrigatorias do builder/payload:

- Valores do draft sao centavos inteiros.
- Linhas ja atribuidas preenchem sua conta e preservam o proprio ID como ancora.
- Linhas sem conta nao sao inferidas; aparecem como valor restante.
- Uma linha protegida sem conta exige escolha explicita em `ancoras`.
- Uma conta/categoria pode receber no maximo uma ancora protegida.
- Fatia de destino que reutiliza uma ancora recebe seu `lancamento_id`; fatias adicionais recebem `null`.
- Uma fatia totalmente zerada nao e enviada.
- Cada categoria/componente precisa fechar exatamente com `totais`.
- O payload final usa `fromCents` e segue `FolhaRateioFatiaInput`.

- [ ] **Step 4: Rodar todos os testes do seletor**

Run: `node --test components/folha-rateio/folhaRateioSelectors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commitar validacao e payload**

```bash
git add components/folha-rateio/folhaRateioSelectors.ts components/folha-rateio/folhaRateioSelectors.test.ts
git commit -m "feat(folha): preservar origem no rateio por conta"
```

---

### Task 3: Entregar painel de progresso e lista consolidada

**Files:**
- Create: `components/folha-rateio/FolhaRateioContasPanel.tsx`
- Modify: `services/folhaRateioService.ts`

- [ ] **Step 1: Criar o componente com contrato de dados explicito**

```ts
type FolhaRateioContasPanelProps = {
  folhaId: number;
  lancamentos: Lancamento[];
  onLancamentosChanged: () => Promise<void>;
};
```

O painel deve carregar em paralelo `fetchFolhaContasPagadoras()` e `fetchFolhaRateioPreflight(folhaId)`, sem consultar ou escrever diretamente em `lancamentos_folha`.

- [ ] **Step 2: Implementar progresso honesto**

Exibir em um `Card` do design system:

- `pessoas_total - pessoas_pendentes` conciliadas;
- `pessoas_pendentes` pendentes;
- `fatias_sem_conta`, `incoerencias_fiscais` e `conflitos_chave` quando maiores que zero;
- `diferenca` formatada;
- barra percentual baseada em pessoas, com zero protegido.

Usar somente `bg-surface`, `bg-surface-2`, `border-line`, `text-primary`, `text-secondary`, `text-muted`, `bg-accent`, `success` e `danger`.

- [ ] **Step 3: Implementar busca, filtro e cards de pessoa**

Filtros:

```ts
type FolhaRateioFiltro = 'todos' | 'pendentes';
```

Cada pessoa mostra nome, funcao, categorias, total consolidado, chips com subtotais por conta e badge:

- `A conciliar` para `a_conciliar`;
- `Parcial` para `parcial`;
- `Conciliado` para `conciliado`.

A acao chama `setEditingPessoa(pessoa)`. Nao renderizar tres linhas separadas para Ana.

- [ ] **Step 4: Tratar loading, vazio e erro**

Usar `LoadingSpinner`, `ErrorState`, `Card`, `Badge` e `Button` existentes. O retry recarrega contas e preflight. O vazio deve distinguir folha sem lancamentos de busca sem resultado.

- [ ] **Step 5: Commitar painel de leitura**

```bash
git add components/folha-rateio/FolhaRateioContasPanel.tsx services/folhaRateioService.ts
git commit -m "feat(folha): listar conciliacao por conta pagadora"
```

---

### Task 4: Implementar modal desktop e mobile

**Files:**
- Create: `components/folha-rateio/FolhaRateioContasModal.tsx`
- Modify: `components/folha-rateio/FolhaRateioContasPanel.tsx`
- Modify: `components/folha-rateio/folhaRateioSelectors.ts`
- Test: `components/folha-rateio/folhaRateioSelectors.test.ts`

- [ ] **Step 1: Criar modal com draft isolado**

```ts
type FolhaRateioContasModalProps = {
  isOpen: boolean;
  pessoa: FolhaRateioPessoa | null;
  contas: FolhaContaPagadora[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};
```

Ao abrir, criar um novo draft a partir de `pessoa.lancamentos`. Ao fechar sem salvar, descartar o draft. Nunca alterar o array de `App.tsx` de forma otimista antes da RPC responder.

- [ ] **Step 2: Implementar matriz desktop**

Para cada categoria, renderizar um bloco independente. Linhas sao componentes; colunas sao contas dinamicas; ultima coluna e o total original imutavel. Cada input monetario:

- converte texto para centavos;
- atualiza apenas a celula atual;
- mostra restante da linha;
- usa `aria-label` com componente, conta e categoria;
- nunca absorve diferenca automaticamente.

O cabecalho da categoria mostra o subtotal e os chips das contas atuais.

- [ ] **Step 3: Implementar blocos mobile**

Em `lg:hidden`, renderizar um bloco por conta com os campos dos componentes e subtotal. Em `hidden lg:block`, renderizar a matriz. O rodape do modal permanece visivel com:

- total da pessoa;
- total distribuido;
- diferenca;
- botao Salvar.

Nao usar largura minima que provoque scroll horizontal da pagina.

- [ ] **Step 4: Implementar preservacao explicita de detalhes**

Para cada `protegido` ainda sem ancora, mostrar um `CustomSelect` com o rotulo `Manter detalhes desta fatia em`. As opcoes sao contas ativas. Mostrar a origem pelo nome da categoria e pelo resumo seguro do metadado, sem despejar JSON.

Se duas ancoras protegidas da mesma categoria escolherem a mesma conta, mostrar erro e bloquear Salvar. Linhas ja atribuidas mantem a ancora atual, mas podem ser movidas explicitamente.

- [ ] **Step 5: Implementar sugestoes confirmaveis**

Quando todas as linhas da categoria forem sem conta e a unidade atual for exclusivamente `rec` ou `bar`, mostrar `Aplicar sugestao Recreio/Barra`. O clique preenche a matriz; a sugestao nunca roda automaticamente. Para `cg`, nunca sugerir EMLA ou Kids.

- [ ] **Step 6: Salvar somente pela RPC**

```ts
const validation = validateFolhaRateioDraft(draft);
if (!validation.valid) return;
await saveFolhaRateio({
  folhaId: draft.folhaId,
  colaboradorId: draft.colaboradorId,
  fatias: buildFolhaRateioPayload(draft),
});
await onSaved();
```

Desabilitar Salvar durante request e enquanto houver diferenca, ancora faltante ou conflito. Exibir a mensagem amigavel do service sem esconder a causa.

- [ ] **Step 7: Testar o payload de um caso simples e um protegido**

Run: `node --test components/folha-rateio/folhaRateioSelectors.test.ts`

Expected: PASS, incluindo diferenca de R$ 0,01 e metadados.

- [ ] **Step 8: Commitar modal responsivo**

```bash
git add components/folha-rateio/FolhaRateioContasModal.tsx components/folha-rateio/FolhaRateioContasPanel.tsx components/folha-rateio/folhaRateioSelectors.ts components/folha-rateio/folhaRateioSelectors.test.ts
git commit -m "feat(folha): editar divisao por conta pagadora"
```

---

### Task 5: Integrar como modo secundario de Lancamentos

**Files:**
- Modify: `App.tsx`
- Create: `components/folha-rateio/FolhaRateioContasPanel.visual.test.ts`

- [ ] **Step 1: Escrever teste estatico do invólucro**

O teste deve ler `App.tsx` e o painel para provar:

```ts
assert.match(appSource, /FolhaRateioContasPanel/);
assert.match(appSource, /contas_pagadoras/);
assert.doesNotMatch(panelSource, /\.from\(['"]lancamentos_folha['"]\)\.(insert|update|delete)/);
assert.match(panelSource, /bg-surface/);
assert.match(modalSource, /lg:hidden/);
assert.match(modalSource, /hidden lg:block/);
```

- [ ] **Step 2: Adicionar estado do modo secundario**

Dentro da aba `lancamentos`, criar:

```ts
type LancamentosView = 'folha' | 'contas_pagadoras';
const [lancamentosView, setLancamentosView] = useState<LancamentosView>('folha');
```

Renderizar um segmented control do design system visual existente com rotulos `Folha do mes` e `Contas pagadoras`. Nao adicionar uma sexta aba principal nem item na sidebar/bottom nav.

- [ ] **Step 3: Preservar integralmente a tela existente**

Envolver o conteudo atual de Lancamentos em `lancamentosView === 'folha'`. No outro modo, renderizar:

```tsx
<FolhaRateioContasPanel
  folhaId={folhaAtual.id}
  lancamentos={lancamentos}
  onLancamentosChanged={async () => {
    await refetchLancamentosSilent();
  }}
/>
```

O filtro de unidade e os botoes de criar/duplicar/importar continuam apenas no modo Folha.

- [ ] **Step 4: Rodar teste estatico e typecheck**

Run:

```bash
node --test components/folha-rateio/*.test.ts
npm run typecheck
```

Expected: todos verdes.

- [ ] **Step 5: Commitar integracao**

```bash
git add App.tsx components/folha-rateio/FolhaRateioContasPanel.visual.test.ts
git commit -m "feat(folha): integrar conciliacao de contas pagadoras"
```

---

### Task 6: Regressao automatizada e acabamento visual

**Files:**
- Modify only if a failure requires it: `components/folha-rateio/*`, `App.tsx`, `services/folhaRateioService.ts`, `types/folhaRateio.ts`

- [ ] **Step 1: Rodar a suite completa**

Run: `node --test`

Expected: 162 testes atuais + novos testes da Fatia B, zero falhas.

- [ ] **Step 2: Rodar typecheck e build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: ambos exit 0.

- [ ] **Step 3: Verificar o diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git diff --name-only origin/main...HEAD
```

Expected: somente frontend/types/service/testes/plano da Fatia B; nenhuma migration, Edge Function, Contas a Pagar ou WhatsApp.

- [ ] **Step 4: Revisar contraste e semantica**

Buscar cores fixas e termos conflitantes:

```bash
rg -n "bg-white|text-gray|#[0-9a-fA-F]{3,8}|Rateado|0 rateados" components/folha-rateio App.tsx
```

Expected: nenhuma cor fixa; os estados visiveis usam `A conciliar`, `Parcial`, `Conciliado`.

- [ ] **Step 5: Commitar correcoes de acabamento, se existirem**

```bash
git add App.tsx components/folha-rateio services/folhaRateioService.ts types/folhaRateio.ts
git commit -m "test(folha): validar conciliacao por conta pagadora"
```

---

### Task 7: Agent Browser e QA real controlado

**Files:**
- No code changes unless a verified defect is found.

- [ ] **Step 1: Subir preview local em porta livre**

Run: `npm run dev -- --host 127.0.0.1 --port 3002`

Expected: Vite serving the feature worktree.

- [ ] **Step 2: Smoke desktop light/dark**

No Agent Browser:

1. abrir Folha de Pagamento e julho/2026;
2. abrir Lancamentos > Contas pagadoras;
3. confirmar uma linha por pessoa;
4. buscar Ana e conferir total R$ 3.499,32;
5. abrir modal e conferir matriz, categorias, contas e diferencas;
6. alternar light/dark e verificar contraste, modal e rodape;
7. nao salvar dados ficticios.

- [ ] **Step 3: Smoke mobile responsivo**

Verificar em largura mobile:

1. o modo secundario cabe sem sobrepor as cinco abas principais;
2. lista encosta nas margens padrao do app;
3. modal usa blocos verticais, sem overflow horizontal;
4. rodape de totais fica acima do bottom nav;
5. teclado/campos nao escondem a acao Salvar.

- [ ] **Step 4: QA real representativo com Rose/Ana**

Salvar somente casos reais autorizados, nesta ordem:

1. colaborador simples de conta unica sem metadado;
2. Ana dividida entre varias contas;
3. Jeremias entre EMLA CG e Kids CG;
4. pessoa com mais de uma categoria;
5. pessoa com `detalhamento` ou observacao protegida.

Depois de cada save, confirmar:

- preflight atualizado;
- total da pessoa intacto;
- total da folha intacto;
- `lancamento_id` protegido preservado;
- somente a distribuicao das fatias mudou.

Nao usar a implementacao para forcar as 67 pessoas a zero durante o smoke. A conciliacao completa e trabalho operacional real de Rose/Ana antes da Fatia C.

- [ ] **Step 5: Preparar PR draft e parar**

Push da branch e PR draft com:

- lista honesta de todos os arquivos;
- confirmacao de escrita apenas via RPC;
- resultados dos gates;
- screenshots desktop/mobile, claro/escuro;
- casos reais testados e qualquer pendencia restante no preflight.

Nao mergear e nao iniciar a Fatia C antes da auditoria de codigo, banco vivo e QA real.

---

## Self-review do plano

- Cobertura da spec: lista consolidada, chips, tres estados, categorias multiplas, matriz desktop, blocos mobile, sugestoes confirmadas, centavos, metadados e preflight estao mapeados.
- Escopo: nenhuma migration, fechamento, Contas a Pagar, Maria ou copia de valores anteriores.
- Porta de escrita: somente `saveFolhaRateio`; nenhuma escrita direta.
- Contratos: `lancamento_id` e obrigatorio no draft/payload para preservar origem; contas sao dinamicas.
- QA: smokes nao criam dados ficticios e nao tratam a reconciliacao operacional completa como teste descartavel.
