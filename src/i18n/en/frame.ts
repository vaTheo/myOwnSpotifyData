import { count } from './count';

/** The texts of the frame and navigation (`src/ui/layout`, `src/ui/components`, `src/app.tsx`). */
export const frame = {
  /** The destinations: rail, bottom bar and top bar titles. */
  nav: {
    main: 'Main',
    overview: 'Overview',
    /** Under the icon (bottom bar, 80 px rail), where a long name is cut. */
    overviewShort: 'Overview',
    listening: 'Listening',
    library: 'Library',
    mix: 'Mix',
    settings: 'Settings',
  },
  /** The tabs of Listening and Library. */
  tabs: {
    top: 'Top',
    crate: 'Crate',
    playlists: 'Playlists',
    artists: 'Artists',
  },
  /** The Crate views' names: the one source, read by `CRATE_TITLE`. */
  crateViews: {
    rotation: 'Heavy rotation',
    gems: 'Forgotten gems',
    classics: 'All-time classics',
    year: 'By year',
    finish: 'Finish rate',
    'rarely-played': 'Rarely played',
  },
  /** `titles.ts`: the top bar's other titles. */
  titles: {
    playlist: 'Playlist',
    artist: 'Artist',
    import: 'Import listening history',
  },
  topBar: {
    back: 'Back',
    search: 'Search',
  },
  /** `AppFrame.tsx`. */
  loading: 'Loading your library…',
  /** `SideSheet.tsx`. */
  closeDetails: 'Close details',
  /** `ListDetail.tsx`: the list pane's footer. */
  listDetail: {
    showing: (shown: string, total: string): string =>
      `Showing ${shown} of ${total}`,
    showMore: (n: string): string => `Show ${n} more`,
  },
  /** `ActivityButton.tsx`. */
  activity: {
    running: (label: string): string => `Running: ${label}`,
    jobsRunning: (n: number): string => `${count('job')(n)} running`,
    panel: 'Running jobs',
  },
  /** `jobs.ts`: each running job's label. */
  jobs: {
    sync: 'Syncing playlists',
    import: 'Importing history',
    years: 'Looking up release years',
    bpmKey: 'Looking up BPM and key',
    rekordbox: 'Importing Rekordbox',
    reach: 'Looking up artists',
    push: 'Saving to server',
    pull: 'Loading from server',
    like: 'Liking songs',
    createPlaylist: 'Creating playlist',
    spotifyCheck: 'Checking on Spotify',
    mixLookup: 'Looking up mix',
  },
  /** `components/`. */
  banner: { dismiss: 'Dismiss' },
  empty: {
    playlists: 'No playlists yet.',
    topLists: 'No top lists yet.',
    artists: 'No artists yet.',
    action: 'Sync in Settings',
  },
  noData: 'no data',
  noMatch: {
    artists: (query: string): string => `No artists match "${query}".`,
    clear: 'Clear filter',
  },
  play: (artist: string, title: string): string =>
    `Play ${artist} – ${title} on Spotify`,
  openInSpotify: 'Open in Spotify',
  dig: {
    search: (site: string): string => `Search ${site}`,
    openInShazam: 'Open in Shazam',
  },
  fileDrop: {
    refused: (name: string, types: string): string =>
      `${name} cannot be used here: drop a ${types} file.`,
    /** `acceptLabel` with no extension to name. */
    matching: 'matching',
    /** `acceptLabel`: the last two extensions. */
    or: (head: string, last: string): string => `${head} or ${last}`,
  },
  /** `ProgressBar.tsx`: the unit when none is given. */
  progressUnit: 'playlists',
  /** `main.tsx`: a Spotify sign-in that failed, with the reason received. */
  loginFailed: (reason: string): string => `Login failed: ${reason}`,
};
