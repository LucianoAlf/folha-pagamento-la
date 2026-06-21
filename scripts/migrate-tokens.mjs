// Bulk token migration: hardcoded Tailwind colors -> semantic tokens.
// Usage: node scripts/migrate-tokens.mjs <file> [<file> ...]
// Safe + idempotent: only touches slate/violet/emerald/etc + known hex.
import fs from 'fs';

const fam = {
  violet: 'accent', purple: 'accent', fuchsia: 'accent', indigo: 'accent',
  emerald: 'success', green: 'success', lime: 'success',
  rose: 'danger', red: 'danger', pink: 'danger',
  amber: 'warning', orange: 'warning', yellow: 'warning',
  cyan: 'info', sky: 'info', blue: 'info', teal: 'info',
};
const PREF = 'bg|text|border|ring|ring-offset|from|to|via|shadow|fill|stroke|divide|placeholder|outline|decoration';

function slateToken(prefix, shade) {
  const n = Number(shade);
  if (prefix === 'bg') return n >= 950 ? 'bg' : n >= 900 ? 'surface' : n >= 800 ? 'surface-2' : 'surface-3';
  if (prefix === 'text') return n >= 700 ? 'primary' : n >= 500 ? 'muted' : 'secondary';
  if (prefix === 'border' || prefix === 'divide' || prefix === 'ring' || prefix === 'outline') return n >= 800 ? 'line' : n >= 600 ? 'line-strong' : 'line';
  if (prefix === 'from' || prefix === 'to' || prefix === 'via') return n >= 950 ? 'bg' : n >= 900 ? 'surface' : n >= 800 ? 'surface-2' : 'surface-3';
  if (prefix === 'placeholder') return n >= 500 ? 'muted' : 'secondary';
  return 'surface';
}

for (const file of process.argv.slice(2)) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;

  // 1) Known hex backgrounds
  s = s.replace(/bg-\[#0a0d14\]/g, 'bg-bg').replace(/bg-\[#060814\]/g, 'bg-bg').replace(/bg-\[#0f172a\]/g, 'bg-surface');

  // 2) Color families (strip shade, keep opacity modifier)
  s = s.replace(new RegExp(`\\b(${PREF})-(violet|purple|fuchsia|indigo|emerald|green|lime|rose|red|pink|amber|orange|yellow|cyan|sky|blue|teal)-(\\d{1,3})(/\\d{1,3})?\\b`, 'g'),
    (_m, p, f, _sh, op) => `${p}-${fam[f]}${op || ''}`);

  // 3) slate by prefix + shade (keep opacity)
  s = s.replace(new RegExp(`\\b(${PREF})-slate-(\\d{1,3})(/\\d{1,3})?\\b`, 'g'),
    (_m, p, sh, op) => `${p}-${slateToken(p, sh)}${op || ''}`);

  // 4) text-white -> text-primary ONLY on text-ish classNames (has text-size/font and no solid bg/gradient on the line)
  s = s.split('\n').map((line) => {
    if (!line.includes('text-white')) return line;
    const hasTextRole = /\b(text-(xs|sm|base|lg|xl|\dxl|\[)|font-(bold|black|semibold|medium))/.test(line);
    const hasSolid = /\b(bg-(accent|success|danger|warning|info|gradient|black)\b|from-|bg-\[)/.test(line);
    if (hasTextRole && !hasSolid) return line.replace(/\btext-white\b/g, 'text-primary');
    return line;
  }).join('\n');

  if (s !== before) { fs.writeFileSync(file, s); console.log('migrated ' + file); }
  else console.log('no change ' + file);
}
