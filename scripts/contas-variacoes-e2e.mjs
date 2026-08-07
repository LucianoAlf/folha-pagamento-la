import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const PREFIX = 'TEST_CONTAS_MEMORIA_20260806';
const COMPETENCIA = '2026-08-01';
const BASE = '2026-07-01';
const UNIDADE = 'cg';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function createFixture(admin) {
  const { data: plano, error: planoError } = await admin
    .from('plano_contas')
    .select('id')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();
  if (planoError) throw planoError;
  if (!plano?.id) throw new Error('Nenhum plano de contas ativo para a fixture.');

  const modeloId = randomUUID();
  const rows = [
    { descricao: `${PREFIX}_RECORRENTE_JUL`, unidade: UNIDADE, valor: 100, data_lancamento: BASE, data_vencimento: BASE, competencia: BASE, status: 'pendente', tipo_lancamento: 'recorrente', recorrente_modelo_id: modeloId, plano_conta_id: plano.id },
    { descricao: `${PREFIX}_RECORRENTE_AGO`, unidade: UNIDADE, valor: 161, data_lancamento: COMPETENCIA, data_vencimento: COMPETENCIA, competencia: COMPETENCIA, status: 'pendente', tipo_lancamento: 'recorrente', recorrente_modelo_id: modeloId, plano_conta_id: plano.id },
    { descricao: `${PREFIX}_SEM_MODELO_JUL`, unidade: UNIDADE, valor: 200, data_lancamento: BASE, data_vencimento: BASE, competencia: BASE, status: 'pendente', tipo_lancamento: 'eventual', recorrente_modelo_id: null, plano_conta_id: plano.id },
    { descricao: `${PREFIX}_SEM_MODELO_AGO_NOME_NOVO`, unidade: UNIDADE, valor: 230, data_lancamento: COMPETENCIA, data_vencimento: COMPETENCIA, competencia: COMPETENCIA, status: 'pendente', tipo_lancamento: 'eventual', recorrente_modelo_id: null, plano_conta_id: plano.id },
    { descricao: `${PREFIX}_ITEM_REMOVIDO`, unidade: UNIDADE, valor: 80, data_lancamento: BASE, data_vencimento: BASE, competencia: BASE, status: 'pendente', tipo_lancamento: 'eventual', recorrente_modelo_id: null, plano_conta_id: plano.id },
    { descricao: `${PREFIX}_ITEM_NOVO`, unidade: UNIDADE, valor: 75, data_lancamento: COMPETENCIA, data_vencimento: COMPETENCIA, competencia: COMPETENCIA, status: 'pendente', tipo_lancamento: 'eventual', recorrente_modelo_id: null, plano_conta_id: plano.id },
  ];
  const { data, error } = await admin.from('contas_pagar').insert(rows).select('id');
  if (error) throw error;
  return { ids: (data || []).map((row) => row.id), noteKeys: [] };
}

async function deleteFixture(admin, fixture) {
  if (fixture?.noteKeys?.length) {
    const { error } = await admin.from('contas_anomalia_notas').delete().eq('competencia_ym', '2026-08').in('anomaly_key', fixture.noteKeys);
    if (error) throw error;
  }
  if (fixture?.ids?.length) {
    const { error } = await admin.from('contas_pagar').delete().in('id', fixture.ids);
    if (error) throw error;
  }
  const { error: prefixError } = await admin.from('contas_pagar').delete().like('descricao', `${PREFIX}%`);
  if (prefixError) throw prefixError;
}

async function countFixtureRows(admin) {
  const { count, error } = await admin.from('contas_pagar').select('id', { count: 'exact', head: true }).like('descricao', `${PREFIX}%`);
  if (error) throw error;
  return count || 0;
}

