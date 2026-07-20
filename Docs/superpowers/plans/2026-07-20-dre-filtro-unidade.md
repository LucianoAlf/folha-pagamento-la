# DRE com Filtro de Unidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o rateio econômico da folha ao DRE e oferecer filtro Consolidado/CG/Recreio/Barra com reconciliação integral e paginação determinística.

**Architecture:** Uma migration nova recria a camada normalizada e as duas RPCs públicas. A camada normalizada atribui unidade, qualidade e motivo de ausência por fonte; `dre_consultar` separa base integral de linhas filtradas; `dre_detalhes` aplica o mesmo filtro e acrescenta unidade ao cursor. O frontend apenas consome esse contrato e mantém unidade como eixo independente de competência, regime e visão.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, React 19, Node test runner, Vite.

---

### Task 1: Fixar o contrato SQL com testes vermelhos

**Files:**
- Create: `supabase/migrations/dre_filtro_unidade.test.mjs`
- Reference: `supabase/migrations/20260719_1_dre_visual_consolidado.sql`

- [ ] **Step 1: Escrever o teste que exige a migration nova**

Criar um teste que leia `20260720_2_dre_filtro_unidade.sql`, extraia as três funções e exija:

```js
assert.match(consultar, /p_unidade\s+text\s+default\s+'consolidado'/i);
assert.match(detalhes, /p_fonte[\s\S]*p_unidade[\s\S]*p_cursor/i);
assert.match(normalizadas, /unidade_operacional\s+text/i);
assert.match(normalizadas, /qualidade_unidade\s+text/i);
assert.match(normalizadas, /motivo_sem_unidade\s+text/i);
assert.match(normalizadas, /colaborador_id\s+integer/i);
```

- [ ] **Step 2: Exigir seleção correta da folha e conservação do valor**

Adicionar asserções para `select distinct`, `folha_alocacao_dre_resolver`, join pela chave primária, Conta a Pagar específica, filtro de pagamento por linha e `valor_assinado_rateado`:

```js
assert.match(normalizadas, /select\s+distinct[\s\S]*fonte_identificador/i);
assert.match(normalizadas, /folha_alocacao_dre_resolver\s*\(/i);
assert.match(normalizadas, /lancamento_folha_id[\s\S]*componente[\s\S]*sequencia/i);
assert.match(normalizadas, /cp_folha\.conta_pagadora_id\s*=\s*d\.conta_pagadora_id_usada/i);
assert.match(normalizadas, /cp_folha\.status\s*=\s*'pago'/i);
assert.match(normalizadas, /valor_assinado_rateado\s+as\s+valor_origem/i);
```

- [ ] **Step 3: Exigir separação base/filtrada, resumo e cursor**

```js
assert.match(consultar, /linhas_base\s+as\s+materialized/i);
assert.match(consultar, /linhas_filtradas\s+as\s+materialized/i);
assert.match(consultar, /'sem_unidade_operacional'/i);
assert.match(consultar, /'folha_sem_alocacao'/i);
assert.match(consultar, /'cartao_nao_confirmado'/i);
assert.match(detalhes, /p_cursor->>'unidade_operacional'/i);
assert.match(detalhes, /'unidade_operacional'.*u\.unidade_operacional/is);
```

- [ ] **Step 4: Exigir ciclo seguro de funções e privilégios**

Verificar `DROP FUNCTION` na ordem detalhes → consulta → normalizador, ausência de `CASCADE`, allowlist e grants nas assinaturas novas.

- [ ] **Step 5: Rodar o teste e confirmar RED**

Run: `node --test supabase/migrations/dre_filtro_unidade.test.mjs`

Expected: FAIL porque `20260720_2_dre_filtro_unidade.sql` ainda não existe.

### Task 2: Implementar a migration do filtro de unidade

**Files:**
- Create: `supabase/migrations/20260720_2_dre_filtro_unidade.sql`
- Test: `supabase/migrations/dre_filtro_unidade.test.mjs`

