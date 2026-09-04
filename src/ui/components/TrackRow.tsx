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
      <div class="row">
        {p.rank !== undefined && <span class="rank">{p.rank}</span>}
        {p.imageUrl && (
          <img class="cover" src={p.imageUrl} loading="lazy" alt="" />
        )}
        {p.href ? (
          <a class="main" href={p.href}>
            {main}
          </a>
        ) : p.onClick ? (
          <button type="button" class="main" onClick={p.onClick}>
            {main}
          </button>
        ) : (
          <div class="main">{main}</div>
        )}
        <SpotifyLink href={p.spotifyUrl} />
      </div>
      {p.children}
    </li>
  );
}
