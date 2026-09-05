import { describe, expect, it } from 'vitest';
import type { AllRows, FeatureRow, FeatureValue } from '../db/schema';
import { buildModel } from './aggregate';
import { featureFor, reccobeatsValue, resolveFeature } from './features';

function recco(over: Partial<FeatureValue> = {}): FeatureValue {
  return {
    bpm: 127.5,
    key: 9,
    major: false,
    energy: 0.8,
    fetchedAt: 10,
    ...over,
  };
}

function row(over: Partial<FeatureRow> = {}): FeatureRow {
  return { trackId: 't1', isrc: null, updatedAt: 20, ...over };
}

const rekordbox = {
  bpm: 128,
  key: 5,
  major: false,
  energy: null,
  fetchedAt: 30,
  matchedBy: 'title-artist-duration' as const,
  rbTitle: 'Song',
  rbArtist: 'Artist',
};

describe('reccobeatsValue', () => {
  it('unwraps a value and rejects a miss', () => {
    expect(reccobeatsValue(row({ reccobeats: recco() }))).toEqual(recco());
    expect(
      reccobeatsValue(row({ reccobeats: { notFound: true, checkedAt: 5 } }))
    ).toBeNull();
    expect(reccobeatsValue(row())).toBeNull();
  });
});

describe('resolveFeature', () => {
  it('takes the ReccoBeats value when it is the only source', () => {
    expect(resolveFeature(row({ reccobeats: recco() }))).toEqual({
      bpm: 127.5,
      key: 9,
      major: false,
      source: 'reccobeats',
    });
  });

  it('lets rekordbox win field by field', () => {
    expect(resolveFeature(row({ reccobeats: recco(), rekordbox }))).toEqual({
      bpm: 128,
      key: 5,
      major: false,
      source: 'rekordbox',
    });
  });

  it('fills a missing rekordbox BPM from ReccoBeats', () => {
    expect(
      resolveFeature(
        row({ reccobeats: recco(), rekordbox: { ...rekordbox, bpm: null } })
      )
    ).toEqual({ bpm: 127.5, key: 5, major: false, source: 'rekordbox' });
  });

  it('takes the key and its mode together from ReccoBeats when rekordbox has none', () => {
    expect(
      resolveFeature(
        row({
          reccobeats: recco(),
          rekordbox: { ...rekordbox, key: null, major: null },
        })
      )
    ).toEqual({ bpm: 128, key: 9, major: false, source: 'rekordbox' });
  });

  it('resolves over a not-found marker', () => {
    expect(
      resolveFeature(
        row({ reccobeats: { notFound: true, checkedAt: 5 }, rekordbox })
      )
    ).toEqual({ bpm: 128, key: 5, major: false, source: 'rekordbox' });
  });

  it('has nothing to show without a BPM and without a key', () => {
    expect(resolveFeature(undefined)).toBeNull();
    expect(resolveFeature(row())).toBeNull();
    expect(
      resolveFeature(row({ reccobeats: { notFound: true, checkedAt: 5 } }))
    ).toBeNull();
    expect(
      resolveFeature(row({ reccobeats: recco({ bpm: null, key: null }) }))
    ).toBeNull();
  });
});

describe('featureFor', () => {
  it('resolves the row of one track and returns null for the others', () => {
    const rows: AllRows = {
      playlists: [],
      tracks: [],
      entries: [],
      topItems: [],
      plays: [],
      features: [row({ reccobeats: recco() })],
    };
    const model = buildModel(rows);
    expect(featureFor(model, 't1')).toEqual({
      bpm: 127.5,
      key: 9,
      major: false,
      source: 'reccobeats',
    });
    expect(featureFor(model, 't2')).toBeNull();
  });
});
