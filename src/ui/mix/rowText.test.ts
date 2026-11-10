import { describe, expect, it } from 'vitest';
import type { Clue, TracklistRow } from '../../db/schema';
import {
  checkText,
  clueLine,
  confidenceShort,
  rowYear,
  yearText,
  confidenceText,
  gapCluesSummary,
  listenIcons,
  originText,
  playLinks,
  referencesText,
  setWideSummary,
  timeText,
} from './rowText';

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: 0,
    endSec: null,
    artist: 'A',
    title: 'T',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'A', title: 'T' },
    referenceCount: null,
    ...over,
  };
}

const clue = (over: Partial<Clue> = {}): Clue => ({
  atSec: 75,
  author: 'dj_fan',
  text: 'ID is Foo – Bar https://x.example',
  kind: 'comment',
  ...over,
});

describe('originText', () => {
  it('reads the second listen with its speed', () => {
    expect(originText(row({ origin: 'replay', speedPercent: 4 }))).toBe(
      'second listen · +4 %'
    );
    expect(originText(row({ origin: 'replay', speedPercent: -4 }))).toBe(
      'second listen · −4 %'
    );
    expect(originText(row({ origin: 'replay', speedPercent: 0 }))).toBe(
      'second listen'
    );
    expect(originText(row({ origin: 'replay' }))).toBe('second listen');
  });

  it('names where a candidate came from, without "not heard" (the badge says it)', () => {
    // Round 021: a commenter's name is never shown.
    expect(originText(row({ origin: 'clue', clue: clue() }))).toBe(
      'from a comment'
    );
    expect(
      originText(row({ origin: 'clue', clue: clue({ author: '' }) }))
    ).toBe('from a comment');
    expect(
      originText(row({ origin: 'clue', clue: clue({ kind: 'description' }) }))
    ).toBe('from the description');
    expect(
      originText(row({ origin: 'clue', clue: clue({ kind: 'chapter' }) }))
    ).toBe('from a chapter');
  });

  it('is null for a first-listen row and a row from before round 003', () => {
    expect(originText(row())).toBeNull();
    expect(originText(row({ source: 'trackid' }))).toBeNull();
  });
});

describe('confidenceText', () => {
  it('reads clips and best score when the row has hits', () => {
    expect(confidenceText(row({ confidence: 87.4, hits: 3 }))).toBe(
      'heard 3× · best 87 %'
    );
    expect(confidenceText(row({ confidence: 60, hits: 1 }))).toBe(
      'heard 1× · best 60 %'
    );
  });

  it('reads "X% match" for an older Tracklistify row', () => {
    expect(confidenceText(row({ confidence: 91.6 }))).toBe('92% match');
  });

  it('is null, never zero, for candidates, gaps, edited rows and rows without a score', () => {
    expect(
      confidenceText(row({ origin: 'clue', clue: clue(), confidence: null }))
    ).toBeNull();
    expect(confidenceText(row({ origin: 'clue', confidence: 80 }))).toBeNull();
    expect(confidenceText(row({ gap: true, confidence: 80 }))).toBeNull();
    expect(
      confidenceText(row({ source: 'manual', confidence: 80 }))
    ).toBeNull();
    expect(confidenceText(row({ source: 'trackid' }))).toBeNull();
    expect(confidenceText(row())).toBeNull();
  });
});

describe('confidenceShort', () => {
  it('merges Clips into Confidence: times heard then score, or the score alone', () => {
    expect(confidenceShort(row({ confidence: 92.2, hits: 3 }))).toBe(
      '×3 · 92%'
    );
    expect(confidenceShort(row({ confidence: 91.6 }))).toBe('92%');
  });

  it('is null wherever the long text is null', () => {
    expect(confidenceShort(row({ origin: 'clue', confidence: 80 }))).toBeNull();
    expect(confidenceShort(row({ gap: true, confidence: 80 }))).toBeNull();
    expect(
      confidenceShort(row({ source: 'manual', confidence: 80 }))
    ).toBeNull();
    expect(confidenceShort(row())).toBeNull();
  });
});

