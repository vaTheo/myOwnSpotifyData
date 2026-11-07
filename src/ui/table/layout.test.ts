import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CELL_PAD,
  fitLevel,
  levelOf,
  ROW_PAD,
  MIN_TITLE_PX,
  titleRoom,
  type ColumnTrack,
  widestPriority,
  widthLevel,
  yearSortFor,
  yearSortOn,
  yearSortOffered,
} from './layout';

describe('widestPriority', () => {
  it('follows the container queries 720, 960 and 1120 px', () => {
    expect(widestPriority(null)).toBe(4);
    expect(widestPriority(390)).toBe(1);
    expect(widestPriority(719)).toBe(1);
    expect(widestPriority(720)).toBe(2);
    expect(widestPriority(959)).toBe(2);
    expect(widestPriority(960)).toBe(3);
    expect(widestPriority(1119)).toBe(3);
    expect(widestPriority(1120)).toBe(4);
  });
});

describe('yearSortOffered', () => {
  it('offers the switch where the Released header is not drawn', () => {
    expect(yearSortOffered(null)).toBe(false);
    expect(yearSortOffered({ twoLine: true, widestPriority: 4 })).toBe(true);
    expect(yearSortOffered({ twoLine: false, widestPriority: 1 })).toBe(true);
    expect(yearSortOffered({ twoLine: false, widestPriority: 2 })).toBe(false);
  });
});

describe('widthLevel (S13c review M3)', () => {
  it('changes only when the level or the compactBelow side changes', () => {
    expect(widthLevel(721)).toBe(widthLevel(959));
    expect(widthLevel(719)).not.toBe(widthLevel(720));
    expect(widthLevel(500, 560)).not.toBe(widthLevel(600, 560));
    expect(levelOf(widthLevel(500, 560))).toEqual({ widest: 1, narrow: true });
    expect(levelOf(widthLevel(1200))).toEqual({ widest: 4, narrow: false });
    expect(levelOf(null)).toEqual({ widest: 4, narrow: null });
  });
});

describe('the Sort by year switch (S13c review M2)', () => {
  it('is on only for Released ascending, and off returns the default order', () => {
    expect(yearSortOn({ columnId: 'released', direction: 'asc' })).toBe(true);
    expect(yearSortOn({ columnId: 'released', direction: 'desc' })).toBe(false);
    expect(yearSortOn({ columnId: 'bpm', direction: 'asc' })).toBe(false);
    expect(yearSortFor(true)).toEqual({
      columnId: 'released',
      direction: 'asc',
    });
    expect(yearSortFor(false)).toEqual({ columnId: null, direction: 'asc' });
  });
});

