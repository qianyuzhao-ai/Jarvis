import { useEffect, useRef } from 'react';
import { agentValue } from '../../../../shared/agent';
import { canvasCommandSchema, type CanvasCommand } from '../../../../shared/canvas-agent';
import { prepareCanvasUndo } from './canvas-transactions';
import type { Project } from './types';
import { openProject } from '../agent/open-targets';

/**
 * Serves the canvas Agent's commands for a project shown in this window: focusing nodes, and
 * undoing edits made before Agent edits moved to the main process. Edits themselves are saved by
 * the main process and arrive as project updates.
 */
export function useCanvasHost(
  project: Project,
  commit: (change: (p: Project) => Project) => Promise<void>,
  focus: (ids: string[]) => void,
  onError: (message: string) => void,
) {
  const latest = useRef({ project, commit, focus, onError });
  latest.current = { project, commit, focus, onError };
  useEffect(() => openProject(project.id, project.name), [project.id, project.name]);
  useEffect(() => {
    const bridge = window.desktop?.agent;
    if (!bridge) return;
    const connected = bridge;
    let mounted = true;
    let queue = Promise.resolve();
    async function receive(raw: CanvasCommand) {
      const command = canvasCommandSchema.parse(raw);
      if (!mounted || command.projectId !== project.id || command.expiresAt < Date.now()) return;
      if (!agentValue(await connected.claimCanvasCommand(command.requestId))) return;
      try {
        if (!mounted) throw new Error('当前画布已关闭');
        const current = latest.current.project;
        if (command.command.type === 'focus') {
          if (command.command.nodeIds.some((id) => !current.nodes.some((n) => n.id === id)))
            throw new Error('节点已不存在');
          latest.current.focus(command.command.nodeIds);
        } else {
          const next = await prepareCanvasUndo(current, command.command.transactionId);
          await latest.current.commit((p) => {
            if (p !== current) throw new Error('画布已发生修改，请重试');
            return next;
          });
        }
        agentValue(
          await connected.completeCanvasCommand({
            requestId: command.requestId,
            projectId: project.id,
            ok: true,
            ...(command.command.type === 'focus' ? { nodeIds: command.command.nodeIds } : {}),
          }),
        );
      } catch (error) {
        await connected.completeCanvasCommand({
          requestId: command.requestId,
          projectId: project.id,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 1000) : '画布操作失败',
        });
      }
    }
    const unsubscribe = bridge.onCanvasCommand((command) => {
      queue = queue
        .then(() => receive(command))
        .catch((error) =>
          latest.current.onError(error instanceof Error ? error.message : '画布工具回执失败'),
        );
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [project.id]);
}
