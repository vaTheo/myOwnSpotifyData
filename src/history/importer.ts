import { putMeta, replacePlays } from '../db/repo';
import type { ImportMessage } from './process';
import type { ImportCounts } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

export interface ImportSummary {
  importedAt: number;
  plays: number;
  tracks: number;
  matchedTracks: number;
  counts: ImportCounts;
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

function storageMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Local storage is full. Free space on the phone and try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

export function runImport(files: File[], deps: ImporterDeps): Promise<void> {
  return new Promise((resolve) => {
    const worker = deps.createWorker();
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
      void (async () => {
        try {
          await replacePlays(message.plays);
          const summary: ImportSummary = {
            importedAt: deps.now(),
            plays: message.counts.credited,
            tracks: message.plays.length,
            matchedTracks: message.plays.filter((p) =>
              deps.knownTrackIds.has(p.trackId)
            ).length,
            counts: message.counts,
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