describe('referencesText', () => {
  it('counts other mixes, singular and plural, and is null when absent', () => {
    expect(referencesText(row({ referenceCount: 1 }))).toBe('1 other mix');
    expect(referencesText(row({ referenceCount: 12 }))).toBe('12 other mixes');
    expect(referencesText(row({ referenceCount: 0 }))).toBe('0 other mixes');
    expect(referencesText(row())).toBeNull();
  });
});

describe('timeText', () => {
  it('reads a start, a span for a gap, or nothing', () => {
    expect(timeText(row({ startSec: 75 }))).toBe('1:15');
    expect(timeText(row({ gap: true, startSec: 60, endSec: 300 }))).toBe(
      '1:00 – 5:00'
    );
    expect(timeText(row({ startSec: null }))).toBeNull();
  });
});

describe('clues', () => {
  it('writes a comment as plain text, its time when known, never its author (round 021)', () => {
    expect(clueLine(clue())).toBe('1:15 · ID is Foo – Bar https://x.example');
    expect(clueLine(clue({ atSec: null }))).toBe(
      'ID is Foo – Bar https://x.example'
    );
    expect(clueLine(clue({ atSec: null, author: '' }))).toBe(
      'ID is Foo – Bar https://x.example'
    );
  });

  it('keeps the uploader on a chapter or description line', () => {
    expect(
      clueLine(clue({ kind: 'chapter', author: 'Demo DJ', text: 'Chapter 3' }))
    ).toBe('1:15 · Demo DJ · Chapter 3');
    expect(
      clueLine(
        clue({
          kind: 'description',
          atSec: null,
          author: 'Demo DJ',
          text: 'A – B',
        })
      )
    ).toBe('Demo DJ · A – B');
    expect(
      clueLine(clue({ kind: 'chapter', author: '', text: 'Chapter 3' }))
    ).toBe('1:15 · Chapter 3');
  });

  it('summarises the set-wide clues by where they came from', () => {
    expect(
      setWideSummary([
        clue({ kind: 'description' }),
        clue({ kind: 'description' }),
      ])
    ).toBe('Tracklist from the description (2 lines, no times)');
    expect(setWideSummary([clue(), clue({ kind: 'description' })])).toBe(
      'Tracklist from the comments (2 lines, no times)'
    );
    expect(setWideSummary([clue({ kind: 'description' })])).toBe(
      'Tracklist from the description (1 line, no times)'
    );
  });

  it('counts the clues around a gap', () => {
    expect(gapCluesSummary(1)).toBe('1 clue around here');
    expect(gapCluesSummary(3)).toBe('3 clues around here');
  });
});

describe('the row year (round 005)', () => {
  const base: TracklistRow = {
    startSec: 0,
    endSec: null,
    artist: 'Orbital',
    title: 'Halcyon',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'Orbital', title: 'Halcyon' },
    referenceCount: null,
  };

  it('says where the year came from', () => {
    expect(yearText({ ...base, yearFrom: 'shazam' }, 1992)).toBe(
      '1992, from Shazam'
    );
    expect(yearText({ ...base, yearFrom: 'catalogue' }, 1992)).toBe(
      '1992, from the ISRC (Deezer or MusicBrainz)'
    );
    expect(yearText({ ...base, yearFrom: 'spotify' }, 1992)).toBe(
      '1992, from Spotify (Create playlist or Check on Spotify)'
    );
    expect(yearText(base, 1992)).toBe('1992');
  });

  it('reads the row own year, never on a gap, never a zero', () => {
    expect(rowYear({ ...base, year: 1993 })).toBe(1993);
    expect(rowYear(base)).toBeNull();
    expect(rowYear({ ...base, gap: true, year: 1993 })).toBeNull();
  });
});

