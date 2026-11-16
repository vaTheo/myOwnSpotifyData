import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { editTracklistRow, hasManualRows } from './rowEdit';

describe('editTracklistRow', () => {
  const base: TracklistRow = {
    startSec: 0,
    endSec: 60,
    artist: 'Apollonia',
    title: 'Chez Michel',
    label: null,
    source: 'trackid',
    gap: false,
    detected: { artist: 'Apollonia', title: 'Chez Michel' },
    referenceCount: 5,
  };

  it('keeps the source when the values still equal detected (a label-only edit)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: 'Ovum',
    });
    expect(out.source).toBe('trackid');
    expect(out.label).toBe('Ovum');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
  });

  it('flips the source to manual when a value now differs, keeping detected', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michelle',
      label: '',
    });
    expect(out.source).toBe('manual');
    expect(out.title).toBe('Chez Michelle');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
    expect(out.label).toBeNull();
  });

  it('drops the Spotify check when the artist or title changes, keeps it otherwise (T117)', () => {
    const checked: TracklistRow = {
      ...base,
      spotify: { id: 'abc', url: 'https://open.spotify.com/track/abc' },
      checkedAt: 5,
      validated: true,
    };
    const relabelled = editTracklistRow(checked, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: 'Ovum',
    });
    expect(relabelled.spotify).toEqual(checked.spotify);
    expect(relabelled.checkedAt).toBe(5);
    const renamed = editTracklistRow(checked, {
      artist: 'Apollonia',
      title: 'Chez Michelle',
      label: '',
    });
    expect(renamed.spotify).toBeUndefined();
    expect(renamed.checkedAt).toBeUndefined();
    expect('spotify' in renamed).toBe(false);
    expect(renamed.validated).toBe(true);
  });

  it('drops the owner’s hand link on a rename, keeps it on a label edit (round 012)', () => {
    const linked: TracklistRow = {
      ...base,
      spotify: { id: 'abc', url: 'https://open.spotify.com/track/abc' },
      spotifyBy: 'owner',
      checkedAt: 5,
    };
    const relabelled = editTracklistRow(linked, {
      artist: linked.artist,
      title: linked.title,
      label: 'Ovum',
    });
    expect(relabelled.spotify).toEqual(linked.spotify);
    expect(relabelled.spotifyBy).toBe('owner');
    const renamed = editTracklistRow(linked, {
      artist: linked.artist,
      title: `${linked.title} (Edit)`,
      label: '',
    });
    expect('spotify' in renamed).toBe(false);
    expect('spotifyBy' in renamed).toBe(false);
    expect('checkedAt' in renamed).toBe(false);
  });

  it('drops a year on a rename unless the row is renamed back to the identified track (S13b N1)', () => {
    const fromSpotify: TracklistRow = {
      ...base,
      year: 1993,
      yearFrom: 'spotify',
    };
    const fromShazam: TracklistRow = {
      ...base,
      year: 1991,
      yearFrom: 'shazam',
    };
    // A label or time edit names the same track: every year stays.
    const relabelled = editTracklistRow(fromSpotify, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: 'Ovum',
      startSec: 12,
    });
    expect(relabelled.year).toBe(1993);
    expect(relabelled.yearFrom).toBe('spotify');
    // Another track: no source's year belongs to it.
    for (const row of [fromSpotify, fromShazam]) {
      const renamed = editTracklistRow(row, {
        artist: 'Apollonia',
        title: 'Other',
        label: '',
      });
      expect('year' in renamed).toBe(false);
      expect('yearFrom' in renamed).toBe(false);
    }
    // Renamed back to what Shazam identified: its year (or the ISRC's)
    // still belongs to that recording; a Spotify year went with the answer.
    const typo: TracklistRow = { ...fromShazam, title: 'Chez Michell' };
    const restored = editTracklistRow(typo, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
    });
    expect(restored.year).toBe(1991);
    expect(restored.yearFrom).toBe('shazam');
    const typoSpotify: TracklistRow = { ...fromSpotify, title: 'Chez Michell' };
    const restoredSpotify = editTracklistRow(typoSpotify, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
    });
    expect('year' in restoredSpotify).toBe(false);
    // Back to the identified track with other case, accents or spacing:
    // the same recording, the Shazam year stays (S13c review M4).
    const recased = editTracklistRow(typo, {
      artist: 'APOLLONIA ',
      title: 'chez  michel',
      label: '',
    });
    expect(recased.year).toBe(1991);
    expect(recased.yearFrom).toBe('shazam');
  });

  it('leaves an added row (detected null) manual', () => {
    const added: TracklistRow = { ...base, source: 'manual', detected: null };
    const out = editTracklistRow(added, { artist: 'X', title: 'Y', label: '' });
    expect(out.source).toBe('manual');
  });

  it('leaves startSec alone when the patch omits it (M5)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
    });
    expect(out.startSec).toBe(0);
  });

  it('sets startSec from the patch, on a row that had none (M5)', () => {
    const untimed: TracklistRow = { ...base, startSec: null, source: 'manual' };
    const out = editTracklistRow(untimed, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 90,
    });
    expect(out.startSec).toBe(90);
  });

  it('clears startSec when the patch passes null (an emptied time field)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: null,
    });
    expect(out.startSec).toBeNull();
  });

  it('flips source to manual when only the time genuinely changes', () => {
    // A retimed-only row must count as curated too: hasManualRows (and so
    // the I2/§8 replace-guards) key off source === 'manual', and a
    // time-only edit would otherwise be invisible to a replace.
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 45, // base.startSec is 0: a real change.
    });
    expect(out.source).toBe('manual');
    expect(hasManualRows([out])).toBe(true);
  });

  it('does not flip source when the same time is resubmitted unchanged', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 0, // same as base.startSec: no real change.
    });
    expect(out.source).toBe('trackid');
  });
});

describe('hasManualRows', () => {
  it('is true when any row is manual, false otherwise', () => {
    const clean: TracklistRow = {
      startSec: null,
      endSec: null,
      artist: 'A',
      title: 'B',
      label: null,
      source: 'trackid',
      gap: false,
      detected: { artist: 'A', title: 'B' },
      referenceCount: null,
    };
    expect(hasManualRows([clean])).toBe(false);
    expect(hasManualRows([clean, { ...clean, source: 'manual' }])).toBe(true);
  });
});
