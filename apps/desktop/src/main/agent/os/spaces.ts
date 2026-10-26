import { join } from 'node:path';
import { sameWritingScope, type WritingScope } from '../../../shared/writing-agent';
import type { OpenTargets } from '../../../shared/agent-targets';
import { GraphLinks, LINK_LEDGER_SESSION } from '../../writing/graph-links';
import type { GraphIndex } from '../../writing/graph-index';
import type { WritingFiles } from '../../writing/files';
import { CanvasBroker } from '../canvas-broker';
import { WritingBroker } from '../writing-broker';
import { Ledger } from '../kernel/ledger';

/**
 * Where canvas and writing work happens: the windows that have a canvas or document open (and
 * answer tool commands for it), and the writing space's own link edits with their undo record.
 */
export class SpaceHosts {
  readonly canvas = new CanvasBroker();
  readonly writing = new WritingBroker();
  readonly links?: GraphLinks;
  /** Link edits the user made in the writing space; they belong to no conversation. */
  readonly linkLedger: Ledger;
  private targets = new Map<number, OpenTargets>();
  constructor(root: string, deps: { files?: WritingFiles; graph?: GraphIndex }) {
    this.linkLedger = new Ledger(join(root, 'link-ledger'));
    if (deps.files && deps.graph)
      this.links = new GraphLinks(deps.files, deps.graph, this.writing, this.linkLedger, (scope) =>
        this.documentOwner(scope),
      );
  }
  initialize() {
    return this.linkLedger.initialize([LINK_LEDGER_SESSION]);
  }
  setTargets(owner: number, targets: OpenTargets) {
    this.targets.set(owner, targets);
  }
  dropTargets(owner: number) {
    this.targets.delete(owner);
  }
  /** The window that shows this canvas, if any. */
  canvasOwner(canvasId: string) {
    for (const [owner, open] of this.targets)
      if (open.projects.some((p) => p.id === canvasId)) return owner;
  }
  /** The window that has this document open, if any; its editor holds the newest text. */
  documentOwner(scope: WritingScope) {
    for (const [owner, open] of this.targets)
      if (open.documents.some((d) => sameWritingScope(d, scope))) return owner;
  }
}
