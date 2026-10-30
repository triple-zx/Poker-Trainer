import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.name.startsWith('.') || e.name === 'node_modules' ? [] :
      e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
let links = 0;
for (const file of files(root).filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#|mailto:)/.test(m[1])) continue;
    const target = m[1].split('#')[0];
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `${file}: missing ${target}`);
    links++;
  }
}
// Parses TS syntax, deliberately not claimed to be a TypeScript type check.
const contract = fs.readFileSync(path.join(root, 'contracts/v1.ts'), 'utf8');
stripTypeScriptTypes(contract);
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(metadata.private, true);
console.log(`Design checks passed: ${links} local links; contract TypeScript syntax; package metadata.`);
