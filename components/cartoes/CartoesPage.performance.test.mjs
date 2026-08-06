import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('./CartoesPage.tsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../../services/cartoesService.ts', import.meta.url), 'utf8');

test('carrega cartoes criticos antes das referencias de formulario', () => {
  assert.match(service, /export async function fetchCartoesResumo\(/);
  assert.match(service, /export async function fetchCartoesReferencias\(/);
  assert.match(service, /abortSignal\(signal\)/);
  assert.match(page, /const data = await fetchCartoesResumo\(\);/);
  assert.match(page, /void loadReferences\(\);/);
  assert.doesNotMatch(page, /if \(loading\) return <LoadingSpinner \/>;/);
});
