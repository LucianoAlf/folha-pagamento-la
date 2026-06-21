#!/usr/bin/env node
/**
 * Deploy uma Edge Function via Supabase Management API.
 * Uso: node scripts/deploy-edge-function.mjs ai-contas-comparativo
 * Requer SUPABASE_ACCESS_TOKEN ou token do CLI em %APPDATA%/supabase/access-token
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ubdvtjbitozhkuvvqkxj';
const fnName = process.argv[2];

if (!fnName) {
  console.error('Uso: node scripts/deploy-edge-function.mjs <function-name>');
  process.exit(1);
}

function readAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const candidates = [
    path.join(process.env.APPDATA || '', 'supabase', 'access-token'),
    path.join(process.env.USERPROFILE || '', '.supabase', 'access-token'),
    path.join(process.env.HOME || '', '.supabase', 'access-token'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}

function collectFunctionFiles(fnDir) {
  const files = [];
  const indexPath = path.join(fnDir, 'index.ts');
  if (!fs.existsSync(indexPath)) throw new Error(`Missing ${indexPath}`);
  files.push({ name: 'index.ts', content: fs.readFileSync(indexPath, 'utf8') });

  const sharedGemini = path.join(root, 'supabase', 'functions', '_shared', 'gemini.ts');
  if (fs.existsSync(sharedGemini)) {
    // MCP bundler resolve ../_shared/gemini.ts a partir de source/index.ts
    files.push({ name: '../_shared/gemini.ts', content: fs.readFileSync(sharedGemini, 'utf8') });
  }
  return files;
}

const token = readAccessToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN não encontrado.');
  console.error('1) Gere um token em https://supabase.com/dashboard/account/tokens (conta com acesso ao projeto la-music-folha)');
  console.error('2) $env:SUPABASE_ACCESS_TOKEN="seu-token"  (PowerShell)');
  console.error('   ou: npx supabase login  (com a conta correta)');
  process.exit(1);
}

const fnDir = path.join(root, 'supabase', 'functions', fnName);
const files = collectFunctionFiles(fnDir);

const body = {
  name: fnName,
  entrypoint_path: 'index.ts',
  verify_jwt: true,
  files,
};

const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${fnName}`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

if (!res.ok) {
  console.error(`Deploy failed (${res.status}):`, JSON.stringify(json, null, 2));
  if (res.status === 403) {
    console.error('');
    console.error('403 = conta/token sem acesso a este projeto.');
    console.error('A CLI local está logada em outra org (ex.: Sonoramente ERP).');
    console.error('Faça login com a conta LA Music ou use SUPABASE_ACCESS_TOKEN da org correta.');
    console.error('Projeto: ubdvtjbitozhkuvvqkxj (la-music-folha)');
  }
  process.exit(1);
}

console.log('Deploy OK:', JSON.stringify(json, null, 2));
