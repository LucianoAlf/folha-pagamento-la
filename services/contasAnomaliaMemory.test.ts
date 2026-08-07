import assert from 'node:assert/strict';
import test from 'node:test';
import { createContasAnomaliaMemoryApi } from './contasAnomaliaMemory.ts';

function makeFakeClient(options: { rows?: unknown[]; upsertError?: Error | null } = {}) {
  const calls: any[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      calls.push({ table });
      return {
        select: (fields: string) => {
          calls.push({ op: 'select', fields });
          const query = {
            eq: (column: string, value: unknown) => {
              calls.push({ op: 'eq', column, value });
              return query;
            },
            order: async (columnName: string, orderOptions: unknown) => {
              calls.push({ op: 'order', column: columnName, options: orderOptions });
              return { data: options.rows || [], error: null };
            },
          };
          return query;
        },
        upsert: (payload: unknown, upsertOptions: unknown) => {
          calls.push({ op: 'upsert', payload, options: upsertOptions });
          return {
            select: (fields: string) => {
              calls.push({ op: 'select-after-upsert', fields });
              return {
                single: async () => ({
                  data: options.upsertError ? null : { ...(payload as object), id: 'note-1', updated_at: '2026-08-06T00:00:00Z' },
                  error: options.upsertError || null,
                }),
              };
            },
          };
        },
      };
    },
  } as any;
  return { client, calls };
}

test('lê notas com identidade recorrente e normaliza status legado', async () => {
  const { client, calls } = makeFakeClient({ rows: [{ id: 'n1', anomaly_key: 'cg|p|modelo:m1', unidade: 'cg', status: 'verificado', nota: 'ok' }] });
  const api = createContasAnomaliaMemoryApi(client);
  const result = await api.fetchContasAnomaliaNotas('2026-08', 'cg');
  assert.match(calls.find((call) => call.op === 'select').fields, /recorrente_modelo_id/);
  assert.equal(result['cg|p|modelo:m1'].status, 'justificada');
});

test('preserva notas de unidades distintas no cache consolidado', async () => {
  const { client } = makeFakeClient({ rows: [
    { id: 'n1', anomaly_key: 'cg|p|modelo:m1', unidade: 'cg', status: null, nota: 'cg' },
    { id: 'n2', anomaly_key: 'rec|p|modelo:m1', unidade: 'rec', status: null, nota: 'rec' },
  ] });
  const api = createContasAnomaliaMemoryApi(client);
  const result = await api.fetchContasAnomaliaNotas('2026-08', 'todas');
  assert.equal(result['cg|cg|p|modelo:m1'].nota, 'cg');
  assert.equal(result['rec|rec|p|modelo:m1'].nota, 'rec');
});

test('upsert envia a chave composta, identidade e criador', async () => {
  const { client, calls } = makeFakeClient();
  const api = createContasAnomaliaMemoryApi(client);
  await api.upsertContasAnomaliaNota({
    competenciaYM: '2026-08', unidade: 'cg', anomalyKey: 'cg|plano|modelo:m1',
    contaId: 'conta-1', recorrenteModeloId: 'm1', planoContaId: 'plano', nota: 'reajuste', status: 'justificada',
  });
  const upsert = calls.find((call) => call.op === 'upsert');
  assert.deepEqual(upsert.options, { onConflict: 'competencia_ym,unidade,anomaly_key' });
  assert.deepEqual(upsert.payload, {
    competencia_ym: '2026-08', unidade: 'cg', anomaly_key: 'cg|plano|modelo:m1', conta_id: 'conta-1',
    recorrente_modelo_id: 'm1', plano_conta_id: 'plano', nota: 'reajuste', status: 'justificada', created_by: 'user-1',
  });
});

test('rejeita justificativa acima de 2.000 caracteres antes da rede', async () => {
  const { client, calls } = makeFakeClient();
  const api = createContasAnomaliaMemoryApi(client);
  await assert.rejects(
    api.upsertContasAnomaliaNota({ competenciaYM: '2026-08', unidade: 'cg', anomalyKey: 'k', contaId: null, recorrenteModeloId: null, planoContaId: null, nota: 'x'.repeat(2001), status: null }),
    /2.000/,
  );
  assert.equal(calls.some((call) => call.op === 'upsert'), false);
});

test('propaga falha da persistência em vez de declarar salvo', async () => {
  const { client } = makeFakeClient({ upsertError: new Error('network down') });
  const api = createContasAnomaliaMemoryApi(client);
  await assert.rejects(
    api.upsertContasAnomaliaNota({ competenciaYM: '2026-08', unidade: 'cg', anomalyKey: 'k', contaId: null, recorrenteModeloId: null, planoContaId: null, nota: 'reajuste', status: null }),
    /network down/,
  );
});
