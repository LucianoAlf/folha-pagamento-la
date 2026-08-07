import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createServer } from 'vite';

test('renderiza números determinísticos, justificativa e rascunho da IA', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  t.after(async () => vite.close());
  const loaded = await vite.ssrLoadModule('/components/contas/ContasVariationAlertCard.tsx');
  const card = loaded.ContasVariationAlertCard;
  const markup = renderToStaticMarkup(React.createElement(card, {
    data: {
      key: 'cg|plano|modelo:m1', titulo: 'Energia', descricao: 'Conta de energia', unidade: 'cg',
      prev: 100, curr: 161, diff: 61, perc: 61, statusVariacao: 'RECORRENTE',
      notaSalva: '', statusOperacional: null, sugestaoJustificativa: 'Leitura maior no período.',
    },
    onSave: async () => {},
  }));
  assert.match(markup, /R\$|61/);
  assert.match(markup, /Sugestão da IA/);
  assert.match(markup, /Salvar justificativa/);
});

test('mostra status salvo mesmo sem texto livre', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  try {
    const loaded = await vite.ssrLoadModule('/components/contas/ContasVariationAlertCard.tsx');
    const markup = renderToStaticMarkup(React.createElement(loaded.ContasVariationAlertCard, {
      data: {
        key: 'cg|plano|modelo:m1', titulo: 'Energia', descricao: 'Conta de energia', unidade: 'cg',
        prev: 100, curr: 161, diff: 61, perc: 61, statusVariacao: 'RECORRENTE',
        notaSalva: '', statusOperacional: 'monitorar', sugestaoJustificativa: null,
      },
      onSave: async () => {},
    }));
    assert.match(markup, /Status: Monitorar/);
  } finally {
    await vite.close();
  }
});
