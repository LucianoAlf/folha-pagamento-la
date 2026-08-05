# RH Onboarding Exclusion and Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar exclusão definitiva e segura de onboardings, aprovação atômica de candidatos sem colaboradores duplicados e reconciliação controlada dos duplicados atuais.

**Architecture:** Duas RPCs públicas transacionais (`rh_onboarding_excluir_definitivo` e `rh_candidato_aprovar`) e um helper SQL privado concentram autorização, validação e materialização. O React apenas coleta confirmação, apresenta conflito de CPF e atualiza a tela após respostas confirmadas. A limpeza produtiva permanece num script operacional separado, seguido por índice único de CPF normalizado.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL, Supabase JS, React 19, TypeScript 5.8, Node test runner, PostgreSQL 17 efêmero via Docker, Vite 6.

---

## Mapa de arquivos

- Create: `supabase/migrations/20260805_2_rh_onboarding_operacoes.sql` — helper privado, criação/aprovação atômica e exclusão definitiva.
- Create: `supabase/migrations/20260805_3_colaboradores_cpf_unico.sql` — índice único parcial, aplicado somente após a reconciliação.
- Create: `supabase/migrations/rh_onboarding_operacoes.test.mjs` — contrato estático das migrations e do script operacional.
- Create: `supabase/tests/rh_onboarding_operacoes_fixture.sql` — cenários comportamentais dentro de transação revertida.
- Create: `supabase/tests/run_rh_onboarding_operacoes_fixture.mjs` — PostgreSQL 17 efêmero, aplicação da migration real e prova pós-rollback.
- Create: `scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql` — preflight, guardas e reconciliação única de Adriana/Vitória.
- Modify: `types/rh.ts` — payloads e respostas discriminadas das RPCs.
- Modify: `services/rhJornadaService.ts` — chamadas RPC, tradução de erros e templates elegíveis.
- Create: `services/rhJornadaOnboarding.operacional.test.mjs` — contrato do serviço e ausência do fluxo antigo multipartes.
- Modify: `components/rh-jornada/candidates/CandidateApprovalModal.tsx` — confirmação explícita de reutilização por CPF.
- Modify: `components/rh-jornada/tabs/CandidatosTab.tsx` — templates elegíveis e tratamento da resposta discriminada.
- Modify: `components/rh-jornada/tabs/OnboardingTab.tsx` — modal de exclusão digitada, estados de salvamento e seleção pós-exclusão.
- Create: `components/rh-jornada/tabs/OnboardingTab.operacional.test.mjs` — contrato visual/funcional da ação destrutiva.
- Create: `components/rh-jornada/candidates/CandidateApprovalModal.operacional.test.mjs` — contrato visual do conflito de CPF.

## Task 1: Fixar o contrato SQL antes da implementação

**Files:**
- Create: `supabase/migrations/rh_onboarding_operacoes.test.mjs`
- Test: `supabase/migrations/rh_onboarding_operacoes.test.mjs`

- [ ] **Step 1: Escrever o teste inicialmente vermelho**

Criar o teste com leitura das duas migrations e do script operacional, incluindo estas asserções centrais:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const operations = readFileSync(new URL('./20260805_2_rh_onboarding_operacoes.sql', import.meta.url), 'utf8');
const uniqueness = readFileSync(new URL('./20260805_3_colaboradores_cpf_unico.sql', import.meta.url), 'utf8');
const reconcile = readFileSync(new URL('../../scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql', import.meta.url), 'utf8');

