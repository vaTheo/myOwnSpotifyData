import { useEffect } from 'preact/hooks';
import {
  autoUpdates,
  loadServerPending,
  requestJob,
  setAutoUpdates,
} from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine } from '../components/StatusLine';
import { ITEM_KIND } from './itemLines';
import type { StatusRow } from './statusLines';

const SWITCH: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/**
 * The Sync status block (spec 026, US3, FR-010), at the top of Settings and
 * never folded: the Automatic updates switch (per device, ADR-12) and one
 * line per source, its label and its state only (spec 027): no date, no
 * count at rest. A failed automatic job carries its Retry, as the Updates
 * card did. The switch's explanation is in the Spotify sync item.
 */
export function SyncStatus(p: { rows: StatusRow[] }) {
  // The changes waiting to send: one local read once the page is up.
  useEffect(() => {
    const timer = setTimeout(() => void loadServerPending(), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Card
      id="settings-status"
      class="settings-section settings-status"
      title="Sync status"
    >
      <div class="settings-auto">
        <h3 class="settings-label">Automatic updates</h3>
        <SegmentedButtons
          options={SWITCH}
          value={autoUpdates.value ? 'on' : 'off'}
          onChange={(v) => setAutoUpdates(v === 'on')}
        />
      </div>
      {p.rows.map((row) => (
        <div key={row.source} class="update-line" data-source={row.source}>
          <StatusLine kind={ITEM_KIND[row.tone]}>
            <strong class="update-label">{row.label}</strong> · {row.text}
          </StatusLine>
          {row.retry !== null && (
            <Button
              variant="text"
              onClick={() => row.retry && requestJob(row.retry)}
            >
              Retry
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
