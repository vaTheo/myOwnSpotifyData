import { count, int } from './count';

const months = count('month');
const years = count('year');
const plays = count('play');

/** `6 months`, `1 year`, `2 years`: a Forgotten gems window. */
const gemWindow = (m: number): string =>
  m % 12 === 0 ? years(m / 12) : months(m);

/** The texts of the Crate (`src/ui/crate`, `src/model/crate.ts`, `src/model/year.ts`). */
export const crate = {
  /** The By year view's season chips. */
  seasons: {
    winter: 'Winter',
    spring: 'Spring',
    summer: 'Summer',
    autumn: 'Autumn',
  },
  /** `src/model/crate.ts`: the badge itself. */
  seasonYear: {
    winter: (year: number): string => `Winter ${year}`,
    spring: (year: number): string => `Spring ${year}`,
    summer: (year: number): string => `Summer ${year}`,
    autumn: (year: number): string => `Autumn ${year}`,
  },
  /** `src/model/year.ts`: a decade chip, `90s`, `2000s` (the short or full year). */
  decade: (year: string): string => `${year}s`,

  /** `labels.ts`. */
  labels: {
    unknownTitle: 'Unknown title',
    unknownArtist: 'Unknown artist',
    /** `month`, `3 months`: the phrase after "the last". */
    window: (m: number): string => (m === 1 ? 'month' : `${m} months`),
  },

  /** `ViewSwitch.tsx`. */
  switch: {
    picker: 'Crate view',
    nav: 'Crate views',
  },

  /** `CrateEmpty.tsx`. */
  empty: {
    emptyHeading: 'Your crate is empty',
    reimportHeading: 'Your history needs importing again',
    emptyBody:
      'These six views are built from your Spotify Extended streaming history, the zip you request from Spotify. The Web API has no play counts, so nothing here can be filled in by syncing.',
    reimportBody:
      "The Crate's views need data the old import didn't keep. Your play counts still work everywhere else.",
    importHistory: 'Import history',
    spotifyTop: "Spotify's own top lists ›",
  },

  /** `CrateHub.tsx`. */
  hub: {
    description: {
      rotation: 'What you play most right now',
      gems: 'Tracks you loved, then stopped playing',
      classics: 'Tracks you come back to year after year',
      year: 'Your tracks of a year, a season or a month',
      finish: 'What you play to the end, and what you skip',
      'rarely-played': 'Songs in your playlists you barely played',
    },
    top: (artist: string, title: string): string => `Top: ${artist} — ${title}`,
    topIn: (year: number, artist: string, title: string): string =>
      `Top in ${year}: ${artist} — ${title}`,
    first: (artist: string, title: string): string =>
      `First: ${artist} — ${title}`,
    nothingYet: 'Nothing yet',
    nothingInLast: (m: number): string =>
      m === 1 ? 'Nothing in the last month' : `Nothing in the last ${m} months`,
    nothingIn: (label: string): string => `Nothing in ${label}`,
    lastMonths: (m: number): string => `last ${months(m)}`,
    unplayedMonths: (m: number): string => `unplayed ${months(m)}+`,
    unplayedYears: (y: number): string => `unplayed ${years(y)}+`,
    yearsPlus: (y: number): string => `${y}+ years`,
    outcomesPlus: (n: number): string => `${n}+ outcomes`,
    neverPlayed: 'never played',
    /** `last`, the largest count in the list, agrees the French noun. */
    playsList: (last: number, list: string): string => `${list} plays`,
    playsPerYear: 'Plays per year',
    reached: (parts: string): string => `Tracks played in: ${parts}`,
    reachedPart: (y: string, tracks: number): string => `${y}+ years ${tracks}`,
    topFinished: 'Top track finished',
    imported: (date: string): string => `Imported ${date}`,
    updateImport: 'Update import',
    historyEnds: (month: string): string => `History ends ${month}`,
    reimport: 're-import',
  },

  /** The six views' shared pieces (`shared.tsx` and each view). */
  common: {
    artist: 'Artist',
    flag: 'Flag',
    notInPlaylist: 'not in a playlist',
    plays: 'Plays',
    playsPerMonth: 'Plays per month',
    playsPerYear: 'Plays per year',
    unitPlay: 'play',
    unitPlays: 'plays',
    tryMonths: (m: number): string => `Try ${m} months`,
    playsPlus: (n: number): string => `${n}+ plays`,
  },

  /** `Rotation.tsx`. */
  rotation: {
    option: (m: number): string => months(m),
    dayIn: (month: string, days: number): string =>
      `${month} is ${count('day')(days)} in`,
    new: 'New',
    ofPlays: (window: number, total: number): string =>
      `${int(window)} of ${plays(total)}`,
    inWindow: 'Plays in window',
    lifetime: 'Lifetime',
    lastWindow: (m: number): string =>
      m === 1 ? 'Last month' : `Last ${m} months`,
    staleEmpty: (month: string, m: number): string =>
      `Your history ends ${month}, so nothing falls in the last ${m === 1 ? 'month' : `${m} months`}.`,
    importFresh: 'Import a fresh export',
    nothingSince: (min: number, month: string): string =>
      `Nothing with ${min}+ plays since ${month}.`,
    table: (m: number): string =>
      `Heavy rotation, last ${m === 1 ? 'month' : `${m} months`}`,
  },

  /** `Gems.tsx`. */
  gems: {
    option: gemWindow,
    yearsOfLast: (active: number, span: number, date: string): string =>
      `${int(active)} of ${years(span)} · last ${date}`,
    lastPlayed: 'Last played',
    lastTwoYears: 'Last 2 years',
    caption: (min: number, since: string): string =>
      `Played ${min}+ times, nothing since ${since}`,
    empty: (min: number, m: number): string =>
      `Nothing forgotten. Everything you have played ${min}+ times has come round in the last ${m === 12 ? 'year' : gemWindow(m)}.`,
    table: (m: number): string =>
      `Forgotten gems, unplayed for ${gemWindow(m)}`,
  },

  /** `Classics.tsx`. */
  classics: {
    playsLast: (n: number, date: string): string =>
      `${plays(n)} · last ${date}`,
    caption: (perYear: number, minYears: number, span: number): string =>
      `Played ${perYear}+ times in ${minYears}+ of your ${span} years`,
    yearsPlayed: 'Years played',
    yearsOf: (active: number, span: number): string => `${active} of ${span}`,
    unitYears: 'years',
    perYear: 'Per year',
    mostYears: 'Most years',
    mostPlays: 'Most plays',
    empty: (min: number, span: number): string =>
      `No track reaches ${min} years yet. Your history covers ${years(span)}.`,
    tableYears: 'All-time classics, most years',
    tablePlays: 'All-time classics, most plays',
  },

  /** `ByYear.tsx`. */
  year: {
    all: 'All',
    playsLifetimeLast: (n: number, date: string): string =>
      `${plays(n)} lifetime · last ${date}`,
    inSelection: 'Plays in selection',
    allTime: 'All time',
    inYear: (year: number): string => `In ${year}`,
    perMonth: 'Per month',
    noPlays: (label: string): string => `No plays in ${label}.`,
    table: (label: string): string => `By year, ${label}`,
  },

  /** `Finish.tsx`. */
  finish: {
    finished: 'Finished',
    skipped: 'Skipped',
    captionFinished: 'Tracks you play to the end',
    captionSkipped: 'You bail out of these',
    note: (pct: number, finished: number, outcomes: number): string =>
      `${pct}% finished · ${int(finished)} of ${count('clear outcome')(outcomes)}`,
    legendHigh: '65%+ green',
    legendLow: 'under 35% red',
    pctFinished: '% finished',
    ofCount: (finished: number, outcomes: number): string =>
      `${int(finished)} of ${int(outcomes)}`,
    unclear: 'Unclear',
    clearPlus: (n: number): string => `${n}+ clear outcomes`,
    empty: (n: number): string => `No track has ${n} clear outcomes yet.`,
    tableFinished: 'Finish rate, finished',
    tableSkipped: 'Finish rate, skipped',
  },

  /** `Rarely.tsx`. */
  rarely: {
    never: 'Never',
    playCounts: 'Play counts',
    playlist: 'Playlist',
    playlists: 'Playlists',
    allPlaylists: 'All playlists',
    countedTo: (date: string): string => `plays counted to ${date}`,
    emptyPlaylist: 'Nothing to listen to in this playlist.',
    emptyNever: 'Nothing never played in your playlists.',
    emptyPlays: (list: string): string =>
      `Nothing ${list} plays in your playlists.`,
    tryAll: 'Try 0 to 3 plays',
    tableNever: 'Playlist songs played never played',
    tablePlays: (list: string): string => `Playlist songs played ${list} plays`,
  },
};
