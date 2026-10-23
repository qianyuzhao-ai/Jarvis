import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const { normalizeOptions } = require('electron-builder/out/builder.js');
const builderRequire = createRequire(require.resolve('electron-builder'));
const { Platform, Arch } = builderRequire('app-builder-lib');
const { computeArchToTargetNamesMap } = builderRequire(
  'app-builder-lib/out/targets/targetFactory.js',
);
const config = parse(
  readFileSync(new URL('../electron-builder.release.yml', import.meta.url), 'utf8'),
);
const workflow = parse(
  readFileSync(new URL('../../../.github/workflows/release-macos.yml', import.meta.url), 'utf8'),
);

test('each macOS workflow command builds only its matrix architecture despite dual-arch configuration', () => {
  const command = workflow.jobs.package.steps.find(
    (step) => step.name === 'Build signed and notarized DMG and ZIP',
  ).run;
  const targets = command
    .match(/electron-builder --mac (.*?) --\$\{\{ matrix.arch \}\}/)?.[1]
    .split(' ');
  assert.deepEqual(targets, ['dmg', 'zip']);
  for (const arch of ['arm64', 'x64']) {
    const options = normalizeOptions({ mac: targets, [arch]: true });
    const map = computeArchToTargetNamesMap(
      options.targets.get(Platform.MAC),
      { platformSpecificBuildOptions: config.mac },
      Platform.MAC,
    );
    assert.deepEqual([...map], [[Arch[arch], ['dmg', 'zip']]]);
    const oldOptions = normalizeOptions({ mac: [], [arch]: true });
    const oldMap = computeArchToTargetNamesMap(
      oldOptions.targets.get(Platform.MAC),
      { platformSpecificBuildOptions: config.mac },
      Platform.MAC,
    );
    assert.equal(oldMap.size, 2, 'Original command reproduced the unwanted second architecture');
  }
});
