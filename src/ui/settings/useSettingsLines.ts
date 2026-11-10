import { useMemo } from 'preact/hooks';
import {
  artistReachSummary,
  autoUpdates,
  chainView,
  coverage,
  historySummary,
  importState,
  lastSyncAt,
  lookupState,
  model,
  reachCoverage,
  reachState,
  rekordboxState,
  rekordboxSummary,
  serverLastSyncAt,
  serverPending,
  serverPendingError,
  serverSession,
  serverState,
  syncState,
} from '../../model/state';
import { updateLines, type UpdateJob } from '../../model/updateLines';
import { accountLine } from './AccountSection';
import { datedCount } from './AudioSection';
import { historyZoneWarning } from './HistorySection';
import {
  audioItemLine,
  DANGER_LINE,
  historyItemLine,
  reachItemLine,
  serverItemLine,
  serverStatusLine,
  spotifyStatusLine,
  stateOnly,
  syncItemLine,
  type ItemLine,
} from './itemLines';
import { SOURCE_LABEL, sharedRunLine } from './lines';
import type { SectionId } from './sections';
import { syncStatusRows, type StatusRow } from './statusLines';
import { syncView } from './SyncSection';

/**
 * Every line of the closed Settings page (spec 026), read from the signals
 * the opened items read: the Sync status block's rows and one closed line
 * per item. The words come from the pure `updateLines`, `itemLines` and
 * `statusLines`.
 */
export function useSettingsLines(): {
  rows: StatusRow[];
  items: Record<SectionId, ItemLine>;
} {
  const m = model.value;
  const cov = m ? coverage(m) : null;
  const reachCov = m ? reachCoverage(m) : null;
  // The year scan reads every Top list per track: once per model.
  const dated = useMemo(() => (m ? datedCount(m) : null), [m]);
  const jobs = updateLines({
    now: Date.now(),
    autoOn: autoUpdates.value,
    chain: chainView.value,
    server: serverState.value,
    sync: syncState.value,
    lastSyncAt: lastSyncAt.value,
    lookup: lookupState.value,
    features: cov && cov.total > 0 ? cov : null,
    reach: reachState.value,
    reachSummary: artistReachSummary.value,
    history: historySummary.value,
    rekordbox: rekordboxSummary.value,
  });
  const job = (name: UpdateJob) => {
    const found = jobs.find((l) => l.job === name);
    if (!found) throw new Error(`no ${name} line`);
    return found;
  };
  const sync = syncView();
  const spotify = spotifyStatusLine(job('spotify'), sync.sharedLine);
  const server = serverState.value;
  const serverLine = serverStatusLine({
    server,
    signedIn: serverSession.value !== null,
    pending: serverPending.value,
    pendingError: serverPendingError.value,
    lastSyncAt: serverLastSyncAt.value,
  });
  const lookup = lookupState.value;
  const lookupShared =
    lookup.status === 'done' ? sharedRunLine(lookup.shared) : null;
  const reach = reachState.value;
  const reachShared =
    reach.status === 'done' ? sharedRunLine(reach.shared, 'artists') : null;
  const imp = importState.value;
  const rows = syncStatusRows({
    spotify,
    spotifyRetry: job('spotify').retry,
    library: m
      ? { playlists: m.playlists.length, tracks: m.tracksByKey.size }
      : null,
    features: job('features'),
    coverage: cov,
    dated: cov && cov.total > 0 ? dated : null,
    rekordbox: rekordboxSummary.value,
    rekordboxRun: rekordboxState.value,
    reach: job('reach'),
    reachCoverage: reachCov,
    history: historySummary.value,
    historyRun: imp.status === 'done' ? { status: 'done' } : imp,
    server: serverLine,
    stamps: server.status === 'connected' ? server.stamps : null,
  });
  // Progress for "Running 40 %" in the closed lines.
  const of = (st: { status: string; done?: number; total?: number }) =>
    st.status === 'running' ||
    st.status === 'pushing' ||
    st.status === 'pulling'
      ? { done: st.done ?? 0, total: st.total ?? 0 }
      : null;
  const rek = rekordboxState.value;
  const audio = audioItemLine({
    features: job('features'),
    rekordbox: rek,
    sharedError: lookupShared?.kind === 'error' ? lookupShared.text : null,
  });
  const IDLE = { ok: 'Up to date', off: 'Automatic updates off' };
  return {
    rows,
    // Closed item lines say the state only: counts and dates are the
    // block's (FR-007).
    items: {
      account: stateOnly(accountLine(), {}),
      sync: stateOnly(
        syncItemLine(spotify, sync.busyLine),
        {
          ok: 'Synced',
          off: 'Automatic updates off',
          never: lastSyncAt.value === null ? 'Never synced' : null,
        },
        of(syncState.value)
      ),
      history: stateOnly(
        historyItemLine(
          job('history'),
          historySummary.value !== null,
          historyZoneWarning()
        ),
        {
          ok: 'Imported',
          never: historySummary.value === null ? 'Not imported' : null,
        }
      ),
      audio: stateOnly(
        audio,
        {
          ...IDLE,
          never:
            cov === null || cov.total === 0
              ? 'No tracks yet'
              : cov.covered === 0
                ? 'Not looked up'
                : null,
        },
        audio.scope === 'Rekordbox' && rek.status === 'running'
          ? { done: rek.index, total: rek.total }
          : of(lookupState.value)
      ),
      reach: stateOnly(
        reachItemLine(
          job('reach'),
          reach.status === 'idle'
            ? []
            : reach.paused.map((step) => SOURCE_LABEL[step]),
          reachShared?.kind === 'error' ? reachShared.text : null
        ),
        {
          ...IDLE,
          never: artistReachSummary.value === null ? 'Not looked up' : null,
        },
        of(reach)
      ),
      server: stateOnly(
        serverItemLine(
          serverLine,
          server.status === 'connected' ? server.rejected : 0
        ),
        {},
        of(server)
      ),
      danger: DANGER_LINE,
    },
  };
}
