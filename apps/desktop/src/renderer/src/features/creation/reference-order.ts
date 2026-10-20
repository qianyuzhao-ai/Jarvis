import type { Reference } from './types';
const names = { image: '图片', audio: '音频', video: '视频' };
export function numberReferences(references: Reference[]) {
  const counts = { image: 0, audio: 0, video: 0 };
  return references.map((item) => {
    const number = ++counts[item.type];
    return { item, number, label: `${names[item.type]} ${number}` };
  });
}
