import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./folhaAprovacaoWhatsapp.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('folha approval WhatsApp helper targets Ana with the approved playful Maria message', () => {
  assert.match(source, /ANA_WHATSAPP_FOLHA\s*=\s*'5521965910990'/);
  assert.match(source, /sendWhatsappMessage\(ANA_WHATSAPP_FOLHA,\s*buildAnaFolhaAprovadaMessage/);
  assert.match(source, /o chefe aprovou a folha/i);
  assert.match(source, /Pode seguir com a rotina/i);
  assert.match(source, /Maria/);
});

test('folha approval flow notifies Ana only after approving the folha', () => {
  assert.match(appSource, /import\s+\{\s*notifyAnaFolhaAprovada\s*\}\s+from\s+'\.\/services\/folhaAprovacaoWhatsapp'/);
  assert.match(appSource, /await api\.updateFolhaStatus\(folhaAtual\.id,\s*newStatus\)[\s\S]*await notifyAnaFolhaAprovada/);
  assert.match(appSource, /newStatus\s*===\s*'aprovada'/);
});
