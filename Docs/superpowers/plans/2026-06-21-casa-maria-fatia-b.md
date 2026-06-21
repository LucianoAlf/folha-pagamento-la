# Casa da Maria — Fatia B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rose consegue logar e trabalhar amanhã em Contas a Pagar (lista + editar + pagar + Auditoria/Comparativo IA) sem migration grande — sistema confiável com erros visíveis.

**Architecture:** Correções pontuais no frontend (`saveNotas` + perfil Rose) e deploy da Edge Function `ai-contas-auditoria` com `upsert` (mesmo padrão do comparativo v16). Usuário Rose criado via Supabase Auth Admin + `user_profiles` com role `rh` (igual Ana). Sem schema novo.

**Tech Stack:** Vite + React 19 + TS, Supabase Auth + Edge Functions, MCP Supabase para deploy. **Sem framework de teste E2E** — smoke manual + `npm run typecheck` + `npm run build`.

**Spec:** `Docs/superpowers/specs/2026-06-21-casa-maria-contas-pagar-design.md` (§6.3 Fatia B)

**Pré-requisito do Alf:** e-mail da Rose (`ROSE_EMAIL`) e senha inicial temporária (ou convite).

---

## File Structure

**Criar:**
- `scripts/create-rose-user.mjs` — cria usuário Auth + `user_profiles` (one-shot, reutilizável)

**Modificar:**
- `App.tsx` — helper `isRose()`, defaults de nome/avatar/role para Rose
- `components/contas/ContasPagarPage.tsx` — `saveNotas` com checagem de erro + toast
- `supabase/functions/ai-contas-auditoria/index.ts` — já tem `upsert`; confirmar e deployar

**Deploy (remoto):**
- `ai-contas-auditoria` → Supabase project `ubdvtjbitozhkuvvqkxj`

---

## Task 1: Deploy `ai-contas-auditoria` (upsert cache)

**Files:**
- Verify: `supabase/functions/ai-contas-auditoria/index.ts` (~447–461)
- Deploy via MCP `deploy_edge_function` ou `npm run deploy:auditoria` (se script existir)

- [ ] **Step 1: Confirmar upsert no código local**

```typescript
const { data: inserted, error: insErr } = await supabase
  .from("contas_ai_insights")
  .upsert(
    {
      competencia_ym: competenciaYM,
      unidade,
      filtros: { categoriaId, comportamento, tipo },
      model,
      input_hash: inputHash,
      summary: parsed.resumo_executivo,
      response_json: parsed,
    },
    { onConflict: "input_hash" },
  )
  .select("*")
  .single();
```

- [ ] **Step 2: Deploy para produção**

Via MCP Supabase `deploy_edge_function`:
- `project_id`: `ubdvtjbitozhkuvvqkxj`
- `name`: `ai-contas-auditoria`
- `verify_jwt`: `false` (mesmo padrão do comparativo)
- Incluir `index.ts` + `../_shared/gemini.ts`

Ou adicionar em `package.json`:

```json
"deploy:auditoria": "npx supabase functions deploy ai-contas-auditoria --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt"
```

Run: `npm run deploy:auditoria` (se CLI autenticado) **ou** MCP deploy.

Expected: função ativa com `version` incrementada (ex.: v17+).

- [ ] **Step 3: Smoke remoto**

No app logado: Contas a Pagar → Auditoria → **Atualizar** duas vezes seguidas.

Expected: sem erro `duplicate key value violates unique constraint "contas_ai_insights_input_hash_key"`.

---

## Task 2: Corrigir `saveNotas` (erro visível)

**Files:**
- Modify: `components/contas/ContasPagarPage.tsx:173,461-507`

- [ ] **Step 1: Importar `error` do toast**

Linha ~173, trocar:

```typescript
const { success: toastSuccess } = useToast();
```

por:

```typescript
const { success: toastSuccess, error: toastError } = useToast();
```

- [ ] **Step 2: Reescrever `saveNotas` com checagem de erro**

Substituir o corpo de `saveNotas` (461–507):

```typescript
const saveNotas = async () => {
  if (!competenciaFiltro) return;
  const isComp = mode === 'comparativo';
  if (isComp) {
    setNotasComparativoLoading(true);
    setNotasComparativoSaved(false);
  } else {
    setNotasAuditoriaLoading(true);
    setNotasAuditoriaSaved(false);
  }

  const [year, month] = competenciaFiltro.split('-').map(Number);
  const notasPayload = isComp
    ? { contas_comparativo_notas_rh: notasComparativo }
    : { contas_notas_rh: notasAuditoria };

  try {
    const { data: folha, error: folhaErr } = await supabase
      .from('folhas_mensais')
      .select('id')
      .eq('ano', year)
      .eq('mes', month)
      .maybeSingle();

    if (folhaErr) throw folhaErr;

    if (folha?.id) {
      const { error: updateErr } = await supabase
        .from('folhas_mensais')
        .update(notasPayload)
        .eq('id', folha.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase.from('folhas_mensais').insert([
        { ano: year, mes: month, status: 'rascunho', ...notasPayload },
      ]);
      if (insertErr) throw insertErr;
    }

    if (isComp) {
      setNotasComparativoSaved(true);
      toastSuccess('Notas do comparativo salvas.');
      setTimeout(() => setNotasComparativoSaved(false), 3000);
    } else {
      setNotasAuditoriaSaved(true);
      toastSuccess('Notas da auditoria salvas.');
      setTimeout(() => setNotasAuditoriaSaved(false), 3000);
    }
  } catch (e: any) {
    const msg = e?.message || 'Não foi possível salvar as notas.';
    toastError(msg);
    console.error('saveNotas failed:', e);
  } finally {
    if (isComp) setNotasComparativoLoading(false);
    else setNotasAuditoriaLoading(false);
  }
};
```

