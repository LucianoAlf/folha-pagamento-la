import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const duplicateStart = source.indexOf('async duplicateLancamentos');
const duplicateEnd = source.indexOf('async updateFolhaStatus', duplicateStart);
const duplicateBody =
  duplicateStart >= 0 && duplicateEnd > duplicateStart
    ? source.slice(duplicateStart, duplicateEnd)
    : '';

test('duplicating a competence never copies payer-account reconciliation', () => {
  assert.ok(duplicateBody, 'duplicateLancamentos body not found');
  assert.doesNotMatch(duplicateBody, /conta_pagadora_id/);
});
