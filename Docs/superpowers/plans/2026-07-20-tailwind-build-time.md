# Tailwind Build-Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is executed inline because the user already approved implementation; do not commit, push, deploy, or merge before the audit/QA gate.

**Goal:** Replace the Tailwind Play CDN runtime with a pinned Tailwind 3.4.17 PostCSS build while preserving the current UI and theme behavior.

**Architecture:** Vite imports a dedicated `styles/tailwind.css` entry that PostCSS compiles with Tailwind and Autoprefixer. CommonJS configuration files avoid the repository ESM boundary, content globs include all real UI class sources and exclude tests, and the existing `styles/theme.css` remains byte-identical.

**Tech Stack:** Vite 6.4.1, React 19, Tailwind CSS 3.4.17, PostCSS, Autoprefixer, Node test runner, in-app browser visual verification.

---

### Task 1: Capture the pre-change baseline

**Files:**
- Create (ignored): `.tmp/tailwind-parity/BASELINE.md`
- Create (ignored): `.tmp/tailwind-parity/baseline/*.png`
- Create (ignored): `.tmp/tailwind-parity/baseline/technical-baseline.json`

- [x] Record the base commit, Node/npm/Vite versions, `theme.css` hash, current local CSS bytes, Play CDN version and transfer bytes.
- [x] Run `npm ci`, `node --test`, `npm run typecheck`, and `npm run build` before application edits.
- [x] Capture 24 private screenshots: Folha, Contas a Pagar, Contas a Receber, DRE, Cartoes and Agenda in light/dark at 1440x900 and 390x844.
- [x] Capture additional sidebar-collapsed, Radix popover and modal/form states.

### Task 2: Add a failing source-contract test

**Files:**
- Create: `scripts/tailwind-build-contract.test.mjs`

- [ ] Write a Node test that asserts the CDN and inline assignment are absent, the CSS entry is imported, the Tailwind/PostCSS CJS configs exist, the semantic theme mapping is exact, content globs include `types` and exclude tests, Tailwind is exactly 3.4.17, and `tailwindcss-animate` is absent.
- [ ] Run `node --test scripts/tailwind-build-contract.test.mjs` and confirm it fails because the new contract is not implemented.

### Task 3: Implement the pinned build-time pipeline

**Files:**
- Create: `tailwind.config.cjs`
- Create: `postcss.config.cjs`
- Create: `styles/tailwind.css`
- Modify: `index.tsx`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Run `npm install --save-dev --save-exact tailwindcss@3.4.17 postcss autoprefixer`.
- [ ] Copy `darkMode`, Inter font, custom slate shades and every semantic RGB token literally into `tailwind.config.cjs`.
- [ ] Configure `content.relative` with root/components/hooks/types sources and negative test globs; leave `plugins` empty.
- [ ] Configure Tailwind and Autoprefixer in `postcss.config.cjs`.
- [ ] Add the three Tailwind directives to `styles/tailwind.css`.
- [ ] Import `./styles/tailwind.css` from `index.tsx`.
- [ ] Remove only the Play CDN script and inline `tailwind.config =` block from `index.html`.
- [ ] Re-run the contract test and confirm it passes.

### Task 4: Verify source, build and clean install

**Files:**
- Create (ignored): `.tmp/tailwind-parity/after/technical-after.json`

- [ ] Confirm `git diff -- styles/theme.css` is empty and its SHA-256 remains `FFE3E20EB4B5B60EE9CB2B4D01EED0F8BD443CA480331CD5A292515F42C2D911`.
- [ ] Run `node --test` and require 0 failures.
- [ ] Run `npm run typecheck` and require exit 0.
- [ ] Run `npm run build` and require exit 0.
- [ ] Search `index.html` and `dist/index.html` for zero `cdn.tailwindcss.com` and zero inline `tailwind.config =`.
- [ ] Verify production CSS contains Agenda priority/category utilities and contains no `animate-in` plugin utility.
- [ ] Run a clean-install proof in a temporary clone/worktree with `npm ci`, `npm run typecheck`, and `npm run build`.

### Task 5: Verify runtime parity and load the preview

**Files:**
- Create (ignored): `.tmp/tailwind-parity/after/*.png`
- Create (ignored): `.tmp/tailwind-parity/diff-report.json`

- [ ] Start `vite preview` on an unused local port from the migrated worktree.
- [ ] Assert zero requests to `cdn.tailwindcss.com` while the page remains styled.
- [ ] Capture the same 24 after screenshots and critical states with the same account/data/viewports/themes.
- [ ] Compare baseline and after images; inspect every non-zero visual diff and record the report privately.
- [ ] Compare relative cascade order and computed body/token/modal/sidebar values with the baseline.
- [ ] Compare compressed local CSS with the baseline local CSS plus the 123,264-byte CDN transfer.
- [ ] Leave the migrated preview available for the user.

### Task 6: Stop at the audit gate

- [ ] Review the diff and acceptance criteria one final time.
- [ ] Report local verification evidence and any remaining QA/PWA limitations.
- [ ] Stop without commit, push, deploy, cache-version change, staging mutation or merge.
- [ ] Defer the same-origin PWA upgrade test to the explicit staging step after code audit and visual QA.
