/**
 * The server card's state (spec data-model "Signals"). Pure types, so
 * `sync.ts` can report progress without importing `model/state.ts`, which
 * touches the browser singletons at module scope.
 */

/** One line of the Settings server card's per-dataset table. */
export interface ServerStampView {
  name: string;
  /** When this device fetched or imported the dataset, or null. */
  localAt: number | null;
  /** The server's stamp, or null when it holds nothing. */
  serverAt: number | null;
  rows: number | null;
}

/**
 * Every failure lands here with its reason; `offline` and `paused` are
 * states, not errors (no banner, pending pushes kept).
 */
export type ServerStatus =
  | { status: 'unset' }
  | { status: 'signedOut' }
  | { status: 'offline'; message: string }
  | { status: 'paused'; dashboardUrl: string }
  | {
      status: 'pushing' | 'pulling';
      dataset: string;
      done: number;
      total: number;
    }
  | {
      status: 'connected';
      lastSyncAt: number | null;
      usedBytes: number | null;
      stamps: ServerStampView[];
      /** Rows the safety check dropped on the last pull (FR-018). */
      rejected: number;
    }
  | { status: 'error'; message: string };
