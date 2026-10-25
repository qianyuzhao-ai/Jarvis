import { useEffect, useRef } from 'react';
import { agentValue } from '../../../../shared/agent';
import { canvasCommandSchema } from '../../../../shared/canvas-agent';
import { openProject } from '../agent/open-targets';
import { canvasSnapshot } from './canvas-context';
import type { Project } from './types';

/**
 * Projects with a canvas tab count as open, so the main Agent can delegate to them. A canvas only
 * mounts while its tab is shown or its conversation replies, so snapshot requests are answered here
 * too; whichever handler claims a request first replies, from the same project data.
 */
export function useCanvasTargets(projects: Project[]) {
  const latest = useRef(projects);
  latest.current = projects;
  const key = JSON.stringify(projects.map((p) => [p.id, p.name]));
  useEffect(() => {
    const entries: [string, string][] = JSON.parse(key);
    const close = entries.map(([id, name]) => openProject(id, name));
    return () => {
      for (const done of close) done();
    };
  }, [key]);
  useEffect(() => {
    const bridge = window.desktop?.agent;
    if (!bridge) return;
    const connected = bridge;
    return bridge.onCanvasCommand(async (raw) => {
      const parsed = canvasCommandSchema.safeParse(raw);
      if (!parsed.success) return;
      const command = parsed.data;
      const project = latest.current.find((p) => p.id === command.projectId);
      if (command.command.type !== 'snapshot' || !project || command.expiresAt < Date.now()) return;
      if (!agentValue(await connected.claimCanvasCommand(command.requestId))) return;
      try {
        agentValue(
          await connected.completeCanvasCommand({
            requestId: command.requestId,
            projectId: project.id,
            ok: true,
            snapshot: await canvasSnapshot(project, []),
          }),
        );
      } catch (error) {
        await connected.completeCanvasCommand({
          requestId: command.requestId,
          projectId: project.id,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 1000) : '无法读取画布',
        });
      }
    });
  }, []);
}
