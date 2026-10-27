import { memo, type ReactNode } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { lowlight } from '../writing/blocks/highlight';

/** The slice of mdast this renderer reads. */
interface Node {
  type: string;
  value?: string;
  children?: Node[];
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  alt?: string | null;
  align?: (string | null)[];
  identifier?: string;
}
/** The slice of hast that lowlight returns. */
interface Hast {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: Hast[];
}

const parser = unified().use(remarkParse).use(remarkGfm);

function highlighted(node: Hast, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  const children = node.children?.map(highlighted);
  if (node.type === 'element')
    return (
      <span key={key} className={node.properties?.className?.join(' ')}>
        {children}
      </span>
    );
  return children;
}

function code(node: Node) {
  const text = node.value ?? '';
  const lang = node.lang?.toLowerCase();
  if (!lang || !lowlight.registered(lang)) return text;
  try {
    return (lowlight.highlight(lang, text) as Hast).children?.map(highlighted);
  } catch {
    return text;
  }
}

/**
 * Builds React elements from the parsed tree; raw HTML stays text, so a reply cannot inject markup.
 * Links show their address on hover but do not navigate: the window has no way to open them.
 */
function render(node: Node, key: number): ReactNode {
  const children = () => node.children?.map((child, index) => render(child, index));
  switch (node.type) {
    case 'root':
      return children();
    case 'paragraph':
      return <p key={key}>{children()}</p>;
    case 'heading': {
      const Tag = `h${Math.min(Math.max(node.depth ?? 1, 1), 6)}` as 'h1';
      return <Tag key={key}>{children()}</Tag>;
    }
    case 'text':
    case 'html':
      return node.value;
    case 'strong':
      return <strong key={key}>{children()}</strong>;
    case 'emphasis':
      return <em key={key}>{children()}</em>;
    case 'delete':
      return <del key={key}>{children()}</del>;
    case 'inlineCode':
      return <code key={key}>{node.value}</code>;
    case 'break':
      return <br key={key} />;
    case 'link':
      return (
        <span key={key} className="chat-md-link" title={node.url}>
          {children()}
        </span>
      );
    case 'linkReference':
      return <span key={key}>{children()}</span>;
    case 'image':
    case 'imageReference':
      return (
        <span key={key} className="chat-md-link" title={node.url}>
          {node.alt || node.url || '图片'}
        </span>
      );
    case 'blockquote':
      return <blockquote key={key}>{children()}</blockquote>;
    case 'list':
      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {children()}
        </ol>
      ) : (
        <ul key={key}>{children()}</ul>
      );
    case 'listItem':
      return (
        <li key={key} data-checked={node.checked ?? undefined}>
          {typeof node.checked === 'boolean' && (
            <input type="checkbox" checked={node.checked} disabled readOnly />
          )}
          {children()}
        </li>
      );
    case 'code':
      return (
        <pre key={key}>
          <code>{code(node)}</code>
        </pre>
      );
    case 'thematicBreak':
      return <hr key={key} />;
    case 'table':
      return (
        <div key={key} className="chat-md-table">
          <table>
            <tbody>
              {node.children?.map((row, index) => (
                <tr key={index}>
                  {row.children?.map((cell, column) => {
                    const Cell = index === 0 ? 'th' : 'td';
                    const align = node.align?.[column] ?? undefined;
                    return (
                      <Cell key={column} style={align ? { textAlign: align as 'left' } : undefined}>
                        {cell.children?.map((child, i) => render(child, i))}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'footnoteReference':
      return <sup key={key}>[{node.identifier}]</sup>;
    case 'definition':
    case 'footnoteDefinition':
      return null;
    default:
      return node.children ? <span key={key}>{children()}</span> : (node.value ?? null);
  }
}

/** Renders an assistant reply's Markdown (GFM); the copy button still copies the source text. */
export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  return <div className="chat-md">{render(parser.parse(text) as Node, 0)}</div>;
});
