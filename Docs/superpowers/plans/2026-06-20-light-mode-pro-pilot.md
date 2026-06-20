# Light Mode Pro — Piloto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a infraestrutura de tema (tokens semânticos) + Light Mode Pro aplicado ao shell, aos primitivos compartilhados e ao módulo Contas a Pagar, com dark como padrão e light opt-in.

**Architecture:** Tokens semânticos em CSS variables (canais RGB) definidos em `styles/theme.css`, mapeados como cores nomeadas no Tailwind config inline do `index.html` via `rgb(var(--token) / <alpha-value>)`. Um `ThemeProvider` aplica `.dark`/`.light` em `<html>` e persiste em `localStorage`. A migração troca classes slate/violet hardcoded por classes-token (`bg-surface`, `text-primary`, `bg-accent/10`…), arquivo por arquivo.

**Tech Stack:** Vite + React 19 + TypeScript ~5.8, Tailwind Play CDN (sem build de CSS), lucide-react. **Sem framework de teste** — verificação por `npm run typecheck` (tsc --noEmit), `npm run build`, conferência visual nos 2 temas e grep anti-vazamento.

**Spec:** `Docs/superpowers/specs/2026-06-20-light-mode-pro-design.md`
**Branch:** `feat/light-mode-pro`

---

## Referência: Mapa de classes (origem → token)

Usado em todas as tasks de migração (5–10). Aplicar preservando o modificador de opacidade (`/40`, `/10`…).

| Hardcoded hoje | Vira |
|---|---|
| `bg-slate-950`, `bg-[#0a0d14]`, `bg-[#060814]` | `bg-bg` |
| `bg-slate-900`, `bg-slate-900/NN`, `bg-[#0f172a]` | `bg-surface` (mantém `/NN`) |
| `bg-slate-850`, `bg-slate-800`, `bg-slate-800/NN` | `bg-surface-2` |
| `bg-slate-700`, `bg-white/5`, `bg-white/10` (hover) | `bg-surface-3` |
| `text-white` | `text-primary` |
| `text-slate-200`, `text-slate-300`, `text-slate-400` | `text-secondary` |
| `text-slate-500`, `text-slate-600` | `text-muted` |
| `border-slate-800`, `border-slate-800/NN` | `border-base` |
| `border-slate-700`, `border-slate-700/NN` | `border-strong` |
| `bg-violet-600/500`, `text-violet-400/300`, `bg-violet-500/NN`, `border-violet-500/NN`, `ring-violet-500` | família `accent` (`bg-accent`, `text-accent`, `bg-accent/NN`, `border-accent/NN`, `ring-accent`) |
| `*-emerald-*` | `success` | (`text-success`, `bg-success/NN`, `border-success/NN`) |
| `*-amber-*` | `warning` |
| `*-rose-*` | `danger` |
| `*-cyan-*` / `*-sky-*` | `info` |

**Componentes dual já existentes** (`bg-white dark:bg-slate-XXX`, `text-slate-900 dark:text-white`, etc.): substituir o **par inteiro** por **um** token (`bg-white dark:bg-slate-800/50` → `bg-surface`; `text-slate-900 dark:text-white` → `text-primary`; `border-slate-200 dark:border-slate-700` → `border-base`). Remover o `dark:`.

---

## File Structure

**Criar:**
- `styles/theme.css` — tokens (`:root/.dark`, `.light`), sombras semânticas, scrollbar. Linkado no `<head>`.
- `hooks/useTheme.tsx` — `ThemeProvider` + `useTheme()`.
- `components/ThemeToggle.tsx` — botão sol/lua.

**Modificar (infra/shell):**
- `index.html` — link do theme.css, script anti-flash, mapeamento de cores no Tailwind config, `body`/scrollbar → vars.
- `index.tsx` — envolver com `ThemeProvider`; `FatalBootError` → tokens.
- `components/Sidebar.tsx` — migrar para tokens + inserir `ThemeToggle` no rodapé.
- `App.tsx` — chrome persistente (container raiz autenticado + header) → tokens; **remover o `dark` forçado** do wrapper autenticado.
- `components/UI.tsx` — primitivos → tokens.

