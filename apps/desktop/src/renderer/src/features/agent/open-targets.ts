import type { OpenTargets } from '../../../../shared/agent-targets';

/**
 * The projects and documents this window has open, reported to the main process so the main
 * Agent can delegate to them. Canvas and writing hosts register while they are mounted.
 */
const projects = new Map<string, { name: string; count: number }>();
let documents: OpenTargets['documents'] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function publish() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void window.desktop?.agent?.setOpenTargets({
      projects: [...projects].slice(0, 50).map(([id, p]) => ({ id, name: p.name.slice(0, 100) })),
      documents: documents.slice(0, 200),
    });
  }, 0);
}

/** Marks a project open until the returned function runs. */
export function openProject(id: string, name: string) {
  const entry = projects.get(id) ?? { name, count: 0 };
  entry.name = name;
  entry.count++;
  projects.set(id, entry);
  publish();
  return () => {
    const current = projects.get(id);
    if (current && --current.count <= 0) projects.delete(id);
    publish();
  };
}

export function setOpenDocuments(next: OpenTargets['documents']) {
  documents = next;
  publish();
}
