import { Handle, Position } from '@xyflow/react';
import type { KeyboardEvent } from 'react';

function activate(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}
export function NodePorts({ input, enabled }: { input: boolean; enabled: boolean }) {
  return (
    <>
      {input && (
        <Handle
          id="input"
          className="workflow-port"
          type="target"
          position={Position.Left}
          isConnectable={enabled}
          isConnectableStart={false}
          role="button"
          tabIndex={0}
          aria-label="输入连接"
          title="输入：连接上游参考节点"
          onKeyDown={activate}
        />
      )}
      <Handle
        id="output"
        className="workflow-port"
        type="source"
        position={Position.Right}
        isConnectable={enabled}
        isConnectableEnd={false}
        role="button"
        tabIndex={0}
        aria-label="输出连接"
        title="输出：拖向下游节点左侧输入"
        onKeyDown={activate}
      />
    </>
  );
}
