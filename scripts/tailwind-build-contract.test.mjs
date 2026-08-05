import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const rootUrl = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, rootUrl), 'utf8');
}

test('runtime shell no longer depends on the Tailwind Play CDN', async () => {
  const [html, entry] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('index.tsx'),
  ]);

  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /tailwind\.config\s*=/);
  assert.match(entry, /import ['"]\.\/styles\/tailwind\.css['"];?/);
  assert.match(html, /Entrada dos toasts/);
  assert.match(html, /fonts\.googleapis\.com/);
});

test('Tailwind config preserves the current semantic theme and scans only UI sources', () => {
  const config = require('../tailwind.config.cjs');

  assert.equal(config.darkMode, 'class');
  assert.deepEqual(config.content, {
    relative: true,
    files: [
      './index.html',
      './*.{ts,tsx}',
      './components/**/*.{ts,tsx}',
      './hooks/**/*.{ts,tsx}',
      './types/**/*.{ts,tsx}',
      '!./components/**/*.{test,spec}.{ts,tsx}',
      '!./hooks/**/*.{test,spec}.{ts,tsx}',
    ],
  });
  assert.deepEqual(config.theme.extend.fontFamily.sans, ['Inter', 'sans-serif']);
  assert.deepEqual(config.theme.extend.colors, {
    slate: { 850: '#162031', 900: '#0f172a', 950: '#020617' },
    bg: 'rgb(var(--bg) / <alpha-value>)',
    surface: 'rgb(var(--surface) / <alpha-value>)',
    'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
    'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
    primary: 'rgb(var(--text) / <alpha-value>)',
    secondary: 'rgb(var(--text-2) / <alpha-value>)',
    muted: 'rgb(var(--text-3) / <alpha-value>)',
    line: 'rgb(var(--border) / <alpha-value>)',
    'line-strong': 'rgb(var(--border-strong) / <alpha-value>)',
    accent: 'rgb(var(--accent) / <alpha-value>)',
    'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
    success: 'rgb(var(--success) / <alpha-value>)',
    warning: 'rgb(var(--warning) / <alpha-value>)',
    danger: 'rgb(var(--danger) / <alpha-value>)',
    info: 'rgb(var(--info) / <alpha-value>)',
  });
  assert.deepEqual(config.plugins, []);
});

test('PostCSS and the CSS entry use the classic Tailwind v3 pipeline', async () => {
  const postcss = require('../postcss.config.cjs');
  const css = await readProjectFile('styles/tailwind.css');

  assert.deepEqual(Object.keys(postcss.plugins), ['tailwindcss', 'autoprefixer']);
  assert.match(css, /^@tailwind base;\s*@tailwind components;\s*@tailwind utilities;\s*$/);
});

test('Tailwind is pinned and the dormant animation plugin stays absent', async () => {
  const pkg = JSON.parse(await readProjectFile('package.json'));
  const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies };

  assert.equal(pkg.devDependencies.tailwindcss, '3.4.17');
  assert.ok(pkg.devDependencies.postcss);
  assert.ok(pkg.devDependencies.autoprefixer);
  assert.equal(allDependencies['tailwindcss-animate'], undefined);
});

test('mobile month selector keeps its fixed width after build-time class sorting', async () => {
  const contasPagar = await readProjectFile('components/contas/ContasPagarPage.tsx');

  // CustomSelect includes w-full. The local fixed width must be important so
  // Tailwind's build-time utility ordering cannot make the selector grow.
  assert.match(contasPagar, /className="!w-\[7\.25rem\] !px-2\.5/);
});
