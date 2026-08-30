import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureRecorrentesInstancias, ocorrenciasSemanaisNoMes } from "./recorrentesMes.ts";

function makeAdmin({ recorrentes, existentes }) {
  const upserts = [];
  const inserts = [];
  const selects = [];

  function makeQuery(table) {
    const state = { table, filters: [] };
    const query = {
      select(columns) {
        state.columns = columns;
        selects.push({ ...state });
        return query;
      },
      eq(column, value) {
        state.filters.push(["eq", column, value]);
        return query;
      },
      neq(column, value) {
        state.filters.push(["neq", column, value]);
        return query;
      },
      is(column, value) {
        state.filters.push(["is", column, value]);
        return Promise.resolve({ data: recorrentes, error: null });
      },
      not(column, operator, value) {
        state.filters.push(["not", column, operator, value]);
        return Promise.resolve({ data: existentes, error: null });
      },
      upsert(payload, options) {
        upserts.push({ table, payload, options });
        return Promise.resolve({ error: null });
      },
      insert(payload) {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    };
    return query;
  }

  return {
    admin: {
      from(table) {
        return makeQuery(table);
      },
    },
    upserts,
    inserts,
    selects,
  };
}

function makeAdminWithUpsertError({ recorrentes, existentes, upsertError }) {
  const { admin, upserts, inserts } = makeAdmin({ recorrentes, existentes });
  const originalFrom = admin.from;
  admin.from = (table) => {
    const query = originalFrom(table);
    query.upsert = (payload, options) => {
      upserts.push({ table, payload, options });
      return Promise.resolve({ error: upsertError });
    };
    return query;
  };
  return { admin, upserts, inserts };
}

test("materializa recorrentes faltantes no mes alvo e retorna a quantidade", async () => {
  const modelo = {
    id: "modelo-1",
    descricao: "Aluguel Loja 170",
    valor: 1234.56,
    data_vencimento: "2026-07-05",
    competencia: "2026-07-01",
    tipo_lancamento: "recorrente",
    recorrente_modelo_id: null,
    status: "pendente",
    data_pagamento: "2026-07-05",
    metodo_pagamento: "pix",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
  const jaGerado = {
    ...modelo,
    id: "modelo-2",
    descricao: "Software",
  };
  const { admin, upserts } = makeAdmin({
    recorrentes: [modelo, jaGerado],
    // dedup agora e por data: a instancia de modelo-2 em out/2026 vence em 2026-10-05.
    existentes: [{ recorrente_modelo_id: "modelo-2", data_vencimento: "2026-10-05" }],
  });

  const result = await ensureRecorrentesInstancias(admin, "2026-10");

  assert.equal(result.criadas, 1);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].options, {
    onConflict: "recorrente_modelo_id,data_vencimento",
    ignoreDuplicates: true,
  });
  assert.equal(upserts[0].payload.length, 1);
  assert.equal(upserts[0].payload[0].recorrente_modelo_id, "modelo-1");
  assert.equal(upserts[0].payload[0].competencia, "2026-10-01");
  assert.equal(upserts[0].payload[0].data_vencimento, "2026-10-05");
  assert.equal(upserts[0].payload[0].status, "pendente");
  assert.equal(upserts[0].payload[0].data_pagamento, null);
  assert.equal(upserts[0].payload[0].metodo_pagamento, null);
  assert.equal("id" in upserts[0].payload[0], false);
  assert.equal("created_at" in upserts[0].payload[0], false);
  assert.equal("updated_at" in upserts[0].payload[0], false);
});

test("nao duplica o mes inicial do modelo", async () => {
  const { admin, upserts } = makeAdmin({
    recorrentes: [
      {
        id: "modelo-1",
        data_vencimento: "2026-07-05",
        competencia: "2026-07-01",
        tipo_lancamento: "recorrente",
        recorrente_modelo_id: null,
        status: "pendente",
      },
    ],
    existentes: [],
  });

  const result = await ensureRecorrentesInstancias(admin, "2026-07");

  assert.equal(result.criadas, 0);
  assert.equal(upserts.length, 0);
});

