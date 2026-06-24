import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./NotificacoesPage.tsx', import.meta.url), 'utf8');

test('Grupos tab uses shared UI shell components instead of hand-rolled controls', () => {
  assert.match(source, /import \{[^}]*Button[^}]*ConfirmDialog[^}]*Modal[^}]*\} from '\.\.\/UI';/s);
  assert.match(source, /<Button[\s\S]*variant="outline"[\s\S]*Adicionar notificacao/);
  assert.match(source, /<Button[\s\S]*variant="primary"[\s\S]*Salvar/);
  assert.match(source, /<Modal[\s\S]*Nova notificacao/);
  assert.match(source, /<ConfirmDialog[\s\S]*variant="danger"/);
  assert.doesNotMatch(source, /window\.confirm/);
});
