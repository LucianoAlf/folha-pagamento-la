import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const dir = path.resolve(".");
const names = process.argv.slice(2);
if (!names.length) {
  console.error("Usage: node scripts/deploy-from-mcp-invoke.mjs <fn1> [fn2...]");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL("https://mcp.supabase.com/mcp"), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

const client = new Client({ name: "deploy-from-mcp-invoke", version: "1.0.0" });
await client.connect(transport);

const results = [];
for (const name of names) {
  const args = JSON.parse(
    fs.readFileSync(path.join(dir, "tmp-mcp-invoke", `${name}.json`), "utf8"),
  );
  try {
    const result = await client.callTool({
      name: "deploy_edge_function",
      arguments: args,
    });
    const text = result.content?.map((c) => c.text || "").join("") || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text, isError: result.isError };
    }
    if (result.isError || parsed?.error) {
      results.push({
        name,
        version: null,
        status: "error",
        error: parsed?.error || parsed?.message || text || "unknown error",
      });
      console.error(`FAIL ${name}:`, String(parsed?.error || text).slice(0, 300));
    } else {
      results.push({
        name,
        version: parsed?.version ?? null,
        status: parsed?.status ?? "unknown",
      });
      console.log(`OK ${name} v${parsed?.version ?? "?"} ${parsed?.status ?? ""}`);
    }
  } catch (err) {
    results.push({ name, version: null, status: "error", error: String(err) });
    console.error(`FAIL ${name}:`, err);
  }
}

await client.close();
const outPath = path.join(dir, "tmp-deploy-results", "deploy-mcp-invoke-results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("WROTE", outPath);
process.exit(results.every((r) => r.status !== "error") ? 0 : 1);
