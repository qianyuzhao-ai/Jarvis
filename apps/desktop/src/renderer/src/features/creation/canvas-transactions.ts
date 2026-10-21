import type { CanvasCommand } from '../../../../shared/canvas-agent';
import { applyCanvasOperations } from './canvas-commands';
import { graphRevision } from './canvas-context';
import type { Project } from './types';

export async function prepareCanvasEdit(project: Project, command: CanvasCommand) {
  if (
    project.id !== command.projectId ||
    (await graphRevision(project)) !== command.expectedRevision
  )
    throw new Error('画布已发生修改，请重新读取后再操作');
  if (command.command.type !== 'apply') throw new Error('不是画布编辑命令');
  const result = applyCanvasOperations(project, command.command.operations);
  const previous = project.agentEdits.at(-1);
  const sameRun = previous?.runId === command.runId;
  const entry = {
    id: sameRun ? previous.id : crypto.randomUUID(),
    runId: command.runId,
    createdAt: Date.now(),
    before: sameRun ? previous.before : { nodes: project.nodes, edges: project.edges },
    afterRevision: await graphRevision(result.project),
    nodeIds: [...new Set([...(sameRun ? previous.nodeIds : []), ...result.nodeIds])],
  };
  return {
    project: {
      ...result.project,
      agentEdits: [...project.agentEdits.slice(0, sameRun ? -1 : undefined), entry].slice(-20),
    },
    transactionId: entry.id,
    nodeIds: result.nodeIds,
  };
}
export async function prepareCanvasUndo(project: Project, transactionId: string) {
  const last = project.agentEdits.at(-1);
  if (!last || last.id !== transactionId) throw new Error('请先撤销最近一次画布修改');
  if ((await graphRevision(project)) !== last.afterRevision)
    throw new Error('画布已发生后续修改，为保留你的工作，暂不能撤销这次操作');
  return { ...project, ...last.before, agentEdits: project.agentEdits.slice(0, -1) };
}
