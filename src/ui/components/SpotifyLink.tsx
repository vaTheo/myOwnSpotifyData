/**
 * The row form is icon only: the words took about a quarter of every row and
 * the track titles paid for it. `label` asks for the spelled-out link, which
 * is what the Artist and Playlist headers use — there is no title beside them
 * competing for the width.
 */
export function SpotifyLink(p: {
  href: string | null | undefined;
  label?: boolean;
}) {
  if (!p.href) return null;
  if (p.label) {
    return (
      <a class="spotify-link-text" href={p.href} target="_blank" rel="noopener">
        Open in Spotify
      </a>
    );
  }
  return (
    <a
      class="spotify-link"
      href={p.href}
      target="_blank"
      rel="noopener"
      aria-label="Open in Spotify"
      title="Open in Spotify"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M14 4h6v6" />
        <path d="M20 4 11 13" />
        <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      </svg>
    </a>
  );
}
