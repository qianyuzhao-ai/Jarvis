import { useState } from 'react';
import { ChevronRight, FileText } from '@jarvis/ui/icons';
import { Button } from '@jarvis/ui/components/Button';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { ResonanceCards } from './ResonanceCards';
import type { GraphWorkspace } from './use-writing-graph';
import type { GraphLink } from '../../../../../shared/writing-graph';
import './graph.css';

function plain(text: string) {
  return text
    .replace(
      /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
      (_, target, alias) => alias ?? target,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ');
}

function backlinkSnippet(link: Pick<GraphLink, 'from' | 'to' | 'context'>) {
  const start = Math.max(0, link.from - 40);
  const offset = link.from - start;
  const end = Math.min(link.context.length, offset + link.to - link.from);
  return {
    before: `${start ? '…' : ''}${plain(link.context.slice(0, offset)).trimStart()}`,
    mark: plain(link.context.slice(offset, end)),
    after: plain(link.context.slice(end)).trimEnd(),
  };
}
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
        <summary>
          <ChevronRight aria-hidden className="writing-backlinks-chevron" />
          连接到此文的点（{incoming.length}）
        </summary>
        {incoming.map((link, index) => {
          const snippet = backlinkSnippet(link);
          return (
            <div className="writing-backlink" key={`${link.source}:${index}`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => onOpen(link.source, e.metaKey || e.ctrlKey)}
              >
                <FileText aria-hidden />
                {link.source}
              </Button>
              <p>
                {snippet.before}
                <mark>{snippet.mark}</mark>
                {snippet.after}
              </p>
            </div>
          );
        })}
        {!incoming.length && <p>还没有文档链接到这里。</p>}
      </details>
      <ResonanceCards workspace={workspace} rootId={rootId} path={path} onOpen={onOpen} />
      {!!broken.length && (
        <details>
          <summary>
            <ChevronRight aria-hidden className="writing-backlinks-chevron" />
            失效链接（{broken.length}）
          </summary>
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
