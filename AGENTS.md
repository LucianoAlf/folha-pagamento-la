# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Super Folha (LA Music Payroll) is a React + Vite SPA that connects to a hosted Supabase backend. There is no local database or Docker setup. The `supabase/` directory contains Deno-based Edge Functions deployed to the hosted Supabase project -- these are not run locally.

### Environment variables

The app requires a `.env.local` file at the project root with:
- `VITE_SUPABASE_URL` - the Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - the Supabase anonymous key

These must be provided as secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Without valid credentials the app renders the login page but authentication requests fail with "Failed to fetch".

### Running the dev server

- `npm run dev` starts Vite on port 3000 (binds to `0.0.0.0`).
- `npm run build` produces a production build in `dist/`.

### Lint and tests

- No ESLint or test framework is configured in this project. `tsc --noEmit` reports errors in the `supabase/functions/` directory (Deno types) and some pre-existing type issues in components -- these do not affect the Vite build.
- The Vite build (`npm run build`) is the primary correctness check for the frontend.

### Gotchas

- Tailwind CSS is loaded via CDN (`<script src="https://cdn.tailwindcss.com">` in `index.html`), not as a PostCSS plugin. Changes to Tailwind config are in `index.html`, not `tailwind.config.js`.
- The service worker is automatically disabled on `localhost` to avoid caching issues during development.
- The `supabase/functions/` directory uses Deno imports (URL-based) and `Deno` globals. Do not attempt to run or type-check these with Node.js tooling.
