import { describe, expect, it } from 'vitest';
import {
  MIN_PLAY_MS,
  PlayAggregator,
  classify,
  emptyCounts,
  trackIdFromUri,
} from './records';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-01T00:00:00Z',
    platform: 'android',
    ms_played: 200000,
    conn_country: 'FR',
    ip_addr: null,
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:t1',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    audiobook_title: null,
    audiobook_uri: null,
    audiobook_chapter_uri: null,
    audiobook_chapter_title: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
    ...over,
  };
}

describe('trackIdFromUri', () => {
  it('extracts the id from track uris only', () => {
    expect(trackIdFromUri('spotify:track:abc')).toBe('abc');
    expect(trackIdFromUri('spotify:episode:abc')).toBeNull();
    expect(trackIdFromUri('spotify:track:')).toBeNull();
    expect(trackIdFromUri(null)).toBeNull();
  });
});

describe('classify', () => {
  it('applies the 30 second rule to track plays', () => {
    expect(classify(rec())).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS }))).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS - 1 }))).toBe('short');
    expect(classify(rec({ ms_played: null }))).toBe('short');
  });

  it('classifies podcasts, audiobooks, null-metadata rows and junk', () => {
    expect(
      classify(
        rec({
          spotify_track_uri: null,
          spotify_episode_uri: 'spotify:episode:e',
        })
      )
    ).toBe('podcast');
    expect(
      classify(
        rec({ spotify_track_uri: null, audiobook_uri: 'spotify:show:b' })
      )
    ).toBe('audiobook');
    expect(classify(rec({ spotify_track_uri: null }))).toBe('unattributed');
    expect(classify(null)).toBe('malformed');
    expect(classify('x')).toBe('malformed');
    expect(classify([])).toBe('malformed');
  });
});

describe('PlayAggregator', () => {
  it('counts plays per track with totals, first and last timestamps', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-03-01T00:00:00Z' }));
    agg.add(rec({ ts: '2022-01-01T00:00:00Z', ms_played: 50000 }));
    agg.add(rec({ ms_played: 1000 }));
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:t2',
        ts: '2025-01-01T00:00:00Z',
        master_metadata_track_name: null,
      })
    );
    agg.add(rec({ spotify_track_uri: null }));
    agg.add(42);
    expect(agg.counts).toEqual({
      ...emptyCounts(),
      credited: 3,
      short: 1,
      unattributed: 1,
      malformed: 1,
    });
    const rows = agg.rows().sort((a, b) => a.trackId.localeCompare(b.trackId));
    expect(rows).toEqual([
      {
        trackId: 't1',
        plays: 2,
        msPlayed: 250000,
        firstTs: '2022-01-01T00:00:00Z',
        lastTs: '2024-03-01T00:00:00Z',
        trackName: 'Song',
        artistName: 'Artist',
      },
      {
        trackId: 't2',
        plays: 1,
        msPlayed: 200000,
        firstTs: '2025-01-01T00:00:00Z',
        lastTs: '2025-01-01T00:00:00Z',
        trackName: null,
        artistName: 'Artist',
      },
    ]);
    expect(agg.range()).toEqual({
      first: '2022-01-01T00:00:00Z',
      last: '2025-01-01T00:00:00Z',
    });
  });

  it('fills names from a later record when the first was null', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec());
    expect(agg.rows()[0].trackName).toBe('Song');
  });

  it('has no range when nothing was credited', () => {
    expect(new PlayAggregator().range()).toBeNull();
  });
});
