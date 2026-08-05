import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const rhSource = readFileSync(new URL('./rhJornadaService.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

function methodSource(source, name) {
  const start = source.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `Metodo ${name} precisa existir.`);
  const next = source.indexOf('\n  async ', start + 8);
  return source.slice(start, next === -1 ? source.length : next);
}

test('Jornada RH usa consulta estreita e resiliente de colaboradores', () => {
  const apiMethod = methodSource(apiSource, 'fetchRhColaboradores');
  const serviceMethod = methodSource(rhSource, 'fetchColaboradores');

  assert.match(apiMethod, /fetchRhRead\(/);
  assert.match(apiMethod, /select=id%2Cnome%2Cfuncao%2Ctipo%2Cdepartamento%2Cunidade_fixa%2Cis_rateado%2Cativo%2Cdata_admissao%2Cstatus%2Carquivado_em/);
  assert.doesNotMatch(apiMethod, /select=\*/);
  assert.match(serviceMethod, /api\.fetchRhColaboradores\(\)/);
});

test('frontend salva perfil sem enviar id ou role controlado pelo navegador', () => {
  const apiMethod = methodSource(apiSource, 'updateOwnUserProfile');
  assert.match(apiMethod, /supabase\s*\.rpc\('user_profile_self_update'/);
  assert.doesNotMatch(apiMethod, /\brole\b/);

  const saveStart = appSource.indexOf('const saveProfile = async');
  const saveEnd = appSource.indexOf('\n  };', saveStart);
  const saveProfile = appSource.slice(saveStart, saveEnd);
  assert.match(saveProfile, /api\.updateOwnUserProfile\(/);
  assert.doesNotMatch(saveProfile, /\brole\s*:/);
  assert.doesNotMatch(saveProfile, /\bid\s*:/);
});
