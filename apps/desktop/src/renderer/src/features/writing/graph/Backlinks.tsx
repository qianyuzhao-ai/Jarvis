import { useState } from 'react';
import { Button } from '@jarvis/ui/components/Button';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { ResonanceCards } from './ResonanceCards';
import type { GraphWorkspace } from './use-writing-graph';
import './graph.css';
export function Backlinks({
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
  const [target, setTarget] = useState('');
  const confirm = useConfirm();
  const incoming = workspace.graph?.links.filter((link) => link.target === path) ?? [];
  const broken =
    workspace.graph?.links.filter((link) => link.source === path && !link.target) ?? [];
  return (
    <section className="writing-backlinks" aria-label="文档关联">
      <details>
        <summary>连接到此文的点（{incoming.length}）</summary>
        {incoming.map((link, index) => (
          <div className="writing-backlink" key={`${link.source}:${index}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => onOpen(link.source, e.metaKey || e.ctrlKey)}
            >
              {link.source}
            </Button>
            <p>{link.context}</p>
          </div>
        ))}
        {!incoming.length && <p>还没有文档链接到这里。</p>}
      </details>
      <ResonanceCards workspace={workspace} rootId={rootId} path={path} onOpen={onOpen} />
      {!!broken.length && (
        <details>
          <summary>失效链接（{broken.length}）</summary>
          <NativeSelect
            aria-label="修复链接目标"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">选择目标文档</option>
            {workspace.graph?.dots
              .filter((dot) => dot.path !== path)
              .map((dot) => (
                <option key={dot.path} value={dot.path}>
                  {dot.path}
                </option>
              ))}
          </NativeSelect>
          {broken.map((link) => (
            <div className="writing-backlink" key={`${link.from}:${link.reference}`}>
              <span>{link.reference}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!target || workspace.busy}
                onClick={() =>
                  void (async () => {
                    if (
                      await confirm({
                        title: '修复这个链接？',
                        message: `将“${link.reference}”改为“${target}”。仅修改来源文档。`,
                      })
                    )
                      await workspace.change({
                        action: 'repair',
                        rootId,
                        from: path,
                        to: target,
                        reference: link.reference,
                        offset: link.from,
                      });
                  })()
                }
              >
                修复链接
              </Button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
