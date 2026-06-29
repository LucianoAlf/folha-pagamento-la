import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContaAuditCard.tsx', import.meta.url), 'utf8');

test('payment date uses date-only formatter to avoid timezone shifts', () => {
  assert.match(source, /formatDateBR\(conta\.data_pagamento!\)/);
  assert.doesNotMatch(source, /new Date\(conta\.data_pagamento!\)/);
});
