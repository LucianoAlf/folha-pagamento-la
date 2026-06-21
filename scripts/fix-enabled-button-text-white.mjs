import fs from 'fs';
import path from 'path';

const pairs = [
  ["'bg-accent hover:bg-accent')", "'bg-accent hover:bg-accent text-white')"],
  ["'bg-info hover:bg-info')", "'bg-info hover:bg-info text-white')"],
  ["'bg-warning hover:bg-warning')", "'bg-warning hover:bg-warning text-white')"],
  ["'bg-success hover:bg-success')", "'bg-success hover:bg-success text-white')"],
  ["'bg-danger hover:bg-danger')", "'bg-danger hover:bg-danger text-white')"],
  ["'bg-fuchsia-600 hover:bg-fuchsia-500')", "'bg-fuchsia-600 hover:bg-fuchsia-500 text-white')"],
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.name === 'node_modules') continue;
    if (ent.isDirectory()) walk(p, files);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
  return files;
}

for (const file of walk('components/rh-jornada')) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [from, to] of pairs) {
    while (s.includes(from)) s = s.replace(from, to);
  }
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log('fixed', file);
  }
}
