import { describe, expect, it } from 'vitest';
import { linkedRow, parseSpotifyTrackLink, unlinkedRow } from './spotifyLink';
import type { TracklistRow } from '../../db/schema';
import { sortValue } from '../../ui/mix/tracklistSort';
import { inFilter, reviewLine, spotifyStatus } from './review';

const ID = '1qGibBSuprByJCYMC4zRUG';

const row: TracklistRow = {
  startSec: 60,
  endSec: null,
  artist: 'A',
  title: 'T',
  label: null,
  source: 'manual',
  gap: false,
  detected: null,
  referenceCount: null,
  spotify: 'not-found',
  checkedAt: 5,
};

describe('parseSpotifyTrackLink (contracts/link-paste.md)', () => {
  it('accepts the copied forms of a track link', () => {
    for (const text of [
      `https://open.spotify.com/track/${ID}?si=f4ed2a88f4744bea`,
      `https://open.spotify.com/track/${ID}`,
      `https://open.spotify.com/intl-fr/track/${ID}`,
      `https://open.spotify.com/intl-pt-BR/track/${ID}?si=x#y`,
      `http://open.spotify.com/track/${ID}`,
      `https://play.spotify.com/track/${ID}`,
      `https://open.spotify.com/track/${ID}/`,
      `spotify:track:${ID}`,
      `  https://open.spotify.com/track/${ID}?si=f4ed2a88f4744bea\n`,
      `\tspotify:track:${ID} `,
    ]) {
      expect(parseSpotifyTrackLink(text), text).toBe(ID);
    }
  });

  it('refuses anything that is not a track link', () => {
    for (const text of [
      '',
      '   \n',
      `https://open.spotify.com/album/${ID}`,
      `https://open.spotify.com/artist/${ID}`,
      `https://open.spotify.com/playlist/${ID}`,
      `https://open.spotify.com/episode/${ID}`,
      `spotify:album:${ID}`,
      'https://spotify.link/AbCdEfGhIjK',
      `https://evil.example/track/${ID}`,
      `https://open.spotify.com.evil.example/track/${ID}`,
      `https://open.spotify.com/search/${ID}`,
      `ftp://open.spotify.com/track/${ID}`,
      `https://open.spotify.com/track/${ID.slice(1)}`,
      `https://open.spotify.com/track/${ID}X`,
      `spotify:track:${ID.slice(1)}`,
      'https://open.spotify.com/track/1qGibBSuprByJCYMC4zR-G',
      'Artist - Title',
      ID,
    ]) {
      expect(parseSpotifyTrackLink(text), text).toBeNull();
    }
  });
});

describe('linkedRow / unlinkedRow', () => {
  it('marks the row found by the owner with a rebuilt url', () => {
    expect(linkedRow(row, ID, 9)).toEqual({
      ...row,
      spotify: { id: ID, url: `https://open.spotify.com/track/${ID}` },
      spotifyBy: 'owner',
      checkedAt: 9,
    });
  });

  it('a replace overwrites the previous hand link', () => {
    const other = 'A'.repeat(22);
    const replaced = linkedRow(linkedRow(row, ID, 9), other, 10);
    expect(replaced.spotify).toEqual({
      id: other,
      url: `https://open.spotify.com/track/${other}`,
    });
    expect(replaced.spotifyBy).toBe('owner');
    expect(replaced.checkedAt).toBe(10);
  });

  it('Remove link returns to not found and keeps checkedAt', () => {
    const out = unlinkedRow(linkedRow(row, ID, 9));
    expect(out.spotify).toBe('not-found');
    expect('spotifyBy' in out).toBe(false);
    expect(out.checkedAt).toBe(9);
  });

  it('a removed link counts and sorts as not found again', () => {
    const linked = linkedRow(row, ID, 9);
    expect(spotifyStatus(linked)).toBe('found');
    expect(reviewLine([linked])).toBe('1 track · 1 on Spotify · 0 not found');
    const out = unlinkedRow(linked);
    expect(spotifyStatus(out)).toBe('notFound');
    expect(inFilter(out, 'notOnSpotify')).toBe(true);
    expect(reviewLine([out])).toBe('1 track · 0 on Spotify · 1 not found');
    expect(sortValue('spotify', { row: out })).toBe(
      sortValue('spotify', { row })
    );
  });
});
