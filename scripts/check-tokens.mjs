import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const allowance = JSON.parse(
  readFileSync(resolve(root, 'scripts/token-legacy-allowlist.json'), 'utf8'),
);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(css|tsx?|jsx?)$/.test(path) ? [path] : [];
  });
}
export function violations(source) {
  return [
    ...source.matchAll(/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)|\b[\w-]+-\[[^\]\n]+\]/gi),
  ].map((match) => match[0]);
}
const iconAllowance = JSON.parse(
  readFileSync(resolve(root, 'scripts/icon-legacy-allowlist.json'), 'utf8'),
);
const errors = [];
for (const path of [
  ...files(resolve(root, 'apps/desktop/src/renderer/src')),
  ...files(resolve(root, 'packages/ui/src')),
]) {
  const name = relative(root, path).replaceAll('\\', '/');
  const source = readFileSync(path, 'utf8');
  if (
    /from\s+['"]lucide-react['"]/.test(source) &&
    name !== 'packages/ui/src/icons.ts' &&
    !iconAllowance.includes(name)
  )
    errors.push(`${name}: import icons from @jarvis/ui/icons`);
  if (name === 'packages/ui/src/styles/tokens.css') continue;
  const allowed = [...(allowance[name] ?? [])];
  for (const value of violations(readFileSync(path, 'utf8'))) {
    const index = allowed.indexOf(value);
    if (index < 0) errors.push(`${name}: ${value}`);
    else allowed.splice(index, 1);
  }
  if (
    name.startsWith('packages/ui/') &&
    /(?:window\.desktop|from\s+['"](?:electron|node:|.*apps\/))/.test(readFileSync(path, 'utf8'))
  )
    errors.push(`${name}: UI package crosses application boundary`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Token check passed (legacy exceptions cannot grow).');
