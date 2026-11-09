import { describe, expect, it } from 'vitest';
import { digLinks } from '../features/mix/digLinks';
import { spotifyTrackId, trackListenItems } from './listen';

describe('spotifyTrackId', () => {
  it('returns a Spotify track id as is', () => {
    expect(spotifyTrackId('4uLU6hMCjMI75M1A2tKUQC')).toBe(
      '4uLU6hMCjMI75M1A2tKUQC'
    );
  });

  it('returns null for a local file', () => {
    expect(
      spotifyTrackId(
        'spotify:local:Unknown+Bootleg+Artist:Bootlegs:Untitled+Bootleg:412'
      )
    ).toBeNull();
  });

  it('returns null for any spotify: URI', () => {
    expect(spotifyTrackId('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toBeNull();
  });

  it('returns null for an empty or missing id', () => {
    expect(spotifyTrackId('')).toBeNull();
    expect(spotifyTrackId(null)).toBeNull();
    expect(spotifyTrackId(undefined)).toBeNull();
  });
});

describe('trackListenItems', () => {
  const artist = 'Synthetic Artist';
  const title = 'Made Up Track (Extended Mix)';
  const searches = digLinks(artist, title).map((l) => ({
    label: l.label,
    href: l.href,
  }));

  it('lists Play on Spotify, the Spotify page, then the five searches', () => {
    const items = trackListenItems({ id: 'abc123', artist, title });
    expect(items).toEqual([
      { label: 'Play on Spotify', href: 'spotify:track:abc123', app: true },
      {
        label: 'Open Spotify web page',
        href: 'https://open.spotify.com/track/abc123',
      },
      ...searches,
    ]);
    expect(items.slice(2).map((i) => i.label)).toEqual([
      'Beatport',
      'Bandcamp',
      'Discogs',
      'SoundCloud',
      'YouTube',
    ]);
    expect('app' in items[1]!).toBe(false);
  });

  it('lists only the five searches without an id', () => {
    expect(trackListenItems({ id: null, artist, title })).toEqual(searches);
  });
});
