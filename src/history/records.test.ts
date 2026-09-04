import { describe, expect, it } from 'vitest';
import {
  MIN_PLAY_MS,
  PlayAggregator,
  classify,
  emptyCounts,
  outcomeOf,
  trackIdFromUri,
} from './records';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-15T12:00:00Z',
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

describe('outcomeOf', () => {
  it('lets trackdone win over the skipped flag', () => {
    expect(outcomeOf(rec({ reason_end: 'trackdone', skipped: true }))).toBe(
      'finished'
    );
  });

  it('counts the four skip reasons and the skipped flag', () => {
    for (const reason of ['fwdbtn', 'backbtn', 'endplay', 'unknown']) {
      expect(outcomeOf(rec({ reason_end: reason }))).toBe('skipped');
    }
    expect(outcomeOf(rec({ reason_end: 'logout', skipped: true }))).toBe(
      'skipped'
    );
  });

  it('leaves interruptions and the pre-2017 values neutral', () => {
    for (const reason of [
      'logout',
      'remote',
      'trackerror',
      'unexpected-exit',
      'unexpected-exit-while-paused',
      'switched-to-audio',
      '',
      'appload',
      'clickrow',
      'clickside',
      'playbtn',
      'popup',
      'uriopen',
    ]) {
      expect(outcomeOf(rec({ reason_end: reason }))).toBe('neutral');
    }
    expect(outcomeOf(rec({ reason_end: null }))).toBe('neutral');
    expect(outcomeOf(42)).toBe('neutral');
  });
});

describe('PlayAggregator', () => {
  it('counts plays per track with totals, first and last timestamps', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-03-15T12:00:00Z' }));
    agg.add(rec({ ts: '2022-01-15T12:00:00Z', ms_played: 50000 }));
    agg.add(rec({ ms_played: 1000 }));
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:t2',
        ts: '2025-01-15T12:00:00Z',
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
        firstTs: '2022-01-15T12:00:00Z',
        lastTs: '2024-03-15T12:00:00Z',
        trackName: 'Song',
        artistName: 'Artist',
        months: { '2022-01': 1, '2024-03': 1 },
        attempts: 3,
        finished: 3,
        skipped: 0,
      },
      {
        trackId: 't2',
        plays: 1,
        msPlayed: 200000,
        firstTs: '2025-01-15T12:00:00Z',
        lastTs: '2025-01-15T12:00:00Z',
        trackName: null,
        artistName: 'Artist',
        months: { '2025-01': 1 },
        attempts: 1,
        finished: 1,
        skipped: 0,
      },
    ]);
    expect(agg.range()).toEqual({
      first: '2022-01-15T12:00:00Z',
      last: '2025-01-15T12:00:00Z',
    });
    expect(agg.outcomes()).toEqual({
      attempts: 4,
      finished: 4,
      skipped: 0,
    });
  });

  it('fills names from a later record when the first was null', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec());
    expect(agg.rows()[0].trackName).toBe('Song');
  });

  it('keeps the latest non-null name when a later record renames a track', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: 'Old title' }));
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec({ master_metadata_track_name: 'New title' }));
    expect(agg.rows()[0].trackName).toBe('New title');
  });

  it('has no range when nothing was credited', () => {
    expect(new PlayAggregator().range()).toBeNull();
  });

  it('gives a short-only track a row with no play', () => {
    const agg = new PlayAggregator();
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:s1',
        ms_played: 4000,
        reason_end: 'fwdbtn',
      })
    );
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:s1',
        ms_played: 1200,
        reason_end: 'backbtn',
      })
    );
    expect(agg.rows()).toEqual([
      {
        trackId: 's1',
        plays: 0,
        msPlayed: 0,
        firstTs: '',
        lastTs: '',
        trackName: 'Song',
        artistName: 'Artist',
        months: {},
        attempts: 2,
        finished: 0,
        skipped: 2,
      },
    ]);
    expect(agg.counts.short).toBe(2);
    expect(agg.range()).toBeNull();
    expect(agg.outcomes()).toEqual({
      attempts: 2,
      finished: 0,
      skipped: 2,
    });
  });

  it('buckets credited plays by month so the months sum to the plays', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-07-15T12:00:00Z' }));
    agg.add(rec({ ts: '2024-07-20T12:00:00Z' }));
    agg.add(rec({ ts: '2025-02-15T12:00:00Z' }));
    agg.add(
      rec({
        ts: '2025-02-16T12:00:00Z',
        ms_played: 2000,
        reason_end: 'fwdbtn',
      })
    );
    const row = agg.rows()[0];
    expect(row.months).toEqual({ '2024-07': 2, '2025-02': 1 });
    const summed = Object.values(row.months ?? {}).reduce((a, b) => a + b, 0);
    expect(summed).toBe(row.plays);
    expect(row.attempts).toBe(4);
    expect(row.skipped).toBe(1);
  });

  it('reports the device zone alongside the outcome totals', () => {
    const agg = new PlayAggregator();
    agg.add(rec());
    expect(agg.zone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(agg.outcomes()).toEqual({
      attempts: 1,
      finished: 1,
      skipped: 0,
    });
  });
});
