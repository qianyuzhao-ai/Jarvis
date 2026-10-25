import { diffProjects } from '../../../../shared/project-diff';
import type {
  ProjectChange,
  ProjectRecord,
  ProjectResult,
  ProjectsBridge,
  StoredProject,
} from '../../../../shared/project';
import { projectFromStored, storedForm } from './project-records';
import type { Project } from './types';

function value<T>(result: ProjectResult<T>): T {
  if (!result.ok)
    throw Object.assign(new Error(result.error), { conflict: result.code === 'CONFLICT' });
  return result.value;
}
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/**
 * Saves the renderer's projects to the main-process store. Each changed project is compared with
 * its last saved form and only the difference is sent, one save at a time per project, always from
 * the latest state, so quick successive changes collapse into fewer saves. A held project (one
 * being dragged) is saved when released. Changes saved by other windows replace local copies.
 */
export class ProjectSync {
  readonly source = crypto.randomUUID();
  private saved = new Map<
    string,
    { version: number; project: StoredProject; blobs: Set<string> }
  >();
  private queues = new Map<string, Promise<void>>();
  private held = new Set<string>();
  /** Called with a project saved elsewhere, or null when it was removed. */
  onRemote: (id: string, project: Project | null) => void = () => {};
  constructor(
    private bridge: ProjectsBridge,
    records: ProjectRecord[],
    private latest: () => Project[],
  ) {
    for (const { version, project } of records) this.remember(version, project);
  }
  /** Saves every project that differs between two states; resolves when they are saved. */
  sync(before: Project[], after: Project[]) {
    const ids = new Set<string>();
    const old = new Map(before.map((p) => [p.id, p]));
    for (const p of after) if (old.get(p.id) !== p) ids.add(p.id);
    for (const p of before) if (!after.some((q) => q.id === p.id)) ids.add(p.id);
    return Promise.all([...ids].map((id) => this.enqueue(id, () => this.flush(id)))).then(() => {});
  }
  /** Holds a project's saves while it is dragged; releasing saves its final state once. */
  hold(id: string, held: boolean) {
    if (held) {
      this.held.add(id);
      return Promise.resolve();
    }
    this.held.delete(id);
    return this.enqueue(id, () => this.flush(id));
  }
  /** Releases every hold and waits for all pending saves. */
  async flushAll() {
    const held = [...this.held];
    this.held.clear();
    await Promise.all([
      ...held.map((id) => this.enqueue(id, () => this.flush(id))),
      ...this.queues.values(),
    ]);
  }
  /** Applies a change saved by another window, after this window's pending saves of it. */
  receive(change: ProjectChange) {
    if (change.source === this.source) return;
    void this.enqueue(change.projectId, async () => {
      const saved = this.saved.get(change.projectId);
      if (!change.project) {
        if (!saved) return;
        this.saved.delete(change.projectId);
        this.onRemote(change.projectId, null);
        return;
      }
      if (saved && change.version <= saved.version) return;
      await this.load(change.version, change.project);
    }).catch(() => {});
  }
  private enqueue(id: string, action: () => Promise<void>) {
    const pending = (this.queues.get(id) ?? Promise.resolve()).then(action);
    const tail = pending.catch(() => {});
    this.queues.set(id, tail);
    void tail.then(() => {
      if (this.queues.get(id) === tail) this.queues.delete(id);
    });
    return pending;
  }
  private remember(version: number, project: StoredProject) {
    const blobs = new Set(
      [...project.nodes, ...project.agentEdits.flatMap((e) => e.before.nodes)].flatMap((n) =>
        n.type === 'media' ? n.data.references.map((r) => r.id) : [],
      ),
    );
    const previous = this.saved.get(project.id);
    for (const id of previous?.blobs ?? []) blobs.add(id);
    this.saved.set(project.id, { version, project, blobs });
  }
  private async load(version: number, stored: StoredProject) {
    const project = await projectFromStored(stored, async (id) =>
      value(await this.bridge.readBlob({ projectId: stored.id, id })),
    );
    this.remember(version, stored);
    this.onRemote(stored.id, project);
  }
  private async flush(id: string) {
    if (this.held.has(id)) return;
    const current = this.latest().find((p) => p.id === id);
    const saved = this.saved.get(id);
    if (!current) {
      if (!saved) return;
      value(await this.bridge.remove({ projectId: id, source: this.source }));
      this.saved.delete(id);
      return;
    }
    const { project, blobs } = storedForm(current);
    if (!saved) {
      const files = await Promise.all(
        [...blobs].map(async ([blobId, blob]) => ({ id: blobId, bytes: await bytes(blob) })),
      );
      const version = value(
        await this.bridge.create({ project, blobs: files, source: this.source }),
      );
      this.remember(version, project);
      return;
    }
    const ops = diffProjects(saved.project, project);
    if (!ops.length) return;
    for (const [blobId, blob] of blobs)
      if (!saved.blobs.has(blobId)) {
        value(await this.bridge.putBlob({ projectId: id, id: blobId, bytes: await bytes(blob) }));
        saved.blobs.add(blobId);
      }
    try {
      const version = value(
        await this.bridge.apply({
          projectId: id,
          baseVersion: saved.version,
          ops,
          source: this.source,
        }),
      );
      this.remember(version, project);
    } catch (error) {
      if (!(error as { conflict?: boolean }).conflict) throw error;
      const latest = value(await this.bridge.get(id));
      await this.load(latest.version, latest.project);
      throw new Error('项目已在其他窗口修改，已载入最新内容', { cause: error });
    }
  }
}