async function runBrowser(baseUrl, storageState) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?module=contas&page=dashboard`, { waitUntil: 'networkidle' });
    const unidade = page.getByRole('button', { name: 'Campo Grande', exact: true });
    if (await unidade.count()) await unidade.click();
    await page.getByText('Alertas Detectados').click();
    const card = page.locator('[data-variation-key]').first();
    await card.getByLabel('Justificativa operacional').fill('Reajuste confirmado no contrato.');
    await card.getByRole('button', { name: 'Salvar justificativa' }).click();
    await assertVisible(page.getByText('Reajuste confirmado no contrato.'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Alertas Detectados').click();
    await assertVisible(page.getByText('Reajuste confirmado no contrato.'));
    const valuesBefore = await page.locator('[data-variation-key]').first().innerText();
    const comparative = page.getByRole('button', { name: /^Comparativo$/i });
    if (await comparative.count()) {
      await page.route('**/functions/v1/ai-contas-comparativo*', (route) => route.abort());
      await comparative.click();
      await page.getByText('Atualizar', { exact: true }).click().catch(() => {});
      await page.waitForTimeout(500);
      const valuesAfter = await page.locator('[data-variation-key]').first().innerText().catch(() => '');
      assert.deepEqual(
        valuesAfter ? valuesAfter.match(/R\$[^\n]+|[+-]\d+[,.]\d+%/g)?.slice(0, 4) : null,
        valuesBefore.match(/R\$[^\n]+|[+-]\d+[,.]\d+%/g)?.slice(0, 4) || null,
        'falha da IA não pode alterar os números determinísticos da variação',
      );
      const comparatorCard = page.locator('[data-variation-key]').first();
      if (await comparatorCard.count()) {
        await comparatorCard.getByLabel('Justificativa operacional').fill('Salvamento manual durante indisponibilidade da IA.');
        await comparatorCard.getByRole('button', { name: 'Salvar justificativa' }).click();
        await assertVisible(page.getByText('Salvamento manual durante indisponibilidade da IA.'));
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function assertVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const storageState = process.env.CONTAS_MEMORIA_STORAGE_STATE;
  if (!url || !serviceKey || !anonKey || !storageState) {
    console.log('E2E de memória não executado: configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY e CONTAS_MEMORIA_STORAGE_STATE. Nenhuma fixture foi criada.');
    return;
  }
  if (!existsSync(storageState)) throw new Error(`Storage state não encontrado: ${storageState}`);
  if (!process.env.CONTAS_MEMORIA_E2E_ALLOW_REMOTE && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    throw new Error('Bloqueado por segurança: use CONTAS_MEMORIA_E2E_ALLOW_REMOTE=1 para fixture fora do Supabase local.');
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let fixture = { ids: [], noteKeys: [] };
  let vite;
  try {
    fixture = await createFixture(admin);
    const { data: forbiddenRows } = await anon.from('contas_anomalia_notas').select('id').limit(1);
    assert.equal(forbiddenRows?.length || 0, 0, 'usuário anônimo não deve ler memória');

    const key = `${UNIDADE}|fixture|modelo:${randomUUID()}`;
    fixture.noteKeys.push(key);
    const payload = { competencia_ym: '2026-08', unidade: UNIDADE, anomaly_key: key, conta_id: fixture.ids[1] || null, recorrente_modelo_id: null, plano_conta_id: null, nota: 'primeira', status: 'pendente' };
    const { error: forbiddenWrite } = await anon.from('contas_anomalia_notas').upsert(payload, { onConflict: 'competencia_ym,unidade,anomaly_key' });
    assert.ok(forbiddenWrite, 'usuário anônimo não deve gravar memória');
    await admin.from('contas_anomalia_notas').upsert(payload, { onConflict: 'competencia_ym,unidade,anomaly_key' });
    await admin.from('contas_anomalia_notas').upsert({ ...payload, nota: 'segunda', status: 'justificada' }, { onConflict: 'competencia_ym,unidade,anomaly_key' });
    const { data: notes, error: noteError } = await admin.from('contas_anomalia_notas').select('nota').eq('competencia_ym', '2026-08').eq('unidade', UNIDADE).eq('anomaly_key', key);
    if (noteError) throw noteError;
    assert.equal(notes?.length, 1);
    assert.equal(notes?.[0]?.nota, 'segunda');

    vite = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
    await vite.listen();
    const address = vite.httpServer?.address();
    await runBrowser(`http://127.0.0.1:${address.port}`, storageState);
    console.log('E2E de memória concluído.');
  } finally {
    try {
      if (vite) await vite.close();
      await deleteFixture(admin, fixture);
      assert.equal(await countFixtureRows(admin), 0, `fixture ainda existe; IDs: ${fixture.ids.join(',')}`);
      console.log('Fixture removida e confirmada ausente.');
    } catch (cleanupError) {
      console.error('FALHA NO CLEANUP — remova manualmente estes IDs:', fixture.ids);
      throw cleanupError;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
