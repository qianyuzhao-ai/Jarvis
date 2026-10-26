import { Button } from '@jarvis/ui/components/Button';
import { Badge } from '@jarvis/ui/components/Badge';
import { Sparkles, Link2 } from '@jarvis/ui/icons';
import type { GraphWorkspace } from './use-writing-graph';
export function ResonanceCards({
  workspace,
  rootId,
  path,
  onOpen,
}: {
  workspace: GraphWorkspace;
  rootId: string;
  path: string;
  onOpen(path: string, newTab: boolean): void;
}) {
  return (
    <div className="writing-resonances">
      {workspace.candidates.map((item) => (
        <article className="writing-resonance" key={item.path}>
          <div className="writing-resonance-title">
            <Sparkles size={14} />
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => onOpen(item.path, e.metaKey || e.ctrlKey)}
            >
              {item.path.replace(/\.(md|markdown)$/i, '')}
            </Button>
            <Badge tone="info" appearance="subtle">
              共鸣点
            </Badge>
          </div>
          <p>{item.reason}</p>
          {workspace.confirmed[item.path] ? (
            <div className="writing-resonance-actions">
              <span>
                <Link2 size={12} /> 已关联
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void workspace.undo(workspace.confirmed[item.path]!)}
              >
                撤销
              </Button>
            </div>
          ) : (
            <div className="writing-resonance-actions">
              <Button
                size="sm"
                disabled={workspace.busy}
                onClick={() =>
                  void workspace.change({ action: 'link', rootId, from: path, to: item.path })
                }
              >
                建立关联
              </Button>
              <Button size="sm" variant="ghost" onClick={() => workspace.ignore(item.path)}>
                忽略
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
