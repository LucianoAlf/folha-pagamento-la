# CLAUDE.md — Super Folha (LA Music Group)

Sistema interno de gestão financeira e de RH da LA Music Group. Não é SaaS multi-tenant:
é ferramenta interna, e várias decisões de arquitetura (RLS, auth) partem disso.

## Stack

React 19 + TypeScript + Vite 6 · Tailwind 3.4 · Supabase (Postgres 17) · Recharts · lucide-react
Deploy do front na Vercel. Backend = Supabase (Postgres + Edge Functions em Deno).

## Comandos

```bash
npm run dev          # Vite em :3000 (host 0.0.0.0)
npm run build        # build de produção
npm run typecheck    # tsc --noEmit — deve passar limpo SEMPRE
```

Testes usam o runner nativo do Node (não há Jest/Vitest):

```bash
node --test --experimental-strip-types <arquivo>.test.ts   # testes .ts precisam da flag
node --test <arquivo>.test.mjs                             # .mjs roda direto
```

Há ~126 arquivos de teste (53 `.test.ts`, 73 `.test.mjs`). Não existe script que rode
todos de uma vez — rode os do módulo que você tocou.

## Arquitetura

### App.tsx é um monolito — respeite o padrão de lazy loading

`App.tsx` tem ~4.900 linhas / 255 KB. Ele contém **inline** o módulo de Folha inteiro
(dashboard, lançamentos, comparativo, colaboradores) mais a tela de login e os modais globais.

Todos os **outros** módulos são `lazy()` importados de `components/`:

| Módulo | Origem |
|---|---|
| Contas a Pagar / Receber | `components/contas/`, `components/contas-receber/` |
| DRE | `components/dre/` |
| Cartões | `components/cartoes/` |
| Agenda / Notificações | `components/agenda/`, `components/notificacoes/` |
| Férias | `components/ferias/` |
| RH / Jornada | `components/rh-jornada/` |
| Bistrô | `components/bistro/` |

**Ao criar um módulo novo, crie em `components/<modulo>/` e adicione via `lazy()`.**
Não engorde o `App.tsx`. Ao mexer no módulo de Folha, você vai editar `App.tsx` mesmo —
use âncoras de busca precisas, o arquivo é grande demais para ler inteiro.

### Navegação

`components/navigation.ts` é a fonte da verdade: `MODULE_IDS` e `NavigationItemId`.
Página nova exige atualizar esse arquivo — e ele tem testes (`navigation.test.ts`,
`NavigationGroups.test.ts`, `navigationAppIntegration.test.ts`) que quebram se você esquecer.

### Camada de dados (`services/`)

Um arquivo por domínio: `contasPagarService.ts`, `dreService.ts`, `feriasService.ts`,
`rhJornadaService.ts`, `cartoesService.ts`, etc. Tipos correspondentes em `types/`.

**Existem dois padrões de acesso convivendo — reconheça qual está em uso antes de editar:**

1. **Cliente Supabase** — `import { supabase } from './supabase'` → `supabase.from(...)`, `.rpc(...)`
2. **`fetch` cru no PostgREST** — `` fetch(`${SUPABASE_URL}/rest/v1/tabela?select=...`) `` com
   headers `apikey` + `Authorization` montados à mão. `services/api.ts` é quase todo assim.

Nenhum dos dois está errado. Siga o padrão do arquivo que você está editando em vez de misturar.

### Variáveis de ambiente

`config/resolveSupabaseEnv.ts` resolve em cascata:

```
VITE_SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL → default hardcoded
```

O `.env.local` deste projeto usa prefixo `NEXT_PUBLIC_` (herança de Next) e **funciona** por
causa dessa cascata — não "conserte" isso achando que está quebrado. O fallback final vive em
`config/supabaseDefaults.ts`, então o app sobe mesmo sem `.env.local`.

`GEMINI_API_KEY` **nunca** vai pro client. O `envPrefix` do Vite expõe só `VITE_` e `NEXT_PUBLIC_`;
a chave da Gemini fica exclusivamente nas Edge Functions.

## Design system — só tokens semânticos

Dark mode por classe (`darkMode: 'class'`, `<html class="dark">`), alternado por `hooks/useTheme.tsx`.
Tokens em `styles/theme.css`, mapeados no `tailwind.config.cjs`:

`bg` · `surface` / `surface-2` / `surface-3` · `primary` / `secondary` / `muted`
`line` / `line-strong` · `accent` / `on-accent` · `success` · `warning` · `danger` · `info`

**Não use cores cruas do Tailwind** (`slate-700`, `violet-500`, `text-white`, `bg-[#hex]`) em
código novo. Elas quebram o light mode. Existem scripts de migração em `scripts/`
(`migrate-tokens.mjs`, `fix-textwhite.mjs`) usados nessa faxina.

⚠️ O token de borda chama-se **`line`**, não `base` — `base` colidia com o utilitário nativo
`text-base` do Tailwind e foi renomeado. Não reintroduza `-base` como cor.

Z-index e larguras também são tokens (`--z-modal`, `--z-toast`, `--app-sidebar-width`).
Use-os em vez de números mágicos.

`scripts/tailwind-build-contract.test.mjs` garante que o runtime não volte a depender do
CDN do Tailwind. Se você mexer no `index.html` ou `index.tsx`, rode esse teste.

## Supabase

Projeto: **`la-music-folha`** · ref `ubdvtjbitozhkuvvqkxj` · região `sa-east-1`

- **175 migrations** em `supabase/migrations/` (várias com `.test.sql` / `.test.mjs` ao lado)
- **28 Edge Functions** em `supabase/functions/`, código compartilhado em `_shared/`
  (wrapper da Gemini, auth de RH, dispatcher de WhatsApp)
- Deploy: `scripts/deploy-edge-function.mjs` e correlatos, ou
  `npx supabase functions deploy <slug> --project-ref ubdvtjbitozhkuvvqkxj --no-verify-jwt`

### Modelo de acesso (RLS)

Por design, **autenticado = acesso total; anon bloqueado**. É ferramenta interna e a decisão
está registrada em `Docs/decisao-modelo-acesso-rls-2026-06.md`. Não "endureça" RLS por
instinto sem ler esse documento antes.

⚠️ **5 tabelas estão com RLS desabilitado** e portanto expostas à anon key (que é pública,
vai no bundle): `maria_agent_memory_events`, `maria_gov_findings`, `maria_gov_known_issues`,
`maria_gov_runs`, `maria_gov_probes`. Ligar RLS sem policy **bloqueia todo acesso** e quebra o
que consome essas tabelas — trate como decisão consciente, não como fix automático.

## Convenções

- **Idioma:** domínio em português (`contasPagar`, `colaboradores`, `folhas_mensais`).
  Mantenha. Não traduza nomes de tabela/campo para inglês.
- **Mensagens de commit:** português, sem acento, prefixo convencional
  (`fix:`, `feat:`, `docs:`, `test:`).
- **Docs:** decisões de arquitetura e planos vão em `Docs/` — vale ler antes de mudanças
  estruturais; boa parte do "porquê" do sistema está lá, não no código.

## Armadilhas conhecidas

- `App.tsx` grande demais para ler inteiro — busque por âncora, nunca leia do começo ao fim.
- `npm run typecheck` passa limpo hoje. Se quebrar, foi você — não é dívida herdada.
- Testes de navegação quebram sempre que se adiciona página sem atualizar `navigation.ts`.
- Cores cruas do Tailwind passam no typecheck e no build, mas estragam o light mode
  silenciosamente. Revise visualmente nos dois temas.
