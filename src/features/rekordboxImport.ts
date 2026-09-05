import { putFeatures, putMeta } from '../db/repo';
import type { FeatureRow } from '../db/schema';
import type { RekordboxMessage } from './rekordbox';
import { matchRekordbox, type LibraryTrack } from './rekordbox-match';

export const REKORDBOX_SUMMARY_META = 'rekordboxSummary';

export interface RekordboxSummary {
  importedAt: number;
  parsed: number;
  withBpm: number;
  withKey: number;
  matched: number;
  unmatched: number;
}

export type RekordboxState =
  | { status: 'idle' }
  | { status: 'running'; file: string; index: number; total: number }
  | { status: 'done'; summary: RekordboxSummary }
  | { status: 'error'; message: string };

export interface RekordboxDeps {
  createWorker: () => Worker;
  /** Synced tracks with a Spotify id; local files are left out. */
  library: LibraryTrack[];
  /** Rows already stored, so a ReccoBeats value survives the merge. */
  existing: FeatureRow[];
  now: () => number;
  onState: (state: RekordboxState) => void;
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

/** Never rejects: every failure arrives through `onState`. */
export function runRekordboxImport(
  file: File,
  deps: RekordboxDeps
): Promise<void> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = deps.createWorker();
    } catch (err) {
      deps.onState({
        status: 'error',
        message: `Could not start the Rekordbox worker: ${describeError(err)}`,
      });
      resolve();
      return;
    }
    let finished = false;
    const finish = (state: RekordboxState) => {
      if (finished) return;
      finished = true;
      worker.terminate();
      deps.onState(state);
      resolve();
    };
    worker.onerror = (event) => {
      finish({
        status: 'error',
        message: event.message || 'Rekordbox worker crashed',
      });
    };
    worker.onmessage = (event: MessageEvent<RekordboxMessage>) => {
      const message = event.data;
      if (message.type === 'error') {
        finish({ status: 'error', message: message.message });
        return;
      }
      const tracks = message.tracks;
      deps.onState({ status: 'running', file: file.name, index: 1, total: 1 });
      void (async () => {
        try {
          // One clock for fetchedAt, updatedAt and the summary.
          const importedAt = deps.now();
          const { matches, unmatched } = matchRekordbox(
            tracks,
            deps.library,
            importedAt
          );
          const stored = new Map<string, FeatureRow>(
            deps.existing.map((row) => [row.trackId, row])
          );
          const merged = new Map<string, FeatureRow>();
          for (const match of matches) {
            // Two collection entries can name one Spotify track: last wins.
            const previous =
              merged.get(match.trackId) ?? stored.get(match.trackId);
            merged.set(
              match.trackId,
              previous
                ? { ...previous, rekordbox: match.value, updatedAt: importedAt }
                : {
                    trackId: match.trackId,
                    isrc: null,
                    rekordbox: match.value,
                    updatedAt: importedAt,
                  }
            );
          }
          await putFeatures([...merged.values()]);
          const summary: RekordboxSummary = {
            importedAt,
            parsed: tracks.length,
            withBpm: tracks.filter((t) => t.bpm !== null).length,
            withKey: tracks.filter((t) => t.key !== null).length,
            matched: matches.length,
            unmatched,
          };
          await putMeta(REKORDBOX_SUMMARY_META, summary);
          finish({ status: 'done', summary });
        } catch (err) {
          finish({ status: 'error', message: storageMessage(err) });
        }
      })();
    };
    deps.onState({ status: 'running', file: file.name, index: 0, total: 1 });
    worker.postMessage({ file });
  });
}