test('exclusao definitiva e atomica e remove espelhos da agenda', () => {
  assert.match(operations, /function public\.rh_onboarding_excluir_definitivo\s*\(\s*p_processo_id uuid\s*,\s*p_confirmacao_titulo text/i);
  assert.match(operations, /for update/i);
  assert.match(operations, /v_processo\.tipo\s*<>\s*'onboarding'/i);
  assert.match(operations, /v_processo\.status\s*=\s*'concluido'/i);
  assert.match(operations, /delete from public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_etapa'/i);
  assert.match(operations, /delete from public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_processo'/i);
  assert.match(operations, /delete from public\.rh_processos/i);
});

test('aprovacao valida template e CPF antes de escrever', () => {
  assert.match(operations, /function public\.rh_candidato_aprovar/i);
  assert.match(operations, /pg_advisory_xact_lock/i);
  assert.match(operations, /jsonb_build_object\s*\(\s*'status'\s*,\s*'cpf_existente'/i);
  assert.match(operations, /rh_onboarding_materializar/i);
  assert.doesNotMatch(operations, /grant execute on function public\.rh_onboarding_materializar[\s\S]*authenticated/i);
});

test('ACLs fecham funcoes para public e anon', () => {
  for (const signature of ['rh_onboarding_excluir_definitivo(uuid, text)', 'rh_candidato_aprovar(jsonb, integer)']) {
    assert.match(operations, new RegExp(`revoke all on function public\\.${signature.replace(/[().]/g, '\\$&')} from public, anon`, 'i'));
  }
});

test('CPF unico e criado somente na migration posterior', () => {
  assert.doesNotMatch(operations, /create unique index/i);
  assert.match(uniqueness, /create unique index[\s\S]*regexp_replace\s*\(\s*cpf\s*,\s*'\\D'/i);
  assert.match(reconcile, /REFUSED:[\s\S]*vinculo novo/i);
});
```

- [ ] **Step 2: Executar e comprovar a falha esperada**

Run: `node --test supabase/migrations/rh_onboarding_operacoes.test.mjs`

Expected: FAIL por ausência de `20260805_2_rh_onboarding_operacoes.sql`.

- [ ] **Step 3: Commitar apenas o teste vermelho**

```powershell
git add -- supabase/migrations/rh_onboarding_operacoes.test.mjs
git commit -m "test: fixar contrato das operacoes de onboarding RH"
```

## Task 2: Implementar as operações transacionais do banco

**Files:**
- Create: `supabase/migrations/20260805_2_rh_onboarding_operacoes.sql`
- Test: `supabase/migrations/rh_onboarding_operacoes.test.mjs`

- [ ] **Step 1: Criar normalização de CPF e helper privado de onboarding**

Implementar `rh_cpf_normalizar(text)` como SQL immutable que retorna `nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '')`. Implementar `rh_onboarding_materializar(jsonb, integer, uuid)` em PL/pgSQL com `security definer set search_path = public, pg_temp`; validar template ativo, tipo `onboarding` e existência de pelo menos uma `rh_template_etapas` antes de inserir processo, participante, etapas, responsáveis, checklists e documentos.

O helper devolve o ID do processo e termina com ACL fechada:

```sql
revoke all on function public.rh_onboarding_materializar(jsonb, integer, uuid)
  from public, anon, authenticated;
```

- [ ] **Step 2: Implementar `rh_onboarding_excluir_definitivo`**

Usar a assinatura e os guardrails completos:

```sql
create or replace function public.rh_onboarding_excluir_definitivo(
  p_processo_id uuid,
  p_confirmacao_titulo text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_processo public.rh_processos%rowtype;
  v_etapas uuid[];
  v_tarefas_etapas integer := 0;
  v_tarefas_processo integer := 0;
begin
  if auth.uid() is null or not public.rh_is_admin_or_rh() then
    raise exception using errcode = '42501', message = 'Sem permissao para excluir onboarding.';
  end if;

  select * into v_processo
  from public.rh_processos
  where id = p_processo_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Onboarding nao encontrado.'; end if;
  if v_processo.tipo <> 'onboarding' then raise exception 'Somente onboarding pode ser excluido por esta operacao.'; end if;
  if v_processo.status = 'concluido' then raise exception 'Onboarding concluido exige manutencao administrativa.'; end if;
  if trim(coalesce(p_confirmacao_titulo, '')) <> v_processo.titulo then raise exception 'Titulo de confirmacao divergente.'; end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_etapas
  from public.rh_processo_etapas where processo_id = p_processo_id;

  delete from public.tarefas
  where vinculo_tipo = 'rh_etapa' and vinculo_id = any(v_etapas);
  get diagnostics v_tarefas_etapas = row_count;

  delete from public.tarefas
  where vinculo_tipo = 'rh_processo' and vinculo_id = p_processo_id;
  get diagnostics v_tarefas_processo = row_count;

  delete from public.rh_processos where id = p_processo_id;

  return jsonb_build_object(
    'processo_id', p_processo_id,
    'titulo', v_processo.titulo,
    'etapas', cardinality(v_etapas),
    'tarefas_removidas', v_tarefas_etapas + v_tarefas_processo
  );
end;
$$;
```

O schema produtivo já foi confirmado: `tarefas.vinculo_id` é `uuid`. Usar comparação UUID direta, sem cast da coluna que inutilize índice.

- [ ] **Step 3: Implementar `rh_onboarding_criar` e `rh_candidato_aprovar`**

`rh_onboarding_criar(p_payload jsonb)` autentica, chama o helper e devolve a linha de `rh_processos` como JSON.

`rh_candidato_aprovar(p_payload jsonb, p_reutilizar_colaborador_id integer default null)` deve:

```sql
v_cpf := public.rh_cpf_normalizar(p_payload ->> 'cpf');
if v_cpf is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_cpf, 0));
  select c.* into v_existente
  from public.colaboradores c
  where public.rh_cpf_normalizar(c.cpf) = v_cpf
  order by c.id
  limit 1
  for update;
end if;

if v_existente.id is not null and p_reutilizar_colaborador_id is null then
  return jsonb_build_object(
    'status', 'cpf_existente',
    'colaborador_existente', jsonb_build_object(
      'id', v_existente.id,
      'nome', v_existente.nome,
      'funcao', v_existente.funcao,
      'email', v_existente.email
    )
  );
end if;

if p_reutilizar_colaborador_id is not null
   and p_reutilizar_colaborador_id is distinct from v_existente.id then
  raise exception 'Cadastro confirmado nao corresponde ao CPF do candidato.';
end if;
```

Antes desse bloco, travar o candidato e validar o template solicitado. Depois, reutilizar `v_existente.id` ou inserir uma única linha em `colaboradores`; atualizar o candidato; materializar onboarding opcional; concluir o processo de recrutamento; devolver `status='aprovado'`, candidato, colaborador e onboarding. Qualquer exceção reverte a transação inteira.

- [ ] **Step 4: Aplicar ACLs explícitas**

```sql
revoke all on function public.rh_onboarding_excluir_definitivo(uuid, text) from public, anon;
revoke all on function public.rh_candidato_aprovar(jsonb, integer) from public, anon;
revoke all on function public.rh_onboarding_criar(jsonb) from public, anon;
grant execute on function public.rh_onboarding_excluir_definitivo(uuid, text) to authenticated, service_role;
grant execute on function public.rh_candidato_aprovar(jsonb, integer) to authenticated, service_role;
grant execute on function public.rh_onboarding_criar(jsonb) to authenticated, service_role;
```

- [ ] **Step 5: Rodar o contrato estático**

Run: `node --test supabase/migrations/rh_onboarding_operacoes.test.mjs`

Expected: testes das operações PASS; teste da migration de unicidade e script ainda FAIL até Task 3.

- [ ] **Step 6: Commitar a migration transacional**

```powershell
git add -- supabase/migrations/20260805_2_rh_onboarding_operacoes.sql supabase/migrations/rh_onboarding_operacoes.test.mjs
git commit -m "feat: tornar onboarding RH transacional"
```

## Task 3: Criar fixture comportamental e reconciliação protegida

**Files:**
- Create: `supabase/tests/rh_onboarding_operacoes_fixture.sql`
- Create: `supabase/tests/run_rh_onboarding_operacoes_fixture.mjs`
- Create: `scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql`
- Create: `supabase/migrations/20260805_3_colaboradores_cpf_unico.sql`

- [ ] **Step 1: Criar o harness PostgreSQL 17 efêmero**

Reusar a disciplina de `supabase/tests/run_dre_filtro_unidade_fixture.mjs`: container com nome aleatório, banco `rh_onboarding_fixture`, `ON_ERROR_STOP=1`, schema mínimo compatível, roles `anon/authenticated/service_role`, aplicação do arquivo real `20260805_2_rh_onboarding_operacoes.sql`, execução da fixture e `docker rm --force` em `finally` e sinais.

- [ ] **Step 2: Escrever os cenários da fixture com rollback**

O SQL deve recusar qualquer banco sem `app.rh_onboarding_fixture_guard=local_ci_only`, abrir `begin`, criar dados sentinela e comprovar:

```sql
-- template vazio não cria processo ou colaborador
-- CPF existente devolve status cpf_existente e zero escrita
-- confirmação explícita reutiliza o colaborador existente
-- template completo cria processo, etapas, checklist e documentos
-- exclusão remove processo, filhos, tarefa rh_processo e tarefas rh_etapa
-- título divergente e processo concluído não removem nada
rollback;
```

Após a execução, o harness consulta todos os IDs sentinela e exige soma `0`.

- [ ] **Step 3: Executar a fixture**

Run: `node supabase/tests/run_rh_onboarding_operacoes_fixture.mjs`

Expected: `PostgreSQL 17.x`, `rollback_sentinel_rows=0` e todos os cenários PASS.

- [ ] **Step 4: Criar o script operacional com falha fechada**

O script usa transação, trava os quatro colaboradores e aborta se os vínculos diferirem do snapshot esperado. Sequência:

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Adriana: candidato -> 107; excluir tarefa/processo vazio; excluir 109.
-- Vitória: candidato/processo/documentos -> 106; excluir 108.
-- As guardas verificam CPF normalizado igual, contagens exatas e ausência de
-- folha, férias, financeiro, DRE ou qualquer FK adicional antes de cada DELETE.

do $$
begin
  if exists (
    select 1 from public.colaboradores c
    where public.rh_cpf_normalizar(c.cpf) is not null
    group by public.rh_cpf_normalizar(c.cpf)
    having count(*) > 1
  ) then
    raise exception 'REFUSED: reconciliacao terminou com CPF duplicado.';
  end if;
end $$;

commit;
```

O texto `REFUSED: vinculo novo` deve aparecer nas guardas que detectam referências não previstas.

- [ ] **Step 5: Criar a migration posterior de unicidade**

```sql
create unique index if not exists colaboradores_cpf_normalizado_uidx
  on public.colaboradores ((public.rh_cpf_normalizar(cpf)))
  where public.rh_cpf_normalizar(cpf) is not null;
```

- [ ] **Step 6: Rodar contratos e fixture novamente**

Run: `node --test supabase/migrations/rh_onboarding_operacoes.test.mjs`

Run: `node supabase/tests/run_rh_onboarding_operacoes_fixture.mjs`

Expected: tudo PASS.

- [ ] **Step 7: Commitar testes, script e índice**

```powershell
git add -- supabase/tests/rh_onboarding_operacoes_fixture.sql supabase/tests/run_rh_onboarding_operacoes_fixture.mjs scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql supabase/migrations/20260805_3_colaboradores_cpf_unico.sql supabase/migrations/rh_onboarding_operacoes.test.mjs
git commit -m "test: cobrir exclusao e deduplicacao de onboarding"
```

## Task 4: Trocar o serviço frontend pelas RPCs

**Files:**
- Modify: `types/rh.ts`
- Modify: `services/rhJornadaService.ts`
- Create: `services/rhJornadaOnboarding.operacional.test.mjs`

- [ ] **Step 1: Escrever teste vermelho do serviço**

Asserir chamadas `supabase.rpc('rh_candidato_aprovar'...)`, `supabase.rpc('rh_onboarding_criar'...)` e `supabase.rpc('rh_onboarding_excluir_definitivo'...)`; exigir ausência de `api.createColaborador` dentro de `approveCandidate` e ausência de insert direto em `rh_processos` dentro de `createProcessFromTemplate` para onboarding.

- [ ] **Step 2: Adicionar tipos discriminados**

```ts
export interface RhExistingCollaboratorConflict {
  status: 'cpf_existente';
  colaborador_existente: Pick<Colaborador, 'id' | 'nome' | 'funcao' | 'email'>;
}

export interface RhCandidateApprovedResult {
  status: 'aprovado';
  candidate: RhCandidate;
  collaborator: Colaborador;
  onboardingProcess?: RhProcess | null;
}

export type RhCandidateApprovalResult = RhExistingCollaboratorConflict | RhCandidateApprovedResult;

export interface RhOnboardingDeletionResult {
  processo_id: string;
  titulo: string;
  etapas: number;
  tarefas_removidas: number;
}
```

Adicionar `reuseExistingCollaboratorId?: number | null` a `RhCandidateApprovalInput`.

- [ ] **Step 3: Implementar as chamadas RPC e templates elegíveis**

`approveCandidate` envia todo o input em `p_payload` e `reuseExistingCollaboratorId` em `p_reutilizar_colaborador_id`. `createProcessFromTemplate` usa `rh_onboarding_criar` quando `tipo==='onboarding'`. `deleteOnboarding` chama a RPC destrutiva.

Criar:

```ts
async fetchEligibleOnboardingTemplates(): Promise<RhTemplate[]> {
  const templates = (await this.fetchTemplates('onboarding')).filter((template) => template.ativo);
  const counts = await Promise.all(templates.map(async (template) => ({
    template,
    stages: await this.fetchTemplateStages(template.id),
  })));
  return counts.filter(({ stages }) => stages.length > 0).map(({ template }) => template);
}
```

- [ ] **Step 4: Rodar teste e typecheck**

Run: `node --test services/rhJornadaOnboarding.operacional.test.mjs`

Run: `npm run typecheck`

Expected: PASS e zero erros TypeScript.

- [ ] **Step 5: Commitar serviço e tipos**

```powershell
git add -- types/rh.ts services/rhJornadaService.ts services/rhJornadaOnboarding.operacional.test.mjs
git commit -m "refactor: consumir operacoes atomicas do onboarding RH"
```

## Task 5: Exibir conflito de CPF na aprovação

**Files:**
- Modify: `components/rh-jornada/candidates/CandidateApprovalModal.tsx`
- Modify: `components/rh-jornada/tabs/CandidatosTab.tsx`
- Create: `components/rh-jornada/candidates/CandidateApprovalModal.operacional.test.mjs`

- [ ] **Step 1: Escrever teste vermelho da UI**

Exigir textos `CPF já pertence a um colaborador`, `Usar cadastro existente e aprovar`, o campo `reuseExistingCollaboratorId` e uso de `fetchEligibleOnboardingTemplates` em `CandidatosTab`.

- [ ] **Step 2: Implementar resposta em duas fases**

Guardar `existingConflict` no modal. Na primeira resposta `cpf_existente`, manter o modal aberto e mostrar nome, função e e-mail encontrados. O botão final chama novamente `onConfirm` com `reuseExistingCollaboratorId` e só fecha quando `status==='aprovado'`.

Quando não houver template elegível, deixar `Criar onboarding agora` desmarcado/desabilitado e mostrar `Nenhum modelo com etapas está pronto para uso.`

- [ ] **Step 3: Rodar testes e typecheck**

Run: `node --test components/rh-jornada/candidates/CandidateApprovalModal.operacional.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commitar o fluxo de aprovação**

```powershell
git add -- components/rh-jornada/candidates/CandidateApprovalModal.tsx components/rh-jornada/tabs/CandidatosTab.tsx components/rh-jornada/candidates/CandidateApprovalModal.operacional.test.mjs
git commit -m "feat: confirmar reutilizacao de colaborador por CPF"
```

## Task 6: Adicionar exclusão definitiva à tela de Onboarding

**Files:**
- Modify: `components/rh-jornada/tabs/OnboardingTab.tsx`
- Create: `components/rh-jornada/tabs/OnboardingTab.operacional.test.mjs`

- [ ] **Step 1: Escrever teste vermelho da ação destrutiva**

Exigir ícone/ação `Excluir onboarding`, bloqueio para `concluido`, input com confirmação pelo título, chamada `rhJornadaService.deleteOnboarding` e atualização de `selectedProcessId` depois da exclusão.

- [ ] **Step 2: Implementar modal dedicado**

Usar `Modal`, não o `ConfirmDialog` simples, porque a confirmação precisa de texto digitado. Exibir título, colaborador, `total_etapas`, irreversibilidade e botão danger habilitado apenas quando a digitação for idêntica.

No sucesso:

```ts
const remaining = processes.filter((process) => process.id !== selectedProcess.id);
await rhJornadaService.deleteOnboarding(selectedProcess.id, confirmationTitle);
setSelectedProcessId(remaining[0]?.id ?? null);
await loadData();
```

Manter o modal aberto e mostrar erro se a RPC falhar.

- [ ] **Step 3: Filtrar templates elegíveis também no novo onboarding**

Trocar `fetchTemplates('onboarding')` por `fetchEligibleOnboardingTemplates()` e mostrar estado vazio acionável no modal quando nenhum modelo estiver pronto.

- [ ] **Step 4: Rodar testes e build**

Run: `node --test components/rh-jornada/tabs/OnboardingTab.operacional.test.mjs`

Run: `npm run typecheck`

Run: `npm run build`

Expected: PASS e build Vite concluído.

- [ ] **Step 5: Commitar a UI de exclusão**

```powershell
git add -- components/rh-jornada/tabs/OnboardingTab.tsx components/rh-jornada/tabs/OnboardingTab.operacional.test.mjs
git commit -m "feat: excluir onboarding definitivamente pela Jornada RH"
```

## Task 7: Verificação integrada, produção e publicação

**Files:**
- Verify: todos os arquivos anteriores

- [ ] **Step 1: Rodar a suíte relevante completa**

```powershell
node --test supabase/migrations/rh_onboarding_operacoes.test.mjs services/rhJornadaService.operacional.test.mjs services/rhJornadaOnboarding.operacional.test.mjs components/rh-jornada/candidates/CandidateApprovalModal.operacional.test.mjs components/rh-jornada/tabs/OnboardingTab.operacional.test.mjs
node supabase/tests/run_rh_onboarding_operacoes_fixture.mjs
npm run typecheck
npm run build
git diff --check
```

Expected: tudo PASS, rollback com zero sentinelas e diff sem whitespace inválido.

- [ ] **Step 2: Revisar segurança e diff**

Confirmar assinaturas/ACLs, `search_path`, nenhuma autorização para `anon`, helper privado sem grant, nenhuma credencial no diff e nenhuma alteração fora de Jornada RH/Agenda espelhada.

- [ ] **Step 3: Aplicar somente a migration de operações**

Aplicar `20260805_2_rh_onboarding_operacoes.sql` via migration Supabase. Em seguida, consultar `pg_proc`/`information_schema.routine_privileges` e executar um smoke autenticado com fixture descartável.

- [ ] **Step 4: Fazer preflight produtivo imediatamente antes da limpeza**

Reler os quatro colaboradores, todos os FKs que referenciam `colaboradores`, processos, documentos, etapas e tarefas. Comparar com as guardas do script. Se qualquer contagem divergir, não executar a reconciliação.

- [ ] **Step 5: Executar a reconciliação única e fazer readback**

Executar `scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql`. Confirmar: Adriana somente no cadastro 107 e onboarding correto; Vitória somente no cadastro 106 e onboarding válido; zero tarefa RH órfã; zero alteração em folha, férias, financeiro ou DRE.

- [ ] **Step 6: Aplicar o índice único posterior**

Somente após o readback com zero duplicidades, aplicar `20260805_3_colaboradores_cpf_unico.sql` e testar que uma inserção duplicada dentro de transação revertida falha com unique violation.

- [ ] **Step 7: Validar no Simple Browser**

Com usuário RH autenticado:

1. abrir Candidatos e Onboarding;
2. confirmar que template vazio não aparece como executável;
3. abrir/cancelar exclusão;
4. testar título incorreto;
5. excluir onboarding fixture e confirmar ausência na lista e Agenda;
6. aprovar candidato fixture com CPF existente e reutilização explícita;
7. aprovar candidato fixture com CPF novo e template completo;
8. abrir as etapas e todos os modais envolvidos;
9. limpar integralmente as fixtures.

- [ ] **Step 8: Commit final de evidências, push e publicação**

Registrar evidências sem dados pessoais sensíveis, conferir `git status`, fazer commit final se houver relatório de QA, `git push origin main`, acompanhar o deploy e repetir o smoke na URL publicada.

## Self-review

- Spec coverage: exclusão definitiva, Agenda, template vazio, aprovação atômica, conflito de CPF, ambos os pares duplicados, índice posterior, browser e produção estão mapeados.
- Placeholder scan: não há etapas abertas sem arquivo, comando ou resultado esperado.
- Type consistency: `reuseExistingCollaboratorId`, `p_reutilizar_colaborador_id`, `RhCandidateApprovalResult` e as três RPCs mantêm os mesmos nomes em serviço, UI e SQL.