**Modificar (módulo Contas a Pagar):**
- `components/contas/*.tsx` (12 arquivos) — migrar para tokens.
- `components/CollaboratorComponents.tsx` — apenas o `cn` (helper já correto) permanece; converter `dark:` compartilhados tocados pelo Contas, se houver.

---

## Task 1: Tokens + mapeamento Tailwind + validação do CDN

**Files:**
- Create: `styles/theme.css`
- Modify: `index.html` (head: link + config colors)

- [ ] **Step 1: Criar `styles/theme.css`**

```css
/* Tokens semânticos do tema. Canais RGB crus p/ suportar <alpha-value> do Tailwind. */
:root, .dark {
  --bg: 2 6 23;          --surface: 15 23 42;    --surface-2: 30 41 59;   --surface-3: 36 48 73;
  --text: 255 255 255;   --text-2: 148 163 184;  --text-3: 100 116 139;
  --border: 30 41 59;    --border-strong: 51 65 85;
  --accent: 139 92 246;
  --success: 52 211 153; --warning: 251 191 36;  --danger: 251 113 133;   --info: 56 189 248;
  --shadow-card: 0 1px 3px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.30);
  --shadow-pop: 0 18px 50px rgba(0,0,0,.55);
  --scrollbar-track: #1e293b; --scrollbar-thumb: #475569; --scrollbar-thumb-hover: #64748b;
}
.light {
  --bg: 233 237 243;     --surface: 255 255 255; --surface-2: 245 248 252; --surface-3: 238 242 248;
  --text: 15 23 42;      --text-2: 71 85 105;    --text-3: 148 163 184;
  --border: 227 232 239; --border-strong: 203 213 225;
  --accent: 124 58 237;
  --success: 5 150 105;  --warning: 180 83 9;    --danger: 225 29 72;     --info: 2 132 199;
  --shadow-card: 0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04);
  --shadow-pop: 0 18px 50px rgba(15,23,42,.12);
  --scrollbar-track: #e9edf3; --scrollbar-thumb: #cbd5e1; --scrollbar-thumb-hover: #94a3b8;
}
```

- [ ] **Step 2: Linkar o theme.css no `<head>` do `index.html`** (antes do script do Tailwind, p/ existir no 1º paint)

Inserir logo após a linha do favicon shortcut (`<link rel="shortcut icon" ...>`):
```html
    <link rel="stylesheet" href="/styles/theme.css" />
```

- [ ] **Step 3: Adicionar as cores semânticas no `tailwind.config` do `index.html`**

Substituir o bloco `colors: { slate: {...} }` por (mantém slate durante a migração):
```js
            colors: {
              slate: { 850: '#162031', 900: '#0f172a', 950: '#020617' },
              bg:            'rgb(var(--bg) / <alpha-value>)',
              surface:       'rgb(var(--surface) / <alpha-value>)',
              'surface-2':   'rgb(var(--surface-2) / <alpha-value>)',
              'surface-3':   'rgb(var(--surface-3) / <alpha-value>)',
              primary:       'rgb(var(--text) / <alpha-value>)',
              secondary:     'rgb(var(--text-2) / <alpha-value>)',
              muted:         'rgb(var(--text-3) / <alpha-value>)',
              base:          'rgb(var(--border) / <alpha-value>)',
              'base-strong': 'rgb(var(--border-strong) / <alpha-value>)',
              accent:        'rgb(var(--accent) / <alpha-value>)',
              success:       'rgb(var(--success) / <alpha-value>)',
              warning:       'rgb(var(--warning) / <alpha-value>)',
              danger:        'rgb(var(--danger) / <alpha-value>)',
              info:          'rgb(var(--info) / <alpha-value>)',
            }
```

- [ ] **Step 4: Validar o alpha no CDN (probe manual)**

