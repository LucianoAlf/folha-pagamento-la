// Fix disabled action buttons: text-white on bg-surface-3 is invisible in light mode.
import fs from 'fs';
import path from 'path';

const root = 'components/rh-jornada';
const disabledOld = 'bg-surface-3 opacity-60 cursor-not-allowed';
const disabledNew = 'bg-surface-2 text-muted border border-line cursor-not-allowed';

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
  return files;
}

for (const file of walk(root)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.split(disabledOld).join(disabledNew);
  // Move text-white off the shared base when disabled branch follows.
  s = s.replace(
    /font-black text-white', ([^?]+)\? 'bg-surface-2 text-muted/g,
    "font-black', $1? 'bg-surface-2 text-muted",
  );
  s = s.replace(
    /font-black text-primary', ([^?]+)\? 'bg-surface-2 text-muted/g,
    "font-black', $1? 'bg-surface-2 text-muted",
  );
  s = s.replace(
    /font-black text-white', ([^?]+)\? \"bg-surface-2 text-muted/g,
    'font-black\', $1? "bg-surface-2 text-muted',
  );
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log('fixed', file);
  }
}
