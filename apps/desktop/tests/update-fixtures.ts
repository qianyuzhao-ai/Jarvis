import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, test } from '@playwright/test';
import { appendFileSync } from 'node:fs';

export async function launchUpdateApp() {
  const source = resolve(import.meta.dirname, '..');
  const directory = test.info().outputPath('update-application');
  const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'Jarvis',
      version,
      main: join(source, 'tests/fixtures/updates-main.cjs'),
    }),
  );
  const instance = await electron.launch({
    args: [directory, `--user-data-dir=${test.info().outputPath('profile')}`],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  const log = test.info().outputPath('main-process.log');
  instance.process().stderr?.on('data', (chunk) => appendFileSync(log, chunk));
  const page = await instance.firstWindow();
  await page.getByTestId('theme-root').waitFor();
  await page.waitForLoadState('load');
  return instance;
}
