import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../Sidebar.tsx', import.meta.url), 'utf8');
const cartoesSource = readFileSync(new URL('./CartoesPage.tsx', import.meta.url), 'utf8');

test('Faturas is not exposed as a global module in App or Sidebar', () => {
  assert.doesNotMatch(sidebarSource, /id:\s*'faturas'/);
  assert.doesNotMatch(appSource, /\{\s*id:\s*'faturas'/);
  assert.doesNotMatch(appSource, /currentModule\s*===\s*'faturas'/);
});

test('CartoesPage owns the Faturas tab and card shortcut', () => {
  assert.match(cartoesSource, /FaturasCartaoPage/);
  assert.match(cartoesSource, /setCartoesTab\('faturas'/);
  assert.match(cartoesSource, /params\.set\('tab',\s*'faturas'\)/);
  assert.doesNotMatch(cartoesSource, /module:\s*'faturas'/);
});
