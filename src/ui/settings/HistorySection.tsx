import { historySummary } from '../../model/state';
import { routeHref } from '../../router';
import { Card } from '../components/Card';
import { StatusLine } from '../components/StatusLine';
import { historyLine } from './lines';
import { sectionDomId } from './sections';

/** Listening history (US5): the import itself lives on `#/import`. */
export function HistorySection() {
  const summary = historySummary.value;
  const importHref = routeHref({ name: 'import' });
  // Only a version 2 summary knows which zone bucketed its months; an older
  // one has no zone to compare, so it never shows the mismatch warning.
  const zoneAtImport = summary?.version === 2 ? summary.zone : undefined;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Card
      id={sectionDomId('history')}
      class="settings-section"
      title="Listening history"
      description="Play counts from your Spotify extended streaming history export."
    >
      {summary ? (
        <StatusLine>{historyLine(summary, zoneAtImport)}</StatusLine>
      ) : (
        <StatusLine>No history imported yet.</StatusLine>
      )}
      {zoneAtImport && zoneAtImport !== deviceZone && (
        <StatusLine kind="warning">
          This browser is now on {deviceZone}. Re-import to re-bucket months.
        </StatusLine>
      )}
      <div class="actions">
        <a class="btn btn-filled" href={importHref}>
          <span>{summary ? 'Update import' : 'Import history'}</span>
        </a>
      </div>
    </Card>
  );
}