Temporariamente, no `index.html` dentro do `<body>` (antes do `<div id="root">`), inserir:
```html
<div id="__probe" class="bg-surface text-primary border border-base p-4">probe <span class="bg-accent/10 text-accent px-2">accent/10</span></div>
```
Rodar: `npm run dev` e abrir o app. **Esperado:** o probe tem fundo `#0f172a` (dark), texto branco, e o span violeta translúcido. Se o fundo sair transparente/preto, o CDN não resolveu `<alpha-value>` → aplicar o **fallback** (Step 5). Se funcionou, **remover** o `<div id="__probe">` e pular o Step 5.

- [ ] **Step 5: (Só se o probe falhar) Fallback sem `<alpha-value>`**

No config, trocar cada `'rgb(var(--X) / <alpha-value>)'` por `'rgb(var(--X))'` e, em `theme.css`, adicionar tokens dedicados para os usos com opacidade que o piloto precisar (ex.: `--surface-muted`, `--accent-soft`, `--success-soft`…), usados como `bg-[rgb(var(--accent-soft))]`. Documentar no spec (§3.7) que o fallback foi acionado. Remover o probe.

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: build conclui sem erro (exit 0).

- [ ] **Step 7: Commit**

```bash
git add styles/theme.css index.html
git commit -m "feat(theme): add semantic color tokens + Tailwind mapping (CDN validated)"
```

---

## Task 2: Hook useTheme + ThemeProvider

**Files:**
- Create: `hooks/useTheme.tsx`

- [ ] **Step 1: Criar `hooks/useTheme.tsx`**

```tsx
// =====================================================
// HOOK - useTheme (Light Mode Pro)
// Aplica .dark/.light no <html> e persiste em localStorage.
// Dark é o padrão; light é opt-in. Sem detecção de SO (decisão do produto).
// =====================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'theme';

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  const c = document.documentElement.classList;
  c.toggle('dark', theme === 'dark');
  c.toggle('light', theme === 'light');
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const persist = (t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
  };

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add hooks/useTheme.tsx
git commit -m "feat(theme): add useTheme hook + ThemeProvider"
```

---

## Task 3: Wire provider + anti-flash + body/scrollbar + FatalBootError

**Files:**
- Modify: `index.tsx`, `index.html`

- [ ] **Step 1: Envolver a árvore com `ThemeProvider` em `index.tsx`**

Adicionar o import no topo:
```tsx
import { ThemeProvider } from './hooks/useTheme';
```
Trocar o bloco `root.render(...)` (dentro de `bootstrap`) por:
```tsx
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
```

- [ ] **Step 2: Anti-flash no `<head>` do `index.html`**

Inserir como **primeiro** elemento dentro do `<head>` (antes dos favicons):
```html
    <script>try{var t=localStorage.getItem('theme')||'dark';var c=document.documentElement.classList;c.toggle('dark',t!=='light');c.toggle('light',t==='light');}catch(e){}</script>
```

- [ ] **Step 3: `body` e scrollbar → vars no `<style>` do `index.html`**

Trocar:
```css
        body { background-color: #0f172a; color: white; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
```
por:
```css
        body { background-color: rgb(var(--bg)); color: rgb(var(--text)); }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
```

- [ ] **Step 4: `FatalBootError` em `index.tsx` → tokens via CSS vars**

(É inline style, não Tailwind.) Trocar `background: '#0f172a'` por `background: 'rgb(var(--bg))'` e `color: 'white'` por `color: 'rgb(var(--text))'` no `<div>` raiz do `FatalBootError`. Manter o resto.

- [ ] **Step 5: Verificar typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.

- [ ] **Step 6: Commit**

```bash
git add index.tsx index.html
git commit -m "feat(theme): wire ThemeProvider, anti-flash boot script, tokenize body/scrollbar"
```

---

## Task 4: ThemeToggle + Sidebar (tokens + toggle no rodapé)

**Files:**
- Create: `components/ThemeToggle.tsx`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Criar `components/ThemeToggle.tsx`**

