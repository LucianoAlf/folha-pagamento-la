import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./UI.tsx', import.meta.url), 'utf8');

test('CustomSelect deixa o placeholder para selects sem uma opcao vazia', () => {
  assert.match(
    source,
    /const emptyOption = options\.find\(\(o\) => o\.value === ''\);/,
    'o componente precisa distinguir placeholder de opcao vazia real',
  );
  assert.match(
    source,
    /value === '' \? \(emptyOption \? EMPTY_SENTINEL : undefined\) : value/,
    'sem opcao vazia, o valor controlado deve ficar undefined para o Radix exibir o placeholder',
  );
});
