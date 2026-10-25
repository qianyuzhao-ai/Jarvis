import { app, ipcMain, type WebContents } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import {
  blobId,
  projectApplySchema,
  projectCreateSchema,
  projectMigrationSchema,
  projectSourceSchema,
  type ProjectResult,
} from '../../shared/project';
import { ProjectMigration } from './migration';
import { ProjectConflictError, ProjectStore } from './project-store';

const trusted = new Map<number, { contents: WebContents; url: string }>();
const projectId = z.string().uuid();
let store: ProjectStore | undefined;
/** The main-process project store, once registered; the Agent uses it from A2c on. */
export const projectStore = () => store;
export function trustProjectsWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.once('destroyed', () => trusted.delete(contents.id));
}
export async function registerProjects() {
  const dir = join(app.getPath('userData'), 'projects');
  const projects = new ProjectStore(dir);
  const migration = new ProjectMigration(projects, dir);
  let initializationError = '';
  try {
    await projects.initialize();
  } catch {
    initializationError = '项目目录无法读取，原文件已保留';
  }
  store = projects;
  projects.onChange = (change) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url)
        contents.send('projects:changed', change);
  };
  const handlers: Record<string, (request: unknown) => unknown> = {
    'projects:migrated': () => migration.done(),
    'projects:migrate': (r) => migration.migrate(projectMigrationSchema.parse(r)),
    'projects:list': () => projects.list().map((p) => projects.get(p.id)),
    'projects:get': (r) => projects.get(projectId.parse(r)),
    'projects:read-blob': async (r) => {
      const v = z.object({ projectId, id: blobId }).strict().parse(r);
      return new Uint8Array(await projects.readBlob(v.projectId, v.id));
    },
    'projects:put-blob': (r) => {
      const v = z
        .object({ projectId, id: blobId, bytes: z.instanceof(Uint8Array) })
        .strict()
        .parse(r);
      return projects.putBlob(v.projectId, v.id, v.bytes);
    },
    'projects:create': async (r) => {
      const v = projectCreateSchema.parse(r);
      const blobs = new Map(v.blobs.map((b) => [b.id, b.bytes]));
      return (await projects.create(v.project, blobs, v.source)).version;
    },
    // Windows send their own `updatedAt`, so the store does not stamp one.
    'projects:apply': async (r) => {
      const v = projectApplySchema.parse(r);
      const result = await projects.applyOps(v.projectId, v.baseVersion, v.ops, {
        touch: false,
        source: v.source,
      });
      return result.version;
    },
    'projects:remove': (r) => {
      const v = z.object({ projectId, source: projectSourceSchema }).strict().parse(r);
      return projects.remove(v.projectId, v.source);
    },
  };
  for (const [channel, handler] of Object.entries(handlers))
    ipcMain.handle(channel, async (event, request): Promise<ProjectResult<unknown>> => {
      try {
        if (
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame?.url !== trusted.get(event.sender.id)?.url
        )
          throw new Error('请求来源不可信');
        if (initializationError) throw new Error(initializationError);
        return { ok: true, value: await handler(request) };
      } catch (error) {
        if (error instanceof ProjectConflictError)
          return { ok: false, code: 'CONFLICT', error: error.message };
        return {
          ok: false,
          error:
            error instanceof z.ZodError
              ? '项目数据格式不正确'
              : error instanceof Error && !('code' in error)
                ? error.message
                : '项目保存失败，请检查磁盘空间并重试',
        };
      }
    });
}
