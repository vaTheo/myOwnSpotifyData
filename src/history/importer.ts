import { putMeta, replacePlays } from '../db/repo';
import { plural } from '../ui/format';
import { describeError, storageMessage } from '../util/errors';
import type { ImportMessage } from './process';
import type { ImportCounts, Outcomes } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

/** Said when a narrower import is refused; nothing was written. */
export const IMPORT_CANCELLED =
  'Import cancelled. Your existing history was kept.';

/** The first and last play an import covers, as export ISO strings. */
export interface HistoryRange {
  first: string;
  last: string;
}

const DAY_MS = 86_400_000;

/** "12 days", "8 months", "4 years": the coarsest unit that stays honest. */
function describeSpan(range: HistoryRange): string {
  const days = Math.max(
    1,
    Math.round((Date.parse(range.last) - Date.parse(range.first)) / DAY_MS)
  );
  if (days < 60) return plural(days, 'day');
  const months = Math.round(days / 30.44);
  if (months < 24) return plural(months, 'month');
  return plural(Math.round(days / 365.25), 'year');
}

/**
 * An import replaces the whole history (spec §8), which is only a surprise
 * when it covers less than what is stored — picking a few of the loose JSON
 * files rather than the zip, or picking the video files, which are read but
 * credit no play at all. Returns the question to ask, or null when there is
 * nothing to warn about: no stored history, an unreadable stored range, or an
 * incoming range at least as wide.
 */
export function replaceQuestion(
  incoming: HistoryRange | null,
  current: HistoryRange | null
): string | null {
  if (!current) return null;
  const currentMs = Date.parse(current.last) - Date.parse(current.first);
  if (!Number.isFinite(currentMs)) return null;
  if (!incoming) {
    return (
      `This import covers no plays at all; your current history covers ` +
      `${describeSpan(current)}. Replace it?`
    );
  }
  const incomingMs = Date.parse(incoming.last) - Date.parse(incoming.first);
  if (!Number.isFinite(incomingMs)) return null;
  if (incomingMs >= currentMs) return null;
  return (
    `This import covers ${describeSpan(incoming)}; your current history ` +
    `covers ${describeSpan(current)}. Replace it?`
  );
}

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
  range: HistoryRange | null;
  processed: string[];
  skipped: { name: string; reason: string }[];
}

export type ImportState =
  | { status: 'idle' }
  | { status: 'running'; file: string; index: number; total: number }
  | { status: 'done'; summary: ImportSummary }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };

export interface ImporterDeps {
  createWorker: () => Worker;
  knownTrackIds: ReadonlySet<string>;
  now: () => number;
  onState: (state: ImportState) => void;
  /** The stored history's range, so a narrower import can be spotted. */
  currentRange?: HistoryRange | null;
  /** Asked with `replaceQuestion`'s text; false keeps the stored history. */
  confirmReplace?: (question: string) => boolean;
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
      const question = replaceQuestion(
        message.range,
        deps.currentRange ?? null
      );
      if (question && deps.confirmReplace && !deps.confirmReplace(question)) {
        finish({ status: 'cancelled', message: IMPORT_CANCELLED });
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
