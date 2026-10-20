import { Clock3, Diamond, RectangleHorizontal, Video } from 'lucide-react';
import { ParameterControl } from './ParameterControl';
import { videoModels, videoRatios } from './models';
import type { MediaData } from './types';
export function VideoControls({
  data,
  disabled,
  onChange,
}: {
  data: MediaData;
  disabled: boolean;
  onChange: (patch: Partial<MediaData>) => void;
}) {
  const resolutions =
    data.model === 'seedance-2.5' ? ['480p', '720p', '1080p'] : ['480p', '720p', '1080p', '4k'];
  return (
    <div className="node-parameters" role="group" aria-label="视频参数">
      <ParameterControl
        model
        icon={<Video size={16} />}
        label="选择模型"
        value={data.model}
        display={data.model ? data.model.replace('seedance-', 'Seedance ') : '选择模型'}
        disabled={disabled}
        onChange={(model) => onChange({ model })}
      >
        <option value="">选择模型</option>
        {videoModels.map((model) => (
          <option value={model} key={model}>
            {model.replace('seedance-', 'Seedance ')}
          </option>
        ))}
      </ParameterControl>
      <ParameterControl
        label="视频时长"
        value={String(data.duration)}
        display={data.duration === -1 ? '自动' : `${data.duration}s`}
        icon={<Clock3 size={16} />}
        disabled={disabled}
        onChange={(duration) => onChange({ duration: Number(duration) })}
      >
        <option value={-1}>自动时长</option>
        {Array.from({ length: data.model === 'seedance-2.5' ? 27 : 12 }, (_, i) => i + 4).map(
          (n) => (
            <option value={n} key={n}>
              {n} 秒
            </option>
          ),
        )}
      </ParameterControl>
      <ParameterControl
        label="宽高比"
        value={data.size}
        display={data.size === 'adaptive' ? '自适应' : data.size}
        icon={<RectangleHorizontal size={16} />}
        disabled={disabled}
        onChange={(size) => onChange({ size })}
      >
        {videoRatios.map((r) => (
          <option value={r} key={r}>
            {r === 'adaptive' ? '自适应' : r}
          </option>
        ))}
      </ParameterControl>
      <ParameterControl
        label="分辨率"
        value={data.resolution}
        display={data.resolution}
        icon={<Diamond size={16} />}
        disabled={disabled}
        onChange={(resolution) => onChange({ resolution })}
      >
        {resolutions.map((r) => (
          <option value={r} key={r}>
            {r}
          </option>
        ))}
      </ParameterControl>
    </div>
  );
}
