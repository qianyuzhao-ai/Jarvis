import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Statuses of every operation-ledger entry saved in an app profile, oldest first per file. */
export async function ledgerStatuses(profile: string) {
  const dir = join(profile, 'agent', 'ledger');
  const names = await readdir(dir).catch(() => [] as string[]);
  const statuses: string[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const file = JSON.parse(await readFile(join(dir, name), 'utf8')) as {
      entries: { status: string }[];
    };
    statuses.push(...file.entries.map((e) => e.status));
  }
  return statuses;
}
