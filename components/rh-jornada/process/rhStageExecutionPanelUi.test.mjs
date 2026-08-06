import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const theme = readFileSync(new URL('../../../styles/theme.css', import.meta.url), 'utf8');

test('o design system neutraliza text-white em botoes desabilitados', () => {
  assert.match(
    theme,
    /button:disabled\.text-white\s*\{[^}]*color:\s*rgb\(var\(--text-3\)\)\s*!important/s,
    'botoes disabled com text-white precisam usar o token de texto muted',
  );
});
