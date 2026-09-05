import type { PlayRow } from '../../db/schema';
import type { ImportSummary } from '../../history/importer';
import {
  CLASSIC_MIN_YEARS,
  FINISH_MIN_OUTCOMES,
  byYear,
  classics,
  finishRate,
  forgottenGems,
  heavyRotation,
  yearSetting,
  yearsWithPlays,
} from '../../model/crate';
import { crateStatus, historySummary, model } from '../../model/state';
import { routeHref, type CrateView } from '../../router';
import { Badge } from '../components/Badge';
import { formatDate, plural } from '../format';
import { CrateEmpty } from './CrateEmpty';
import {
  classicSort,
  finishTab,
  gemMonths,
  rotationMonths,
  yearPeriod,
  yearSel,
} from './selections';
import { staleMonthKey, windowLabel, yearSpanLabel } from './labels';
import { monthLabel, trackLabel, useCrateRows } from './shared';

interface HubRow {
  view: CrateView;
  name: string;
  top: string;
  count: number;
  setting: string;
}

function topLine(
  row: PlayRow | undefined,
  prefix: string,
  empty: string
): string {
  if (!row) return empty;
  const label = trackLabel(row);
  return `${prefix}: ${label.subtitle} — ${label.title}`;
}

function rotationSetting(months: number): string {
  return `last ${plural(months, 'month')}`;
}

function gemSetting(months: number): string {
  if (months % 12 !== 0) return `unplayed ${plural(months, 'month')}+`;
  return `unplayed ${plural(months / 12, 'year')}+`;
}

/**
 * Every row is computed with that view's current setting, so the badges say
 * what the user would actually land on.
 */
function hubRows(rows: PlayRow[], now: Date): HubRow[] {
  const rotation = heavyRotation(rows, now, rotationMonths.value);
  const gems = forgottenGems(rows, now, gemMonths.value);
  const classic = classics(rows, classicSort.value);
  const years = yearsWithPlays(rows);
  const year =
    yearSel.value ??
    (years.length > 0 ? years[years.length - 1] : now.getFullYear());
  const yearView = byYear(rows, year, yearPeriod.value);
  const yearLabel = yearSetting(year, yearPeriod.value);
  const finish = finishRate(rows, finishTab.value);
  return [
    {
      view: 'rotation',
      name: 'Heavy rotation',
      top: topLine(
        rotation[0]?.row,
        'Top',
        `Nothing in the last ${windowLabel(rotationMonths.value)}`
      ),
      count: rotation.length,
      setting: rotationSetting(rotationMonths.value),
    },
    {
      view: 'gems',
      name: 'Forgotten gems',
      top: topLine(gems[0]?.row, 'Top', 'Nothing yet'),
      count: gems.length,
      setting: gemSetting(gemMonths.value),
    },
    {
      view: 'classics',
      name: 'All-time classics',
      top: topLine(classic[0]?.row, 'Top', 'Nothing yet'),
      count: classic.length,
      setting: `${CLASSIC_MIN_YEARS}+ years`,
    },
    {
      view: 'year',
      name: 'By year',
      top: topLine(
        yearView.items[0]?.row,
        `Top in ${year}`,
        `Nothing in ${yearLabel}`
      ),
      count: yearView.tracks,
      setting: yearLabel,
    },
    {
      view: 'finish',
      name: 'Finish rate',
      top: topLine(finish[0]?.row, 'Top', 'Nothing yet'),
      count: finish.length,
      setting: `${FINISH_MIN_OUTCOMES}+ outcomes`,
    },
  ];
}

function Provenance(p: { summary: ImportSummary }) {
  const range = p.summary.range;
  const stale = staleMonthKey(range, new Date());
  const span = yearSpanLabel(range);
  return (
    <p class="provenance">
      {stale ? (
        <span class="warn">
          History ends {monthLabel(stale)} ·{' '}
          <a href={routeHref({ name: 'import' })}>re-import</a>
        </span>
      ) : (
        <span>
          {span ? `${span} · ` : ''}
          {plural(p.summary.plays, 'play')}
        </span>
      )}
      <span>
        Imported {formatDate(p.summary.importedAt)} ·{' '}
        <a href={routeHref({ name: 'import' })}>Update import</a>
      </span>
    </p>
  );
}

export function CrateHub() {
  const status = crateStatus.value;
  const summary = historySummary.value;
  const m = model.value;
  const rows = useCrateRows();
  if (status !== 'ready' || !m) {
    return (
      <section>
        <h1>Crate</h1>
        {summary && <Provenance summary={summary} />}
        <CrateEmpty status={status === 'reimport' ? 'reimport' : 'empty'} />
      </section>
    );
  }
  return (
    <section>
      <h1>Crate</h1>
      {summary && <Provenance summary={summary} />}
      {hubRows(rows, new Date()).map((row) => (
        <button
          key={row.view}
          type="button"
          class="hub-row"
          onClick={() => {
            location.hash = routeHref({ name: 'crateView', view: row.view });
          }}
        >
          <span class="main">
            <span class="name">{row.name}</span>
            <span class="sub">{row.top}</span>
            <span class="badges">
              <Badge kind="plays">{plural(row.count, 'track')}</Badge>
              <Badge>{row.setting}</Badge>
            </span>
          </span>
          <span class="chev">›</span>
        </button>
      ))}
    </section>
  );
}
