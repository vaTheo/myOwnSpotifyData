import { signal } from '@preact/signals';
import type { Period } from '../../db/schema';
import { topArtists, topTracks } from '../../model/aggregate';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { TOP_PERIOD_LABEL, artistNames } from '../format';

const PERIODS: Period[] = ['short_term', 'medium_term', 'long_term'];

/** The id under the pointer or the focus: the same id is outlined everywhere. */
const hovered = signal<string | null>(null);

interface Item {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  href?: string;
}

function itemsOf(kind: 'tracks' | 'artists', period: Period): Item[] {
  const m = model.value;
  if (!m) return [];
  if (kind === 'tracks') {
    return topTracks(m, period).map(({ item }) => ({
      id: item.id,
      rank: item.rank,
      title: item.name,
      subtitle: artistNames(item.artists),
      imageUrl: item.imageUrl,
    }));
  }
  return topArtists(m, period).map(({ item }) => ({
    id: item.id,
    rank: item.rank,
    title: item.name,
    subtitle: '',
    imageUrl: item.imageUrl,
    href: routeHref({ name: 'artist', key: item.id }),
  }));
}

/**
 * Compare periods (spec 003, FR-029; screens.md §4): the three periods side
 * by side as narrow ranked columns. Hovering or focusing an item outlines the
 * same id in the other columns, so a track that climbed or fell is found at
 * a glance. Large windows only; the caller decides.
 */
export function ComparePeriods(p: { kind: 'tracks' | 'artists' }) {
  return (
    <div class="compare">
      {PERIODS.map((period) => {
        const items = itemsOf(p.kind, period);
        return (
          <section key={period} class="compare-col">
            <h2>{TOP_PERIOD_LABEL[period]}</h2>
            <ol class="compare-list" aria-label={TOP_PERIOD_LABEL[period]}>
              {items.map((item) => {
                const body = (
                  <>
                    <span class="compare-rank">{item.rank}</span>
                    <span class="compare-text">
                      <span class="dt-text">{item.title}</span>
                      {item.subtitle && (
                        <span class="dt-text">{item.subtitle}</span>
                      )}
                    </span>
                  </>
                );
                const common = {
                  class:
                    hovered.value === item.id
                      ? 'compare-item same'
                      : 'compare-item',
                  'data-item-id': item.id,
                  title: item.subtitle
                    ? `${item.title}, ${item.subtitle}`
                    : item.title,
                  onMouseEnter: () => {
                    hovered.value = item.id;
                  },
                  onMouseLeave: () => {
                    hovered.value = null;
                  },
                  onFocus: () => {
                    hovered.value = item.id;
                  },
                  onBlur: () => {
                    hovered.value = null;
                  },
                };
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <a {...common} href={item.href}>
                        {body}
                      </a>
                    ) : (
                      <div {...common} tabIndex={0}>
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
