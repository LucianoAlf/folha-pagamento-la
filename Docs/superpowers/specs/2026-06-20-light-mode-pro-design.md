# Light Mode Pro — Design

**Data:** 2026-06-20
**Autor:** Luciano + Claude (brainstorming Superpowers)
**Status:** Aprovado (design) — pré-implementação

---

## 1. Contexto e objetivo

O `dash-folha-pagamento` é um sistema interno de RH/folha (Vite + React 19 + TS + Supabase, pt-BR, desktop + mobile-first). Hoje ele é **dark-only**: não existe um sistema de temas — existe uma "pele" dark chumbada no código.

Investigação da arquitetura de cores atual:

- Tailwind via **Play CDN** (`cdn.tailwindcss.com`), config inline no `index.html`, **sem build de CSS** (PostCSS).
- `darkMode: 'class'` já configurado e `<html class="dark">`; o `body` chumba `background:#0f172a; color:white` num `<style>` inline.
- **~3000 ocorrências de classes de cor hardcoded** em ~65 arquivos (724 `bg-slate-900/950/800/850` + 2467 `text-white | text-slate-N | border-slate-N | bg-white/`).
- Theming semântico praticamente inexistente — **exceto** `components/CollaboratorComponents.tsx`, que já foi feito no padrão idiomático `bg-white dark:bg-slate-900` (~34 usos de `dark:`). É um precedente, não a regra.

**Objetivo:** adicionar um **"Light Mode Pro"** de alta qualidade, como tema alternativo ao dark, sem "dar mole" — com uma base arquitetural que torne a paleta consistente e fácil de manter nos dois temas.

---

## 2. Decisões (validadas com o dono)

| Tema | Decisão |
|---|---|
| **Escopo/sequência** | **Piloto primeiro**, depois rollout módulo a módulo. |
| **Tema padrão** | **Dark continua o padrão.** Light é opt-in, salvo no navegador (`localStorage`, por dispositivo). **Sem** detecção de SO. |
| **Direção visual** | **A · Soft Cloud** — fundo off-white frio (família slate), cards brancos com sombra suave; profundidade por sombra. Mantém a identidade da marca (o dark já é slate) e lê como "SaaS premium". |
| **Abordagem técnica** | **Tokens semânticos com CSS variables**, mapeados como cores nomeadas no Tailwind. Fonte única da paleta. |

Direções descartadas: **B · Warm Paper** (desloca a marca do slate); **C · Crisp White** (chapado demais para UI muito aninhada). Abordagem técnica descartada: variantes `dark:` (espalha a paleta light em ~3000 strings, sem fonte única).

---

## 3. Arquitetura do tema

### 3.1 Camada de tokens (fonte única)
Arquivo novo `styles/theme.css`, linkado no `<head>` do `index.html` (carrega antes do paint → sem flash). Tokens em **canais RGB crus** para suportar o modificador de opacidade do Tailwind:

```css
:root, .dark {
  --bg: 2 6 23;        --surface: 15 23 42;   --surface-2: 30 41 59;  --surface-3: 36 48 73;
  --text: 255 255 255; --text-2: 148 163 184; --text-3: 100 116 139;
  --border: 30 41 59;  --border-strong: 51 65 85;
  --accent: 139 92 246;
  --success: 52 211 153; --warning: 251 191 36; --danger: 251 113 133; --info: 56 189 248;
}
.light {
  --bg: 233 237 243;   --surface: 255 255 255; --surface-2: 245 248 252; --surface-3: 238 242 248;
  --text: 15 23 42;    --text-2: 71 85 105;    --text-3: 148 163 184;
  --border: 227 232 239; --border-strong: 203 213 225;
  --accent: 124 58 237;
  --success: 5 150 105; --warning: 180 83 9; --danger: 225 29 72; --info: 2 132 199;
}
```

### 3.2 Mapeamento no Tailwind (config inline do `index.html`)
```js
colors: {
  bg:       'rgb(var(--bg) / <alpha-value>)',
  surface:  'rgb(var(--surface) / <alpha-value>)',
  'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
  'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
  primary:   'rgb(var(--text) / <alpha-value>)',
  secondary: 'rgb(var(--text-2) / <alpha-value>)',
  muted:     'rgb(var(--text-3) / <alpha-value>)',
  base:        'rgb(var(--border) / <alpha-value>)',
  'base-strong':'rgb(var(--border-strong) / <alpha-value>)',
  accent:    'rgb(var(--accent) / <alpha-value>)',
  success:   'rgb(var(--success) / <alpha-value>)',
  warning:   'rgb(var(--warning) / <alpha-value>)',
  danger:    'rgb(var(--danger) / <alpha-value>)',
  info:      'rgb(var(--info) / <alpha-value>)',
}
```
Uso resultante: `bg-surface`, `text-primary`, `text-secondary`, `border-base`, `bg-surface/40`, `bg-accent/10`, `text-accent`, `bg-success/10 text-success`, etc. (As cores `slate.850/900/950` customizadas atuais podem ser removidas do config ao fim da migração.)

