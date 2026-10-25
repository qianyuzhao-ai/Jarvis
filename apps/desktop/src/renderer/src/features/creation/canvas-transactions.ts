import { graphRevision } from './canvas-context';
import type { Project } from './types';

/** Undoes an Agent edit saved before edits moved to the main process (no ledger inverse). */
export async function prepareCanvasUndo(project: Project, transactionId: string) {
  const last = project.agentEdits.at(-1);
  if (!last || last.id !== transactionId) throw new Error('请先撤销最近一次画布修改');
  if ((await graphRevision(project)) !== last.afterRevision)
    throw new Error('画布已发生后续修改，为保留你的工作，暂不能撤销这次操作');
  return { ...project, ...last.before, agentEdits: project.agentEdits.slice(0, -1) };
}
