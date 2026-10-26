import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ledgerEntrySchema, type LedgerEntry } from '../../../shared/agent-ledger';
import { JsonFile, readJson } from '../json-file';

/** Rounds kept per conversation; older rounds can no longer be undone from their reply anyway. */
export const LEDGER_ROUNDS = 50;
const fileSchema = z.object({ version: z.literal(1), entries: z.array(ledgerEntrySchema) });

/**
 * The record of reversible changes, one file per conversation under `agent/ledger`. Changes stay
 * in memory immediately; writes are queued per file and a failed write is reported through
 * `onError` (the caller decides whether to stop accepting new requests).
 */
export class Ledger {
  onError: (error: unknown) => void = () => {};
  private sessions = new Map<string, LedgerEntry[]>();
  private files = new Map<string, JsonFile>();
  constructor(private dir: string) {}
  /** Loads the files of known conversations; files of deleted conversations are ignored. */
  async initialize(sessionIds: string[]) {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const id of sessionIds) {
      if (!names.includes(`${id}.json`)) continue;
      const raw = await readJson(this.path(id));
      if (raw) this.sessions.set(id, fileSchema.parse(raw).entries);
    }
  }
  find(id: string) {
    for (const entries of this.sessions.values()) {
      const entry = entries.find((e) => e.id === id);
      if (entry) return entry;
    }
    return undefined;
  }
  entries(sessionId: string) {
    return this.sessions.get(sessionId) ?? [];
  }
  /** Adds a change, or updates the same transaction from a later edit in its round. */
  record(entry: Omit<LedgerEntry, 'status' | 'createdAt' | 'updatedAt'>) {
    const entries = this.entries(entry.sessionId);
    const now = Date.now();
    const existing = entries.find((e) => e.id === entry.id);
    if (existing)
      Object.assign(existing, {
        summary: entry.summary,
        updatedAt: now,
        ...(entry.inverse ? { inverse: entry.inverse } : {}),
        ...(entry.afterRevision ? { afterRevision: entry.afterRevision } : {}),
        ...(entry.fileOps ? { fileOps: entry.fileOps } : {}),
      });
    else entries.push({ ...entry, status: 'applied', createdAt: now, updatedAt: now });
    const runs = [...new Set(entries.map((e) => e.runId))].slice(-LEDGER_ROUNDS);
    this.sessions.set(
      entry.sessionId,
      entries.filter((e) => runs.includes(e.runId)),
    );
    this.save(entry.sessionId);
  }
  /** Keeps the steps of a partly undone change, so undoing again continues from there. */
  setFileOps(id: string, fileOps: LedgerEntry['fileOps']) {
    const entry = this.find(id);
    if (!entry) return;
    entry.fileOps = fileOps;
    entry.updatedAt = Date.now();
    this.save(entry.sessionId);
  }
  renameWritingScope(rootId: string, from: string, to: string) {
    for (const [sessionId, entries] of this.sessions) {
      let changed = false;
      for (const entry of entries) {
        const scope = entry.writingScope;
        if (
          scope?.rootId === rootId &&
          (scope.path === from || scope.path.startsWith(from + '/'))
        ) {
          scope.path = to + scope.path.slice(from.length);
          changed = true;
        }
      }
      if (changed) this.save(sessionId);
    }
  }
  markUndone(id: string) {
    const entry = this.find(id);
    if (!entry) return;
    entry.status = 'undone';
    entry.updatedAt = Date.now();
    this.save(entry.sessionId);
  }
  async remove(sessionId: string) {
    const file = this.files.get(sessionId);
    this.sessions.delete(sessionId);
    this.files.delete(sessionId);
    await file?.settled();
    try {
      await unlink(this.path(sessionId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  /** Resolves once every queued write has finished, successful or not. */
  async settled() {
    await Promise.all([...this.files.values()].map((file) => file.settled()));
  }
  private path(sessionId: string) {
    return join(this.dir, `${sessionId}.json`);
  }
  private save(sessionId: string) {
    let file = this.files.get(sessionId);
    if (!file) {
      file = new JsonFile(this.path(sessionId));
      this.files.set(sessionId, file);
    }
    void file
      .write({ version: 1, entries: this.entries(sessionId) })
      .catch((error) => this.onError(error));
  }
}