test("mensal NAO duplica quando a instancia do mes teve o vencimento ajustado", async () => {
  // Regressao do bug de 29/08: o modelo vence dia 02; a instancia de agosto foi paga
  // no dia 03 e ficou com data_vencimento 2026-08-03. Chavear a dedup por data nao
  // reconheceria essa instancia (esperaria 2026-08-02) e recriaria o mes inteiro.
  // A dedup mensal deve ser por COMPETENCIA: a instancia ja existe, entao nada e criado.
  const modelo = {
    id: "light-rec",
    descricao: "PG Light Loja 170 - (Recreio)",
    data_vencimento: "2026-07-02",
    competencia: "2026-07-01",
    tipo_lancamento: "recorrente",
    recorrente_modelo_id: null,
    recorrente_frequencia: "mensal",
    status: "pendente",
  };
  const { admin, upserts, inserts } = makeAdmin({
    recorrentes: [modelo],
    existentes: [{ recorrente_modelo_id: "light-rec", data_vencimento: "2026-08-03" }],
  });

  const result = await ensureRecorrentesInstancias(admin, "2026-08");

  assert.equal(result.criadas, 0);
  assert.equal(upserts.length, 0);
  assert.equal(inserts.length, 0);
});

test("usa insert quando o banco nao tem constraint para on conflict", async () => {
  const modelo = {
    id: "modelo-1",
    data_vencimento: "2026-07-05",
    competencia: "2026-07-01",
    tipo_lancamento: "recorrente",
    recorrente_modelo_id: null,
    status: "pendente",
  };
  const { admin, upserts, inserts } = makeAdminWithUpsertError({
    recorrentes: [modelo],
    existentes: [],
    upsertError: {
      message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
    },
  });

  const result = await ensureRecorrentesInstancias(admin, "2026-10");

  assert.equal(result.criadas, 1);
  assert.equal(upserts.length, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "contas_pagar");
  assert.equal(inserts[0].payload[0].recorrente_modelo_id, "modelo-1");
});

test("ocorrenciasSemanaisNoMes: leque no mesmo mes exclui a ancora", () => {
  // ancora sexta 2026-08-07; agosto tem sextas 07,14,21,28
  assert.deepEqual(
    ocorrenciasSemanaisNoMes("2026-08-07", "2026-08"),
    ["2026-08-14", "2026-08-21", "2026-08-28"]
  );
});

test("ocorrenciasSemanaisNoMes: mes seguinte inclui todas as ocorrencias", () => {
  // ancora 2026-08-07; setembro: 04,11,18,25
  assert.deepEqual(
    ocorrenciasSemanaisNoMes("2026-08-07", "2026-09"),
    ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]
  );
});

test("ocorrenciasSemanaisNoMes: mes anterior a ancora e vazio", () => {
  assert.deepEqual(ocorrenciasSemanaisNoMes("2026-08-07", "2026-07"), []);
});

test("modelo semanal gera as demais semanas do mes (leque por data)", async () => {
  const modelo = {
    id: "sem-1",
    descricao: "Faxina Recreio",
    valor: 150,
    data_vencimento: "2026-08-07",
    competencia: "2026-08-01",
    tipo_lancamento: "recorrente",
    recorrente_modelo_id: null,
    recorrente_frequencia: "semanal",
    status: "pendente",
  };
  const { admin, upserts } = makeAdmin({ recorrentes: [modelo], existentes: [] });

  const result = await ensureRecorrentesInstancias(admin, "2026-08");

  assert.equal(result.criadas, 3);
  const datas = upserts[0].payload.map((p) => p.data_vencimento).sort();
  assert.deepEqual(datas, ["2026-08-14", "2026-08-21", "2026-08-28"]);
  assert.equal(upserts[0].payload.every((p) => p.recorrente_modelo_id === "sem-1"), true);
  assert.equal(upserts[0].payload.every((p) => p.competencia === "2026-08-01"), true);
  assert.deepEqual(upserts[0].options, {
    onConflict: "recorrente_modelo_id,data_vencimento",
    ignoreDuplicates: true,
  });
});

test("modelo semanal nao regera ocorrencia ja existente (dedup por data)", async () => {
  const modelo = {
    id: "sem-1",
    data_vencimento: "2026-08-07",
    competencia: "2026-08-01",
    tipo_lancamento: "recorrente",
    recorrente_modelo_id: null,
    recorrente_frequencia: "semanal",
    status: "pendente",
  };
  const { admin, upserts } = makeAdmin({
    recorrentes: [modelo],
    existentes: [{ recorrente_modelo_id: "sem-1", data_vencimento: "2026-08-14" }],
  });

  const result = await ensureRecorrentesInstancias(admin, "2026-08");

  assert.equal(result.criadas, 2);
  const datas = upserts[0].payload.map((p) => p.data_vencimento).sort();
  assert.deepEqual(datas, ["2026-08-21", "2026-08-28"]);
});
