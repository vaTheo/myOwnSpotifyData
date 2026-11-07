import type { LookupState } from '../features/lookup';
import type { ArtistReachSummary, ReachState } from '../features/reachRun';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import type { ServerStatus } from '../server/types';
import type { SyncState } from '../sync/runner';
import { formatDateTime } from '../ui/format';
import { AUTO_SYNC_AGE_MS, type AutoStep, type ChainView } from './autoChain';

/**
 * The Settings Updates card (round 006): one line per job, derived from the
 * job signals and the chain, never stored. A missing number is "Never",
 * never 0.
 */

export type UpdateJob =
  'server' | 'spotify' | 'features' | 'reach' | 'history' | 'rekordbox';

export type UpdateTone =
  'ok' | 'running' | 'waiting' | 'paused' | 'failed' | 'off' | 'manual';

export interface UpdateLine {
  job: UpdateJob;
  label: string;
  tone: UpdateTone;
  text: string;
  /** The step a Retry button runs; automatic jobs only. */
  retry: AutoStep | null;
}

export interface UpdateInputs {
  now: number;
  autoOn: boolean;
  chain: ChainView;
  server: ServerStatus;
  sync: SyncState;
  lastSyncAt: number | null;
  lookup: LookupState;
  features: { covered: number; total: number } | null;
  reach: ReachState;
  reachSummary: ArtistReachSummary | null;
  history: ImportSummary | null;
  rekordbox: RekordboxSummary | null;
}

type Body = Pick<UpdateLine, 'tone' | 'text' | 'retry'>;

const body = (tone: UpdateTone, text: string): Body => ({
  tone,
  text,
  retry: null,
});

function serverLine(s: ServerStatus): Body {
  switch (s.status) {
    case 'connected':
      return body(
        'ok',
        s.lastSyncAt === null
          ? 'Never'
          : `Up to date · ${formatDateTime(s.lastSyncAt)}`
      );
    case 'pushing':
    case 'pulling':
      return body('running', `Running · ${s.dataset}`);
    case 'offline':
      return body('paused', 'Offline');
    case 'paused':
      return body('paused', 'Paused by the server');
    case 'error':
      return body('failed', `Failed · ${s.message}`);
    case 'signedOut':
      return body('manual', 'Not signed in');
    case 'unset':
      return body('manual', 'Not set up');
  }
}

/**
 * The shared precedence of an automatic job: running, waiting in the chain,
 * failed, paused, then its idle text (prefixed "Off · " with the switch off).
 */
function autoLine(
  step: AutoStep,
  i: UpdateInputs,
  progress: { done: number; total: number; unit: string } | null,
  error: string | null,
  paused: string | null,
  idle: string
): Body {
  if (progress) {
    return body(
      'running',
      `Running · ${progress.done} / ${progress.total} ${progress.unit}`
    );
  }
  if (i.chain.waiting.includes(step)) return body('waiting', 'Waiting');
  if (error !== null) {
    return { tone: 'failed', text: `Failed · ${error}`, retry: step };
  }
  if (paused !== null) return body('paused', paused);
  return i.autoOn ? body('ok', idle) : body('off', `Off · ${idle}`);
}

function spotifyLine(i: UpdateInputs): Body {
  const s = i.sync;
  const synced =
    i.lastSyncAt === null ? 'Never' : `Synced ${formatDateTime(i.lastSyncAt)}`;
  const idle =
    i.lastSyncAt !== null && i.autoOn
      ? `${synced} · next after ${formatDateTime(i.lastSyncAt + AUTO_SYNC_AGE_MS)}`
      : synced;
  return autoLine(
    'spotify',
    i,
    s.status === 'running'
      ? { done: s.done, total: s.total, unit: 'playlists' }
      : null,
    s.status === 'error' ? s.message : null,
    s.status === 'locked' && s.retryAt > i.now
      ? `Paused by Spotify until ${formatDateTime(s.retryAt)}`
      : null,
    idle
  );
}

function featuresLine(i: UpdateInputs): Body {
  const l = i.lookup;
  return autoLine(
    'features',
    i,
    l.status === 'running'
      ? { done: l.done, total: l.total, unit: 'tracks' }
      : null,
    l.status === 'error' ? l.message : null,
    null,
    i.features === null
      ? 'Never'
      : `${i.features.covered.toLocaleString()} / ${i.features.total.toLocaleString()} tracks with BPM or key`
  );
}

function reachLine(i: UpdateInputs): Body {
  const r = i.reach;
  return autoLine(
    'reach',
    i,
    r.status === 'running'
      ? { done: r.done, total: r.total, unit: 'artists' }
      : null,
    r.status === 'error' ? r.message : null,
    null,
    i.reachSummary === null
      ? 'Never'
      : `Checked ${formatDateTime(i.reachSummary.ranAt)}`
  );
}

function importLine(importedAt: number | null, again: string): Body {
  return body(
    'manual',
    importedAt === null
      ? 'Never · needs a file'
      : `Imported ${formatDateTime(importedAt)} · ${again}`
  );
}

export function updateLines(i: UpdateInputs): UpdateLine[] {
  return [
    { job: 'server', label: 'Server', ...serverLine(i.server) },
    { job: 'spotify', label: 'Spotify', ...spotifyLine(i) },
    { job: 'features', label: 'BPM and key', ...featuresLine(i) },
    { job: 'reach', label: 'Artist reach', ...reachLine(i) },
    {
      job: 'history',
      label: 'History',
      ...importLine(i.history?.importedAt ?? null, 'needs a new export'),
    },
    {
      job: 'rekordbox',
      label: 'Rekordbox',
      ...importLine(i.rekordbox?.importedAt ?? null, 'needs a new XML'),
    },
  ];
}
