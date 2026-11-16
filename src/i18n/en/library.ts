import { count, int, word } from './count';

/** The texts of the Library: playlists, artists, Under the radar. */
export const library = {
  /** Column headers and the nouns a phone's two-line item appends. */
  columns: {
    name: 'Name',
    tracks: 'Tracks',
    playlists: 'Playlists',
    plays: 'Plays',
    listeners: 'Listeners',
    fans: 'Fans',
    trackUnit: word('track'),
    playlistUnit: word('playlist'),
    listenerUnit: word('listener'),
    fanUnit: word('fan'),
  },
  /** `src/ui/Playlists.tsx`. */
  playlists: {
    title: 'Playlists',
    lastSynced: 'Last synced',
    syncedPrefix: 'synced ',
    status: 'Status',
    pending: 'pending',
    filter: 'Filter playlists',
    clearFilter: 'Clear filter',
    noMatch: (query: string): string => `No playlists match "${query}".`,
  },
  /** `src/ui/Playlist.tsx`. */
  playlist: {
    notSynced: 'Playlist not synced yet.',
    back: 'Back to playlists',
    others: count('other'),
    noPlays: 'No play counts yet —',
    importLink: 'import your history',
    byPlays: 'By plays',
    playlistOrder: 'Playlist order',
    match: 'Match',
    filters: 'Filters',
    tableLabel: {
      matches: (name: string): string => `${name}, matches`,
      order: (name: string): string => `${name}, playlist order`,
      plays: (name: string): string => `${name}, by plays`,
    },
    syncing: 'Syncing…',
    syncThis: 'Sync this playlist',
  },
  /** The Match mode of a playlist (`Playlist.tsx`, `playlist/matchCells.ts`). */
  match: {
    selectSeed: 'Select a track to match against',
    matching: (name: string): string => `Matching: ${name}`,
    bpm: (bpm: string): string => `${bpm} BPM`,
    clear: 'Clear',
    noFeature: 'No BPM or key for this track yet',
    noBpm: 'No BPM for this track — matching by key alone',
    relation: 'Relation',
    noData: 'no data',
    sameKey: 'same key',
    relative: 'relative',
    boost: 'boost',
  },
  /** The like job's lines written by `Playlist.tsx`. */
  like: {
    needScope:
      'This app cannot like songs yet — connect again to allow it. Your library stays in this browser.',
    connectAgain: 'Connect again to allow likes',
    checking: 'Checking your Liked Songs…',
    liking: 'Liking…',
    songs: 'songs',
  },
  /** `src/ui/Artists.tsx`. */
  artists: {
    bySavedTracks: 'Artists by saved tracks',
    savedTracks: 'Saved tracks',
    underRadar: 'Under the radar',
    filter: 'Filter artists',
  },
  /** `src/ui/Artist.tsx`. */
  artist: {
    noSaved: 'No saved tracks for this artist.',
    back: 'Back to artists',
    meta: (tracks: number, playlists: number): string =>
      `${count('saved track')(tracks)} in ${count('playlist')(playlists)}`,
    noTracks: (name: string): string =>
      `No saved tracks from ${name} in your playlists.`,
    tableLabel: (name: string): string => `Saved tracks by ${name}`,
    listeners: 'ListenBrainz listeners',
    fans: 'Deezer fans',
    noReach: 'No reach data',
    asOf: (date: string): string => `as of ${date}`,
    wikiCredit: 'Wikipedia figures CC BY-SA 4.0',
    lookUp: 'Look up artists',
  },
  /** `src/ui/UnderRadar.tsx`. */
  radar: {
    noReach: 'No reach data',
    unresolved: 'Not resolved yet ·',
    lookUpLink: 'Look up artists ›',
    wellKnown: 'Well known',
    noRunTitle: 'No reach data yet',
    noRunText:
      'Under the radar shows the artists in your playlists with the smallest audiences on ListenBrainz and Deezer, and moves the ones with a Wikipedia article to the bottom. It needs one lookup first: roughly 45 to 50 minutes for 1,000 artists, and you can stop it and come back.',
    mostPlayed: 'Most played',
    fewestListeners: 'Fewest listeners',
    fewestFans: 'Fewest fans',
    coverage: (covered: number, artists: number, date: string): string =>
      `${int(covered)} of ${count('artist')(artists)} have reach data · as of ${date}`,
    noneYet: 'No under-the-radar artists yet.',
  },
  /** `src/ui/listen.ts`: the Listen menu of every track list. */
  listen: {
    play: 'Play on Spotify',
    webPage: 'Open Spotify web page',
  },
  /** `src/model/keys.ts`: the classic notation of a minor key. */
  keys: {
    minor: (name: string): string => `${name} minor`,
  },
};