> Nota: `text-primary`/`text-secondary` são nomes de **cor de texto** (mapeiam `text-{color}`). Não confundir com as classes de utilitário de tamanho. Conferir que não há colisão de nomes com plugins.

### 3.3 ThemeProvider + useTheme
Novo `hooks/useTheme.tsx`:
- Lê `localStorage.getItem('theme')`; default `'dark'`.
- Aplica `.dark`/`.light` em `document.documentElement` (remove a outra classe).
- Expõe `{ theme, setTheme, toggle }`; persiste em `localStorage` na troca.
- **Sem** `prefers-color-scheme` (decisão).
- Montado no topo da árvore em `index.tsx`, dentro do `ErrorBoundary` e por fora do `ToastProvider`/`App`.

### 3.4 Anti-flash
Script inline mínimo no `<head>` do `index.html`, **antes** do bundle, aplica o tema salvo antes do React montar:
```html
<script>try{var t=localStorage.getItem('theme')||'dark';var c=document.documentElement.classList;c.toggle('dark',t!=='light');c.toggle('light',t==='light');}catch(e){}</script>
```
(O `<html class="dark">` continua como default estático, então o dark não pisca; o script só corrige para quem escolheu light.)

### 3.5 ThemeToggle
Componente novo `ThemeToggle` (sol/lua) no **rodapé da Sidebar**, perto do chip do usuário. Versão mobile/drawer validada no piloto. Usa `useTheme().toggle`.

### 3.6 `body`
Trocar `background:#0f172a; color:white` do `<style>` inline por `var(--bg)` / `var(--text)` (canais → `rgb(var(--bg))`). Ajustar também as cores da scrollbar para acompanhar o tema (tokens ou um par dark/light).

### 3.7 Risco técnico + fallback
**Risco:** confirmar que o Tailwind Play CDN aceita `rgb(var(--token) / <alpha-value>)` no config (alta confiança que sim). **É o 1º passo da implementação.**
**Fallback** (se o CDN não resolver o `<alpha-value>`): usar utilitárias com valor arbitrário (`bg-[rgb(var(--surface))]`) — funciona no CDN, perde só o atalho de opacidade `/40`; cobre-se isso com tokens dedicados (`--surface-muted`, `--accent-soft`, etc.). A abordagem de tokens se mantém de pé em qualquer cenário.

---

## 4. Vocabulário de tokens (referência)

| Token | Uso | Dark | Light (Soft Cloud) |
|---|---|---|---|
| `--bg` | fundo do app | `#020617` | `#e9edf3` |
| `--surface` | cards, sidebar, topbar, modais | `#0f172a` | `#ffffff` |
| `--surface-2` | inset, chips, base de hover | `#1e293b` | `#f5f8fc` |
| `--surface-3` | hover forte / item ativo | `#243049` | `#eef2f8` |
| `--text` | texto primário | `#ffffff` | `#0f172a` |
| `--text-2` | secundário | `#94a3b8` | `#475569` |
| `--text-3` | label / muted | `#64748b` | `#94a3b8` |
| `--border` | borda padrão | `#1e293b` | `#e3e8ef` |
| `--border-strong` | divisórias / ênfase | `#334155` | `#cbd5e1` |
| `--accent` | violeta da marca | `#8b5cf6` | `#7c3aed` |
| `--success` | pago / positivo | `#34d399` | `#059669` |
| `--warning` | urgente / hoje | `#fbbf24` | `#b45309` |
| `--danger` | vencida / erro | `#fb7185` | `#e11d48` |
| `--info` | informativo | `#38bdf8` | `#0284c7` |

**Princípio:** status e accent são **1 token cada**, usados com alpha (`bg-success/10 text-success`, `bg-accent/10`). Como o token troca por tema, badges e chips ficam corretos nos dois automaticamente. Accent é mais claro no dark e mais profundo no light para manter contraste sobre cada fundo.

---

## 5. Estratégia de migração

### 5.1 Mapa de classes (origem → token)

| Hardcoded hoje | Vira |
|---|---|
| `bg-slate-950` | `bg-bg` |
| `bg-slate-900`, `bg-slate-900/40`, `bg-[#0f172a]` | `bg-surface` (mantém o `/40`) |
| `bg-slate-850`, `bg-slate-800` | `bg-surface-2` |
| `bg-slate-700`, `bg-white/5`, `bg-white/10` (hover) | `bg-surface-3` |
| `text-white` | `text-primary` |
| `text-slate-300/400` | `text-secondary` |
| `text-slate-500/600` | `text-muted` |
| `border-slate-800` | `border-base` |
| `border-slate-700` | `border-strong` |
| `*-violet-*` (bg/text/border, com alpha) | família `accent` |
| `*-emerald/rose/amber/sky-*` | `success` / `danger` / `warning` / `info` |

