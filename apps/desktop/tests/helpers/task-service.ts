import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Response = { result: { status: string; content?: string[]; error?: unknown } };
export class TaskService {
  private tasks = new Map<string, Response>();
  hold = false;
  submit(res: ServerResponse, response: Response) {
    const id = randomUUID().replaceAll('-', '');
    this.tasks.set(id, response);
    res.end(JSON.stringify({ task_id: id, request_id: id, status: 'pending' }));
  }
  query(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'GET') return false;
    if (req.url?.includes('/model-quota?')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          granted: true,
          items: [
            {
              label: '可用额度',
              daily: { used: 4, limit: 120, remaining: 116 },
              monthly: { used: 4, limit: 300, remaining: 296 },
            },
          ],
        }),
      );
      return true;
    }
    const id = req.url?.split('/').at(-1) ?? '';
    const response = this.tasks.get(id);
    if (!response) return false;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        task_id: id,
        status: this.hold ? 'running' : response.result.status === 'success' ? 'success' : 'failed',
        response: this.hold ? null : { ...response, request_id: id },
      }),
    );
    return true;
  }
}
