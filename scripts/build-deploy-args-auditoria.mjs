#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = {
  project_id: 'ubdvtjbitozhkuvvqkxj',
  name: 'ai-contas-auditoria',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: [
    {
      name: 'index.ts',
      content: fs.readFileSync(
        path.join(root, 'supabase/functions/ai-contas-auditoria/index.ts'),
        'utf8',
      ),
    },
    {
      name: '../_shared/gemini.ts',
      content: fs.readFileSync(path.join(root, 'supabase/functions/_shared/gemini.ts'), 'utf8'),
    },
  ],
};

const outPath = path.join(root, 'scripts/.deploy-args-auditoria.json');
fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');

const index = args.files[0].content;
console.log(
  JSON.stringify({
    outPath,
    indexLen: index.length,
    promptOk: index.includes('Controller Financeiro'),
    upsertOk: index.includes('onConflict'),
    noPlaceholder: !index.includes('READ_FROM_DISK'),
  }),
);
