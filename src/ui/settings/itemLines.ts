/**
 * The closed lines of the Settings items and the Sync status block (spec
 * 026): one line per item, the worst condition first (FR-003), derived from
 * the signals the opened items already read, never stored. Pure, so they are
 * tested without a DOM. The job wording stays `updateLines`' (one source).
 */
import type { ServerPending } from '../../db/schema';
import type { UpdateLine, UpdateTone } from '../../model/updateLines';
import type { ServerStatus } from '../../server/types';
import type { StatusKind } from '../components/StatusLine';
import { msg } from '../../i18n';
import { formatDateTime } from '../format';
import { datasetName, pendingLine } from './lines';

const said = () => msg().settings.words;
const closed = () => msg().settings.closed;
/** Parts of a line, joined as every line here: `Failed · boom`. */
const parts = (...p: string[]) => p.join(' · ');

/** Worst first: error > warning > running > waiting > ok > off. */
export type ItemTone =
  'error' | 'warning' | 'running' | 'waiting' | 'ok' | 'off';

export interface ItemLine {
  tone: ItemTone;
  text: string;
  /** The part of the item the condition is about ("Rekordbox"), if not all. */
  scope?: string;
  /** The item's main action is the one needed now: its button is filled. */
  act?: boolean;
}

const RANK: Record<ItemTone, number> = {
  error: 5,
  warning: 4,
  running: 3,
  waiting: 2,
  ok: 1,
  off: 0,
};

/** The `StatusLine` kind of a tone: its colour and its icon. */
export const ITEM_KIND: Record<ItemTone, StatusKind> = {
  error: 'error',
  warning: 'warning',
  running: 'info',
  waiting: 'info',
  ok: 'success',
  off: 'info',
};

/** The worst of the lines given, the first one on a tie; nulls skipped. */
export function worst(
  first: ItemLine,
  ...rest: readonly (ItemLine | null)[]
): ItemLine {
  let best = first;
  for (const line of rest) {
    if (line !== null && RANK[line.tone] > RANK[best.tone]) best = line;
  }
  return best;
}

/**
 * The closed form of an item's line (spec 026 fix round 1, FR-007): the
 * state words only, since the counts and dates live in the opened item. A failure says "Failed", a job "Running 40 %", a warning keeps its
 * first words; `never` (nothing synced, imported or looked up yet) wins over
 * an idle line and asks for the main action.
 */
export function stateOnly(
  line: ItemLine,
  words: { ok?: string; off?: string; never?: string | null },
  progress: { done: number; total: number } | null = null
): ItemLine {
  const first = line.text.split(' · ')[0];
  const c = closed();
  switch (line.tone) {
    case 'error':
      return {
        tone: 'error',
        text: line.scope ? c.scopeFailed(line.scope) : said().failed,
        act: true,
      };
    case 'warning':
      return { tone: 'warning', text: first, act: true };
    case 'running': {
      const pct =
        progress && progress.total > 0
          ? Math.round((progress.done / progress.total) * 100)
          : null;
      const text = line.scope
        ? pct === null
          ? c.scopeRunning(line.scope)
          : c.scopeRunningPct(line.scope, pct)
        : pct === null
          ? said().running
          : c.runningPct(pct);
      return { tone: 'running', text };
    }
    case 'waiting':
      return { tone: 'waiting', text: first };
    case 'ok':
    case 'off':
      if (words.never) return { tone: 'off', text: words.never, act: true };
      return {
        tone: line.tone,
        text: (line.tone === 'ok' ? words.ok : words.off) ?? first,
      };
  }
}

/** FR-005: an item opens on arrival when it fails or runs a job. */
export function opensOnArrival(line: ItemLine): boolean {
  return line.tone === 'error' || line.tone === 'running';
}

/**
 * While Settings is open: an item opens when a job starts or fails in it
 * (it did not want to open, now it does), unless the owner closed it by
 * hand since the page opened.
 */
export function opensLater(
  wanted: boolean,
  wants: boolean,
  closedByHand: boolean
): boolean {
  return wants && !wanted && !closedByHand;
}

const FROM_UPDATE: Record<UpdateTone, ItemTone> = {
  ok: 'ok',
  running: 'running',
  waiting: 'waiting',
  paused: 'warning',
  failed: 'error',
  off: 'off',
  manual: 'off',
};

/** A line of `updateLines` as a closed line, its words unchanged. */
export function fromUpdate(line: Pick<UpdateLine, 'tone' | 'text'>): ItemLine {
  return { tone: FROM_UPDATE[line.tone], text: line.text };
}

const warn = (text: string | null): ItemLine | null =>
  text === null ? null : { tone: 'warning', text };

/** The shared store's error: a failure of that part, not of the lookup. */
const sharedStore = (text: string | null): ItemLine | null =>
  text === null ? null : { tone: 'error', text, scope: closed().sharedStore };

/** Spotify account: signed in, or the writes its scopes still lack. */
export function accountItemLine(
  signedIn: boolean,
  missing: readonly string[]
): ItemLine {
  const c = closed();
  if (!signedIn) {
    return { tone: 'off', text: c.notSignedInSpotify, act: true };
  }
  if (missing.length > 0) {
    return {
      tone: 'warning',
      text: parts(c.notAllowed(missing.join(', ')), c.connectAgain),
    };
  }
  return { tone: 'ok', text: c.signedInSpotify };
}

