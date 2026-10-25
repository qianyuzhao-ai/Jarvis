import { Badge } from '@jarvis/ui/components/Badge';
import { Button } from '@jarvis/ui/components/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jarvis/ui/components/Dialog';
import { Field, FieldDescription, FieldLabel } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Textarea } from '@jarvis/ui/components/Textarea';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from '@jarvis/ui/icons';
import { agentValue } from '../../../../shared/agent';
import type { McpServerInput, McpServerView, McpStatus } from '../../../../shared/agent-mcp';

const statusLabel: Record<
  McpStatus,
  [string, 'success' | 'neutral' | 'warning' | 'danger' | 'accent']
> = {
  connected: ['已连接', 'success'],
  connecting: ['连接中', 'neutral'],
  needs_auth: ['需要登录', 'warning'],
  signing_in: ['正在浏览器中登录', 'accent'],
  disabled: ['已停用', 'neutral'],
  error: ['连接失败', 'danger'],
};
/** `KEY=VALUE` per line; blank lines are ignored. */
function pairs(text: string) {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const at = trimmed.indexOf(trimmed.includes('=') ? '=' : ':');
    if (at <= 0) throw new Error(`格式应为 名称=值：${trimmed.slice(0, 40)}`);
    result[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
  return result;
}

/** MCP servers for the main Agent: Google, email and other external tools come in this way. */
export function McpSettings({
  servers,
  actionTarget,
  active,
}: {
  servers: McpServerView[];
  /** The plugins toolbar, where the add button sits while this tab is shown. */
  actionTarget: HTMLElement | null;
  active: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const agent = window.desktop?.agent;
  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败，请重试');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div data-testid="plugins-mcp" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-subheadline text-fg-secondary">
          接入 MCP 服务后，Jarvis 可以使用 Google
          文档、邮件等外部工具。只读工具直接调用；发送、写入、删除等操作每次都会先请你确认。凭据加密保存在系统钥匙串中。
        </p>
      </div>
      {actionTarget &&
        active &&
        createPortal(
          <Button
            variant="secondary"
            type="button"
            disabled={!agent}
            onClick={() => setAdding(true)}
          >
            <Plus size={16} />
            添加 MCP
          </Button>,
          actionTarget,
        )}
      {error && (
        <p role="alert" className="text-subheadline text-danger">
          {error}
        </p>
      )}
      {servers.length === 0 ? (
        <p data-testid="mcp-empty" className="text-subheadline text-fg-secondary">
          还没有 MCP 服务。
        </p>
      ) : (
        <ul className="flex flex-col">
          {servers.map((server) => {
            const [label, tone] = statusLabel[server.status];
            const run = (action: () => Promise<unknown>) => agent && void act(server.id, action);
            return (
              <li
                key={server.id}
                data-testid="mcp-server"
                aria-label={`MCP 服务：${server.name}`}
                className="flex flex-col gap-2 border-b border-separator py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <strong className="text-body">{server.name}</strong>
                    <Badge tone={tone} data-testid="mcp-status">
                      {label}
                    </Badge>
                    <span className="text-footnote text-fg-tertiary">
                      {server.type === 'stdio' ? '本地命令' : '远程 HTTP'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {server.status === 'needs_auth' && (
                      <Button
                        size="sm"
                        disabled={busy === server.id}
                        onClick={() =>
                          run(async () => agentValue(await agent!.signInMcpServer(server.id)))
                        }
                      >
                        登录
                      </Button>
                    )}
                    {server.enabled && server.status !== 'signing_in' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === server.id}
                        onClick={() =>
                          run(async () => agentValue(await agent!.reconnectMcpServer(server.id)))
                        }
                      >
                        重新连接
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === server.id}
                      onClick={() =>
                        run(async () =>
                          agentValue(
                            await agent!.setMcpServerEnabled({
                              id: server.id,
                              enabled: !server.enabled,
                            }),
                          ),
                        )
                      }
                    >
                      {server.enabled ? '停用' : '启用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`移除 MCP：${server.name}`}
                      disabled={busy === server.id}
                      onClick={() =>
                        run(async () => agentValue(await agent!.removeMcpServer(server.id)))
                      }
                    >
                      移除
                    </Button>
                  </div>
                </div>
                <div className="truncate text-subheadline text-fg-secondary" title={server.target}>
                  {server.target}
                  {server.secretKeys.length > 0 && ` · 凭据：${server.secretKeys.join('、')}`}
                </div>
                {server.error && server.status !== 'connected' && (
                  <div className="text-subheadline text-fg-secondary">{server.error}</div>
                )}
                {server.tools.length > 0 && (
                  <ul data-testid="mcp-tools" className="flex flex-wrap gap-1">
                    {server.tools.map((tool) => (
                      <li key={tool.name}>
                        <Badge
                          tone={tool.readOnly ? 'neutral' : 'warning'}
                          title={tool.readOnly ? '只读，可直接调用' : '调用前需你确认'}
                        >
                          {tool.title ?? tool.name}
                          {tool.readOnly ? '' : ' · 需确认'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && agent && (
        <AddMcpDialog
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            agentValue(await agent.addMcpServer(input));
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddMcpDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: McpServerInput) => Promise<void>;
}) {
  const [type, setType] = useState<'stdio' | 'http'>('http');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [args, setArgs] = useState('');
  const [secrets, setSecrets] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const values = pairs(secrets);
      await onAdd(
        type === 'stdio'
          ? {
              type,
              name: name.trim(),
              command: target.trim(),
              args: args
                .split('\n')
                .map((a) => a.trim())
                .filter(Boolean),
              env: values,
            }
          : { type, name: name.trim(), url: target.trim(), headers: values },
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '添加失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>添加 MCP 服务</DialogTitle>
          <DialogDescription>远程服务需要登录时，添加后点“登录”在浏览器中授权。</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field controlId="mcp-type">
            <FieldLabel htmlFor="mcp-type">连接方式</FieldLabel>
            <NativeSelect
              id="mcp-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'stdio' | 'http')}
            >
              <option value="http">远程 HTTP（Streamable HTTP）</option>
              <option value="stdio">本地命令（stdio）</option>
            </NativeSelect>
          </Field>
          <Field controlId="mcp-name">
            <FieldLabel htmlFor="mcp-name">名称</FieldLabel>
            <Input
              id="mcp-name"
              value={name}
              maxLength={31}
              placeholder="gmail"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
            <FieldDescription>小写字母、数字和连字符，用作工具名前缀。</FieldDescription>
          </Field>
          <Field controlId="mcp-target">
            <FieldLabel htmlFor="mcp-target">{type === 'http' ? '服务地址' : '命令'}</FieldLabel>
            <Input
              id="mcp-target"
              value={target}
              spellCheck={false}
              placeholder={type === 'http' ? 'https://example.com/mcp' : 'npx'}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
          {type === 'stdio' && (
            <Field controlId="mcp-args">
              <FieldLabel htmlFor="mcp-args">参数</FieldLabel>
              <Textarea
                id="mcp-args"
                rows={3}
                value={args}
                spellCheck={false}
                onChange={(e) => setArgs(e.target.value)}
              />
              <FieldDescription>
                每行一个参数。添加时会弹出系统对话框请你确认允许运行。
              </FieldDescription>
            </Field>
          )}
          <Field controlId="mcp-secrets">
            <FieldLabel htmlFor="mcp-secrets">
              {type === 'http' ? '请求头（可选）' : '环境变量（可选）'}
            </FieldLabel>
            <Textarea
              id="mcp-secrets"
              rows={3}
              value={secrets}
              spellCheck={false}
              placeholder={type === 'http' ? 'Authorization=Bearer …' : 'API_TOKEN=…'}
              onChange={(e) => setSecrets(e.target.value)}
            />
            <FieldDescription>每行 名称=值，按凭据加密保存，之后不再显示。</FieldDescription>
          </Field>
          {error && (
            <p role="alert" className="text-subheadline text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !name.trim() || !target.trim()} onClick={() => void submit()}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
