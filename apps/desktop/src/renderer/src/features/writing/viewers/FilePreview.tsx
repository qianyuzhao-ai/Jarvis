import { useState } from 'react';
import { Button } from '@jarvis/ui/components/Button';
import { Badge } from '@jarvis/ui/components/Badge';
import { WritingFileIcon } from '../tree/FileTreeRow';
import { unwrap, type DocumentSession } from '../useWriting';
export function FilePreview({
  document,
  onInsert,
  onError,
}: {
  document: DocumentSession;
  onInsert?: () => void;
  onError(message: string): void;
}) {
  const [dimensions, setDimensions] = useState(''),
    [copied, setCopied] = useState(false);
  const url = `jarvis-writing://${document.rootId}/${encodeURIComponent(document.path)}`;
  const name = document.path.split('/').at(-1) ?? document.path;
  const type = document.fileType;
  return (
    <section className="writing-file-preview" aria-label="文件预览">
      <header>
        <WritingFileIcon name={name} />
        <strong>{name}</strong>
        <Badge>{name.split('.').at(-1)?.toUpperCase()}</Badge>
      </header>
      <div className="writing-preview-content">
        {type === 'image' && (
          <img
            src={url}
            alt={name}
            onLoad={(e) =>
              setDimensions(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)
            }
            onError={() => onError('图片无法读取')}
          />
        )}
        {type === 'pdf' && <iframe title={name} src={url} />}
        {type === 'audio' && (
          <audio controls src={url} aria-label={name}>
            <track kind="captions" />
          </audio>
        )}
        {type === 'video' && (
          <video controls playsInline src={url} aria-label={name}>
            <track kind="captions" />
          </video>
        )}
        {type === 'binary' && <p>这个格式暂不支持在 Jarvis 中预览</p>}
      </div>
      <footer>
        <span>
          {[
            dimensions,
            document.size !== undefined ? `${(document.size / 1024).toFixed(1)} KB` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {type === 'image' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `![${name.replaceAll(']', '\\]')}](${document.path.split('/').map(encodeURIComponent).join('/')})`,
                  )
                  .then(() => setCopied(true))
                  .catch(() => onError('复制失败'))
              }
            >
              {copied ? '已复制' : '复制引用'}
            </Button>
            <Button size="sm" disabled={!onInsert} onClick={onInsert}>
              插入到文稿
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void window.desktop?.writing
              .reveal(document)
              .then(unwrap)
              .catch((e: unknown) => onError(e instanceof Error ? e.message : '无法定位文件'))
          }
        >
          {window.desktop?.platform === 'win32' ? '在资源管理器中显示' : '在访达中显示'}
        </Button>
      </footer>
    </section>
  );
}
