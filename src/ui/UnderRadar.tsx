import { Fragment } from 'preact';
import { normalize } from '../model/normalize';
import {
  hasHistory,
  rankUnderTheRadar,
  type ReachGroup,
  type UnderRadarRow,
} from '../model/reach';
import { artistReachSummary, model, reachCoverage } from '../model/state';
import { routeHref } from '../router';
import { radarFilter, radarSort } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { Segmented } from './components/Segmented';
import { TrackRow } from './components/TrackRow';
import {
  artistUrl,
  formatDate,
  plural,
  profileLine,
  reachLine,
} from './format';

/** Output order, and the order the headings are rendered in (spec §2). */
const GROUPS: ReachGroup[] = ['radar', 'unknown', 'known'];

/**
 * `radar` never carries a heading: it is the view. The other two always carry
 * theirs when they hold a row, so a list of nothing but unresolved artists
 * cannot read as if absence were the answer (spec §5.3).
 */
const HEADING: Record<ReachGroup, string | null> = {
  radar: null,
  unknown: 'No reach data',
  known: 'Well known',
};

/** Parts only when they are known: the plays part needs an import (§5.3). */
function subtitle(row: UnderRadarRow, history: boolean): string {
  const parts = [
    plural(row.tracks, 'track'),
    plural(row.playlists, 'playlist'),
  ];
  if (history && row.plays > 0) parts.push(plural(row.plays, 'play'));
  return parts.join(' · ');
}

/**
 * The reach and public-profile lines ride in `TrackRow`'s existing `badges`
 * slot as `.reach` spans, which spec §6 gives `flex-basis: 100%` so they
 * stack under the subtitle without `TrackRow` changing at all.
 */
function RadarRow(p: { row: UnderRadarRow; history: boolean }) {
  const { row } = p;
  // profileLine is null below one sitelink, which is exactly the `known`
  // group's own rule, so the line appears on Well known rows and nowhere else.
  const profile = profileLine(row.sitelinks, row.views);
  return (
    <TrackRow
      rank={row.rank}
      title={row.agg.name}
      subtitle={subtitle(row, p.history)}
      href={routeHref({ name: 'artist', key: row.agg.key })}
      spotifyUrl={artistUrl(row.artistId)}
      badges={
        <>
          <span class="reach">{reachLine(row.listeners, row.fans)}</span>
          {profile && <span class="reach">{profile}</span>}
        </>
      }
    />
  );
}

/**
 * Spec §5.2: a card, not the `Empty` component, because the copy needs a
 * heading and a button — the same shape as `CrateEmpty`.
 */
function NoRun() {
  return (
    <div class="card">
      <h2>No reach data yet</h2>
      <p>
        Under the radar shows the artists in your playlists with the smallest
        audiences on ListenBrainz and Deezer, and moves the ones with a
        Wikipedia article to the bottom. It needs one lookup first: roughly 45
        to 50 minutes for 1,000 artists, and you can stop it and come back.
      </p>
      <button
        type="button"
        class="primary"
        onClick={() => {
          location.hash = routeHref({ name: 'settings' });
        }}
      >
        Look up artists
      </button>
    </div>
  );
}

export function UnderRadar() {
  const m = model.value;
  if (!m || m.artists.length === 0) return <Empty what="artists" />;
  const summary = artistReachSummary.value;
  // The one gate, per spec §2: the summary record, never sniffing rows.
  if (summary?.version !== 1) return <NoRun />;
  // Memoised on the model identity and the sort, so a keystroke in the filter
  // below costs one `includes` per row and no re-sort. The array it returns
  // is the memo's own and is never sorted or mutated here; `filter` copies.
  const rows = rankUnderTheRadar(m, radarSort.value);
  const query = normalize(radarFilter.value);
  const shown = query
    ? rows.filter((r) => normalize(r.agg.name).includes(query))
    : rows;
  // Grouped after filtering, so a heading whose rows have all been filtered
  // out is not rendered, and so are the retry line and the CC BY-SA footer.
  // Ranks were assigned over the unfiltered list, so nothing renumbers.
  const grouped = new Map<ReachGroup, UnderRadarRow[]>(
    GROUPS.map((group) => [group, []])
  );
  for (const row of shown) grouped.get(row.group)?.push(row);
  const cov = reachCoverage(m);
  const history = hasHistory(m);
  const hasKnown = (grouped.get('known') ?? []).length > 0;
  return (
    <>
      <p class="caption">
        {cov.covered.toLocaleString()} of {plural(cov.artists, 'artist')} have
        reach data · as of {formatDate(summary.ranAt)}
      </p>
      <Segmented
        scroll
        options={[
          { value: 'plays', label: 'Most played' },
          { value: 'listeners', label: 'Fewest listeners' },
          { value: 'fans', label: 'Fewest fans' },
        ]}
        value={radarSort.value}
        onChange={(v) => {
          radarSort.value = v;
        }}
      />
      <Filter
        value={radarFilter.value}
        onInput={(v) => {
          radarFilter.value = v;
        }}
        placeholder="Filter artists"
      />
      {shown.length === 0 ? (
        query ? (
          <div class="empty">
            <p>No artists match "{radarFilter.value}".</p>
            <button
              type="button"
              onClick={() => {
                radarFilter.value = '';
              }}
            >
              Clear filter
            </button>
          </div>
        ) : (
          // Every artist in the library is known by name only: none of them
          // has the Spotify id every source here is keyed on.
          <Empty what="artists" />
        )
      ) : (
        <>
          {(grouped.get('radar') ?? []).length === 0 && !query && (
            <p class="muted">No under-the-radar artists yet.</p>
          )}
          <ul class="list">
            {GROUPS.map((group) => {
              const list = grouped.get(group) ?? [];
              if (list.length === 0) return null;
              return (
                <Fragment key={group}>
                  {HEADING[group] && <li class="group">{HEADING[group]}</li>}
                  {group === 'unknown' && (
                    <li class="provenance">
                      <span>
                        Not resolved yet ·{' '}
                        <a href={routeHref({ name: 'settings' })}>
                          Look up artists ›
                        </a>
                      </span>
                    </li>
                  )}
                  {list.map((row) => (
                    <RadarRow key={row.agg.key} row={row} history={history} />
                  ))}
                </Fragment>
              );
            })}
          </ul>
          {hasKnown && <p class="provenance">Wikipedia figures CC BY-SA 4.0</p>}
        </>
      )}
    </>
  );
}
