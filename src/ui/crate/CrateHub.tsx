import type { ComponentChildren } from 'preact';
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
  lastMonths,
  yearSetting,
  yearsWithPlays,
} from '../../model/crate';
import { crateStatus, historySummary, model } from '../../model/state';
import { routeHref, type CrateView } from '../../router';
import { Meter } from '../charts/Meter';
import { MonthBars } from '../charts/MonthBars';
import { MiniYearGrid } from '../charts/YearMonthGrid';
import {
  monthSeries,
  monthTotals,
  yearMonthTotals,
  yearPoints,
  yearsReached,
  type MonthPoint,
} from '../charts/series';
import { Card } from '../components/Card';
import { Flag } from '../components/Flag';
import { StatusLine } from '../components/StatusLine';
import { formatDate, plural } from '../format';
import { Icon, type IconName } from '../icons';
import { CRATE_TITLE } from '../layout/titles';
import { CrateEmpty } from './CrateEmpty';
import { staleMonthKey, windowLabel, yearSpanLabel } from './labels';
import {
  classicSort,
  finishTab,
  gemMonths,
  rotationMonths,
  yearPeriod,
  yearSel,
} from './selections';
import {
  historyRange,
  monthLabel,
  spanYears,
  trackLabel,
  useCrateRows,
} from './shared';

interface HubCard {
  view: CrateView;
  icon: IconName;
  description: string;
  top: string;
  count: number;
  setting: string;
  chart: ComponentChildren;
}

/** What each view finds, in one line. */
const DESCRIPTION: Record<CrateView, string> = {
  rotation: 'What you play most right now',
  gems: 'Tracks you loved, then stopped playing',
  classics: 'Tracks you come back to year after year',
  year: 'Your tracks of a year, a season or a month',
  finish: 'What you play to the end, and what you skip',
};

const ICON: Record<CrateView, IconName> = {
  rotation: 'trending_up',
  gems: 'diamond',
  classics: 'star',
  year: 'calendar_month',
  finish: 'skip_next',
};

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

/** A card's bars: 40 px a bar at most, so three months are not three slabs. */
function Bars(p: { series: MonthPoint[]; title?: string; label?: string }) {
  return (
    <div style={{ maxWidth: `${p.series.length * 40}px` }}>
      <MonthBars compact series={p.series} title={p.title} label={p.label} />
    </div>
  );
}

/**
 * Every card is computed with that view's current setting, so its figures
 * say what the owner would actually land on. The charts only picture what
 * the views compute (FR-049).
 */
