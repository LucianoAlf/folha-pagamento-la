import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./FeriasPage.tsx', import.meta.url), 'utf8');

test('nao recarrega programacoes ao filtrar a lista de colaboradores', () => {
  assert.match(source, /const \[colaboradoresBase, setColaboradoresBase\]/);
  assert.match(source, /const colaboradores = useMemo\(/);
  assert.match(source, /const loadProgramacoes = useCallback/);
  assert.doesNotMatch(source, /const \[colaboradoresData, programacoesData\] = await Promise\.all/);
});
