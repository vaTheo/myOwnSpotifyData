import type { LookupState } from '../features/lookup';
import type { ArtistReachSummary, ReachState } from '../features/reachRun';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import type { ServerStatus } from '../server/types';
import type { SyncState } from '../sync/runner';
import { msg } from '../i18n';
import { formatDateTime } from '../ui/format';
import { datasetName } from '../ui/settings/lines';
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

/** Parts of a line: `Failed · boom`. Each part is a catalogue entry. */
const parts = (...p: string[]) => p.join(' · ');
const said = () => msg().settings.words;
const text = () => msg().settings.updates;

function serverLine(s: ServerStatus): Body {
  const w = said();
  const c = msg().settings.closed;
  switch (s.status) {
    case 'connected':
      return body(
        'ok',
        s.lastSyncAt === null
          ? w.never
          : parts(w.upToDate, formatDateTime(s.lastSyncAt))
      );
    case 'pushing':
    case 'pulling':
      return body('running', parts(w.running, datasetName(s.dataset)));
    case 'offline':
      return body('paused', w.offline);
    case 'paused':
      return body('paused', c.pausedByServer);
    case 'error':
      return body('failed', parts(w.failed, s.message));
    case 'signedOut':
      return body('manual', c.notSignedIn);
    case 'unset':
      return body('manual', c.notSetUp);
  }
}

type Unit = 'playlists' | 'tracks' | 'artists';

/**
 * The shared precedence of an automatic job: running, waiting in the chain,
 * failed, paused, then its idle text (prefixed "Off · " with the switch off).
 */
function autoLine(
  step: AutoStep,
  i: UpdateInputs,
  progress: { done: number; total: number; unit: Unit } | null,
  error: string | null,
  paused: string | null,
  idle: string
): Body {
  const w = said();
  if (progress) {
    return body(
      'running',
      parts(w.running, text()[progress.unit](progress.done, progress.total))
    );
  }
  if (i.chain.waiting.includes(step)) return body('waiting', w.waiting);
  if (error !== null) {
    return { tone: 'failed', text: parts(w.failed, error), retry: step };
  }
  if (paused !== null) return body('paused', paused);
  return i.autoOn ? body('ok', idle) : body('off', parts(w.off, idle));
}

function spotifyLine(i: UpdateInputs): Body {
  const s = i.sync;
  const t = text();
  const synced =
    i.lastSyncAt === null
      ? said().never
      : t.syncedAt(formatDateTime(i.lastSyncAt));
  const idle =
    i.lastSyncAt !== null && i.autoOn
      ? parts(
          synced,
          t.nextAfter(formatDateTime(i.lastSyncAt + AUTO_SYNC_AGE_MS))
        )
      : synced;
  return autoLine(
    'spotify',
    i,
    s.status === 'running'
      ? { done: s.done, total: s.total, unit: 'playlists' }
      : null,
    s.status === 'error' ? s.message : null,
    s.status === 'locked' && s.retryAt > i.now
      ? t.pausedSpotify(formatDateTime(s.retryAt))
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
      ? said().never
      : text().withBpm(i.features.covered, i.features.total)
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
      ? said().never
      : text().checked(formatDateTime(i.reachSummary.ranAt))
  );
}

function importLine(importedAt: number | null, again: string): Body {
  const t = text();
  return body(
    'manual',
    importedAt === null
      ? parts(said().never, t.needsFile)
      : parts(t.importedAt(formatDateTime(importedAt)), again)
  );
}

export function updateLines(i: UpdateInputs): UpdateLine[] {
  const m = msg().settings;
  return [
    { job: 'server', label: m.items.server, ...serverLine(i.server) },
    { job: 'spotify', label: 'Spotify', ...spotifyLine(i) },
    { job: 'features', label: m.words.bpmKey, ...featuresLine(i) },
    { job: 'reach', label: m.items.reach, ...reachLine(i) },
    {
      job: 'history',
      label: m.updates.labelHistory,
      ...importLine(i.history?.importedAt ?? null, m.updates.needsExport),
    },
    {
      job: 'rekordbox',
      label: 'Rekordbox',
      ...importLine(i.rekordbox?.importedAt ?? null, m.updates.needsXml),
    },
  ];
}
