import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./feriasService.ts', import.meta.url), 'utf8');

test('status de ferias repete a leitura quando o Supabase sofre timeout transitorio', () => {
  assert.match(source, /import \{ fetchRhRead \} from '\.\/rhReadResilience';/);

  const method = source.match(
    /async fetchColaboradoresStatus[\s\S]*?return colaboradores;\s*\n\s*},/,
  )?.[0];

  assert.ok(method, 'fetchColaboradoresStatus precisa continuar existindo');
  assert.match(method, /await fetchRhRead\(url, \{ headers \}, \{/);
  assert.match(method, /label: 'A lista de colaboradores de ferias'/);
  assert.doesNotMatch(method, /await fetch\(url, \{ headers \}\)/);
});
