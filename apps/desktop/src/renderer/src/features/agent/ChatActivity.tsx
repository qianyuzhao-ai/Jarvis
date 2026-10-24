import { Alert } from '@jarvis/ui/components/Alert';
import { Button } from '@jarvis/ui/components/Button';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@jarvis/ui/components/Collapsible';
import type { ChatMessage } from '../../../../shared/agent';

function diffLines(diff: string) {
  let oldLine: number | undefined;
  let newLine: number | undefined;
  return diff.split('\n').map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    }
    const kind =
      text.startsWith('+') && !text.startsWith('+++')
        ? 'add'
        : text.startsWith('-') && !text.startsWith('---')
          ? 'remove'
          : text.startsWith(' ')
            ? 'context'
            : '';
    const before = kind === 'remove' || kind === 'context' ? oldLine : undefined;
    const after = kind === 'add' || kind === 'context' ? newLine : undefined;
    if (before !== undefined) oldLine = before + 1;
    if (after !== undefined) newLine = after + 1;
    return { text, kind, before, after };
  });
}

export type CanvasActivityActions = {
  focus: (ids: string[]) => void;
  undo: (id: string) => void;
  canUndo: (id: string) => boolean;
};
export type WritingActivityActions = {
  undo: (id: string) => void;
  canUndo: (id: string) => boolean;
};
export function ChatActivity({
  activities,
  canvas,
  writing,
}: {
  activities: ChatMessage['activities'];
  canvas?: CanvasActivityActions;
  writing?: WritingActivityActions;
}) {
  if (!activities?.length) return null;
  return (
    <div data-testid="chat-activities" className="chat-activities">
      {activities.map((activity) => (
        <Collapsible className="chat-activity" key={activity.id} defaultOpen>
          <CollapsibleTrigger>{activity.label}</CollapsibleTrigger>
          <CollapsibleContent>
            {writing && activity.writingScope && activity.transactionId && (
              <Alert
                tone="success"
                title={activity.label}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!writing.canUndo(activity.transactionId)}
                    onClick={() => writing.undo(activity.transactionId!)}
                  >
                    撤销本次修改
                  </Button>
                }
              >
                编辑器内容已更新，尚未保存到磁盘。
              </Alert>
            )}
            {canvas && activity.nodeIds?.length ? (
              <div className="canvas-activity-actions">
                <button type="button" onClick={() => canvas.focus(activity.nodeIds ?? [])}>
                  定位节点
                </button>
                {activity.transactionId && (
                  <button
                    type="button"
                    disabled={!canvas.canUndo(activity.transactionId)}
                    onClick={() => canvas.undo(activity.transactionId ?? '')}
                  >
                    撤销本次修改
                  </button>
                )}
              </div>
            ) : null}
            {!!activity.changes?.length && (
              <Collapsible data-testid="canvas-change-details" className="canvas-change-details">
                <CollapsibleTrigger>查看 {activity.changes.length} 项变更</CollapsibleTrigger>
                <CollapsibleContent>
                  {activity.changes.map((change, index) => (
                    <div key={`${change.nodeId}-${index}`}>
                      <strong>{change.label}</strong>
                      <del>{change.before || '未填写'}</del>
                      <ins>{change.after || '未填写'}</ins>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
            {activity.files.length > 0 && (
              <div className="chat-files">
                {activity.files.map((file, index) => (
                  <Collapsible
                    data-testid="chat-file"
                    className="chat-file"
                    key={`${file.path}-${index}`}
                  >
                    <CollapsibleTrigger>
                      <span>
                        {{ created: '创建', edited: '修改', deleted: '删除' }[file.action]}
                      </span>
                      <span className="chat-file-name">{file.path.split(/[\\/]/).at(-1)}</span>
                      <span className="diff-added">+{file.added}</span>
                      <span className="diff-removed">−{file.removed}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div data-testid="chat-file-path" className="chat-file-path">
                        {file.path}
                      </div>
                      <pre
                        data-testid="chat-diff"
                        className="chat-diff"
                        tabIndex={0}
                        aria-label={`${file.path} 文件差异`}
                      >
                        <code>
                          {diffLines(file.diff).map((line, index) => (
                            <span
                              key={`${index}-${line.text}`}
                              data-diff-kind={line.kind || 'header'}
                              className={`diff-${line.kind || 'header'}`}
                            >
                              <span
                                data-testid="diff-line-number"
                                className="diff-line-number"
                                aria-hidden="true"
                              >
                                {line.before}
                              </span>
                              <span
                                data-testid="diff-line-number"
                                className="diff-line-number"
                                aria-hidden="true"
                              >
                                {line.after}
                              </span>
                              <span>{line.text || ' '}</span>
                            </span>
                          ))}
                        </code>
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
