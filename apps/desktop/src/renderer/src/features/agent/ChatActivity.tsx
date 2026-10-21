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

export function ChatActivity({ activities }: { activities: ChatMessage['activities'] }) {
  if (!activities?.length) return null;
  return (
    <div className="chat-activities">
      {activities.map((activity) => (
        <details className="chat-activity" key={activity.id} open>
          <summary>{activity.label}</summary>
          {activity.files.length > 0 && (
            <div className="chat-files">
              {activity.files.map((file, index) => (
                <details className="chat-file" key={`${file.path}-${index}`}>
                  <summary>
                    <span>{{ created: '创建', edited: '修改', deleted: '删除' }[file.action]}</span>
                    <span className="chat-file-name">{file.path.split(/[\\/]/).at(-1)}</span>
                    <span className="diff-added">+{file.added}</span>
                    <span className="diff-removed">−{file.removed}</span>
                  </summary>
                  <div className="chat-file-path">{file.path}</div>
                  <pre className="chat-diff" tabIndex={0} aria-label={`${file.path} 文件差异`}>
                    <code>
                      {diffLines(file.diff).map((line, index) => (
                        <span
                          key={`${index}-${line.text}`}
                          className={`diff-${line.kind || 'header'}`}
                        >
                          <span className="diff-line-number" aria-hidden="true">
                            {line.before}
                          </span>
                          <span className="diff-line-number" aria-hidden="true">
                            {line.after}
                          </span>
                          <span>{line.text || ' '}</span>
                        </span>
                      ))}
                    </code>
                  </pre>
                </details>
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