function hubCards(rows: PlayRow[], now: Date): HubCard[] {
  const range = historyRange();
  const rotation = heavyRotation(rows, now, rotationMonths.value);
  const gems = forgottenGems(rows, now, gemMonths.value);
  const classic = classics(rows, classicSort.value);
  const span = spanYears(rows);
  const years = yearsWithPlays(rows);
  const year =
    yearSel.value ??
    (years.length > 0 ? years[years.length - 1] : now.getFullYear());
  const yearView = byYear(rows, year, yearPeriod.value);
  const yearLabel = yearSetting(year, yearPeriod.value);
  const finish = finishRate(rows, finishTab.value);
  const topFinish = finish[0];
  const reached = yearsReached(
    classic.map((c) => c.yearsActive),
    CLASSIC_MIN_YEARS,
    span.length
  );
  return [
    {
      view: 'rotation',
      icon: ICON.rotation,
      description: DESCRIPTION.rotation,
      top: topLine(
        rotation[0]?.row,
        'Top',
        `Nothing in the last ${windowLabel(rotationMonths.value)}`
      ),
      count: rotation.length,
      setting: rotationSetting(rotationMonths.value),
      chart: (
        <Bars
          series={monthSeries(
            monthTotals(rows),
            lastMonths(now, rotationMonths.value),
            range
          )}
        />
      ),
    },
    {
      view: 'gems',
      icon: ICON.gems,
      description: DESCRIPTION.gems,
      top: topLine(gems[0]?.row, 'Top', 'Nothing yet'),
      count: gems.length,
      setting: gemSetting(gemMonths.value),
      chart: gems[0] && (
        <Bars
          title="Plays per year"
          series={yearPoints(gems[0].row.months, span)}
        />
      ),
    },
    {
      view: 'classics',
      icon: ICON.classics,
      description: DESCRIPTION.classics,
      top: topLine(classic[0]?.row, 'Top', 'Nothing yet'),
      count: classic.length,
      setting: `${CLASSIC_MIN_YEARS}+ years`,
      chart: classic.length > 0 && reached.length > 0 && (
        <Bars
          series={reached}
          label={`Tracks played in: ${reached
            .map((p) => `${p.key}+ years ${p.value}`)
            .join(', ')}`}
        />
      ),
    },
    {
      view: 'year',
      icon: ICON.year,
      description: DESCRIPTION.year,
      top: topLine(
        yearView.items[0]?.row,
        `Top in ${year}`,
        `Nothing in ${yearLabel}`
      ),
      count: yearView.tracks,
      setting: yearLabel,
      chart: (
        <MiniYearGrid
          totals={yearMonthTotals(rows, range, now.getFullYear()).slice(-4)}
        />
      ),
    },
    {
      view: 'finish',
      icon: ICON.finish,
      description: DESCRIPTION.finish,
      top: topLine(topFinish?.row, 'Top', 'Nothing yet'),
      count: finish.length,
      setting: `${FINISH_MIN_OUTCOMES}+ outcomes`,
      chart: topFinish && (
        <Meter
          pct={((topFinish.row.finished ?? 0) / topFinish.outcomes) * 100}
          label="Top track finished"
        />
      ),
    },
  ];
}

/** The import status line (spec 003, screens.md §5). */
function ImportLine(p: { summary: ImportSummary }) {
  const range = p.summary.range;
  const stale = staleMonthKey(range, new Date());
  const span = yearSpanLabel(range);
  const imported = (
    <>
      Imported {formatDate(p.summary.importedAt)} ·{' '}
      <a href={routeHref({ name: 'import' })}>Update import</a>
    </>
  );
  return stale ? (
    <StatusLine kind="warning" class="import-line">
      History ends {monthLabel(stale)} ·{' '}
      <a href={routeHref({ name: 'import' })}>re-import</a> · {imported}
    </StatusLine>
  ) : (
    <StatusLine class="import-line">
      {span ? `${span} · ` : ''}
      {plural(p.summary.plays, 'play')} · {imported}
    </StatusLine>
  );
}

/**
 * One view's card. The name is the card's link and its box covers the
 * card, so the whole card opens the view while a screen reader hears one
 * link named after the view, then the card's lines.
 */
function HubCardView({ card }: { card: HubCard }) {
  return (
    <Card
      class="hub-card"
      title={
        <a
          class="hub-link"
          href={routeHref({ name: 'crateView', view: card.view })}
        >
          <Icon name={card.icon} size={24} />
          <span>{CRATE_TITLE[card.view]}</span>
        </a>
      }
      description={card.description}
    >
      <p class="hub-figures">
        <Flag kind="plays">{plural(card.count, 'track')}</Flag>
        <Flag>{card.setting}</Flag>
      </p>
      <p class="hub-top">{card.top}</p>
      {card.chart && <div class="hub-chart">{card.chart}</div>}
    </Card>
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
        {summary && <ImportLine summary={summary} />}
        <CrateEmpty status={status === 'reimport' ? 'reimport' : 'empty'} />
      </section>
    );
  }
  return (
    <section>
      {summary && <ImportLine summary={summary} />}
      <div class="hub-grid">
        {hubCards(rows, new Date()).map((card) => (
          <HubCardView key={card.view} card={card} />
        ))}
      </div>
    </section>
  );
}
