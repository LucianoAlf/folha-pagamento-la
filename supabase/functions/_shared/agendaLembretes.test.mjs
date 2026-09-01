import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planejarEnvios, formatLembrete } from './agendaLembretes.ts';

const agora = new Date('2026-09-02T11:00:00Z'); // 08:00 SP
const base = {
  tarefa_id: 't1', titulo: 'Conciliar 8641', descricao: null, prioridade: 'alta', categoria: 'financeiro',
  vencimento_em: '2026-09-02T12:00:00Z', momento: '2026-09-02T11:30:00Z',
  whatsapp_ativo: true, agenda_lembrete_tarefas_ativo: true,
};

test('dois destinatarios da mesma tarefa geram dois envios, cada um pro seu numero', () => {
  const linhas = [
    { ...base, user_id: 'u-rose', nome: 'Rose', whatsapp_numero: '+55 (21) 99999-0001', momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u-ana', nome: 'Ana', whatsapp_numero: '5521999990002', momento: '2026-09-02T10:30:00Z' },
  ];
  const { envios, skipped } = planejarEnvios(linhas, agora, false);
  assert.equal(envios.length, 2);
  assert.deepEqual(envios.map((e) => e.numero).sort(), ['5521999990001', '5521999990002']);
  assert.equal(envios[0].tarefa_id, 't1');
  assert.equal(envios[0].scheduled_for, '2026-09-02T10:30:00.000Z');
  assert.equal(skipped, 0);
});

test('sem config, whatsapp desligado ou lembretes desativados -> skipped', () => {
  const linhas = [
    { ...base, user_id: 'u1', nome: 'A', whatsapp_numero: null, momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u2', nome: 'B', whatsapp_numero: '5521999990002', whatsapp_ativo: false, momento: '2026-09-02T10:30:00Z' },
    { ...base, user_id: 'u3', nome: 'C', whatsapp_numero: '5521999990003', agenda_lembrete_tarefas_ativo: false, momento: '2026-09-02T10:30:00Z' },
  ];
  const { envios, skipped } = planejarEnvios(linhas, agora, false);
  assert.equal(envios.length, 0);
  assert.equal(skipped, 3);
});

test('momento no futuro -> skipped (sem force); com force envia', () => {
  const linhas = [{ ...base, user_id: 'u1', nome: 'A', whatsapp_numero: '5521999990001', momento: '2026-09-02T11:30:00Z' }];
  assert.equal(planejarEnvios(linhas, agora, false).envios.length, 0);
  assert.equal(planejarEnvios(linhas, agora, true).envios.length, 1);
});

test('momento nulo (dia inteiro) nunca vira ping', () => {
  const linhas = [{ ...base, user_id: 'u1', nome: 'A', whatsapp_numero: '5521999990001', momento: null }];
  assert.equal(planejarEnvios(linhas, agora, true).envios.length, 0);
});

test('formatLembrete mostra hora em SP e diz "Venceu" quando ja passou', () => {
  const futura = formatLembrete({ ...base, vencimento_em: '2026-09-02T12:00:00Z' }, agora);
  assert.match(futura, /Vence às 09:00/);
  const passada = formatLembrete({ ...base, vencimento_em: '2026-09-01T23:30:00Z' }, agora);
  assert.match(passada, /Venceu às 20:30/);
  assert.match(futura, /\*Conciliar 8641\*/);
});
