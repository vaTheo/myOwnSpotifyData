import { count, int } from './count';

/** Counted nouns: `1 track`, `2 tracks`, `1,234 tracks`. */
export const n = {
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
};

/** Short month names, January first. */
export const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The texts of `src/ui/format.ts`, shared by several screens. */
export const format = {
  period: {
    short_term: '4 weeks',
    medium_term: '6 months',
    long_term: '1 year',
  },
  topLongTerm: 'All time',
  minutes: (m: number): string => `${m} min`,
  hours: (h: number): string => `${int(h)} h`,
  hoursMinutes: (h: number, m: number): string => `${int(h)} h ${m} min`,
  thousands: (k: number): string => `${k}k`,
  millions: (m: number): string => `${m.toLocaleString('en-GB')}m`,
  notCounted: {
    short: (c: number): string => `${int(c)} under 30 s`,
    podcast: (c: number): string => `${int(c)} podcast`,
    audiobook: (c: number): string => `${int(c)} audiobook`,
    unattributed: (c: number): string => `${int(c)} without a track id`,
    malformed: (c: number): string => `${int(c)} unreadable`,
    line: (parts: string): string => `Not counted: ${parts}`,
  },
  listeners: count('ListenBrainz listener'),
  fans: count('Deezer fan'),
  noReach: 'no reach data',
  wikipedia: (languages: number): string =>
    `Wikipedia · ${count('language')(languages)}`,
  viewsPerYear: (views: string): string => `${views} views/yr`,
  history: {
    imported: (date: string, plays: string, tracks: string): string =>
      `Imported ${date}: ${plays} across ${tracks}.`,
    range: (first: string, last: string): string => `${first} – ${last}.`,
    zone: (zone: string): string => `Months bucketed in ${zone}.`,
  },
  top: {
    comparing: "Spotify's own ranking, period by period.",
    ranking: "Spotify's own ranking for this period.",
    plays: 'Plays come from your history import.',
  },
};

export const language = {
  /** Each language's own name, written the same whatever is shown. */
  names: { fr: 'Français', en: 'English' },
  choose: 'Language',
  description: 'The language the app is written in.',
  kept: 'Kept on this device.',
};