```tsx
import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export const ThemeToggle: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2.5 rounded-xl text-secondary hover:text-primary hover:bg-surface-3 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {!collapsed && <span className="text-sm font-bold">{isDark ? 'Tema claro' : 'Tema escuro'}</span>}
    </button>
  );
};
```

- [ ] **Step 2: Importar e inserir o ThemeToggle no rodapé da Sidebar**

Em `components/Sidebar.tsx`, adicionar ao import de lucide nada novo; adicionar:
```tsx
import { ThemeToggle } from './ThemeToggle';
```
No bloco `{/* Footer */}`, logo após o `</div>` que fecha o `<div key="logout">` (antes do fechamento do footer `</div>` da linha ~348), inserir:
```tsx
        <ThemeToggle collapsed={collapsed} />
```

- [ ] **Step 3: Migrar as classes da Sidebar para tokens**

Aplicar o mapa de classes. Edições não óbvias (fazer exatamente):
- `containerClass`: `'bg-[#0a0d14] border-r border-slate-800/80'` → `'bg-bg border-r border-base'`. As linhas decorativas `before:bg-[radial-gradient(...rgba(139,92,246,0.20)...)]` e `after:...from-white/[0.03]...to-black/40` podem permanecer (decorativas); aceitável no piloto.
- Logo area: `border-b border-slate-800/80` → `border-b border-base`; `text-white` → `text-primary`; `text-slate-500` → `text-muted`.
- Botão de nav ativo: `'bg-violet-500/15 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5'` → `'bg-accent/15 text-accent border border-accent/20 shadow-lg shadow-accent/5'`. Inativo: `'text-slate-400 hover:bg-slate-800/40 hover:text-white border border-transparent'` → `'text-secondary hover:bg-surface-2/40 hover:text-primary border border-transparent'`. Disabled: `text-slate-500` → `text-muted`.
- Badge "Em breve": `bg-slate-800 ... text-slate-400` → `bg-surface-2 ... text-secondary`.
- Badge danger/warning: `bg-rose-500/20 text-rose-400 border border-rose-500/40` → `bg-danger/20 text-danger border border-danger/40`; amber → `warning`. Versão colapsada: `bg-rose-500 text-white border-2 border-[#0a0d14]` → `bg-danger text-white border-2 border-bg`; amber → `bg-warning`.
- Footer perfil: `border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 hover:border-violet-500/30` → `border-base bg-surface/30 hover:bg-surface/50 hover:border-accent/30`; avatar `border-slate-700 ... bg-slate-900/40 group-hover/profile:border-violet-500/50` → `border-strong ... bg-surface/40 group-hover/profile:border-accent/50`; `text-white ... group-hover/profile:text-violet-300` → `text-primary ... group-hover/profile:text-accent`; `text-slate-500 ... group-hover/profile:text-slate-400` → `text-muted ... group-hover/profile:text-secondary`.
- Logout: `text-slate-400 hover:text-rose-400 hover:bg-rose-500/10` → `text-secondary hover:text-danger hover:bg-danger/10`.
- Collapse toggle: `bg-slate-900 border border-slate-700 ... text-slate-400 hover:text-white` → `bg-surface border border-strong ... text-secondary hover:text-primary`.

- [ ] **Step 4: Verificar typecheck + grep anti-vazamento na Sidebar**

Run: `npm run typecheck`
Expected: 0 erros.
Run (grep): procurar `slate-|text-white|bg-\[#|violet-|rose-|amber-` em `components/Sidebar.tsx`.
Expected: só restam os gradientes decorativos `before:`/`after:` (rgba inline) — nenhuma classe utilitária de cor sólida.

- [ ] **Step 5: Verificação visual (companion ou dev)**

Run: `npm run dev`. Alternar o tema pelo novo botão no rodapé da Sidebar. Esperado: a Sidebar fica correta em dark e em light (fundo, texto, ativo violeta, badges).

- [ ] **Step 6: Commit**

```bash
git add components/ThemeToggle.tsx components/Sidebar.tsx
git commit -m "feat(theme): add ThemeToggle and migrate Sidebar to tokens"
```

