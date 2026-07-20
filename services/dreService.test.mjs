import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dreService.ts', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../types/dre.ts', import.meta.url), 'utf8');

function exportedFunctionSource(name) {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${marker} to be exported.`);

  const nextExport = source.indexOf('\nexport async function ', start + marker.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

function rpcPayloadSource(functionSource, rpcName) {
  const marker = `supabase.rpc('${rpcName}',`;
  const rpcStart = functionSource.indexOf(marker);
  assert.notEqual(rpcStart, -1, `Expected ${marker} call.`);

  const payloadStart = functionSource.indexOf('{', rpcStart + marker.length);
  assert.notEqual(payloadStart, -1, `Expected ${rpcName} payload.`);

  let depth = 0;
  for (let index = payloadStart; index < functionSource.length; index += 1) {
    if (functionSource[index] === '{') depth += 1;
    if (functionSource[index] === '}') depth -= 1;
    if (depth === 0) return functionSource.slice(payloadStart, index + 1);
  }

  assert.fail(`Expected ${rpcName} payload to close.`);
}

test('DRE reads only through the two dedicated RPC contracts', () => {
  const consultaSource = exportedFunctionSource('fetchDreConsulta');
  const detalhesSource = exportedFunctionSource('fetchDreDetalhes');
  const consultaPayload = rpcPayloadSource(consultaSource, 'dre_consultar');
  const detalhesPayload = rpcPayloadSource(detalhesSource, 'dre_detalhes');

  assert.match(consultaPayload, /p_competencia:\s*competencia,/);
  assert.match(consultaPayload, /p_regime:\s*regime,/);
  assert.match(consultaPayload, /p_unidade:\s*unidade,/);
  assert.match(detalhesPayload, /p_competencia:\s*args\.competencia,/);
  assert.match(detalhesPayload, /p_regime:\s*args\.regime,/);
  assert.match(detalhesPayload, /p_unidade:\s*args\.unidade,/);
  assert.match(detalhesPayload, /p_cursor:\s*cursor,/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.(insert|update|delete)\(/);
});

test('DRE service requires the selected operational unit in both public APIs', () => {
  assert.match(exportedFunctionSource('fetchDreConsulta'), /regime:\s*DreRegime,\s*\n\s*unidade:\s*DreUnidade/);
  assert.match(exportedFunctionSource('fetchDreDetalhes'), /regime:\s*DreRegime;\s*\n\s*unidade:\s*DreUnidade;/);
});

test('DRE detail pages include the selected unit returned by the RPC', () => {
  assert.match(
    typesSource,
    /export interface DreDetalhesPagina\s*\{[^}]*\bunidade:\s*DreUnidade;/s,
  );
});
