import { Icon } from '../icons';
import { IconButton } from './IconButton';

/**
 * The row form is an icon button (48 × 48, named "Open in Spotify"): the
 * words took about a quarter of every row and the track titles paid for it.
 * `label` asks for the spelled-out link, which is what the Artist and
 * Playlist headers use — there is no title beside them competing for the
 * width. A `spotify:` link (artists, round 017 follow-up) opens the app in
 * place, like the track play button; a web link opens a new tab.
 */
export function SpotifyLink(p: {
  href: string | null | undefined;
  label?: boolean;
}) {
  if (!p.href) return null;
  const external = !p.href.startsWith('spotify:');
  if (p.label) {
    return (
      <a
        class="spotify-link-text"
        href={p.href}
        {...(external ? { target: '_blank', rel: 'noopener' } : {})}
      >
        <span>Open in Spotify</span>
        <Icon name="open_in_new" size={18} />
      </a>
    );
  }
  return (
    <IconButton
      icon="open_in_new"
      label="Open in Spotify"
      href={p.href}
      external={external}
      class="spotify-link"
    />
  );
}
