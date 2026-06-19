import fs from "fs";
import path from "path";

const deployDir = path.resolve(".");
const outDir = path.resolve("tmp-deploy-results");
fs.mkdirSync(outDir, { recursive: true });

const names = fs
  .readdirSync(deployDir)
  .filter((f) => f.startsWith("tmp-deploy-") && f.endsWith(".json"))
  .map((f) => f.replace("tmp-deploy-", "").replace(".json", ""))
  .filter((n) => n !== "ai-payroll" && n !== "whatsapp-send")
  .sort();

for (const name of names) {
  const payload = JSON.parse(fs.readFileSync(path.join(deployDir, `tmp-deploy-${name}.json`), "utf8"));
  fs.writeFileSync(path.join(outDir, `${name}.args.json`), JSON.stringify(payload));
  console.log(name);
}

