import type { ComponentChildren } from 'preact';
import { SpotifyLink } from './SpotifyLink';

export function TrackRow(p: {
  rank?: number;
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  spotifyUrl?: string | null;
  badges?: ComponentChildren;
  /** Where focus returns when the row's details sheet closes. */
  rowId?: string;
  /** The row whose details sheet is open. */
  selected?: boolean;
  /** -1 leaves the row out of the Tab order (a roving list, T100). */
  tabIndex?: number;
  children?: ComponentChildren;
}) {
  const main = (
    <>
      <span class="title">{p.title}</span>
      {p.subtitle && <span class="sub">{p.subtitle}</span>}
      {p.badges && <div class="badges">{p.badges}</div>}
    </>
  );
  return (
    <li>
      <div class={p.selected ? 'row selected' : 'row'}>
        {p.rank !== undefined && <span class="rank">{p.rank}</span>}
        {/* `null`: a cover column without a picture keeps its place. */}
        {p.imageUrl ? (
          <img class="cover" src={p.imageUrl} loading="lazy" alt="" />
        ) : (
          p.imageUrl === null && <span class="cover" aria-hidden="true" />
        )}
        {p.href ? (
          <a
            class="main"
            href={p.href}
            data-row-id={p.rowId}
            aria-current={p.selected ? 'page' : undefined}
            tabIndex={p.tabIndex}
          >
            {main}
          </a>
        ) : p.onClick ? (
          <button
            type="button"
            class="main"
            onClick={p.onClick}
            data-row-id={p.rowId}
            aria-current={p.selected ? 'true' : undefined}
            tabIndex={p.tabIndex}
          >
            {main}
          </button>
        ) : (
          <div class="main">{main}</div>
        )}
        <SpotifyLink href={p.spotifyUrl} />
        {p.href && (
          <span class="chev" aria-hidden="true">
            ›
          </span>
        )}
      </div>
      {p.children}
    </li>
  );
}