describe('titleRoom and two-line items (S13c review I1)', () => {
  // Top's tracks: # · cover · title · artists · plays · playlists · BPM ·
  // key · released · link.
  const top: ColumnTrack[] = [
    { id: 'rank', priority: 1, width: '56px' },
    { id: 'cover', priority: 3, width: '56px' },
    { id: 'title', priority: 1, width: 'minmax(0, 2fr)' },
    { id: 'artists', priority: 2, width: 'minmax(0, 1.5fr)' },
    { id: 'plays', priority: 1, width: '88px' },
    { id: 'playlists', priority: 2, width: '152px' },
    { id: 'bpm', priority: 1, width: '76px' },
    { id: 'key', priority: 1, width: '76px' },
    { id: 'released', priority: 2, width: '88px' },
    { id: 'spotify', priority: 1, width: '64px' },
  ];

  it('shares the free width by fr, after the fixed columns and padding', () => {
    // 1170 px, every column: free 1170 − 24 − 656 = 490, title 2/3.5.
    expect(titleRoom(top, 1170)).toBeCloseTo((490 * 2) / 3.5 - 16);
    // 770 px (beside the docked sheet), level 2: free 770 − 24 − 600 = 146.
    expect(titleRoom(top, 770)).toBeCloseTo((146 * 2) / 3.5 - 16);
    // 600 px, level 1: the artists are hidden, the title takes it all.
    expect(titleRoom(top, 600)).toBe(600 - 24 - 360 - 16);
  });

  it('honours a column minimum, and is null without a title', () => {
    const mix: ColumnTrack[] = [
      { id: 'time', priority: 1, width: '72px' },
      { id: 'title', priority: 1, width: 'minmax(200px, 1fr)' },
      { id: 'label', priority: 1, width: 'minmax(0, 0.4fr)' },
    ];
    expect(titleRoom(mix, 300)).toBe(200 - 16);
    expect(titleRoom([{ id: 'x', priority: 1, width: '1fr' }], 900)).toBeNull();
  });

  it('keeps the title at its minimum while it fits, else gives the free width', () => {
    const min = top.map((c) =>
      c.id === 'title' ? { ...c, width: 'minmax(176px, 2fr)' } : c
    );
    // 900 px, level 2: free 276; 2/3.5 of it is under 176, the title
    // keeps 176 (160 of text) and the artists take the rest.
    expect(titleRoom(min, 900)).toBe(160);
    expect(levelOf(widthLevel(900, undefined, min)).narrow).toBe(false);
    // 770 px: free 146, under the minimum: the title would overflow at
    // level 2, so the table drops to level 1, where it fits.
    expect(titleRoom(min, 770)).toBe(130);
    expect(levelOf(widthLevel(770, undefined, min))).toEqual({
      widest: 1,
      narrow: false,
    });
  });

  it('counts the minimums of the other columns before the title', () => {
    const crate: ColumnTrack[] = [
      { id: 'rank', priority: 1, width: '56px' },
      { id: 'title', priority: 1, width: 'minmax(176px, 2fr)' },
      { id: 'artist', priority: 1, width: 'minmax(64px, 1.5fr)' },
      { id: 'rest', priority: 1, width: '800px' },
    ];
    // 1120: free 1120 − 24 − 856 = 240 = 176 + 64, the title keeps 160.
    expect(titleRoom(crate, 1120)).toBe(160);
    // 1100: free 220 < 240, the title gets 220 − 64 − 16.
    expect(titleRoom(crate, 1100)).toBe(140);
  });

  it('hides columns by priority before it draws two-line items (re-review N1)', () => {
    expect(MIN_TITLE_PX).toBe(160);
    // 770 px: level 2 leaves the title 67 px; level 1 leaves it 370.
    expect(fitLevel(top, 770)).toEqual({ level: 1, fits: true });
    expect(levelOf(widthLevel(770, undefined, top))).toEqual({
      widest: 1,
      narrow: false,
    });
    expect(fitLevel(top, 1170)).toEqual({ level: 4, fits: true });
    expect(fitLevel(top, 600)).toEqual({ level: 1, fits: true });
    // Two-line items only when even the priority-1 columns leave too little.
    const wide: ColumnTrack[] = [
      { id: 'title', priority: 1, width: 'minmax(176px, 2fr)' },
      { id: 'figures', priority: 1, width: '500px' },
    ];
    expect(fitLevel(wide, 650)).toEqual({ level: 1, fits: false });
    expect(levelOf(widthLevel(650, undefined, wide)).narrow).toBe(true);
    expect(levelOf(widthLevel(770)).narrow).toBe(false);
  });

  it('pins its paddings to styles.css (re-review N5)', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../../styles.css', import.meta.url)),
      'utf8'
    );
    const pad = Number(/\.dt \{[^}]*--dt-pad:\s*(\d+)px/.exec(css)?.[1]);
    expect(pad).toBe(8);
    // .dt-row: 0 (pad * 2) 0 pad, so start + end = 3 pads.
    expect(css).toMatch(
      /\.dt-row \{[^}]*padding: 0 calc\(var\(--dt-pad\) \* 2\) 0 var\(--dt-pad\);/
    );
    expect(ROW_PAD).toBe(pad * 3);
    // .dt-cell: 0 pad on both sides.
    expect(css).toMatch(/\.dt-cell \{[^}]*padding: 0 var\(--dt-pad\);/);
    expect(CELL_PAD).toBe(pad * 2);
  });
});
