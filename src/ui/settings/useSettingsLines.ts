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
  return {
    rows,
    items: {
      account: accountLine(),
      sync: syncItemLine(spotify, sync.busyLine),
      history: historyItemLine(
        job('history'),
        historySummary.value !== null,
        historyZoneWarning()
      ),
      audio: audioItemLine({
        features: job('features'),
        rekordboxImportedAt: rekordboxSummary.value?.importedAt ?? null,
        rekordbox: rekordboxState.value,
        sharedError: lookupShared?.kind === 'error' ? lookupShared.text : null,
      }),
      reach: reachItemLine(
        job('reach'),
        reach.status === 'idle'
          ? []
          : reach.paused.map((step) => SOURCE_LABEL[step]),
        reachShared?.kind === 'error' ? reachShared.text : null
      ),
      server: serverItemLine(
        serverLine,
        server.status === 'connected' ? server.rejected : 0
      ),
      danger: DANGER_LINE,
    },
  };
}
