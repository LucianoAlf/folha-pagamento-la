import assert from "node:assert/strict";
import { test } from "node:test";
import { avaliarAgendamentoGrupo } from "./whatsappGrupoDispatcher.ts";

const nowSP = {
  date: "2026-06-24",
  time: "09:30",
  dow: 3,
  dom: 24,
};

test("diario dispara depois do horario quando ainda nao rodou hoje", () => {
  const result = avaliarAgendamentoGrupo({
    notificacao: {
      frequencia: "diario",
      horario: "09:00:00",
      ultima_execucao: "2026-06-23T12:00:00.000Z",
    },
    nowSP,
  });

  assert.equal(result.horaChegou, true);
  assert.equal(result.jaRodouHoje, false);
  assert.equal(result.na_hora, true);
});

test("semanal so dispara no dia da semana configurado", () => {
  const result = avaliarAgendamentoGrupo({
    notificacao: {
      frequencia: "semanal",
      horario: "08:00",
      dia_semana: 4,
      ultima_execucao: null,
    },
    nowSP,
  });

  assert.equal(result.horaChegou, true);
  assert.equal(result.jaRodouHoje, false);
  assert.equal(result.na_hora, false);
});

test("pula quando ultima_execucao ja foi hoje no fuso de Sao Paulo", () => {
  const result = avaliarAgendamentoGrupo({
    notificacao: {
      frequencia: "mensal",
      horario: "08:00",
      dia_mes: 24,
      ultima_execucao: "2026-06-24T12:05:00.000Z",
    },
    nowSP,
  });

  assert.equal(result.horaChegou, true);
  assert.equal(result.jaRodouHoje, true);
  assert.equal(result.na_hora, true);
  assert.equal(result.deveDisparar, false);
});