---

## Task 5: UI.tsx — primitivos compartilhados → tokens

**Files:**
- Modify: `components/UI.tsx`

> Migrar todos os primitivos. Componentes **dual** (`bg-white dark:...`) colapsam para 1 token. Edições-chave abaixo; o restante segue o mapa.

- [ ] **Step 1: `Card` — tokens + corrigir `hasCustomBg`**

Trocar o corpo do `Card.forwardRef` por:
```tsx
  // Se o call site já define a própria superfície, não aplica o padrão.
  const hasCustomBg = /\bbg-(surface|bg|slate-)/.test(className);
  const baseClass = hasCustomBg
    ? 'rounded-2xl'
    : 'bg-surface border border-base rounded-2xl';
```
(Remove o `backdrop-blur-sm` do default e os pares `dark:`; mantém o resto da assinatura/JSX.)

- [ ] **Step 2: `Tooltip`** — `bg-slate-900 ... text-white` → `bg-surface-2 ... text-primary`; `fill-slate-900` → manter como `fill-[rgb(var(--surface-2))]`.

- [ ] **Step 3: `DatePicker`** — colapsar os pares dual: `bg-slate-50 dark:bg-slate-800` → `bg-surface-2`; `border-slate-200 dark:border-slate-700` → `border-base`; `text-slate-900 dark:text-slate-100` → `text-primary`; `focus:ring-violet-500/60` → `focus:ring-accent/60`; `hover:bg-slate-200 dark:hover:bg-slate-700` → `hover:bg-surface-3`; `text-slate-400 group-hover:text-violet-500` → `text-muted group-hover:text-accent`. Popover `bg-white dark:bg-[#0a0d14] border-slate-200 dark:border-slate-800` → `bg-surface border-base`. Botões internos idem (mapa). O bloco `<style>` do `.rdp-modern`: já tem ramos `.dark` — pode permanecer (DatePicker não é foco do piloto Contas; ajuste fino no rollout). Botões "Limpar/Confirmar": `bg-slate-100 dark:bg-slate-900 ... text-slate-700 dark:text-slate-400` → `bg-surface-2 ... text-secondary`; `bg-violet-600 hover:bg-violet-500 ... shadow-violet-600/20` → `bg-accent hover:bg-accent/90 ... shadow-accent/20`.

- [ ] **Step 4: `Button`** — `bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20 border-violet-500/30` → `bg-accent hover:bg-accent/90 text-white shadow-accent/20 border-accent/30`; outline `bg-slate-900/30 hover:bg-slate-800/50 text-slate-200 border-slate-700/60 hover:border-slate-600` → `bg-surface/30 hover:bg-surface-2/50 text-secondary border-strong/60 hover:border-strong`; ghost `bg-slate-900/20 hover:bg-slate-800/40 text-slate-200 border-slate-800/50` → `bg-surface/20 hover:bg-surface-2/40 text-secondary border-base/50`; `focus:ring-violet-500/50` → `focus:ring-accent/50`.

- [ ] **Step 5: `ToggleSwitch`** — `variant='violet'` onBg `bg-violet-500/15 border-violet-500/30` → `bg-accent/15 border-accent/30`, onDot `bg-violet-300` → `bg-accent`; off `bg-slate-900/50 border-slate-800` → `bg-surface/50 border-base`, hover `hover:border-slate-700` → `hover:border-strong`, dot off `bg-slate-600` → `bg-muted`. (emerald/cyan/rose/amber → success/info/danger/warning.)

- [ ] **Step 6: `Modal`** — overlay `bg-black/60` mantém. Header: `bg-slate-900/80 ... border-slate-700/50` → `bg-surface/80 ... border-strong/50`; título `text-white` → `text-primary`; subtítulo `text-white/85` → `text-secondary`; botão fechar `text-slate-400 hover:text-white hover:bg-slate-800` → `text-muted hover:text-primary hover:bg-surface-2`. Scroll `scrollbar-thumb-slate-700` → `scrollbar-thumb-base-strong`. Footer `bg-slate-900/80 ... border-slate-700/50` → `bg-surface/80 ... border-strong/50`.

