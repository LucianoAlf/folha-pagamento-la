import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.join(__dirname, '.deploy-args.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

// Write arguments-only file for MCP invocation (UTF-8)
fs.writeFileSync(
  path.join(__dirname, '.deploy-mcp-arguments.json'),
  JSON.stringify(args),
  'utf8',
);

console.log(JSON.stringify({
  project_id: args.project_id,
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  fileCount: args.files.length,
  fileNames: args.files.map((f) => f.name),
  payloadBytes: JSON.stringify(args).length,
}));
