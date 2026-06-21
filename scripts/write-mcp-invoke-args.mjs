#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/.deploy-args-auditoria.json'), 'utf8'),
);
const payload = {
  project_id: args.project_id,
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  files: args.files,
};
const out = path.join(root, '.tmp/mcp-invoke-args.json');
fs.writeFileSync(out, JSON.stringify(payload), 'utf8');
console.log(
  JSON.stringify({
    out,
    promptOk: payload.files[0].content.includes('Controller Financeiro'),
    indexLen: payload.files[0].content.length,
  }),
);