- [ ] **Step 3: Verificar build**

Run: `npm run typecheck && npm run build`  
Expected: exit 0.

- [ ] **Step 4: Smoke manual**

Auditoria → editar notas RH → blur (onBlur chama saveNotas).  
Expected: toast verde de sucesso. Simular erro (desconectar rede) → toast vermelho.

---

## Task 3: Suporte à Rose no `App.tsx`

**Files:**
- Modify: `App.tsx` (~196–201, 897, 910–911, 1539–1546, 1737)

- [ ] **Step 1: Adicionar helper `isRose`**

Próximo de `isAna` / `isLuciano`:

```typescript
const ROSE_EMAIL = 'ROSE_EMAIL_AQUI'; // Alf substitui pelo e-mail real

const isRose = (email?: string | null) =>
  !!email && email.toLowerCase() === ROSE_EMAIL.toLowerCase();
```

- [ ] **Step 2: Avatar default (opcional)**

Em `getDefaultAvatarByEmail`:

```typescript
if (isRose(email)) return '/Avatar_Rose.png'; // ou avatar genérico se PNG não existir
```

Se não houver asset, usar fallback existente (sem bloquear).

- [ ] **Step 3: Nome e role no perfil**

Atualizar `openProfile`, `saveProfile`, greeting e display name para incluir Rose:

```typescript
const displayName =
  userProfile?.nome ||
  (isAna(userEmail) ? 'Ana Paula' : isLuciano(userEmail) ? 'Luciano Alf' : isRose(userEmail) ? 'Rose' : userEmail || 'Usuário');

const role: UserProfile['role'] =
  isAna(userEmail) || isRose(userEmail) ? 'rh' : isLuciano(userEmail) ? 'admin' : 'user';
```

Repetir padrão nos outros pontos que hoje só tratam Ana/Luciano.

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`  
Expected: PASS.

---

## Task 4: Criar usuário Rose (Supabase Auth)

**Files:**
- Create: `scripts/create-rose-user.mjs`

- [ ] **Step 1: Script de criação**

```javascript
#!/usr/bin/env node
/**
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-rose-user.mjs rose@email.com 'SenhaTemp123!'
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ubdvtjbitozhkuvvqkxj.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];
const nome = process.argv[4] || 'Rose';

if (!serviceKey || !email || !password) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-rose-user.mjs <email> <password> [nome]');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: userData, error: userErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userErr) {
  console.error('createUser:', userErr.message);
  process.exit(1);
}

const userId = userData.user.id;
const { error: profileErr } = await admin.from('user_profiles').upsert({
  id: userId,
  nome,
  role: 'rh',
  avatar_url: null,
}, { onConflict: 'id' });

if (profileErr) {
  console.error('user_profiles:', profileErr.message);
  process.exit(1);
}

console.log('OK Rose created:', userId, email);
```

- [ ] **Step 2: Executar com e-mail real**

Alf fornece `ROSE_EMAIL` e senha temporária.

Run (PowerShell):

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/create-rose-user.mjs "rose@..." "SenhaTemp..."
```

Expected: `OK Rose created: <uuid> <email>`.

- [ ] **Step 3: Atualizar `ROSE_EMAIL` em `App.tsx`**

Substituir placeholder pelo e-mail real usado no script.

- [ ] **Step 4: Login smoke**

Abrir app → login com credenciais Rose → navegar Financeiro → Contas a Pagar.

Expected: todas as 5 abas carregam; editar conta funciona.

---

## Task 5: Smoke checklist Fatia B (Rose-ready)

**Files:** nenhum (validação manual)

- [ ] **Step 1: Lista e CRUD**
  - Filtrar vencidas / hoje / unidade
  - Editar conta (descrição, valor, categoria, método)
  - Marcar como pago
  - Criar conta nova (opcional)

- [ ] **Step 2: IA**
  - Comparativo → Atualizar (2x) — sem 500
  - Auditoria → Atualizar (2x) — sem duplicate key

- [ ] **Step 3: Notas RH**
  - Salvar notas auditoria/comparativo — toast sucesso
  - Forçar erro — toast erro

- [ ] **Step 4: Temas**
  - Repetir smoke rápido em **light** e **dark** (toggle sidebar)

- [ ] **Step 5: Build final**

Run: `npm run typecheck && npm run build`  
Expected: PASS.

---

## Fora deste plano (Fatia C — plano separado)

- Migrations fonte/credencial/código_mes/relatório
- Token `--on-accent` (primeira task do plano C UI)
- Edge `contas-credencial-vault`
- Relatório copiável

Ver spec §6.4 ordem C2 → C1 → C4/C5 → C3/UI.

---

## Self-Review (spec coverage)

| Spec §6.3 ID | Task |
|--------------|------|
| B1 Rose login | Task 3 + 4 |
| B2 Auditoria upsert deploy | Task 1 |
| B3 saveNotas toast | Task 2 |
| B4 Smoke | Task 5 |

Gaps: nenhum para Fatia B.

---

## Execution Handoff

**Plan saved.** Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints

**Which approach?**

Also needed from Alf: **e-mail da Rose** + confirmação de `SUPABASE_SERVICE_ROLE_KEY` disponível para rodar o script.
