import { randomUUID } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import {
  createMedia,
  createProject,
  emptyWorkspace,
} from '../src/renderer/src/features/creation/types';
import { readProjects } from './helpers/workspace';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('an IndexedDB workspace moves to per-project files once, and a drag saves once on release', async () => {
  test.setTimeout(90000);
  const profile = test.info().outputPath('profile');
  const launch = () =>
    electron.launch({
      args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
    });
  const project = {
    ...createProject(),
    name: '旧项目',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'source',
        type: 'media' as const,
        position: { x: 96, y: 96 },
        data: createMedia('image'),
      },
      {
        id: 'target',
        type: 'media' as const,
        position: { x: 600, y: 96 },
        data: createMedia('video'),
      },
    ],
    edges: [{ id: 'link', source: 'source', target: 'target' }],
  };
  const refId = randomUUID();
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).waitFor();
    // Write the workspace the way earlier versions kept it, reference file inline as a Blob.
    await page.evaluate(
      async ({ workspace, refId, bytes }) => {
        const node = workspace.projects[0]!.nodes[0]!;
        if (node.type === 'media')
          node.data.references = [
            {
              id: refId,
              name: '参考.png',
              type: 'image',
              blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
            },
          ];
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('jarvis-workspace', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(workspace, 'current');
          tx.objectStore('workspace').delete('preferences');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      {
        workspace: {
          ...emptyWorkspace,
          projects: [project],
          settings: { ...emptyWorkspace.settings, reqFrom: 'legacy-test' },
        },
        refId,
        bytes: [...png],
      },
    );
    await app.close();
    // The first start of this version wrote an empty marker; remove it to start as an old profile.
    await unlink(join(profile, 'projects', 'migration.json'));

    app = await launch();
    page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '旧项目' }).click();
    await expect(page.locator('.react-flow__node-media')).toHaveCount(2);
    const dir = join(profile, 'projects', project.id);
    const file = async () => JSON.parse(await readFile(join(dir, 'project.json'), 'utf8'));
    expect(await file()).toMatchObject({
      format: 1,
      version: 1,
      project: {
        name: '旧项目',
        edges: [{ id: 'link', source: 'source', target: 'target' }],
        nodes: [
          {
            id: 'source',
            data: {
              references: [
                { id: refId, name: '参考.png', mimeType: 'image/png', size: png.length },
              ],
            },
          },
          { id: 'target' },
        ],
      },
    });
    expect(await readdir(join(dir, 'blobs'))).toEqual([refId]);
    expect(await readFile(join(dir, 'blobs', refId))).toEqual(png);
    expect(
      JSON.parse(await readFile(join(profile, 'projects', 'migration.json'), 'utf8')),
    ).toMatchObject({
      format: 1,
      projects: [project.id],
    });
    // The original record stays in IndexedDB, reference Blob included.
    const original = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('jarvis-workspace', 1);
        request.onsuccess = () => resolve(request.result);
      });
      const value = await new Promise<{
        projects: { name: string; nodes: { data: { references?: { blob: Blob }[] } }[] }[];
      }>((resolve) => {
        const request = db.transaction('workspace').objectStore('workspace').get('current');
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return {
        name: value.projects[0]?.name,
        size: value.projects[0]?.nodes[0]?.data.references?.[0]?.blob.size,
      };
    });
    expect(original).toEqual({ name: '旧项目', size: png.length });

    // Dragging a node writes one new version, when the mouse is released.
    const node = page.locator('.react-flow__node[data-id="target"]');
    const box = await node.boundingBox();
    if (!box) throw new Error('Missing node');
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++)
      await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + 20 + i * 10);
    await page.waitForTimeout(300);
    expect((await file()).version).toBe(1);
    await page.mouse.up();
    await expect.poll(async () => (await file()).version).toBe(2);
    const moved = (await readProjects(page))[0]?.nodes.find((n) => n.id === 'target')?.position;
    expect(moved?.x).toBeGreaterThan(600);
    await page.waitForTimeout(500);
    expect((await file()).version).toBe(2);
    expect(errors).toEqual([]);
    await app.close();

    // Restarting reads the files, keeps the position and the migrated settings, and migrates nothing again.
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await expect(page.getByTestId('project-row')).toHaveCount(1);
    expect((await readProjects(page))[0]?.nodes.find((n) => n.id === 'target')?.position).toEqual(
      moved,
    );
    expect((await file()).version).toBe(2);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('legacy-test');
  } finally {
    await app.close();
  }
});
