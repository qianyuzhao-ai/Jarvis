import { useEffect, useState } from 'react';
import type { AssetData } from './types';

export function UrlMedia({
  url,
  kind,
  label,
}: {
  url: string;
  kind: AssetData['kind'];
  label: string;
}) {
  const [source, setSource] = useState<{ src?: string; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void window.desktop!.generation.mediaUrl(url).then(
      (response) => {
        if (active) setSource(response.ok ? { src: response.value } : { error: response.error });
      },
      () => {
        if (active) setSource({ error: '无法读取媒体地址' });
      },
    );
    return () => {
      active = false;
    };
  }, [url, retry]);
  if (source.error)
    return (
      <div data-testid="result-error" className="result-error" role="alert">
        <span>媒体暂时无法加载：{source.error}</span>
        <button
          className="nodrag nopan"
          onClick={() => {
            setSource({});
            setRetry((n) => n + 1);
          }}
        >
          重新加载媒体
        </button>
      </div>
    );
  if (!source.src) return <span role="status">正在加载媒体…</span>;
  const src = `${source.src}?retry=${retry}`;
  const onError = () => setSource({ error: '请检查网络或资源 URL 是否仍然有效' });
  return kind === 'image' ? (
    <img className="generated-image" src={src} alt={label} draggable={false} onError={onError} />
  ) : kind === 'video' ? (
    <video
      className="generated-video nodrag nopan"
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={onError}
      aria-label={label}
    />
  ) : (
    <audio
      className="asset-audio nodrag nopan"
      src={src}
      controls
      preload="metadata"
      onError={onError}
      aria-label={label}
    />
  );
}
