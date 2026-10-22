const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { createRequire, isBuiltin } = require('node:module');
const { join, resolve, sep } = require('node:path');

const archive = resolve(process.argv[2]);
const visited = new Set();

function visit(directory) {
  if (visited.has(directory)) return;
  visited.add(directory);
  const manifest = join(directory, 'package.json');
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  const lookup = createRequire(manifest);
  for (const dependency of Object.keys(pkg.dependencies || {})) {
    if (isBuiltin(dependency)) continue;
    if (dependency in (pkg.optionalDependencies || {})) continue;
    const target = (lookup.resolve.paths(dependency) || [])
      .filter((path) => path.startsWith(archive + sep))
      .map((path) => join(path, dependency))
      .find((path) => existsSync(join(path, 'package.json')));
    assert(target, `Missing packaged dependency: ${pkg.name} -> ${dependency}`);
    visit(target);
  }
}

visit(archive);
console.log(`Verified ${visited.size} packaged production dependency manifests`);
