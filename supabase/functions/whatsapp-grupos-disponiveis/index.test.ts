import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("whatsapp-grupos-disponiveis sanitizes UAZAPI groups", () => {
  assert.match(source, /\/group\/list\?force=true&noparticipants=true/);
  assert.match(source, /jid:\s*String\(group\.JID/);
  assert.match(source, /nome:\s*String\(group\.Name/);
  assert.doesNotMatch(source, /\bTopic\b|\bparticipants\b|Participantes|descri/i);
  assert.doesNotMatch(source, /console\.log\([^)]*group|console\.error\([^)]*group/i);
});
