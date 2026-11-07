import { useMemo } from 'preact/hooks';
import {
  artistReachSummary,
  autoUpdates,
  chainView,
  coverage,
  historySummary,
  lastSyncAt,
  lookupState,
  model,
  reachState,
  rekordboxSummary,
  requestJob,
  serverState,
  setAutoUpdates,
  syncState,
} from '../../model/state';
import { updateLines, type UpdateTone } from '../../model/updateLines';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine, type StatusKind } from '../components/StatusLine';
import { sectionDomId } from './sections';

const KIND: Record<UpdateTone, StatusKind> = {
  ok: 'success',
  running: 'info',
  waiting: 'info',
  paused: 'warning',
  failed: 'error',
  off: 'info',
  manual: 'info',
};

const SWITCH: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/**
 * Round 006 (ADR-12): where every update is, one line per job, and the
 * Automatic updates switch (per device). The lines come from the pure
 * `updateLines`; a failed automatic job carries its Retry.
 */
export function UpdatesSection() {
  const m = model.value;
  const cov = useMemo(() => (m ? coverage(m) : null), [m]);
  const lines = updateLines({
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
  return (
    <Card
      id={sectionDomId('updates')}
      class="settings-section"
      title="Updates"
      description="With automatic updates on, opening the app syncs Spotify when the last sync is older than 12 hours, then looks up BPM and key, then artist reach, only what is missing."
    >
      <h3 class="settings-label">Automatic updates</h3>
      <SegmentedButtons
        options={SWITCH}
        value={autoUpdates.value ? 'on' : 'off'}
        onChange={(v) => setAutoUpdates(v === 'on')}
      />
      {lines.map((line) => (
        <div key={line.job} class="update-line">
          <StatusLine kind={KIND[line.tone]}>
            {line.label} · {line.text}
          </StatusLine>
          {line.retry !== null && (
            <Button
              variant="text"
              onClick={() => line.retry && requestJob(line.retry)}
            >
              Retry
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
