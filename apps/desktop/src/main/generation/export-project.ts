import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import type { ExportProject, RequestRecord } from '../../shared/generation';

const kindNames = { image: '图像', video: '视频', audio: '音频' };
const statusNames = { running: '进行中', succeeded: '成功', failed: '失败', unknown: '结果未知' };
const colors = { ink: 'FF243447', blue: 'FF245982', pale: 'FFEAF1F7', white: 'FFFFFFFF' };
export function textParts(text: string): string[] {
  const parts: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + 32000, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(text.slice(offset, end));
    offset = end;
  }
  return parts.length ? parts : [''];
}
function header(row: ExcelJS.Row) {
  row.height = 32;
  row.font = { bold: true, color: { argb: colors.white }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.blue } };
  row.alignment = { vertical: 'middle', wrapText: true };
}
export async function createProjectWorkbook(
  project: ExportProject,
  records: RequestRecord[],
  exportedAt = new Date(),
) {
  const source = records
    .filter((r) => r.projectId === project.projectId)
    .sort((a, b) => a.startedAt - b.startedAt);
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const book = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: true,
    useStyles: true,
  });
  book.creator = 'Jarvis';
  book.created = exportedAt;
  const summary = book.addWorksheet('消耗统计', { views: [{ state: 'frozen', ySplit: 8 }] });
  const detail = book.addWorksheet('请求明细', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
  });
  const columns = [
    '请求 ID',
    '节点 ID',
    '请求时间（UTC）',
    '操作',
    '媒体类型',
    '模型',
    '状态',
    '视频请求时长（秒）',
    '文件名',
    '错误',
    '记录警告',
  ];
  const values = source.map((r) => [
    r.requestId,
    r.nodeId,
    new Date(r.startedAt).toISOString(),
    r.operation === 'generation' ? '生成' : '上传',
    kindNames[r.kind],
    r.operation === 'upload' ? '不适用' : (r.model ?? '未记录'),
    statusNames[r.status],
    r.kind === 'video' && r.operation === 'generation'
      ? r.duration === -1
        ? '自动'
        : (r.duration ?? '未记录')
      : '',
    r.fileName ?? '',
    r.error ?? '',
    r.warning ?? '',
  ]);
  const widths = [38, 38, 26, 10, 12, 30, 14, 20, 32, 48, 48];
  for (const field of ['endpoint', 'resultUrl', 'requestJson'] as const) {
    const label = {
      endpoint: '请求地址',
      resultUrl: '返回 URL',
      requestJson: '请求 JSON / 上传元数据',
    }[field];
    const parts = source.map((r) =>
      textParts(r[field] ?? (field === 'requestJson' ? '未记录（旧请求未保存原始 JSON）' : '')),
    );
    const count = Math.max(1, ...parts.map((p) => p.length));
    for (let i = 0; i < count; i++) {
      columns.push(count === 1 ? label : `${label}（分段 ${i + 1}/${count}）`);
      widths.push(field === 'requestJson' ? 90 : 55);
      for (let row = 0; row < values.length; row++) values[row]!.push(parts[row]?.[i] ?? '');
    }
  }
  detail.columns = columns.map((label, index) => ({ header: label, width: widths[index] }));
  for (const row of values) {
    const added = detail.addRow(row);
    added.height = 76;
    added.alignment = { vertical: 'top', wrapText: true };
  }
  header(detail.getRow(1));
  detail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: values.length + 1, column: columns.length },
  };
  summary.columns = [12, 32, 14, 14, 14, 14, 14, 20, 24].map((width) => ({ width }));
  summary.mergeCells('A1:I1');
  summary.getCell('A1').value = '画布项目 · 请求与消耗统计';
  summary.getCell('A1').font = { size: 18, bold: true, color: { argb: colors.ink } };
  summary.getRow(1).height = 36;
  for (const [index, value] of [
    project.projectName,
    `项目 ID：${project.projectId}`,
    `导出时间（UTC）：${exportedAt.toISOString()}`,
  ].entries()) {
    summary.mergeCells(index + 2, 1, index + 2, 9);
    summary.getCell(index + 2, 1).value = value;
    summary.getRow(index + 2).height = 24;
  }
  const notes = [
    '按模型统计生成请求；上传记录保留在请求明细中，不计入生成次数。节点删除不会删除请求账本。',
    '视频秒数按成功请求的配置时长合计；自动时长或旧记录缺失时长单独计数。历史缺失字段不从当前节点推测。',
    'JSON、地址超长时按同名分段列顺序拼接。上传实际使用 multipart，JSON 栏仅保存元数据，不包含文件二进制。',
  ];
  for (const [index, note] of notes.entries()) {
    summary.mergeCells(index + 5, 1, index + 5, 9);
    summary.getCell(index + 5, 1).value = note;
    summary.getCell(index + 5, 1).alignment = { wrapText: true, vertical: 'middle' };
    summary.getRow(index + 5).height = 30;
  }
  summary.getRow(8).values = [
    '媒体类型',
    '模型',
    '请求次数',
    '成功次数',
    '失败次数',
    '进行中',
    '结果未知',
    '成功视频已知秒数',
    '成功视频未知时长次数',
  ];
  header(summary.getRow(8));
  const generations = source.filter((r) => r.operation === 'generation');
  const groups = new Map<string, RequestRecord[]>();
  for (const r of generations) {
    const key = `${r.kind}:${r.model ?? '未记录'}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }
  const end = Math.max(2, values.length + 1);
  const range = (col: string) => `'请求明细'!$${col}$2:$${col}$${end}`;
  for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const first = group[0]!;
    const row = summary.addRow([kindNames[first.kind], first.model ?? '未记录']);
    const criteria = `${range('D')},"生成",${range('E')},A${row.number},${range('F')},B${row.number}`;
    row.getCell(3).value = { formula: `COUNTIFS(${criteria})`, result: group.length };
    for (const [index, status] of (
      ['succeeded', 'failed', 'running', 'unknown'] as const
    ).entries())
      row.getCell(index + 4).value = {
        formula: `COUNTIFS(${criteria},${range('G')},"${statusNames[status]}")`,
        result: group.filter((r) => r.status === status).length,
      };
    const succeededVideos = group.filter((r) => r.kind === 'video' && r.status === 'succeeded');
    row.getCell(8).value = {
      formula: `SUMIFS(${range('H')},${criteria},${range('G')},"成功",${range('E')},"视频",${range('H')},">0")`,
      result: succeededVideos.reduce((total, r) => total + Math.max(0, r.duration ?? 0), 0),
    };
    row.getCell(9).value = {
      formula: `COUNTIFS(${criteria},${range('G')},"成功",${range('E')},"视频",${range('H')},"自动")+COUNTIFS(${criteria},${range('G')},"成功",${range('E')},"视频",${range('H')},"未记录")`,
      result: succeededVideos.filter((r) => r.duration === undefined || r.duration === -1).length,
    };
    row.height = 26;
    row.alignment = { vertical: 'middle' };
  }
  const lastGroup = 8 + groups.size;
  const total = summary.addRow(['合计']);
  for (let column = 3; column <= 9; column++) {
    const letter = summary.getColumn(column).letter;
    const result = [...groups.values()].reduce((sum, _group, index) => {
      const value = summary.getCell(index + 9, column).value;
      return (
        sum + (value && typeof value === 'object' && 'result' in value ? Number(value.result) : 0)
      );
    }, 0);
    total.getCell(column).value =
      lastGroup >= 9 ? { formula: `SUM(${letter}9:${letter}${lastGroup})`, result } : 0;
  }
  total.font = { bold: true };
  total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.pale } };
  total.height = 28;
  for (let column = 3; column <= 9; column++)
    summary.getColumn(column).alignment = {
      horizontal: 'right',
      vertical: 'middle',
      wrapText: true,
    };
  await book.commit();
  return Buffer.concat(chunks);
}

export function exportFileName(projectName: string, now = new Date()) {
  const name =
    projectName
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\p{Cc}/gu, '')
      .replace(/[. ]+$/g, '')
      .slice(0, 80) || '未命名项目';
  return `${name}-请求记录-${now.toISOString().replace(/[:.]/g, '-')}.xlsx`;
}
