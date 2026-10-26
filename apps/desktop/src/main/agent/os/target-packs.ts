import type { ThreadTarget } from '../../../shared/agent-os';
import type { Resonance } from '../../../shared/writing-graph';
import type { WritingScope } from '../../../shared/writing-agent';
import type { CapabilityPack, ToolContext } from '../kernel/capability';
import { canvasPack } from '../packs/canvas';
import { generationPack } from '../packs/generation';
import { writingPack } from '../packs/writing';
import type { OsDeps } from './service';
import type { SpaceHosts } from './spaces';

/** The document a thread is bound to, as a writing scope. */
export const documentOf = (targets: ThreadTarget[]): WritingScope | undefined => {
  const target = targets.find((t) => t.kind === 'document');
  return target?.kind === 'document' ? { rootId: target.rootId, path: target.path } : undefined;
};
export const canvasOf = (targets: ThreadTarget[]) => {
  const target = targets.find((t) => t.kind === 'canvas');
  return target?.kind === 'canvas' ? target.canvasId : undefined;
};

/**
 * The packs that act on a thread's targets. A canvas works on the stored project whether or not
 * it is open; a document goes through the window that has it open (the editor buffer, unsaved)
 * and otherwise through the saved file, where every edit is saved and can be undone.
 */
export function targetPacks(
  targets: ThreadTarget[],
  context: ToolContext,
  selectedIds: readonly string[],
  spaces: SpaceHosts,
  deps: OsDeps,
): CapabilityPack[] {
  const packs: CapabilityPack[] = [];
  const canvasId = canvasOf(targets);
  if (canvasId && deps.projects) {
    packs.push(
      canvasPack(
        context,
        { projectId: canvasId, selectedIds },
        {
          store: deps.projects,
          broker: spaces.canvas,
          focusOwner: () => spaces.canvasOwner(canvasId),
        },
      ),
    );
    if (deps.generation)
      packs.push(
        generationPack(context, canvasId, { runner: deps.generation, store: deps.projects }),
      );
  }
  const scope = documentOf(targets);
  if (scope) {
    const owner = spaces.documentOwner(scope);
    if (owner !== undefined)
      packs.push(writingPack({ ...context, owner }, scope, spaces.writing, deps.graph));
    else if (spaces.disk)
      packs.push(writingPack(context, scope, spaces.disk, deps.graph, spaces.disk));
  }
  return packs;
}

/** Resonance candidates must be other Markdown documents of the target document's folder. */
export async function checkResonance(
  resonance: Resonance[],
  scope: WritingScope | undefined,
  deps: OsDeps,
) {
  if (!scope || !deps.graph) throw new Error('只有绑定文档的线程可以给出共鸣点');
  const allowed = await deps.graph.related(scope.rootId, scope.path);
  if (resonance.some((item) => !allowed.some((d) => d.path === item.path)))
    throw new Error('共鸣点必须来自当前文档同文件夹的其他 Markdown');
}
