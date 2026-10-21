import { useEffect, useRef } from 'react';
import { agentValue } from '../../../../shared/agent';
import { canvasCommandSchema, type CanvasCommand } from '../../../../shared/canvas-agent';
import { canvasSnapshot } from './canvas-context';
import { canvasChanges } from './canvas-changes';
import { prepareCanvasEdit } from './canvas-transactions';
import type { Project } from './types';

export function useCanvasHost(
  project: Project,
  commit: (change: (p: Project) => Project) => Promise<void>,
  focus: (ids: string[]) => void,
  onError: (message: string) => void,
) {
  const latest = useRef({ project, commit, focus, onError });
  latest.current = { project, commit, focus, onError };
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
          agentValue(
            await connected.completeCanvasCommand({
              requestId: command.requestId,
              projectId: project.id,
              ok: true,
              nodeIds: command.command.nodeIds,
            }),
          );
        } else {
          const edit = await prepareCanvasEdit(current, command);
          const changes = canvasChanges(current, edit.project);
          if (!mounted) throw new Error('当前画布已关闭');
          await latest.current.commit((p) => {
            if (p !== current) throw new Error('画布已发生修改，请重新读取后再操作');
            return edit.project;
          });
          agentValue(
            await connected.completeCanvasCommand({
              requestId: command.requestId,
              projectId: project.id,
              ok: true,
              snapshot: await canvasSnapshot(edit.project, []),
              transactionId: edit.transactionId,
              changes,
              nodeIds: edit.nodeIds,
            }),
          );
        }
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
      void bridge.getSnapshot().then((result) => {
        if (!result.ok) return;
        const session = result.value.snapshot.sessions.find(
          (s) => s.projectId === project.id && s.runId,
        );
        if (session?.runId) return bridge.cancel(session.runId);
      });
    };
  }, [project.id]);
}
