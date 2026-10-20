import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  requestRecordSchema,
  type RequestRecord,
  type UploadRequest,
} from '../../shared/generation';
import { upload, uploadDescription } from './protocol';

export class UploadHistory {
  private recordsById = new Map<string, RequestRecord>();
  private writes = Promise.resolve();
  constructor(private readonly file: string) {}
  async initialize() {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const records = z.array(requestRecordSchema).parse(JSON.parse(raw));
    let changed = false;
    for (const record of records) {
      if (record.status === 'running') {
        record.status = 'unknown';
        record.error = '应用已重启，无法确认上次上传结果';
        changed = true;
      }
      this.recordsById.set(record.requestId, record);
    }
    if (changed) await this.persist();
  }
  records(projectId: string) {
    return [...this.recordsById.values()]
      .filter((record) => record.projectId === projectId)
      .map((record) => requestRecordSchema.parse(record));
  }
  private persist() {
    const snapshot = JSON.stringify([...this.recordsById.values()]);
    const write = this.writes.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', snapshot, { mode: 0o600 });
      await rename(this.file + '.tmp', this.file);
    });
    this.writes = write.catch(() => {});
    return write;
  }
  async upload(request: UploadRequest) {
    const description = uploadDescription(request);
    if (this.recordsById.has(request.requestId))
      throw new Error('上传请求标识已使用，请重新添加素材');
    const record: RequestRecord = {
      requestId: request.requestId,
      projectId: request.projectId,
      nodeId: request.nodeId,
      operation: 'upload',
      kind: request.file.kind,
      status: 'running',
      startedAt: Date.now(),
      fileName: request.file.name,
      ...description,
    };
    this.recordsById.set(record.requestId, record);
    try {
      await this.persist();
    } catch {
      this.recordsById.delete(record.requestId);
      throw new Error('无法保存请求记录，上传未发送');
    }
    let failure: unknown;
    try {
      record.resultUrl = (await upload(request)).url;
      record.status = 'succeeded';
    } catch (error) {
      failure = error;
      record.status = 'failed';
      record.error = error instanceof Error ? error.message : '上传失败';
    }
    record.finishedAt = Date.now();
    try {
      await this.persist();
    } catch {
      record.warning = '上传结果尚未写入请求账本，请保留当前窗口并导出记录';
    }
    if (!record.resultUrl) throw failure;
    return { url: record.resultUrl, warning: record.warning };
  }
}
