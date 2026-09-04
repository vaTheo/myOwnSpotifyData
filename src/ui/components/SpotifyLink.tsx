export function SpotifyLink(p: { href: string | null | undefined }) {
  if (!p.href) return null;
  return (
    <a class="spotify-link" href={p.href} target="_blank" rel="noopener">
      Open in Spotify
    </a>
  );
}
