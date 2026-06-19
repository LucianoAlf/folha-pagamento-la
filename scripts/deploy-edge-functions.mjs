import fs from "fs";
import path from "path";

const projectId = "ubdvtjbitozhkuvvqkxj";
const root = "supabase/functions";

const specs = [
  { name: "ai-payroll-insights", dir: "ai-payroll-insights", shared: ["_shared/gemini.ts"], verify_jwt: false },
  { name: "ai-contas-auditoria", dir: "ai-contas-auditoria", shared: ["_shared/gemini.ts"], verify_jwt: false },
  { name: "ai-contas-comparativo", dir: "ai-contas-comparativo", shared: ["_shared/gemini.ts"], verify_jwt: false },
  { name: "rh-ai-dashboard-insights", dir: "rh-ai-dashboard-insights", shared: ["_shared/gemini.ts", "_shared/rh-auth.ts"], verify_jwt: false },
  { name: "rh-ai-journey-insights", dir: "rh-ai-journey-insights", shared: ["_shared/gemini.ts", "_shared/rh-auth.ts"], verify_jwt: false },
  { name: "rh-ai-candidate-parse", dir: "rh-ai-candidate-parse", shared: ["_shared/gemini.ts", "_shared/rh-auth.ts"], verify_jwt: false },
  { name: "rh-ai-candidate-compare", dir: "rh-ai-candidate-compare", shared: ["_shared/gemini.ts", "_shared/rh-auth.ts"], verify_jwt: false },
  { name: "ai-agenda-background", dir: "ai-agenda-background", shared: ["_shared/gemini.ts"], verify_jwt: false },
];

function buildPayload(spec) {
  const files = [{ name: "index.ts", content: fs.readFileSync(path.join(root, spec.dir, "index.ts"), "utf8") }];
  for (const shared of spec.shared) {
    files.push({ name: `../${shared}`, content: fs.readFileSync(path.join(root, shared), "utf8") });
  }
  return {
    project_id: projectId,
    name: spec.name,
    entrypoint_path: "index.ts",
    verify_jwt: spec.verify_jwt,
    files,
  };
}

const fnName = process.argv[2];
if (!fnName) {
  console.error("Usage: node scripts/deploy-edge-functions.mjs <function-name|all>");
  process.exit(1);
}

if (fnName === "all") {
  for (const spec of specs) {
    fs.writeFileSync(`tmp-deploy-${spec.name}.json`, JSON.stringify(buildPayload(spec)));
    console.log(spec.name);
  }
  process.exit(0);
}

const spec = specs.find((s) => s.name === fnName);
if (!spec) {
  console.error(`Unknown function: ${fnName}`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(buildPayload(spec)));
