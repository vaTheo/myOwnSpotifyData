import { msg } from '../../i18n';
import { historySummary } from '../../model/state';
import { routeHref } from '../../router';
import { StatusLine } from '../components/StatusLine';
import { historyLine } from '../format';

/** The item's description, read when drawn (spec 031). */
export function historyDescription(): string {
  return msg().settings.history.description;
}

/**
 * The time-zone warning: only a version 2 summary knows which zone bucketed
 * its months; an older one has no zone to compare, so it never shows it.
 */
export function historyZoneWarning(): string | null {
  const summary = historySummary.value;
  const zoneAtImport = summary?.version === 2 ? summary.zone : undefined;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zoneAtImport && zoneAtImport !== deviceZone
    ? msg().settings.history.zoneWarning(deviceZone)
    : null;
}

/** Import history / Update import: the import itself lives on `#/import`. */
export function HistoryMain(p: { act: boolean }) {
  return (
    <a
      class={p.act ? 'btn btn-filled' : 'btn btn-tonal'}
      href={routeHref({ name: 'import' })}
    >
      <span>
        {historySummary.value
          ? msg().settings.history.update
          : msg().settings.history.import}
      </span>
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
        <StatusLine>{msg().settings.history.none}</StatusLine>
      )}
      {warning && <StatusLine kind="warning">{warning}</StatusLine>}
    </>
  );
}
