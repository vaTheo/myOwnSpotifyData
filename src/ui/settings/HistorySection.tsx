import { historySummary } from '../../model/state';
import { routeHref } from '../../router';
import { StatusLine } from '../components/StatusLine';
import { historyLine } from '../format';

export const HISTORY_DESCRIPTION =
  'Play counts from your Spotify extended streaming history export.';

/**
 * The time-zone warning: only a version 2 summary knows which zone bucketed
 * its months; an older one has no zone to compare, so it never shows it.
 */
export function historyZoneWarning(): string | null {
  const summary = historySummary.value;
  const zoneAtImport = summary?.version === 2 ? summary.zone : undefined;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zoneAtImport && zoneAtImport !== deviceZone
    ? `This browser is now on ${deviceZone}. Re-import to re-bucket months.`
    : null;
}

/** Import history / Update import: the import itself lives on `#/import`. */
export function HistoryMain(p: { act: boolean }) {
  return (
    <a
      class={p.act ? 'btn btn-filled' : 'btn btn-tonal'}
      href={routeHref({ name: 'import' })}
    >
      <span>{historySummary.value ? 'Update import' : 'Import history'}</span>
    </a>
  );
}

/** Listening history (US5). */
export function HistorySection() {
  const summary = historySummary.value;
  const zoneAtImport = summary?.version === 2 ? summary.zone : undefined;
  const warning = historyZoneWarning();
  return (
    <>
      {summary ? (
        <StatusLine>{historyLine(summary, zoneAtImport)}</StatusLine>
      ) : (
        <StatusLine>No history imported yet.</StatusLine>
      )}
      {warning && <StatusLine kind="warning">{warning}</StatusLine>}
    </>
  );
}
