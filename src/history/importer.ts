import { putMeta, replacePlays } from '../db/repo';
import type { ImportMessage } from './process';
import type { ImportCounts, Outcomes } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

export interface ImportSummary {
  /**
   * 2 since the Crate views. Optional because summaries stored by an earlier
   * version have no version at all; those show the re-import state.
   */
  version?: 2;
  importedAt: number;
  plays: number;
  /** Tracks with at least one credited play; short-only rows do not count. */
  tracks: number;
  matchedTracks: number;
  counts: ImportCounts;
  outcomes: Outcomes;
  /** IANA zone the month keys were bucketed in. */
  zone: string;
  range: { first: string; last: string } | null;
  processed: string[];
  skipped: { name: string; reason: string }[];
}

export type ImportState =
  | { status: 'idle' }
  | { status: 'running'; file: string; index: number; total: number }
  | { status: 'done'; summary: ImportSummary }
  | { status: 'error'; message: string };

export interface ImporterDeps {
  createWorker: () => Worker;
  knownTrackIds: ReadonlySet<string>;
  now: () => number;
  onState: (state: ImportState) => void;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function storageMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Local storage is full. Free space on the phone and try again.';
  }
  return describeError(err);
}

function noFileReadMessage(
  skipped: { name: string; reason: string }[]
): string {
  const detail = skipped.map((s) => `${s.name} (${s.reason})`).join(', ');
  return detail ? `No file could be read: ${detail}` : 'No file could be read.';
}

export function runImport(files: File[], deps: ImporterDeps): Promise<void> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = deps.createWorker();
    } catch (err) {
      deps.onState({
        status: 'error',
        message: `Could not start the import worker: ${describeError(err)}`,
      });
      resolve();
      return;
    }
    let finished = false;
    let currentFile = '';
    const finish = (state: ImportState) => {
      if (finished) return;
      finished = true;
      worker.terminate();
      deps.onState(state);
      resolve();
    };
    worker.onerror = (event) => {
      const reason = event.message || 'Import worker crashed';
      finish({
        status: 'error',
        message: currentFile
          ? `${reason} (while reading ${currentFile})`
          : reason,
      });
    };
    worker.onmessage = (event: MessageEvent<ImportMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        currentFile = message.file;
        deps.onState({
          status: 'running',
          file: message.file,
          index: message.index,
          total: message.total,
        });
        return;
      }
      if (message.type === 'error') {
        finish({ status: 'error', message: message.message });
        return;
      }
      if (message.processed.length === 0) {
        // Nothing was read: keep the previous history rather than wiping it.
        finish({
          status: 'error',
          message: noFileReadMessage(message.skipped),
        });
        return;
      }
      void (async () => {
        try {
          await replacePlays(message.plays);
          // Rows with no credited play exist only for the finish-rate view;
          // they are stored but never counted as tracks the owner played.
          const played = message.plays.filter((p) => p.plays > 0);
          const summary: ImportSummary = {
            version: 2,
            importedAt: deps.now(),
            plays: message.counts.credited,
            tracks: played.length,
            matchedTracks: played.filter((p) =>
              deps.knownTrackIds.has(p.trackId)
            ).length,
            counts: message.counts,
            outcomes: message.outcomes,
            zone: message.zone,
            range: message.range,
            processed: message.processed,
            skipped: message.skipped,
          };
          await putMeta(HISTORY_SUMMARY_META, summary);
          finish({ status: 'done', summary });
        } catch (err) {
          finish({ status: 'error', message: storageMessage(err) });
        }
      })();
    };
    deps.onState({
      status: 'running',
      file: 'Reading files',
      index: 0,
      total: 0,
    });
    worker.postMessage({ files });
  });
}