- [ ] **Step 1: Criar os drops e o novo retorno normalizado**

Remover as assinaturas antigas sem `CASCADE` e declarar no `RETURNS TABLE`:

```sql
colaborador_id integer,
unidade_operacional text,
qualidade_unidade text,
motivo_sem_unidade text
```

- [ ] **Step 2: Implementar `folhas_alvo` e `folha_resolvida`**

Usar `UNION` entre a folha de competência e `SELECT DISTINCT` de `contas_pagar` pagas em Caixa. Executar o resolver lateralmente e rejuntar a classificação pela chave primária apenas para recuperar `conta_pagadora_id_usada`.

- [ ] **Step 3: Implementar a linha de folha por conta específica**

Posicionar `parametros` antes do lateral de Conta a Pagar e restringir o lateral ao mês quando `p_regime='caixa'`. Usar `valor_assinado_rateado` para origem e mapear os estados para unidade/qualidade/motivo.

- [ ] **Step 4: Mapear as outras três fontes**

Contas a Pagar usa centro/unidade com qualidade `aproximada_fiscal_pagadora`; Cartão usa centro da transação somente quando confirmado; Contas a Receber usa centro/unidade confirmado. Toda unidade fora de `cg|rec|bar` vira `null` com motivo.

- [ ] **Step 5: Implementar `dre_consultar`**

Validar a allowlist, materializar `linhas_base` e `linhas_filtradas`, manter cobertura/reconciliação na base e construir `sem_unidade_operacional` com totais gerais e por motivo.

- [ ] **Step 6: Implementar `dre_detalhes`**

Acrescentar `p_unidade` entre fonte e cursor, filtrar unidade e usar `unidade_operacional` na comparação, ordenação e `next_cursor`.

- [ ] **Step 7: Reaplicar privilégios e comentários**

O normalizador permanece executável apenas por `service_role`; as RPCs públicas ficam em `authenticated, service_role`; revogar `public, anon` nas assinaturas exatas.

- [ ] **Step 8: Rodar RED → GREEN**

Run: `node --test supabase/migrations/dre_filtro_unidade.test.mjs supabase/migrations/dre_visual_consolidado.test.mjs`

Expected: os testes da migration nova e os testes legados passam juntos; o teste legado continua validando a fundação 2A sem ser enfraquecido.

### Task 3: Propagar o contrato pelo serviço e tipos

**Files:**
- Modify: `types/dre.ts`
- Modify: `services/dreService.ts`
- Modify: `services/dreService.test.mjs`

- [ ] **Step 1: Escrever o teste vermelho do serviço**

```js
assert.match(source, /p_unidade:\s*unidade/);
assert.match(source, /unidade:\s*DreUnidade/);
```

Run: `node --test services/dreService.test.mjs`

Expected: FAIL porque o serviço ainda não envia unidade.

- [ ] **Step 2: Criar os tipos**

Adicionar `DreUnidade`, `DreUnidadeOperacional`, `DreQualidadeUnidade`, `DreSemUnidadeMotivo`, o resumo por motivo e os novos campos em consulta, cursor e detalhe.

- [ ] **Step 3: Atualizar as duas chamadas RPC**

`fetchDreConsulta` recebe unidade; `fetchDreDetalhes` exige unidade nos argumentos. Ambas enviam `p_unidade`.

- [ ] **Step 4: Rodar o teste e typecheck**

Run: `node --test services/dreService.test.mjs && npm run typecheck`

Expected: PASS.

### Task 4: Criar seletores e UI do filtro

**Files:**
- Modify: `components/dre/dreSelectors.test.ts`
- Modify: `components/dre/dreSelectors.ts`
- Modify: `components/dre/DrePage.tsx`

- [ ] **Step 1: Escrever testes vermelhos para rótulos e motivos**

