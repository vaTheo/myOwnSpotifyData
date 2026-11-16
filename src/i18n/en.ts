import { intIn } from './fmt';

/**
 * Every text the app writes, in English (spec 031, ADR-18). This file is the
 * source: its shape is the shape `fr.ts` must have, and its words are the
 * app's words, unchanged by the move (FR-003). A text with a value is a
 * function; a counted noun agrees inside its own entry.
 */
const int = (n: number): string => intIn('en', n);
const count =
  (word: string) =>
  (n: number): string =>
    `${int(n)} ${word}${n === 1 ? '' : 's'}`;

export const en = {
  /** Counted nouns: `1 track`, `2 tracks`, `1,234 tracks`. */
  n: {
    track: count('track'),
    play: count('play'),
    artist: count('artist'),
    playlist: count('playlist'),
    year: count('year'),
    month: count('month'),
    day: count('day'),
    song: count('song'),
    file: count('file'),
    row: count('row'),
  },
  settings: {
    groups: {
      spotify: 'Spotify',
      data: 'Your data',
      devices: 'Between devices',
      device: 'This device',
    },
    items: {
      account: 'Spotify account',
      sync: 'Spotify sync',
      history: 'Listening history',
      audio: 'Audio data',
      reach: 'Artist reach',
      server: 'Server',
      language: 'Language',
      danger: 'Danger zone',
    },
  },
  language: {
    /** Each language's own name, written the same whatever is shown. */
    names: { fr: 'Français', en: 'English' },
    choose: 'Language',
    description: 'The language the app is written in.',
    kept: 'Kept on this device.',
  },
};
