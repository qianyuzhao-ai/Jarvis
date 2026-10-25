import type { ProjectRecord, ProjectResult } from '../../../../shared/project';
import { migrationForm, projectFromStored, storedForm } from './project-records';
import { loadLegacyWorkspace, loadPreferences } from './storage';
import type { WorkspaceData } from './types';

function value<T>(result: ProjectResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/**
 * Opens the workspace: preferences from IndexedDB, projects from the main process. On the first
 * start after the upgrade the IndexedDB projects are copied over once; the main process checks
 * the copy by reading it back, and the IndexedDB record is kept as it was.
 */
export async function loadWorkspace(): Promise<{ data: WorkspaceData; records: ProjectRecord[] }> {
  const bridge = window.desktop?.projects;
  if (!bridge) throw new Error('项目接口尚未加载，请完全退出并重新启动应用');
  if (!value(await bridge.migrated())) {
    const legacy = await loadLegacyWorkspace();
    const input = await Promise.all(
      legacy.projects.map(async (original) => {
        const { project, blobs } = storedForm(migrationForm(original));
        return {
          project,
          blobs: await Promise.all(
            [...blobs].map(async ([id, blob]) => ({
              id,
              bytes: new Uint8Array(await blob.arrayBuffer()),
            })),
          ),
        };
      }),
    );
    const migrated = await bridge.migrate(input);
    if (!migrated.ok) throw new Error(`项目迁移失败，原数据已保留：${migrated.error}`);
  }
  const records = value(await bridge.list());
  const projects = await Promise.all(
    records.map(({ project }) =>
      projectFromStored(project, async (id) =>
        value(await bridge.readBlob({ projectId: project.id, id })),
      ),
    ),
  );
  // An upload that was running when the app closed cannot finish; say so instead of waiting.
  for (const project of projects)
    for (const node of project.nodes)
      if (node.type === 'asset' && node.data.upload.status === 'uploading')
        node.data.upload = { status: 'failed', error: '上传已中断，尚未保存资源 URL' };
  return { data: { ...(await loadPreferences()), projects }, records };
}
