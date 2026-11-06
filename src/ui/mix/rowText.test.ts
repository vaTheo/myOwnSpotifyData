import { describe, expect, it } from 'vitest';
import type { Clue, TracklistRow } from '../../db/schema';
import {
  clueLine,
  confidenceShort,
  confidenceText,
  gapCluesSummary,
  originText,
  referencesText,
  setWideSummary,
  sourceLabel,
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

describe('sourceLabel', () => {
  it('names each layer, and the owner’s added or edited rows', () => {
    expect(sourceLabel(row({ source: 'trackid' }))).toBe('TrackId');
    expect(sourceLabel(row({ source: 'description' }))).toBe('description');
    expect(sourceLabel(row({ source: 'pasted' }))).toBe('pasted');
    expect(sourceLabel(row({ source: 'tracklistify' }))).toBe('Tracklistify');
    expect(sourceLabel(row({ source: 'manual', detected: null }))).toBe(
      'added'
    );
    expect(sourceLabel(row({ source: 'manual' }))).toBe('edited');
  });
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
    expect(originText(row({ origin: 'clue', clue: clue() }))).toBe(
      'from a comment by dj_fan'
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
  it('fits the narrow column: clips and score, or the score alone', () => {
    expect(confidenceShort(row({ confidence: 92.2, hits: 3 }))).toBe(
      '3× · 92 %'
    );
    expect(confidenceShort(row({ confidence: 91.6 }))).toBe('92 %');
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
  it('writes one clue as plain text, its time and author when known', () => {
    expect(clueLine(clue())).toBe(
      '1:15 · dj_fan · ID is Foo – Bar https://x.example'
    );
    expect(clueLine(clue({ atSec: null, author: '' }))).toBe(
      'ID is Foo – Bar https://x.example'
    );
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
