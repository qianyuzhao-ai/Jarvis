import { Brain, Diamond, Image, RectangleHorizontal } from 'lucide-react';
import { ParameterControl } from './ParameterControl';
import { gptDimensions, gptPreset, gptSizes, imageModels, isNano, nanoRatios } from './models';
import type { MediaData } from './types';
const labels: Record<string, string> = {
  'gpt-image-2': 'GPT Image 2',
  'gpt-image-2.5-flare': 'Image 2.5 Flare',
  'gpt-image-2.5-sunburst': 'Image 2.5 Sunburst',
  'nano-banana-2': 'Nano Banana 2',
  'nano-banana-pro': 'Nano Banana Pro',
};
export function ImageControls({
  data,
  disabled,
  onChange,
}: {
  data: MediaData;
  disabled: boolean;
  onChange: (patch: Partial<MediaData>) => void;
}) {
  const nano = isNano(data.model);
  const dimensions = nano
    ? { ratio: data.size, resolution: data.resolution }
    : gptDimensions(data.size);
  const ratios = nano ? nanoRatios : [...new Set(gptSizes.map((p) => gptDimensions(p).ratio))];
  const resolutions = nano
    ? ['1K', '2K', '4K']
    : gptSizes
        .filter((p) => gptDimensions(p).ratio === dimensions.ratio)
        .map((p) => gptDimensions(p).resolution);
  const qualities = [
    'auto',
    'high',
    'medium',
    'low',
    ...(data.model.includes('2.5') ? ['max', 'xhigh'] : []),
  ];
  return (
    <div className="node-parameters" role="group" aria-label="图像参数">
      <ParameterControl
        model
        label="选择模型"
        value={data.model}
        display={labels[data.model] ?? '选择模型'}
        icon={<Image size={16} />}
        disabled={disabled}
        onChange={(model) => onChange({ model })}
      >
        <option value="">选择模型</option>
        {imageModels.map((m) => (
          <option value={m} key={m}>
            {labels[m]}
          </option>
        ))}
      </ParameterControl>
      <ParameterControl
        label="宽高比"
        value={dimensions.ratio}
        display={dimensions.ratio === 'auto' ? 'Auto' : dimensions.ratio}
        icon={<RectangleHorizontal size={16} />}
        disabled={disabled}
        onChange={(ratio) =>
          onChange({ size: nano ? ratio : gptPreset(ratio, dimensions.resolution) })
        }
      >
        {ratios.map((r) => (
          <option value={r} key={r}>
            {r === 'auto' ? 'Auto' : r}
          </option>
        ))}
      </ParameterControl>
      {!nano && (
        <ParameterControl
          label="思考程度"
          hint="当前服务使用 quality 档位；不是独立的推理参数"
          value={data.quality}
          display={
            data.quality === 'auto'
              ? 'Auto'
              : data.quality.charAt(0).toUpperCase() + data.quality.slice(1)
          }
          icon={<Brain size={16} />}
          disabled={disabled}
          onChange={(quality) => onChange({ quality })}
        >
          {qualities.map((q) => (
            <option value={q} key={q}>
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </option>
          ))}
        </ParameterControl>
      )}
      <ParameterControl
        label="分辨率"
        value={dimensions.resolution}
        display={dimensions.resolution === 'auto' ? 'Auto' : dimensions.resolution}
        icon={<Diamond size={16} />}
        disabled={disabled}
        onChange={(resolution) =>
          onChange(
            nano ? { resolution } : { size: gptPreset(dimensions.ratio, resolution), resolution },
          )
        }
      >
        {resolutions.map((r) => (
          <option value={r} key={r}>
            {r === 'auto' ? 'Auto' : r}
          </option>
        ))}
      </ParameterControl>
    </div>
  );
}
