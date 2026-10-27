import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import {
  createMedia,
  createProject,
  emptyWorkspace,
} from '../src/renderer/src/features/creation/types';
import { seedWorkspace, readProjects } from './helpers/workspace';

test('node Copy and box-selection clipboard preserve connections and survive reload without stealing text shortcuts', async () => {
  test.setTimeout(60000);
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000),
    );
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const project = createProject();
    project.name = '复制粘贴验收';
    const [a, b, c]: string[] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    project.nodes = [
      {
        id: a!,
        type: 'asset',
        position: { x: 24, y: 72 },
        data: {
          kind: 'image',
          name: '参考图片',
          upload: { status: 'ready', url: 'https://example.invalid/reference.png' },
        },
      },
      {
        id: b!,
        type: 'media',
        position: { x: 424, y: 72 },
        data: {
          ...createMedia('image'),
          name: '图像 B',
          prompt: '原始提示词',
          model: 'nano-banana-pro',
        },
      },
      {
        id: c!,
        type: 'media',
        position: { x: 824, y: 72 },
        data: { ...createMedia('video'), name: '视频 C' },
      },
    ];
    project.edges = [
      { id: crypto.randomUUID(), source: a!, target: b! },
      { id: crypto.randomUUID(), source: b!, target: c! },
    ];
    await seedWorkspace(app, page, { ...emptyWorkspace, projects: [project] });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByText(project.name, { exact: true }).first().click();
    const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
    // Two pointer moves inside the node, as a real mouse makes, so its hover toolbar takes clicks
    // even when the node was not re-rendered since the pointer arrived.
    const reveal = async (id: string) => {
      await node(id).hover({ position: { x: 24, y: 24 } });
      await node(id).hover();
    };
    const count = () => readProjects(page).then((p) => p.find((p) => p.id === project.id)!);
    await reveal(b!);
    const copy = node(b!).getByRole('button', { name: '复制节点', exact: true });
    const remove = node(b!).getByRole('button', { name: '删除节点', exact: true });
    const copyBox = await copy.boundingBox(),
      removeBox = await remove.boundingBox();
    expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(removeBox!.x);
    await copy.click();
    await expect.poll(async () => (await count()).nodes.length).toBe(4);
    let saved = await count();
    const duplicate = saved.nodes.find((n) => ![a, b, c].includes(n.id))!;
    expect(saved.edges.filter((e) => e.target === duplicate.id)).toMatchObject([{ source: a }]);
    expect(saved.edges.filter((e) => e.source === duplicate.id)).toEqual([]);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await count()).nodes.length).toBe(3);

    const bBox = (await node(b!).boundingBox())!,
      cBox = (await node(c!).boundingBox())!;
    await page.mouse.move(bBox.x - 12, bBox.y - 12);
    await page.mouse.down();
    await page.mouse.move(cBox.x + cBox.width + 12, cBox.y + cBox.height + 12, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await count()).nodes.length).toBe(5);
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
    saved = await count();
    const copies = saved.nodes.filter((n) => ![a, b, c].includes(n.id));
    expect(copies[1]!.position.x - copies[0]!.position.x).toBe(400);
    expect(copies[1]!.position.y).toBe(copies[0]!.position.y);
    expect(saved.edges).toHaveLength(3);
    expect(saved.edges[2]).toMatchObject({ source: copies[0]!.id, target: copies[1]!.id });
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await count()).nodes.length).toBe(7);
    saved = await count();
    expect(saved.edges).toHaveLength(4);
    expect(saved.nodes[5]!.position).not.toEqual(copies[0]!.position);
    await page.screenshot({ path: test.info().outputPath('copied-group.png') });

    await node(b!).click({ position: { x: 30, y: 30 } });
    const prompt = page.getByLabel('图像提示词', { exact: true });
    await prompt.click();
    await prompt.press('ControlOrMeta+a');
    await prompt.press('ControlOrMeta+c');
    await prompt.press('End');
    await prompt.press('ControlOrMeta+v');
    await expect(prompt).toHaveText('原始提示词原始提示词');
    expect((await count()).nodes).toHaveLength(7);
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await page.getByTestId('canvas-body').focus();
    await page.keyboard.press('ControlOrMeta+v');
    expect((await count()).nodes).toHaveLength(7);

    await reveal(a!);
    await node(a!).getByRole('button', { name: '复制资源 参考图片' }).click();
    await expect.poll(async () => (await count()).nodes.length).toBe(8);
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByText(project.name, { exact: true }).first().click();
    await expect(page.locator('.react-flow__node')).toHaveCount(8);
    expect((await count()).edges).toHaveLength(4);
  } finally {
    await app.close();
  }
});
