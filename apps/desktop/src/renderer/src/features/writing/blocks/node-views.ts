import { Node, type Extensions } from '@tiptap/core';
import { createElement } from 'react';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { CalloutView, ToggleView, CodeView, ImageView } from './BasicViews';
import { MermaidView } from './MermaidView';
import { MindMapView } from './MindMapView';
import { TableView } from './TableView';
export const calloutView = () => ReactNodeViewRenderer(CalloutView);
export const toggleView = () => ReactNodeViewRenderer(ToggleView);
export const codeView = () => ReactNodeViewRenderer(CodeView);
export const mermaidView = () => ReactNodeViewRenderer(MermaidView);
export const mindMapView = () => ReactNodeViewRenderer(MindMapView);
export const tableView = () => ReactNodeViewRenderer(TableView, { contentDOMElementTag: 'tbody' });
export const imageView = (resolveImage: (source: string) => string) =>
  ReactNodeViewRenderer((props: NodeViewProps) =>
    createElement(ImageView, { ...props, resolveImage }),
  );

export function withWritingNodeViews(
  extensions: Extensions,
  resolveImage: (source: string) => string,
): Extensions {
  return extensions.map((extension) => {
    if (!(extension instanceof Node)) return extension;
    const views = {
      callout: calloutView,
      toggleBlock: toggleView,
      codeBlock: codeView,
      mermaid: mermaidView,
      mindMap: mindMapView,
      table: tableView,
      image: () => imageView(resolveImage),
    };
    const factory = views[extension.name as keyof typeof views];
    return factory ? extension.extend({ addNodeView: factory }) : extension;
  });
}