Aplicado **arquivo por arquivo** (não find-replace cego no repo, para não quebrar superfícies já claras).

### 5.2 Casos especiais
- **Opacidade preservada** (`/40`, `/10`, `/5`, `/20`).
- **Hex arbitrário** (`bg-[#0f172a]`, `dark:bg-[#0f172a]`) → token.
- **Rings de foco** `ring-violet-*` → `ring-accent`.
- **Sombra:** definir 1-2 sombras semânticas via CSS var (`--shadow-card`, `--shadow-pop`) e aplicá-las com `shadow-[var(--shadow-card)]`. Valores tunados por tema: suaves e slate-tingidas no light (criam a profundidade Soft Cloud), quase nulas no dark. Substituir os `shadow-black/20` / `shadow-xl` hardcoded por essas — evita sombra pesada demais no fundo claro.
- **Ícones lucide** herdam `currentColor` → acompanham `text-*` sozinhos.
- **`CollaboratorComponents.tsx`** (já tem `dark:`): converter para tokens, removendo a duplicação e alinhando ao resto.
- **Gradientes** (`from-/to-`) com slate/violet → tokens ou mantidos se puramente decorativos.

---

## 6. Escopo do piloto (1ª entrega, end-to-end)

1. **Infra** — `styles/theme.css`, mapeamento no config do `index.html`, `hooks/useTheme.tsx` + `ThemeProvider`, script anti-flash, `ThemeToggle`, `body`→vars. (1º passo: validar alpha no CDN.)
2. **Shell** — `index.html`, `App.tsx`, `components/Sidebar.tsx` (+ header/drawer mobile).
3. **Primitivos compartilhados** — `components/UI.tsx` (Card, Badge, Modal, ConfirmDialog, CustomSelect, ToggleSwitch, Tooltip) + partes compartilhadas de `components/CollaboratorComponents.tsx` (incl. `cn`).
4. **Módulo completo: Contas a Pagar** — todos os componentes em `components/contas/` (ContasPagarPage, ContaAuditCard, ContasTable, ContasCalendar, ContasSummaryCards, ParcelasTimeline, ContaLembretesWhatsApp, ContasDoDiaModal, CategoriaModal, NovaContaModal, EditarContaModal, PagarContaModal).

**Critério de pronto do piloto:** alternar light/dark e ter shell + Contas a Pagar corretos e "Pro" nos dois temas, validado no companion (browser) antes de propagar.

---

## 7. Rollout (após piloto aprovado)

Módulo a módulo, cada um conferido nos 2 temas:

1. Dashboard / `DashboardWidgets` (home)
2. Férias (`components/ferias/*`)
3. Agenda (`components/agenda/*`)
4. RH / Jornada (`components/rh-jornada/*`)
5. Colaboradores (resto de `CollaboratorComponents` + `MobileCollaboratorList`)
6. Notificações + avulsas (`NotificacoesPage`, `ErrorBoundary`, `InstallPWAPrompt`, toasts)

---

## 8. Verificação (sem framework de teste)

- `npm run build` verde + `npx tsc --noEmit` com 0 erros a cada módulo.
- Passada visual nos 2 temas (toggle) por módulo.
- **Grep anti-vazamento:** após cada módulo, procurar `slate-|text-white|bg-white/` no escopo migrado para garantir que não sobrou cor chumbada.
- Validação do piloto no companion + code-review (`/code-review`) ao fim.

---

## 9. Fora de escopo (YAGNI)

- Detecção de `prefers-color-scheme` (decisão: dark default fixo).
- Persistência de tema por usuário no banco (é preferência por dispositivo, `localStorage`).
- 3º tema / temas customizáveis pelo usuário.
- Qualquer blindagem de acesso/RLS (sistema interno, usuárias de confiança — decisão já documentada em `Docs/decisao-modelo-acesso-rls-2026-06.md`).

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| CDN não resolver `<alpha-value>` no config | Validar no passo 1; fallback com utilitárias arbitrárias + tokens dedicados (§3.7). |
| Regressão visual em massa (3000 classes) | Piloto primeiro; migração por arquivo; grep anti-vazamento; validação nos 2 temas por módulo. |
| Contraste/acessibilidade no light | Valores de status/accent já ajustados por tema; conferência visual; foco com `ring-accent`. |
| Inconsistência durante rollout (módulos não migrados) | Tokens fazem módulos não migrados continuarem dark; aceitar inconsistência temporária só enquanto o rollout não fecha. |
