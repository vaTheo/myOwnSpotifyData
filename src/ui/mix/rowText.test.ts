import { describe, expect, it } from 'vitest';
import type { Clue, TracklistRow } from '../../db/schema';
import {
  checkText,
  clueLine,
  confidenceShort,
  rowYear,
  yearText,
  confidenceText,
  foundSpotifyId,
  gapCluesSummary,
  listenIcons,
  originText,
  playLinks,
  referencesText,
  setWideSummary,
  speedShort,
  speedText,
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

describe('foundSpotifyId: the ▶ of a found row, computer and phone', () => {
  const web = 'https://open.spotify.com/track/abc';

  it('the id of a Check answer, a hand link too', () => {
    expect(foundSpotifyId(row({ spotify: { id: 'abc', url: web } }))).toBe(
      'abc'
    );
    expect(
      foundSpotifyId(
        row({ spotify: { id: 'abc', url: web }, spotifyBy: 'owner' })
      )
    ).toBe('abc');
  });

  it('null when not found or not checked (a library match alone is no answer)', () => {
    expect(foundSpotifyId(row({ spotify: 'not-found' }))).toBeNull();
    expect(foundSpotifyId(row())).toBeNull();
  });

  it('null for a gap or an unnamed row', () => {
    const spotify = { id: 'abc', url: web };
    expect(foundSpotifyId(row({ gap: true, spotify }))).toBeNull();
    expect(
      foundSpotifyId(row({ artist: 'ID', title: 'ID', spotify }))
    ).toBeNull();
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

describe('spec 029: the evidence level and the mix speed', () => {
  it('speedShort: one decimal, the sign, a space before %, 0 % under 0.05', () => {
    expect(speedShort(-5.8)).toBe('−5.8 %');
    expect(speedShort(3.4)).toBe('+3.4 %');
    expect(speedShort(-7.74)).toBe('−7.7 %');
    expect(speedShort(2)).toBe('+2.0 %');
    expect(speedShort(0.04)).toBe('0 %');
    expect(speedShort(-0.04)).toBe('0 %');
    expect(speedShort(0)).toBe('0 %');
  });

  it('speedText: slower, faster, original speed under 0.05', () => {
    expect(speedText(-5.8)).toBe('played 5.8 % slower');
    expect(speedText(3.4)).toBe('played 3.4 % faster');
    expect(speedText(0.04)).toBe('played at original speed');
    expect(speedText(-0.04)).toBe('played at original speed');
  });

  const lv = (over: Partial<TracklistRow>) => row({ confidence: 92.2, ...over });

  it('the short and long text of each level, with hits and candidates', () => {
    const solid = lv({ evidence: 'solid', hits: 11 });
    expect(confidenceShort(solid)).toBe('Solid ×11');
    expect(confidenceText(solid)).toBe(
      'Solid: heard 11×, the position in the track advances in step'
    );
    const once = lv({ evidence: 'once', hits: 1 });
    expect(confidenceShort(once)).toBe('Heard once');
    expect(confidenceText(once)).toBe('Heard once');
    const step = lv({ evidence: 'out_of_step', hits: 3 });
    expect(confidenceShort(step)).toBe('Out of step ×3');
    expect(confidenceText(step)).toBe(
      'Out of step: heard 3×, the position in the track jumps'
    );
    const many = lv({ evidence: 'candidates', hits: 1, candidates: 12 });
    expect(confidenceShort(many)).toBe('Many candidates');
    expect(confidenceText(many)).toBe(
      'Many candidates: Shazam listed 12 for this answer'
    );
  });

  it('without hits or candidates: the level alone', () => {
    const solid = lv({ evidence: 'solid' });
    expect(confidenceShort(solid)).toBe('Solid');
    expect(confidenceText(solid)).toBe(
      'Solid: the position in the track advances in step'
    );
    const step = lv({ evidence: 'out_of_step' });
    expect(confidenceShort(step)).toBe('Out of step');
    expect(confidenceText(step)).toBe(
      'Out of step: the position in the track jumps'
    );
    const many = lv({ evidence: 'candidates', hits: 1 });
    expect(confidenceShort(many)).toBe('Many candidates');
    expect(confidenceText(many)).toBe('Many candidates');
  });

  it('with mixSpeed: the speed after " · "', () => {
    const solid = lv({ evidence: 'solid', hits: 11, mixSpeed: -5.8 });
    expect(confidenceShort(solid)).toBe('Solid ×11 · −5.8 %');
    expect(confidenceText(solid)).toBe(
      'Solid: heard 11×, the position in the track advances in step · played 5.8 % slower'
    );
    const once = lv({ evidence: 'once', hits: 1, mixSpeed: 3.4 });
    expect(confidenceShort(once)).toBe('Heard once · +3.4 %');
    expect(confidenceText(once)).toBe('Heard once · played 3.4 % faster');
    const step = lv({ evidence: 'out_of_step', hits: 3, mixSpeed: 0.01 });
    expect(confidenceShort(step)).toBe('Out of step ×3 · 0 %');
    expect(confidenceText(step)).toBe(
      'Out of step: heard 3×, the position in the track jumps · played at original speed'
    );
    const many = lv({
      evidence: 'candidates',
      hits: 1,
      candidates: 12,
      mixSpeed: -2,
    });
    expect(confidenceShort(many)).toBe('Many candidates · −2.0 %');
    expect(confidenceText(many)).toBe(
      'Many candidates: Shazam listed 12 for this answer · played 2.0 % slower'
    );
  });

  it('an unknown level and no level read as today', () => {
    for (const evidence of [undefined, 'inside', 'great']) {
      const r = lv({ evidence, hits: 3, mixSpeed: -5.8 });
      expect(confidenceShort(r)).toBe('×3 · 92%');
      expect(confidenceText(r)).toBe('heard 3× · best 92 %');
    }
    expect(confidenceShort(lv({ evidence: 'inside' }))).toBe('92%');
    expect(confidenceText(lv({ evidence: 'inside' }))).toBe('92% match');
  });

  it('a row no longer read as the scan heard it gives null, as today', () => {
    for (const over of [
      { source: 'manual' as const },
      { gap: true },
      { origin: 'clue' as const },
      { origin: 'trackid' as const },
      { confidence: null },
    ]) {
      const r = lv({ evidence: 'solid', hits: 11, mixSpeed: -5.8, ...over });
      expect(confidenceShort(r)).toBeNull();
      expect(confidenceText(r)).toBeNull();
    }
  });

  it('originText: a replay row with mixSpeed reads "second listen"', () => {
    expect(
      originText(row({ origin: 'replay', speedPercent: 4, mixSpeed: -3.1 }))
    ).toBe('second listen');
    expect(originText(row({ origin: 'replay', mixSpeed: 0 }))).toBe(
      'second listen'
    );
    expect(originText(row({ origin: 'replay', speedPercent: 4 }))).toBe(
      'second listen · +4 %'
    );
    expect(originText(row({ origin: 'replay', speedPercent: -4 }))).toBe(
      'second listen · −4 %'
    );
  });
});
