import type { MixJobView } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import {
  progressLine,
  queueOrder,
  requestAt,
  requestStatusText,
  shortLink,
  stepName,
} from './worker';

/**
 * The Mixes list of the Mix screen (spec 003 §12, T116, T121): one row per
 * link, from a saved mix, a request, or both, with one status chip, its
 * line, its progress and its actions. Pure: everything comes from data the
 * app already holds (the last pull's requests, the saved mixes, the create
 * results on them); no request, no poll.
 */

/** What the list reads of a saved mix. `validated` arrives with the review (T118). */
export interface MixListMix {
  url: string;
  title: string | null;
  savedAt: number;
  playlistUrl?: string;
  rows: readonly { gap?: boolean; validated?: boolean; origin?: string }[];
}

export type MixChipKind =
  | 'queued'
  | 'identifying'
  | 'paused'
  | 'stopping'
  | 'found'
  | 'failed'
  | 'rejected'
  | 'saved'
  | 'playlist';

export interface MixListItem {
  /** The link: the saved mix's key and the request's `payload.url`. */
  key: string;
  /** The saved mix's title, else the link's host and last path part. */
  title: string;
  chip: { kind: MixChipKind; text: string };
  /** `progressLine` while running, else the request's state line; null without a request. */
  line: string | null;
  /** The running request's percent, when the worker sent one. */
  percent: number | null;
  /** The running request's step name, the progress bar's label. */
  step: string | null;
  /** The link's latest request, or null. */
  request: MixJobView | null;
  /** The link's earlier requests, newest first. */
  earlier: MixJobView[];
  saved: boolean;
  /** When the saved mix was saved, or null. */
  savedAt: number | null;
  /** Stop was asked on the running request. */
  stopping: boolean;
  canMoveToTop: boolean;
  canCancel: boolean;
  canStop: boolean;
  canAskAgain: boolean;
}

function savedChip(mix: MixListMix): MixListItem['chip'] {
  if (mix.playlistUrl) return { kind: 'playlist', text: 'Playlist made' };
  const tracks = mix.rows.filter((r) => !r.gap);
  const validated = tracks.filter((r) => r.validated === true).length;
  const text = `Saved · ${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}${validated > 0 ? ` · ${validated} validated` : ''}`;
  return { kind: 'saved', text };
}

function requestChip(v: MixJobView): MixListItem['chip'] {
  switch (v.status) {
    case 'queued':
      return { kind: 'queued', text: 'Queued' };
    case 'claimed':
      if (v.stopRequestedAt != null)
        return { kind: 'stopping', text: 'Stopping…' };
      if (v.progress?.step === 'paused')
        return { kind: 'paused', text: 'Paused' };
      return { kind: 'identifying', text: 'Identifying' };
    case 'failed':
      return { kind: 'failed', text: 'Failed' };
    case 'done':
      // The tracks are counted once the result is applied to a saved mix.
      return v.rejected
        ? { kind: 'rejected', text: 'Rejected' }
        : { kind: 'found', text: 'Found tracks' };
  }
}

/**
 * The chip: a waiting or running request first; a failure or rejection
 * newer than the saved mix next; then the saved mix; then the request.
 */
function chipOf(
  v: MixJobView | null,
  mix: MixListMix | undefined
): MixListItem['chip'] {
  if (v && (v.status === 'queued' || v.status === 'claimed'))
    return requestChip(v);
  if (!mix) return v ? requestChip(v) : { kind: 'saved', text: 'Saved' };
  const failedLater =
    v !== null &&
    (v.status === 'failed' || v.rejected === true) &&
    requestAt(v) > mix.savedAt;
  return failedLater && v ? requestChip(v) : savedChip(mix);
}

/** Every link's row, in the queue's order, then the rest newest first. */
export function mixListItems(
  jobs: Record<string, MixJobView[]>,
  mixes: readonly MixListMix[],
  server: ServerStatus,
  now: number
): MixListItem[] {
  const keys = new Set([
    ...Object.keys(jobs).filter((k) => (jobs[k] ?? []).length > 0),
    ...mixes.map((m) => m.url),
  ]);
  const rows = [...keys].map((key) => {
    const history = jobs[key] ?? [];
    const v = history[0] ?? null;
    const mix = mixes.find((m) => m.url === key);
    return { key, v, history, mix };
  });
  const at = (r: (typeof rows)[number]): number =>
    Math.max(r.mix?.savedAt ?? -Infinity, r.v ? requestAt(r.v) : -Infinity);
  const active = (r: (typeof rows)[number]): boolean =>
    r.v !== null && (r.v.status === 'queued' || r.v.status === 'claimed');
  rows.sort((a, b) => {
    const x = active(a);
    const y = active(b);
    if (x && y) return queueOrder(a.v!, b.v!);
    if (x !== y) return x ? -1 : 1;
    return at(b) - at(a);
  });
  const firstQueued = rows.find((r) => r.v?.status === 'queued')?.key;
  return rows.map(({ key, v, history, mix }) => {
    const text = v ? requestStatusText(v, server) : null;
    const running = v?.status === 'claimed';
    const stopping = running && v.stopRequestedAt != null;
    const stoppedEarly =
      v?.status === 'done' && !v.rejected && v.error !== null;
    const progress = running ? v.progress : null;
    return {
      key,
      title: mix?.title ?? shortLink(key),
      chip: chipOf(v, mix),
      line: v
        ? ((running ? progressLine(v, now) : null) ?? text?.line ?? null)
        : null,
      percent: progress?.percent ?? null,
      step: progress ? stepName(progress.step) : null,
      request: v,
      earlier: history.slice(1),
      saved: mix !== undefined,
      savedAt: mix?.savedAt ?? null,
      stopping,
      canMoveToTop: v?.status === 'queued' && key !== firstQueued,
      canCancel: v?.status === 'queued',
      canStop: running && !stopping,
      canAskAgain:
        v !== null &&
        (v.status === 'failed' || v.rejected === true || stoppedEarly) &&
        text?.canAsk === true,
    };
  });
}
