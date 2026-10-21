import { useRef, useState } from 'react';
import type { VisionAsset } from '../../../../shared/canvas-vision';
import { mediaName, type Project } from './types';
import { prepareVisualAsset, visualSource } from './canvas-vision';
export type CanvasAttachment = {
  sourceUrl?: string;
  nodeId: string;
  name: string;
  status: 'preparing' | 'ready' | 'failed';
  images: VisionAsset[];
  error?: string;
};
export function useCanvasAttachments(
  project: Project,
  selectedIds: string[],
  onError: (message: string) => void,
) {
  const [entries, setEntries] = useState<CanvasAttachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const pending = useRef(false);
  async function add() {
    if (pending.current) return;
    const nodes = project.nodes.filter(
      (n) => selectedIds.includes(n.id) && !entries.some((e) => e.nodeId === n.id),
    );
    if (!nodes.length) {
      onError('请先在画布选择尚未添加的图片或视频资产');
      return;
    }
    if (entries.length + nodes.length > 6) {
      onError('每次最多添加 6 个资产');
      return;
    }
    pending.current = true;
    setPreparing(true);
    onError('');
    const additions: CanvasAttachment[] = nodes.map((n) => ({
      nodeId: n.id,
      name: n.type === 'media' ? mediaName(n.data) : n.data.name,
      status: 'preparing',
      images: [],
    }));
    setEntries((current) => [...current, ...additions]);
    let total = entries.reduce((sum, e) => sum + e.images.length, 0);
    let bytes = entries.flatMap((e) => e.images).reduce((sum, i) => sum + i.data.length, 0);
    try {
      for (const node of nodes) {
        let entry: CanvasAttachment;
        try {
          const images = await prepareVisualAsset(node);
          if (
            total + images.length > 12 ||
            bytes + images.reduce((s, i) => s + i.data.length, 0) > 16000000
          )
            throw new Error('图片/视频帧总量较大，请减少发送的资产');
          total += images.length;
          bytes += images.reduce((s, i) => s + i.data.length, 0);
          entry = {
            nodeId: node.id,
            name: additions.find((e) => e.nodeId === node.id)?.name ?? node.id,
            status: 'ready',
            sourceUrl: visualSource(node)?.url,
            images,
          };
        } catch (error) {
          entry = {
            nodeId: node.id,
            name: additions.find((e) => e.nodeId === node.id)?.name ?? node.id,
            status: 'failed',
            images: [],
            error: error instanceof Error ? error.message : '无法准备资产',
          };
        }
        setEntries((current) => current.map((e) => (e.nodeId === node.id ? entry : e)));
      }
    } finally {
      pending.current = false;
      setPreparing(false);
    }
  }
  return {
    entries,
    preparing,
    add,
    clear: () => {
      if (!pending.current) setEntries([]);
    },
    remove: (id: string) => {
      if (!pending.current) setEntries((current) => current.filter((e) => e.nodeId !== id));
    },
    images: entries.flatMap((e) => e.images),
    blocked: entries.some((e) => e.status !== 'ready'),
  };
}
