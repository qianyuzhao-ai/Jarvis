import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { CircleAlert, Music, Play, Pause } from '@jarvis/ui/icons';
import type { AssetData } from './types';
import { mediaTime } from './node-actions-context';
export function UrlMedia({
  url,
  kind,
  label,
  onDimensions,
}: {
  url: string;
  kind: AssetData['kind'];
  label: string;
  onDimensions?: (width: number, height: number) => void;
}) {
  const [source, setSource] = useState<{ src?: string; error?: string }>({});
  const [retry, setRetry] = useState(0),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [duration, setDuration] = useState(0),
    [time, setTime] = useState(0);
  const media = useRef<HTMLMediaElement | null>(null);
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
  const onError = () => setSource({ error: '请检查网络或资源 URL 是否仍然有效' });
  if (source.error)
    return (
      <div data-testid="result-error" className="result-error node-state" role="alert">
        <CircleAlert size={24} />
        <strong>媒体暂时无法加载</strong>
        <span>{source.error}</span>
        <Button
          variant="secondary"
          size="sm"
          className="nodrag nopan"
          onClick={(event) => {
            event.stopPropagation();
            setSource({});
            setReady(false);
            setPlaying(false);
            setRetry((n) => n + 1);
          }}
        >
          重新加载媒体
        </Button>
      </div>
    );
  const loaded = (node: HTMLMediaElement) => {
    setReady(true);
    setDuration(node.duration);
    if (node instanceof HTMLVideoElement) onDimensions?.(node.videoWidth, node.videoHeight);
  };
  const toggle = () => {
    const node = media.current;
    if (!node) return;
    if (node.paused) void node.play().catch(onError);
    else node.pause();
  };
  const durationLabel = Number.isFinite(duration) && duration > 0 ? mediaTime(duration) : '—:—';
  const src = source.src ? `${source.src}?retry=${retry}` : undefined;
  return (
    <div className={`node-media node-media-${kind}`} data-media-ready={ready}>
      {src &&
        (kind === 'image' ? (
          <img
            className="generated-image"
            src={src}
            alt={label}
            draggable={false}
            onError={onError}
            onLoad={(event) => {
              setReady(true);
              onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
            }}
          />
        ) : kind === 'video' ? (
          <video
            className="generated-video nodrag nopan"
            controls
            ref={(node) => {
              media.current = node;
            }}
            src={src}
            playsInline
            preload="metadata"
            draggable={false}
            onLoadedData={(e) => loaded(e.currentTarget)}
            onLoadedMetadata={(e) => loaded(e.currentTarget)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onError={onError}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            aria-label={label}
          />
        ) : (
          <audio
            hidden
            className="asset-audio"
            ref={(node) => {
              media.current = node;
            }}
            src={src}
            preload="metadata"
            onLoadedData={(e) => loaded(e.currentTarget)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onError={onError}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            aria-label={label}
          />
        ))}
      {!ready && (
        <div className="node-media-loading node-state" role="status">
          <Spinner size="lg" />
          <span>正在加载媒体…</span>
        </div>
      )}
      {ready && kind === 'audio' && (
        <div className="node-audio-player">
          <Music size={24} className="text-fg-tertiary" />
          <IconButton
            variant="secondary"
            shape="circle"
            className="nodrag nopan"
            aria-label={`${playing ? '暂停' : '播放'}${label}`}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <span className="text-callout text-fg-secondary">
            {playing ? `${mediaTime(time)} / ` : ''}
            {durationLabel}
          </span>
        </div>
      )}
    </div>
  );
}
