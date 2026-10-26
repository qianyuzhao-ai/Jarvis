import { randomUUID } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  projectSchema,
  threadSchema,
  type AgentProject,
  type OsThread,
} from '../../../shared/agent-os';
import { JsonFile, readJson } from '../json-file';
import { LocalFiles } from '../local-files';
import { MemoryStore } from '../kernel/memory';
import { DecisionStore } from '../kernel/decisions';
import { Ledger } from '../kernel/ledger';

export const DEFAULT_THREAD_BUDGET = 2_000_000;
/** The project's own folder for files people add and threads produce. */
export const LIBRARY_FOLDER = '项目文件';
const registrySchema = z.object({
  version: z.literal(1),
  projects: z.array(z.string().uuid()),
  currentId: z.string().uuid().nullable(),
});
const projectFileSchema = z.object({ version: z.literal(1), project: projectSchema });
const threadsFileSchema = z.object({ version: z.literal(1), threads: z.array(threadSchema) });

/** One project's state and stores: an OS with its own folders, memory, decisions and ledger. */
export class ProjectRuntime {
  readonly files: LocalFiles;
  readonly memory: MemoryStore;
  readonly decisions: DecisionStore;
  readonly ledger: Ledger;
  threads: OsThread[] = [];
  private projectFile: JsonFile;
  private threadsFile: JsonFile;
  constructor(
    public project: AgentProject,
    readonly dir: string,
  ) {
    this.files = new LocalFiles(join(dir, 'folders.json'), join(dir, 'file-snapshots'));
    this.memory = new MemoryStore(join(dir, 'memory'));
    this.decisions = new DecisionStore(join(dir, 'decisions.json'), project.id);
    this.ledger = new Ledger(join(dir, 'ledger'));
    this.projectFile = new JsonFile(join(dir, 'project.json'));
    this.threadsFile = new JsonFile(join(dir, 'threads.json'));
  }
  get id() {
    return this.project.id;
  }
  get sessionsDir() {
    return join(this.dir, 'sessions');
  }
  get wakesPath() {
    return join(this.dir, 'wakes.json');
  }
  async load() {
    const threads = await readJson(join(this.dir, 'threads.json'));
    if (threads) this.threads = threadsFileSchema.parse(threads).threads;
    await this.files.initialize();
    await this.decisions.initialize();
    await this.ledger.initialize([this.project.coordinatorId, ...this.threads.map((t) => t.id)]);
  }
  thread(id: string) {
    const thread = this.threads.find((t) => t.id === id);
    if (!thread) throw new Error('没有这个线程');
    return thread;
  }
  saveProject() {
    return this.projectFile.write({ version: 1, project: this.project });
  }
  saveThreads() {
    return this.threadsFile.write({ version: 1, threads: this.threads });
  }
}

/** Every project under `agent/os`: `projects.json` lists them, each has its own directory. */
export class ProjectRegistry {
  runtimes = new Map<string, ProjectRuntime>();
  currentId: string | null = null;
  private order: string[] = [];
  private registry: JsonFile;
  constructor(readonly root: string) {
    this.registry = new JsonFile(join(root, 'projects.json'));
  }
  private dir(id: string) {
    return join(this.root, 'projects', id);
  }
  async load() {
    const raw = await readJson(this.registry.path);
    if (!raw) return;
    const registry = registrySchema.parse(raw);
    for (const id of registry.projects) {
      const file = await readJson(join(this.dir(id), 'project.json'));
      if (!file) continue;
      const runtime = new ProjectRuntime(projectFileSchema.parse(file).project, this.dir(id));
      await runtime.load();
      this.runtimes.set(id, runtime);
      this.order.push(id);
    }
    this.currentId =
      registry.currentId && this.runtimes.has(registry.currentId)
        ? registry.currentId
        : (this.order[0] ?? null);
  }
  list() {
    return this.order.flatMap((id) => {
      const runtime = this.runtimes.get(id);
      return runtime ? [runtime] : [];
    });
  }
  get(id: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error('没有这个项目');
    return runtime;
  }
  private save() {
    return this.registry.write({ version: 1, projects: this.order, currentId: this.currentId });
  }
  async setCurrent(id: string) {
    this.get(id);
    this.currentId = id;
    await this.save();
  }
  /** Creates a project with its library folder already authorized. */
  async create(
    title: string,
    defaults: Partial<Pick<AgentProject, 'modelId' | 'thinkingLevel'>> = {},
  ) {
    const id = randomUUID();
    const now = Date.now();
    const project = projectSchema.parse({
      id,
      title,
      instructions: '',
      coordinatorId: randomUUID(),
      ...defaults,
      contextTokens: null,
      contextWindow: null,
      mode: 'normal',
      rules: { deny: [], ask: [], allow: [] },
      threadBudget: DEFAULT_THREAD_BUDGET,
      createdAt: now,
      updatedAt: now,
    });
    const runtime = new ProjectRuntime(project, this.dir(id));
    const library = join(runtime.dir, LIBRARY_FOLDER);
    await mkdir(library, { recursive: true, mode: 0o700 });
    await runtime.saveProject();
    await runtime.saveThreads();
    await runtime.load();
    await runtime.files.add(library);
    this.runtimes.set(id, runtime);
    this.order.unshift(id);
    this.currentId = id;
    await this.save();
    return runtime;
  }
  /** Removes a project from the list and moves its directory aside rather than deleting it. */
  async remove(id: string) {
    const runtime = this.get(id);
    this.order = this.order.filter((p) => p !== id);
    this.runtimes.delete(id);
    if (this.currentId === id) this.currentId = this.order[0] ?? null;
    await this.save();
    await runtime.ledger.settled();
    await mkdir(join(this.root, 'removed'), { recursive: true, mode: 0o700 });
    await rename(runtime.dir, join(this.root, 'removed', `${id}-${Date.now()}`)).catch(() => {});
  }
}