/**
 * Spotify → this device: the Spotify job's line, or the shared quota
 * lock-out another reader met (`quotaRefusal`'s words), whichever is worse.
 */
export function spotifyStatusLine(
  spotify: Pick<UpdateLine, 'tone' | 'text'>,
  sharedLock: string | null
): ItemLine {
  return worst(fromUpdate(spotify), warn(sharedLock));
}

/** Spotify sync: the status line, or another Spotify reader holding it. */
export function syncItemLine(status: ItemLine, busy: string | null): ItemLine {
  return worst(status, warn(busy));
}

/** Listening history: imported or not, and the time-zone warning. */
export function historyItemLine(
  history: Pick<UpdateLine, 'text'>,
  imported: boolean,
  zoneWarning: string | null
): ItemLine {
  return worst(
    { tone: imported ? 'ok' : 'off', text: history.text },
    warn(zoneWarning)
  );
}

/**
 * Audio data: the BPM and key job, the Rekordbox import running or failed,
 * the shared store's error.
 */
export function audioItemLine(p: {
  features: Pick<UpdateLine, 'tone' | 'text'>;
  rekordbox:
    | { status: 'running'; index: number; total: number }
    | { status: 'error'; message: string }
    | { status: 'idle' | 'done' };
  sharedError: string | null;
}): ItemLine {
  const r = p.rekordbox;
  return worst(
    fromUpdate(p.features),
    r.status === 'running'
      ? {
          tone: 'running',
          text: parts(
            'Rekordbox',
            said().running,
            closed().files(r.index, r.total)
          ),
          scope: 'Rekordbox',
        }
      : null,
    r.status === 'error'
      ? {
          tone: 'error',
          text: parts('Rekordbox', said().failed, r.message),
          scope: 'Rekordbox',
        }
      : null,
    sharedStore(p.sharedError)
  );
}

/** Artist reach: the job's line, a source that stopped, the shared store. */
export function reachItemLine(
  reach: Pick<UpdateLine, 'tone' | 'text'>,
  stopped: readonly string[],
  sharedError: string | null
): ItemLine {
  const c = closed();
  return worst(
    fromUpdate(reach),
    warn(
      stopped.length === 0
        ? null
        : parts(
            c.stopped(stopped.length, stopped.join(', ')),
            c.skipped(stopped.length)
          )
    ),
    sharedStore(sharedError)
  );
}

export interface ServerLineInputs {
  server: ServerStatus;
  signedIn: boolean;
  /** Null until the flags are read. */
  pending: ServerPending | null;
  pendingError: string | null;
  /** The last push or pull, for the offline line. */
  lastSyncAt: number | null;
}

function waiting(pending: ServerPending | null): boolean {
  return pending !== null && Object.values(pending).some((v) => v === true);
}

/**
 * This device ↔ server (US3, FR-007a): "Up to date" only when connected
 * with nothing waiting to send; changes waiting name their data sets.
 * Its first words "Up to date" and "Offline" are the catalogue's
 * `words.upToDate` and `words.offline`, which `statusLines` compares
 * against in the same language (spec 031, research R4).
 */
export function serverStatusLine(i: ServerLineInputs): ItemLine {
  const s = i.server;
  const c = closed();
  const w = said();
  if (s.status === 'unset') return { tone: 'off', text: c.notSetUp };
  if (s.status === 'error')
    return { tone: 'error', text: parts(w.failed, s.message) };
  if (s.status === 'signedOut' || !i.signedIn) {
    return { tone: 'off', text: c.notSignedIn };
  }
  if (i.pendingError !== null) return { tone: 'error', text: i.pendingError };
  // The changes waiting are named in every state past this point, so an
  // offline or paused server still says what has not reached it.
  const held =
    i.pending !== null && waiting(i.pending) ? pendingLine(i.pending) : null;
  const and = (text: string) => (held === null ? text : parts(text, held));
  switch (s.status) {
    case 'offline':
      return {
        tone: 'warning',
        text: and(
          parts(
            w.offline,
            i.lastSyncAt === null
              ? c.lastSyncNever
              : c.lastSync(formatDateTime(i.lastSyncAt))
          )
        ),
      };
    case 'paused':
      return { tone: 'warning', text: and(c.pausedByServer) };
    case 'pushing':
    case 'pulling': {
      const name = datasetName(s.dataset);
      return {
        tone: 'running',
        text: and(
          parts(
            s.status === 'pushing' ? c.sending(name) : c.fetching(name),
            c.rows(s.done, s.total)
          )
        ),
      };
    }
    case 'connected': {
      if (held !== null) return { tone: 'waiting', text: held };
      if (s.lastSyncAt === null) return { tone: 'off', text: w.neverSynced };
      const at = formatDateTime(s.lastSyncAt);
      // Flags not read yet: the last sync, never "Up to date".
      return i.pending === null
        ? { tone: 'ok', text: c.lastSyncCap(at) }
        : { tone: 'ok', text: parts(w.upToDate, c.lastSync(at)) };
    }
  }
}

/** Server: the status line, or rows the safety check left out. */
export function serverItemLine(status: ItemLine, rejected: number): ItemLine {
  return worst(status, warn(rejected > 0 ? closed().rejected(rejected) : null));
}

/** Danger zone: Disconnect's consequence in a few words, read when drawn. */
export const DANGER_LINE: ItemLine = {
  tone: 'off',
  get text() {
    return closed().danger;
  },
};
