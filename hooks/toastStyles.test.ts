import assert from 'node:assert/strict';
import test from 'node:test';

import { getToastPresentation } from './toastStyles.ts';

test('success toast uses a neutral readable surface instead of a green translucent card', () => {
  const style = getToastPresentation('success');

  assert.match(style.container, /\bbg-surface\b/);
  assert.match(style.container, /\btext-primary\b/);
  assert.doesNotMatch(style.container, /bg-emerald|text-slate|backdrop-blur|shadow-black/);
  assert.equal(style.message, 'text-sm font-black text-primary leading-snug break-words');
  assert.equal(style.close, 'shrink-0 rounded-lg p-1 text-muted hover:text-primary hover:bg-surface-2 transition-colors');
});

test('toast variants keep semantic accent colors only on the icon and edge', () => {
  assert.match(getToastPresentation('success').accent, /success/);
  assert.match(getToastPresentation('error').accent, /danger/);
  assert.match(getToastPresentation('info').accent, /info/);
});
