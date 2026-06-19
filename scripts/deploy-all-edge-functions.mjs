import fs from "fs";
import path from "path";

const projectId = "ubdvtjbitozhkuvvqkxj";
const root = "supabase/functions";

const verifyJwtDefaults = {
  "ai-payroll-insights": false,
  "ai-contas-auditoria": false,
  "ai-contas-comparativo": false,
  "ai-agenda-background": false,
  "ferias-ai-insights": false,
  "whatsapp-send": false,
  "whatsapp-agenda-lembretes": false,
  "whatsapp-agenda-resumo": false,
  "whatsapp-contas-notificacoes": false,
  "whatsapp-folha-notificacoes": false,
  "whatsapp-ferias-alertas": false,
  "rh-generate-document": false,
  "rh-ai-candidate-parse": false,
  "rh-ai-candidate-compare": false,
  "rh-ai-dashboard-insights": false,
  "rh-ai-journey-insights": false,
};

const sharedByFunction = {
  "ai-payroll-insights": ["_shared/gemini.ts"],
  "ai-contas-auditoria": ["_shared/gemini.ts"],
  "ai-contas-comparativo": ["_shared/gemini.ts"],
  "rh-ai-dashboard-insights": ["_shared/gemini.ts", "_shared/rh-auth.ts"],
  "rh-ai-journey-insights": ["_shared/gemini.ts", "_shared/rh-auth.ts"],
  "rh-ai-candidate-parse": ["_shared/gemini.ts", "_shared/rh-auth.ts"],
  "rh-ai-candidate-compare": ["_shared/gemini.ts", "_shared/rh-auth.ts"],
  "ai-agenda-background": ["_shared/gemini.ts"],
  "rh-generate-document": ["_shared/rh-auth.ts"],
};

function listFunctionDirs() {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(root, name, "index.ts")))
    .sort();
}

function buildPayload(name) {
  const files = [{ name: "index.ts", content: fs.readFileSync(path.join(root, name, "index.ts"), "utf8") }];
  for (const shared of sharedByFunction[name] ?? []) {
    files.push({ name: `../${shared}`, content: fs.readFileSync(path.join(root, shared), "utf8") });
  }
  return {
    project_id: projectId,
    name,
    entrypoint_path: "index.ts",
    verify_jwt: verifyJwtDefaults[name] ?? true,
    files,
  };
}

const fnName = process.argv[2];
if (!fnName) {
  console.error("Usage: node scripts/deploy-all-edge-functions.mjs <function-name|all>");
  process.exit(1);
}

if (fnName === "all") {
  for (const name of listFunctionDirs()) {
    fs.writeFileSync(`tmp-deploy-${name}.json`, JSON.stringify(buildPayload(name)));
    console.log(name);
  }
  process.exit(0);
}

if (!listFunctionDirs().includes(fnName)) {
  console.error(`Unknown function: ${fnName}`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(buildPayload(fnName)));
