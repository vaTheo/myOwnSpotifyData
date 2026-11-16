import { count, int } from './count';

/** The texts of Overview, Top and Search. */
export const overview = {
  /** `src/ui/overview/Overview.tsx`. */
  screen: {
    label: 'Overview',
    playsPerMonth: 'Plays per month',
    listenTo: (artist: string, title: string): string =>
      `Listen to ${artist} – ${title}`,
  },
  /** `src/ui/overview/blocks.ts`: the cards. */
  actions: {
    importHistory: 'Import history',
    syncInSettings: 'Sync in Settings',
    importAgain: 'Import again',
    lookUp: 'Look up in Settings',
    openMix: 'Open Mix',
    signIn: 'Sign in in Settings',
  },
  listening: {
    title: 'Listening',
    noHistory: 'No listening history yet.',
    plays: 'Plays',
    time: 'Listening time',
    years: 'Years',
    imported: 'Imported',
    stale: (month: string): string =>
      `History ends ${month}. Import a newer export for recent plays.`,
  },
  rotation: {
    title: 'Heavy rotation',
    empty: 'Heavy rotation is built from your listening history.',
    reimport: 'Your history needs importing again for the month views.',
    tracks: 'Tracks',
    window: 'Window',
    windowValue: (months: number): string => `last ${count('month')(months)}`,
    nothing: (months: number): string =>
      `Nothing in the last ${count('month')(months)}.`,
  },
  top: {
    title: 'Top this month',
    empty: 'No top lists yet.',
  },
  library: {
    title: 'Library',
    empty: 'No playlists yet.',
    playlists: 'Playlists',
    tracks: 'Tracks',
    lastSync: 'Last sync',
    never: 'never',
    retryAfter: (date: string): string => `Retry after ${date}.`,
    retryNow: 'You can retry now.',
    quota: (pending: number): string =>
      `Spotify quota reached with ${count('playlist')(pending)} pending.`,
    pendingError: (pending: number, message: string): string =>
      `${count('playlist')(pending)} pending. Last error: ${message}`,
    lastError: (message: string): string => `Last error: ${message}`,
  },
  coverage: {
    title: 'Coverage',
    empty: 'No tracks or artists to look up yet.',
    audio: 'Audio data',
    audioValue: (covered: number, total: number): string =>
      `${int(covered)} of ${count('track')(total)}`,
    reach: 'Artist reach',
    reachValue: (covered: number, total: number): string =>
      `${int(covered)} of ${count('artist')(total)}`,
    rekordbox: 'Rekordbox imported',
    reachAsOf: 'Reach as of',
    gated: 'Under the radar needs your artists looked up.',
  },
  mix: {
    title: 'Last saved mix',
    reading: 'Reading your saved mixes…',
    empty: 'No saved mixes yet.',
    saved: 'Saved',
  },
  server: {
    title: 'Server',
    signedOut: 'Signed out of your server.',
    lastSync: 'Last sync',
    never: 'never',
    waiting: 'Waiting to send',
    now: 'Now',
    saving: 'Saving to server',
    loading: 'Loading from server',
    offline: (message: string): string =>
      `Server offline: ${message} Local data is in use.`,
    paused:
      'Server paused. Resume it from the Supabase dashboard, then open the app again.',
    rejected: (rows: number): string =>
      `${count('row')(rows)} rejected by the safety check and left out.`,
  },
  /** `src/ui/Top.tsx`. */
  topScreen: {
    tracks: 'Tracks',
    artists: 'Artists',
    compare: 'Compare periods',
    name: 'Name',
    savedTracks: 'Saved tracks',
    savedTrackOne: 'saved track',
    savedTrackMany: 'saved tracks',
    playlists: 'Playlists',
    playlistOne: 'playlist',
    playlistMany: 'playlists',
    tracksLabel: (period: string): string => `Top tracks, ${period}`,
    artistsLabel: (period: string): string => `Top artists, ${period}`,
  },
  /** `src/ui/search/`. */
  search: {
    groups: {
      track: 'Tracks',
      artist: 'Artists',
      playlist: 'Playlists',
      mix: 'Mixes',
    },
    recent: 'Recent',
    showAll: (total: number): string => `Show all ${int(total)}`,
    label: 'Search',
    close: 'Close search',
    field: 'Search tracks, artists, playlists and mixes',
    placeholder: 'Search tracks, artists, playlists, mixes',
    clear: 'Clear search',
    loading: 'Your library is still loading.',
    prompt:
      'Search the tracks, artists, playlists and mixes stored in this browser.',
    nothing: (query: string): string => `Nothing matches '${query}'`,
    results: 'Results',
    /** The context line beside a hit; the names in it are the user's. */
    withPlays: (artist: string, plays: number): string =>
      `${artist} · ${count('play')(plays)}`,
    unknownArtist: 'Unknown artist',
    savedTracks: count('saved track'),
    inTopArtists: 'In your top artists',
    savedOn: (date: string): string => `saved ${date}`,
  },
};
