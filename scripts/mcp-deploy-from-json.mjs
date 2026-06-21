#!/usr/bin/env node
/**
 * Lê scripts/.deploy-args-auditoria.json e imprime metadados de verificação.
 * Deploy real: CallMcpTool user-supabase deploy_edge_function com o JSON parseado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const argsPath = path.join(root, 'scripts', '.deploy-args-auditoria.json');

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const index = args.files.find((f) => f.name === 'index.ts');
const gemini = args.files.find((f) => f.name === '../_shared/gemini.ts');

console.log(
  JSON.stringify({
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    indexLen: index?.content?.length ?? 0,
    geminiLen: gemini?.content?.length ?? 0,
    promptOk: index?.content?.includes('Controller Financeiro') ?? false,
    upsertOk: index?.content?.includes('onConflict') ?? false,
    argsPath,
  }),
);
