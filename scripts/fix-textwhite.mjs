// Convert text-white -> text-primary EXCEPT where it must stay white:
//  - on a solid colored bg / gradient / black overlay (button/badge)
//  - on an icon glyph (className has explicit w-/h-/size => not body text)
// Usage: node scripts/fix-textwhite.mjs <file> [<file> ...]
import fs from 'fs';

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const out = src.split('\n').map((line) => {
    if (!line.includes('text-white')) return line;
    const solid = /bg-(accent|success|danger|warning|info|black)\b|bg-gradient|\bfrom-|bg-\[#/.test(line);
    const iconish = /\b(w-\d|h-\d|size-\d)/.test(line);
    if (solid || iconish) return line;
    return line.replace(/\btext-white\b/g, 'text-primary');
  }).join('\n');
  if (out !== src) { fs.writeFileSync(file, out); console.log('fixed ' + file); }
  else console.log('no change ' + file);
}