describe('playLinks: the direct pages first', () => {
  const web = 'https://open.spotify.com/track/abc';

  it('one Play on Spotify, the app link, on every device; no web page', () => {
    const found = row({ spotify: { id: 'abc', url: web } });
    expect(playLinks(found, 'zzz')).toEqual([
      { label: 'Play on Spotify', href: 'spotify:track:abc', app: true },
    ]);
  });

  it('without a Check answer it uses the library match', () => {
    expect(playLinks(row(), 'zzz')).toEqual([
      { label: 'Play on Spotify', href: 'spotify:track:zzz', app: true },
    ]);
  });

  it('nothing when Spotify has no direct page: not found, no match, a local file', () => {
    expect(playLinks(row({ spotify: 'not-found' }), 'zzz')).toEqual([]);
    expect(playLinks(row(), null)).toEqual([]);
    expect(playLinks(row(), 'spotify:local:a:b:c:1')).toEqual([]);
  });

  it('Shazam only for a row still reading as the scan heard it, after Spotify', () => {
    const shazam = 'https://www.shazam.com/track/1/x';
    expect(playLinks(row({ shazamUrl: shazam }), 'zzz')).toEqual([
      { label: 'Play on Spotify', href: 'spotify:track:zzz', app: true },
      { label: 'Shazam', href: shazam },
    ]);
    expect(
      playLinks(row({ shazamUrl: shazam, source: 'manual' }), null)
    ).toEqual([]);
  });
});

describe('listenIcons: Shazam and SoundCloud beside the Listen menu', () => {
  const shazam = 'https://www.shazam.com/track/1/x';
  const sc = 'https://soundcloud.com/search/sounds?q=A+T';

  it('Shazam then the SoundCloud search, named for the track', () => {
    expect(listenIcons(row({ shazamUrl: shazam }))).toEqual([
      { site: 'shazam', label: 'Shazam A – T', href: shazam },
      { site: 'soundcloud', label: 'Search SoundCloud for A – T', href: sc },
    ]);
  });

  it('no Shazam without its URL or once the row was edited', () => {
    const only = [
      { site: 'soundcloud', label: 'Search SoundCloud for A – T', href: sc },
    ];
    expect(listenIcons(row())).toEqual(only);
    expect(listenIcons(row({ shazamUrl: shazam, source: 'manual' }))).toEqual(
      only
    );
  });

  it('none for a gap or an unnamed row', () => {
    expect(listenIcons(row({ gap: true, shazamUrl: shazam }))).toEqual([]);
    expect(listenIcons(row({ artist: 'ID', title: 'ID' }))).toEqual([]);
  });
});

describe('round 016: TrackId.net rows', () => {
  const tr = { slug: 's', spanStart: 616, spanEnd: 857, references: 31 };
  it('originText names TrackId.net, the span and the references', () => {
    expect(originText(row({ origin: 'trackid', trackid: tr }))).toBe(
      'from TrackId.net · 10:16 to 14:17 · 31 references'
    );
    expect(
      originText(
        row({
          origin: 'trackid',
          trackid: { ...tr, spanStart: 3700, references: undefined },
        })
      )
    ).toBe('from TrackId.net · 1:01:40 to 14:17');
  });
  it('checkText reads the Shazam check', () => {
    const t = (c: TracklistRow['shazamCheck']) =>
      checkText(row({ origin: 'trackid', trackid: tr, shazamCheck: c }));
    expect(t({ outcome: 'agrees' })).toBe('Shazam agrees');
    expect(t({ outcome: 'no_match' })).toBe('Shazam: no match');
    expect(t({ outcome: 'not_asked' })).toBeNull();
    expect(
      t({
        outcome: 'differs',
        artist: 'Other',
        title: 'Track',
        confidence: 0.7,
      })
    ).toBe('Shazam heard Other - Track instead');
    expect(checkText(row({ origin: 'trackid', trackid: tr }))).toBeNull();
    expect(checkText(row())).toBeNull();
  });
  it('leaves clue and replay rows unchanged and shows no confidence', () => {
    expect(originText(row({ origin: 'replay' }))).toBe('second listen');
    expect(
      confidenceText(row({ origin: 'trackid', confidence: 80 }))
    ).toBeNull();
  });
});
