import { Button } from '@jarvis/ui/components/Button';
import { useEffect, useState } from 'react';
import { agentValue } from '../../../../shared/agent';
import type { AuthorizedFolder } from '../../../../shared/agent-files';

/** Folders the main Agent may read and change files in; nothing outside them is reachable. */
export function FileAccessSettings() {
  const [folders, setFolders] = useState<AuthorizedFolder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void window.desktop?.agent.listFolders().then((result) => {
      if (!active) return;
      if (result.ok) setFolders(result.value);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<AuthorizedFolder[] | null>) {
    setBusy(true);
    setError('');
    try {
      const next = await action();
      if (next) setFolders(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  const agent = window.desktop?.agent;
  return (
    <section className="flex flex-col gap-4 p-6" aria-labelledby="file-access-heading">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="file-access-heading" className="text-body">
            授权文件夹
          </h2>
          <p className="mt-1 text-subheadline text-fg-secondary">
            Jarvis
            只能在这里列出的文件夹中读取、新建和移动文件；覆盖或删除文件前会请你确认，本轮修改可在回复中撤销。
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !agent}
          onClick={() => agent && void run(async () => agentValue(await agent.addFolder()))}
        >
          添加文件夹
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-subheadline text-danger">
          {error}
        </p>
      )}
      {folders === null ? (
        <p className="text-subheadline text-fg-secondary">正在读取…</p>
      ) : folders.length === 0 ? (
        <p data-testid="folder-empty" className="text-subheadline text-fg-secondary">
          还没有授权文件夹。
        </p>
      ) : (
        <ul data-testid="folder-list" className="flex flex-col">
          {folders.map((folder) => (
            <li
              key={folder.id}
              data-testid="folder-row"
              className="flex min-h-13 items-center justify-between gap-4 border-b border-separator py-2"
            >
              <div className="min-w-0">
                <div className="text-body">{folder.name}</div>
                <div
                  className="truncate text-subheadline text-fg-secondary"
                  title={folder.directory}
                >
                  {folder.directory}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`移除授权：${folder.name}`}
                disabled={busy || !agent}
                onClick={() =>
                  agent && void run(async () => agentValue(await agent.removeFolder(folder.id)))
                }
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
