import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('fetchColaboradores hides archived collaborators', () => {
  assert.match(source, /colaboradores\?select=\*&arquivado_em=is\.null&order=nome/);
});

test('deleteColaborador archives instead of hard deleting historical rows', () => {
  assert.match(source, /async deleteColaborador\(id: number\): Promise<void>/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /arquivado_em: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(source, /method: 'DELETE'[\s\S]*Erro ao excluir colaborador/);
});
