# Dashboard KPI Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the ten Jornada RH dashboard indicators into two compact, readable rows of five on wide screens, with responsive fallbacks on smaller screens.

**Architecture:** Keep KPI values and business calculations in `DashboardTab.tsx`, but move the display order, labels, grouping, and tone metadata into a pure helper. Render each group through the existing `Card` component and semantic theme tokens. The database and service contracts remain unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node test runner, Vite.

---

### Task 1: Define and test the KPI groups

**Files:**
- Create: `components/rh-jornada/tabs/dashboardKpis.ts`
- Test: `components/rh-jornada/tabs/dashboardKpis.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that the helper returns exactly two groups, each with five KPIs, in the approved order: operation first, development second.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test components/rh-jornada/tabs/dashboardKpis.test.ts`

Expected: module-not-found because the helper does not exist yet.

- [ ] **Step 3: Implement the pure helper**

Create a typed `getDashboardKpiGroups` function that accepts the ten already-calculated values and returns the two groups with labels, subtitles, and semantic color tones. It must not fetch data or mutate state.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test components/rh-jornada/tabs/dashboardKpis.test.ts`

Expected: 3 assertions pass with 0 failures.

### Task 2: Render the compact responsive grid

**Files:**
- Modify: `components/rh-jornada/tabs/DashboardTab.tsx`

- [ ] **Step 1: Replace the ten repeated cards with the two helper-driven groups**

Render one section per group, with a small group label and divider. Use compact cards (`min-h` around 92px, reduced padding), preserve the existing value colors, and render the metrics with `map` so the approved order stays in one source of truth.

- [ ] **Step 2: Apply responsive columns**

Use two columns on phones, three on medium screens, and five when the available desktop layout can support it. Allow long subtitles to wrap to two lines instead of clipping.

- [ ] **Step 3: Run typecheck and the focused test**

Run: `node --test components/rh-jornada/tabs/dashboardKpis.test.ts` and `npm run typecheck`.

Expected: all helper assertions pass and TypeScript exits with code 0.

### Task 3: Verify and publish

**Files:**
- No additional source files.

- [ ] **Step 1: Build the production bundle**

Run: `npm run build`.

Expected: Vite exits with code 0.

- [ ] **Step 2: Check the working tree**

Run: `git diff --check` and confirm there are no whitespace errors.

- [ ] **Step 3: Commit and push**

Use commit message `fix(rh): compactar indicadores do dashboard` and push `main`, allowing the connected Vercel project to deploy the production build.