Exigir rótulos `Consolidado`, `CG`, `Recreio`, `Barra` e linhas de resumo fixas para os quatro motivos, preservando zeros.

Run: `node --experimental-strip-types --test components/dre/dreSelectors.test.ts`

Expected: FAIL porque os helpers não existem.

- [ ] **Step 2: Implementar helpers mínimos**

Criar `getDreUnidadeLabel` e `getDreSemUnidadeReasonRows` em `dreSelectors.ts`.

- [ ] **Step 3: Adicionar estado e controle de unidade**

Adicionar `unidade` com default `consolidado`, o quarto `SegmentedControl`, e incluir unidade nas dependências da consulta principal e de detalhes.

- [ ] **Step 4: Atualizar drill-down e cursor da UI**

Acrescentar unidade à chave React, mostrar unidade/qualidade e limpar detalhes/cursor quando unidade mudar.

- [ ] **Step 5: Exibir resumo sem unidade**

Na Reconciliação, mostrar totais de origem/resultado, linhas, colaboradores da folha e os quatro motivos, sempre a partir do bloco retornado pela RPC.

- [ ] **Step 6: Rodar testes e typecheck**

Run: `node --experimental-strip-types --test components/dre/dreSelectors.test.ts && npm run typecheck`

Expected: PASS.

### Task 5: Acrescentar fixture SQL executável em ambiente isolado

**Files:**
- Create: `supabase/tests/dre_filtro_unidade_fixture.sql`

- [ ] **Step 1: Criar teste transacional documentado**

O script inicia `BEGIN`, cria dados isolados com folha paga fora da competência e confirmação CG/REC/Barra, chama as RPCs, lança exceção se a partição ou cursor falhar e encerra com `ROLLBACK`. O cabeçalho proíbe execução em produção e orienta Postgres local/CI.

Estrutura obrigatória:

```sql
\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_setting('app.environment', true) = 'production' then
    raise exception 'fixture proibida em producao';
  end if;
end;
$$;

-- A preparação reutiliza uma folha de fixture marcada pelo próprio script,
-- cria uma confirmação com três fatias e desloca o pagamento para o mês seguinte.
-- As asserções chamam dre_consultar/dre_detalhes e usam raise exception
-- quando a soma ou o cursor não conservarem todas as fatias.

rollback;
```

- [ ] **Step 2: Validar sintaxe em Postgres local quando disponível**

Run: `supabase db lint --local` e, com a stack local pronta, `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dre_filtro_unidade_fixture.sql`.

Expected: lint sem erro e script encerrado com `ROLLBACK`. Se a stack local estiver indisponível, registrar o bloqueio sem aplicar migration remota.

### Task 6: Verificação final e preview

**Files:**
- Verify only.

- [ ] **Step 1: Rodar testes focados**

```powershell
node --test supabase/migrations/dre_filtro_unidade.test.mjs supabase/migrations/dre_visual_consolidado.test.mjs services/dreService.test.mjs
node --experimental-strip-types --test components/dre/dreSelectors.test.ts
```

- [ ] **Step 2: Rodar compilação**

```powershell
npm run typecheck
npm run build
git diff --check
```

- [ ] **Step 3: Revisar o diff contra a especificação**

Confirmar cada critério: valor rateado, folhas distintas, Caixa por conta, unidade por fonte, qualidade aproximada, base integral, cursor, assinaturas, privilégios, serviço e UI.

- [ ] **Step 4: Carregar o preview**

Iniciar `npm run dev -- --host 127.0.0.1 --port 3000`, abrir `http://127.0.0.1:3000/`, navegar ao DRE e verificar visualmente o controle de unidade, o estado filtrado e o resumo sem unidade.

- [ ] **Step 5: Parar para auditoria**

Não aplicar migration remotamente, não fazer merge e não fazer deploy. Entregar branch, commits, evidências de teste, limitações da fixture local e preview carregado.
