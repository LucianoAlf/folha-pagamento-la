import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const jsonPath = path.resolve(root, process.argv[2] || "tmp-deploy-comparativo-full.json");
const args = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

// Emit deploy args for Cursor CallMcpTool (stdout is the arguments object only)
process.stdout.write(JSON.stringify(args));
