#!/usr/bin/env node
/**
 * Lê .tmp/mcp-invoke-args.json e imprime o payload para deploy MCP.
 * Uso interno: node scripts/mcp-deploy-auditoria-v10.mjs | head -c 200
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argsPath = path.join(root, '.tmp/mcp-invoke-args.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
process.stdout.write(JSON.stringify(args));