- [ ] **Step 7: `ConfirmDialog` e `AlertDialog`** — colapsar dual: `bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700` → `bg-surface border-base`; ícone `bg-rose-500/10 text-rose-500` → `bg-danger/10 text-danger`, `bg-violet-500/10 text-violet-500` → `bg-accent/10 text-accent`; `text-slate-900 dark:text-white` → `text-primary`; `text-slate-500 dark:text-slate-400` → `text-secondary`; botão cancelar `bg-slate-100 dark:bg-slate-800 hover:... text-slate-700 dark:text-white` → `bg-surface-2 hover:bg-surface-3 text-primary`; botão confirmar `bg-rose-600 hover:bg-rose-500 shadow-rose-600/20` → `bg-danger hover:bg-danger/90 shadow-danger/20`, violet → accent.

- [ ] **Step 8: `Badge` — tokens + corrigir bug do `warning`**

Trocar o objeto `variants` por:
```tsx
  const variants = {
    default: 'bg-surface-2 text-secondary',
    success: 'bg-success/20 text-success border border-success/30',
    warning: 'bg-warning/20 text-warning border border-warning/30',
    danger: 'bg-danger/20 text-danger border border-danger/30',
    info: 'bg-info/20 text-info border border-info/30',
    purple: 'bg-accent/20 text-accent border border-accent/30',
  };
```
(Corrige o `border-emerald-500/30` que estava no `warning`.)

- [ ] **Step 9: `LoadingSpinner`, `ErrorState`, `CustomSelect`** — Spinner: `border-slate-700 border-t-violet-500` → `border-base border-t-accent`; `text-slate-400` → `text-secondary`. ErrorState: `text-white` → `text-primary`; `text-slate-400` → `text-secondary`; botão violet → accent. CustomSelect: trigger `bg-slate-900/50 hover:bg-slate-800 text-slate-200 border-slate-700 focus:ring-violet-500` → `bg-surface/50 hover:bg-surface-2 text-secondary border-strong focus:ring-accent`; ícones `text-slate-400 group-hover:text-violet-400` → `text-muted group-hover:text-accent`, `text-slate-500` → `text-muted`; Content `bg-slate-900 border-slate-700 shadow-black/60` → `bg-surface border-strong shadow-black/60`; Item `text-slate-300 hover:bg-violet-500/20 hover:text-white focus:bg-violet-500/20 ... data-[state=checked]:text-violet-400 data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white` → `text-secondary hover:bg-accent/20 hover:text-primary focus:bg-accent/20 ... data-[state=checked]:text-accent data-[highlighted]:bg-accent/20 data-[highlighted]:text-primary`; Check `text-violet-400` → `text-accent`.

- [ ] **Step 10: Verificar typecheck + build + grep**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.
Run (grep): procurar `slate-|text-white|violet-|emerald-|rose-|amber-|cyan-|bg-\[#` em `components/UI.tsx`.
Expected: nenhuma ocorrência (exceto, se mantido, o bloco `<style>` `.rdp-modern` com ramos `.dark`).

- [ ] **Step 11: Commit**

```bash
git add components/UI.tsx
git commit -m "feat(theme): migrate UI.tsx primitives to tokens (+fix Badge warning border)"
```

---

## Task 6: App.tsx — chrome persistente → tokens + remover `dark` forçado

**Files:**
- Modify: `App.tsx` (apenas: container autenticado ~1749, header ~1765–1945, dropdown de perfil)

> **Escopo:** só o chrome persistente da área autenticada. **NÃO** migrar aqui as telas de login/loading (~1538, ~1560) nem as telas de módulo embutidas no App.tsx (folha/comparativo/perfil) — ficam para o rollout. Login/loading **mantêm** seu wrapper `dark` (renderizam sempre em dark por ora).

- [ ] **Step 1: Remover o `dark` forçado e tokenizar o container autenticado (linha ~1749)**

