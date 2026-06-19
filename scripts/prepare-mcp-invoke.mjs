import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const resultsDir = path.resolve("tmp-deploy-results");
const logFile = path.resolve("tmp-deploy-out.jsonl");

const names = fs
  .readdirSync(resultsDir)
  .filter((f) => f.endsWith(".args.json"))
  .map((f) => f.replace(".args.json", ""))
  .filter((n) => !["whatsapp-send", "ferias-calcular-periodos"].includes(n))
  .sort();

const gemini = fs.readFileSync(path.resolve("supabase/functions/_shared/gemini.ts"), "utf8");
const rhAuth = fs.readFileSync(path.resolve("supabase/functions/_shared/rh-auth.ts"), "utf8");

function deployOne(name) {
  const args = JSON.parse(fs.readFileSync(path.join(resultsDir, `${name}.args.json`), "utf8"));
  for (const file of args.files) {
    if (file.name === "../_shared/gemini.ts") file.content = gemini;
    if (file.name === "../_shared/rh-auth.ts") file.content = rhAuth;
  }
  const payload = JSON.stringify(args);
  const out = path.resolve(`tmp-mcp-invoke/${name}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, payload);
  return out;
}

for (const name of names) {
  deployOne(name);
  console.log(name);
}

console.log(`\nWrote ${names.length} invoke files to tmp-mcp-invoke/`);