Trocar:
```tsx
    <div className="dark min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-violet-500/30 flex">
```
por:
```tsx
    <div className="min-h-screen bg-bg text-secondary font-sans selection:bg-accent/30 flex">
```

- [ ] **Step 2: Header e dropdown de perfil → tokens (linhas ~1765–1945)**

Aplicar o mapa nas classes do `<header>` e do dropdown:
- Header: `border-b border-slate-800 bg-[#0f172a]` → `border-b border-base bg-surface`.
- Botão avatar: `border-slate-700/60 bg-slate-900/40 hover:bg-slate-900/60` → `border-strong/60 bg-surface/40 hover:bg-surface/60`.
- Dropdown content: `border-slate-800 bg-slate-950/95` → `border-base bg-bg/95`.
- Barra de submódulos (~1945): `border-b border-slate-800/60 bg-slate-900/20` → `border-b border-base/60 bg-surface/20`.
- Pill de tabs (~1973): `bg-[#0f172a] ... border-slate-800/50` → `bg-surface ... border-base/50`.
(Demais blocos abaixo de ~2000 são telas de módulo — fora do escopo desta task.)

- [ ] **Step 3: Verificar typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.

- [ ] **Step 4: Verificação visual**

Run: `npm run dev`. Logar e alternar tema. Esperado: shell (sidebar + header + área externa) correto nos 2 temas. Telas de módulo não migradas podem aparecer inconsistentes **só** em light — esperado (rollout posterior). Login segue dark.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat(theme): tokenize authenticated shell (App.tsx), drop forced dark wrapper"
```

---

## Task 7: Contas a Pagar — página, card, tabela, calendário, summary, timeline

**Files:**
- Modify: `components/contas/ContasPagarPage.tsx`, `ContaAuditCard.tsx`, `ContasTable.tsx`, `ContasCalendar.tsx`, `ContasSummaryCards.tsx`, `ParcelasTimeline.tsx`, `ContaLembretesWhatsApp.tsx`

- [ ] **Step 1: Migrar cada arquivo aplicando o mapa de classes**

Para cada arquivo acima: ler, substituir toda classe de cor hardcoded pelo token correspondente (tabela de referência no topo), preservando opacidades. Atenção a `cn(...)` com condicionais (ex.: `ContaAuditCard` linhas 49–61: `getStatusColor` e o `Card` com `border-slate-800 bg-slate-900/40` → `border-base bg-surface/40`; `border-violet-500/40 bg-violet-500/[0.04]` → `border-accent/40 bg-accent/[0.04]`; `text-emerald-400/rose-400/amber-400/slate-400` → `text-success/text-danger/text-warning/text-secondary`).

- [ ] **Step 2: Verificar typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.

- [ ] **Step 3: Grep anti-vazamento nos 7 arquivos**

Run (grep): procurar `slate-|text-white|violet-|emerald-|rose-|amber-|cyan-|bg-\[#` em cada arquivo migrado.
Expected: nenhuma ocorrência de cor hardcoded.

- [ ] **Step 4: Commit**

```bash
git add components/contas/ContasPagarPage.tsx components/contas/ContaAuditCard.tsx components/contas/ContasTable.tsx components/contas/ContasCalendar.tsx components/contas/ContasSummaryCards.tsx components/contas/ParcelasTimeline.tsx components/contas/ContaLembretesWhatsApp.tsx
git commit -m "feat(theme): migrate Contas a Pagar (page/card/table/calendar/summary) to tokens"
```

---

## Task 8: Contas a Pagar — modais

**Files:**
- Modify: `components/contas/NovaContaModal.tsx`, `EditarContaModal.tsx`, `PagarContaModal.tsx`, `ContasDoDiaModal.tsx`, `CategoriaModal.tsx`

- [ ] **Step 1: Migrar cada modal aplicando o mapa**

Para cada arquivo: ler e substituir as classes de cor hardcoded por tokens, preservando opacidades. Inputs internos (`bg-slate-900/40 border-slate-700/60 text-slate-100 placeholder:text-slate-600 focus:ring-violet-500/40`) → `bg-surface/40 border-strong/60 text-primary placeholder:text-muted focus:ring-accent/40`.

- [ ] **Step 2: Verificar typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.

- [ ] **Step 3: Grep anti-vazamento nos 5 modais**

Run (grep): procurar `slate-|text-white|violet-|emerald-|rose-|amber-|cyan-|bg-\[#` em cada arquivo.
Expected: nenhuma ocorrência.

- [ ] **Step 4: Commit**

```bash
git add components/contas/NovaContaModal.tsx components/contas/EditarContaModal.tsx components/contas/PagarContaModal.tsx components/contas/ContasDoDiaModal.tsx components/contas/CategoriaModal.tsx
git commit -m "feat(theme): migrate Contas a Pagar modals to tokens"
```

---

## Task 9: Verificação do piloto (2 temas) + revisão visual

**Files:** nenhum (verificação)

- [ ] **Step 1: Build limpo + typecheck**

Run: `npm run typecheck && npm run build`
Expected: 0 erros, build OK.

- [ ] **Step 2: Grep anti-vazamento no escopo do piloto**

Run (grep): procurar `bg-slate-|text-slate-|border-slate-|text-white\b|bg-white/|bg-\[#0|violet-[0-9]|emerald-[0-9]|rose-[0-9]|amber-[0-9]|cyan-[0-9]` em `components/Sidebar.tsx`, `components/UI.tsx`, `components/ThemeToggle.tsx` e `components/contas/`.
Expected: nenhuma cor hardcoded sólida (gradientes decorativos `before:/after:` na Sidebar são aceitáveis).

- [ ] **Step 3: Conferência visual nos 2 temas**

Run: `npm run dev`. Com o toggle, validar em **dark** e **light**:
- Sidebar (nav ativo/inativo, badges férias, perfil, toggle).
- Header + dropdown de perfil.
- Contas a Pagar: cards (status urgente/hoje/pago/vencida), tabela, calendário, summary cards, timeline de parcelas, e os 5 modais (abrir cada um).
Esperado: tudo legível e "Pro" nos dois temas; sem texto invisível, sem card sem contraste.

- [ ] **Step 4: Validação no companion (opcional, recomendado)**

Capturar/print das telas-chave de Contas a Pagar nos 2 temas e revisar lado a lado (companion de brainstorming ou screenshots) antes de aprovar o rollout.

- [ ] **Step 5: Commit do plano concluído (se houver ajustes) e abrir PR do piloto**

```bash
git push -u origin feat/light-mode-pro
```
Abrir PR `feat/light-mode-pro` → `main` com o resumo do piloto. (Não mergear sem a aprovação visual do dono.)

---

## Self-Review (preenchido)

**Cobertura da spec:** §3.1 tokens → T1; §3.2 mapeamento → T1; §3.3 provider → T2/T3; §3.4 anti-flash → T3; §3.5 toggle → T4; §3.6 body → T3; §3.7 risco/fallback → T1 (Steps 4–5); §4 valores → T1; §5 migração → T4–T8 (+ mapa no topo); §6 escopo piloto → T1–T8; §8 verificação → cada task + T9. **§5.2 sombra:** tokens `--shadow-card`/`--shadow-pop` definidos em T1; aplicação (`shadow-[var(--shadow-card)]`) onde houver `shadow-xl/shadow-black/20` é feita junto da migração de cada arquivo (T5–T8) — substituir sombras pesadas hardcoded por `shadow-[var(--shadow-card)]`.

**Placeholders:** nenhum "TBD/TODO"; cada migração referencia o mapa concreto + edições exatas dos pontos não óbvios.

**Consistência de tipos/nomes:** tokens nomeados idênticos em todas as tasks (`bg`, `surface`, `surface-2/3`, `primary`, `secondary`, `muted`, `base`, `base-strong`, `accent`, `success/warning/danger/info`). Hook: `ThemeProvider`/`useTheme`/`toggle` consistentes entre T2, T3, T4.
