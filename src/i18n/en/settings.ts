import { count, int } from './count';

const track = count('track');
const artist = count('artist');
const playlist = count('playlist');
const file = count('file');
const row = count('row');

/** The texts of Settings (`src/ui/settings`, `src/model/updateLines.ts`). */
export const settings = {
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
  /** The state words shared by the Sync status block and the closed lines. */
  words: {
    upToDate: 'Up to date',
    waiting: 'Waiting',
    failed: 'Failed',
    running: 'Running',
    autoOff: 'Automatic updates off',
    neverSynced: 'Never synced',
    synced: 'Synced',
    imported: 'Imported',
    notImported: 'Not imported',
    noTracks: 'No tracks yet',
    noArtists: 'No artists yet',
    notLookedUp: 'Not looked up',
    syncing: 'Syncing',
    updating: 'Updating',
    importing: 'Importing',
    spotifyLimit: "Paused by Spotify's limit",
    offline: 'Offline',
    paused: 'Paused',
    changesToSend: 'Changes to send',
    never: 'Never',
    off: 'Off',
    bpmKey: 'BPM and key',
    lastError: (message: string): string => `Last error: ${message}`,
    lookingUp: 'Looking up…',
    waitingButton: 'Waiting…',
    nothingNew: 'Nothing new to look up.',
  },
  /** The server's data sets, as the server card names them. */
  datasets: {
    library: 'library',
    history: 'history',
    features: 'features',
    reach: 'reach',
    mixes: 'mixes',
  },
  /** `lines.ts`: one entry per fragment, the ` · ` join stays in code. */
  lines: {
    usedShare: (usedMb: number, freeMb: number): string =>
      `${usedMb.toFixed(1)} MB of ${freeMb.toFixed(1)} MB used on the server`,
    signedInAs: (email: string): string => `Signed in as ${email}.`,
    signedInOwner: 'Signed in as the owner.',
    coverage: (covered: number, total: number): string =>
      `BPM and key for ${int(covered)} of ${track(total)}`,
    years: (dated: number, total: number): string =>
      `Release years: ${int(dated)} of ${track(total)}`,
    found: (n: number): string => `found ${int(n)}`,
    notFound: (n: number): string => `not found ${int(n)}`,
    yearsFound: (n: number): string => `years ${int(n)}`,
    sharedNoticeBpm:
      'BPM and key found by a lookup are shared with the other people on this server; your library, plays, rekordbox values and mixes never are.',
    sharedNoticeReach:
      'Listeners and fans found by a lookup are shared with the other people on this server; your library, plays, rekordbox values and mixes never are.',
    sharedError: (error: string): string =>
      `The shared store could not be used (${error}); everything was looked up outside as before.`,
    sharedTracks: (fromStore: number, sent: number): string =>
      `From the shared store: ${track(fromStore)}, no lookup needed. Shared: ${int(sent)} new.`,
    sharedArtists: (fromStore: number, sent: number): string =>
      `From the shared store: ${int(fromStore)} ${fromStore === 1 ? "artist's" : "artists'"} numbers, no lookup needed. Shared: ${int(sent)} new.`,
    parsed: (n: number): string => `parsed ${int(n)}`,
    withBpm: (n: number): string => `with BPM ${int(n)}`,
    withKey: (n: number): string => `with key ${int(n)}`,
    matched: (n: number): string => `matched ${int(n)}`,
    unmatched: (n: number): string => `unmatched ${int(n)}`,
    reachFor: (covered: number, artists: number): string =>
      `Reach data for ${int(covered)} of ${artist(artists)}`,
    wellKnown: (n: number): string => `well known ${int(n)}`,
    lookedUp: (n: number): string => `Looked up ${artist(n)}`,
    newNumbers: count('new number'),
    unresolved: (n: number): string => `${int(n)} unresolved`,
    paused: (source: string): string =>
      `${source} stopped answering after three tries; the rest of this run skipped it.`,
    pending: {
      library: 'Library',
      history: 'Listening history',
      features: 'Audio data',
      reach: 'Artist reach',
      mixes: 'Mixes',
    },
    pendingLine: (value: string): string => `Changes waiting to send: ${value}`,
    deviceUsers: (n: number): string => `${int(n)} people use this device`,
    dangerServer:
      "Removes your Spotify login and deletes your cached playlists and play counts from this browser. Your server data and other people's data on this device are kept.",
    dangerLocal:
      'Removes the Spotify login and deletes every cached playlist and play count from this browser. Server data is kept.',
  },
  /** `statusLines.ts`: the Sync status block's rows. */
  status: {
    syncing: (done: number, total: number): string =>
      `Syncing · ${int(done)} of ${playlist(total)}`,
    updatingTracks: (done: number, total: number): string =>
      `Updating · ${int(done)} of ${track(total)}`,
    updatingArtists: (done: number, total: number): string =>
      `Updating · ${int(done)} of ${artist(total)}`,
    importing: (done: number, total: number): string =>
      `Importing · ${int(done)} of ${file(total)}`,
  },
  /** `itemLines.ts`: the closed lines. */
  closed: {
    scopeFailed: (scope: string): string => `${scope} failed`,
    runningPct: (pct: number): string => `Running ${pct} %`,
    scopeRunning: (scope: string): string => `${scope} running`,
    scopeRunningPct: (scope: string, pct: number): string =>
      `${scope} running ${pct} %`,
    sharedStore: 'Shared store',
    notSignedInSpotify: 'Not signed in to Spotify',
    notAllowed: (writes: string): string => `Not allowed yet: ${writes}`,
    connectAgain: 'Connect again',
    signedInSpotify: 'Signed in to Spotify',
    files: (done: number, total: number): string => `${done} / ${total} files`,
    stopped: (n: number, sources: string): string =>
      `${sources} stopped answering`,
    skipped: (n: number): string =>
      `the run skipped ${n === 1 ? 'it' : 'them'}`,
    notSetUp: 'Not set up',
    notSignedIn: 'Not signed in',
    lastSync: (at: string): string => `last sync ${at}`,
    lastSyncNever: 'last sync never',
    lastSyncCap: (at: string): string => `Last sync ${at}`,
    pausedByServer: 'Paused by the server',
    sending: (dataset: string): string => `Sending ${dataset}`,
    fetching: (dataset: string): string => `Fetching ${dataset}`,
    rows: (done: number, total: number): string => `${done} / ${total} rows`,
    rejected: (n: number): string => `${row(n)} rejected by the safety check`,
    danger: "Disconnect deletes this browser's data · server data is kept",
  },
  /** `src/model/updateLines.ts`: one line per job. */
  updates: {
    labelHistory: 'History',
    playlists: (done: number, total: number): string =>
      `${done} / ${total} playlists`,
    tracks: (done: number, total: number): string =>
      `${done} / ${total} tracks`,
    artists: (done: number, total: number): string =>
      `${done} / ${total} artists`,
    syncedAt: (at: string): string => `Synced ${at}`,
    nextAfter: (at: string): string => `next after ${at}`,
    pausedSpotify: (at: string): string => `Paused by Spotify until ${at}`,
    withBpm: (covered: number, total: number): string =>
      `${int(covered)} / ${int(total)} tracks with BPM or key`,
    checked: (at: string): string => `Checked ${at}`,
    needsFile: 'needs a file',
    importedAt: (at: string): string => `Imported ${at}`,
    needsExport: 'needs a new export',
    needsXml: 'needs a new XML',
  },
  account: {
    description:
      'The Spotify login this browser reads your library with. It also allows the two writes you start with a tap: Create playlist and Like all songs.',
    likeAll: 'Like all songs',
    createPlaylist: 'Create playlist',
    signedIn: 'Signed in to Spotify.',
    notSignedIn: 'Not signed in to Spotify.',
    notAllowed: (writes: string, n: number): string =>
      `Not allowed yet: ${writes}. Connect again to allow ${n === 1 ? 'it' : 'them'}.`,
    note: 'Connect again signs you out and back in. Nothing in this browser is deleted.',
  },
  audio: {
    description:
      'BPM and key for your tracks, from ReccoBeats and your Rekordbox collection; release years from ReccoBeats.',
    lookUp: 'Look up BPM and key',
    classic: 'Classic',
    syncFirst: 'Sync or import a history first.',
    lookingUpPass: (pass: string): string => `Looking up · ${pass}`,
    passById: 'by track id',
    passByIsrc: 'retry by ISRC',
    passYears: 'release years',
    passRids: 'ReccoBeats ids',
    passShared: 'shared store',
    tracks: 'tracks',
    files: 'files',
    xmlLabel: 'Rekordbox collection XML (File > Export Collection)',
    xmlHint: 'Drop the XML here or choose it',
    importedOn: (date: string): string => `imported ${date}`,
    keyNotation: 'Key notation',
    credit: 'Audio data via ReccoBeats (Spotify audio features).',
  },
  history: {
    description:
      'Play counts from your Spotify extended streaming history export.',
    zoneWarning: (zone: string): string =>
      `This browser is now on ${zone}. Re-import to re-bucket months.`,
    update: 'Update import',
    import: 'Import history',
    none: 'No history imported yet.',
  },
  reach: {
    description:
      'Listeners and fans of your artists, for Under the radar: roughly 45 to 50 minutes for 1,000 artists, and you can stop it and come back.',
    lookUp: 'Look up artists',
    syncFirst: 'Sync your playlists first.',
    asOf: (date: string): string => `as of ${date}`,
    resolving: (source: string): string => `Resolving artists · ${source}`,
    batches: 'batches',
    artists: 'artists',
    credit:
      'Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) · Wikipedia (CC BY-SA)',
  },
  server: {
    description:
      'Optional: your own server keeps your data in step across your devices.',
    signInHelp:
      'Sign in to your server with a link sent to your email. Open the link in this browser, within 10 minutes.',
    syncNow: 'Sync now with server',
    unset:
      'No server set up. This browser keeps its own data. To share it across your devices, set the two server values described in the README.',
    offline: (message: string, at: string): string =>
      `Server offline: ${message} Last sync ${at}. Local data is in use.`,
    offlineNever: (message: string): string =>
      `Server offline: ${message} Last sync never. Local data is in use.`,
    pausedBefore: 'Server paused. Resume it from the ',
    pausedLink: 'Supabase dashboard',
    pausedAfter: ', then open the app again. Local data is in use.',
    lastSync: (at: string): string => `Last sync with the server: ${at}`,
    lastSyncNever: 'Last sync with the server: never',
    data: 'Data',
    here: 'Here',
    server: 'Server',
    rows: 'Rows',
    rejected: (n: number): string =>
      `${row(n)} rejected by the safety check and left out.`,
    rowsUnit: 'rows',
    signOut: 'Sign out',
    remove: 'Remove server data',
    note: "Sign out keeps your data here and on the server. Remove server data deletes all your data on the server and keeps this browser's copy.",
  },
  sync: {
    description:
      'Copies your playlists from Spotify into this browser, only when you tap Sync now.',
    syncing: 'Syncing…',
    syncNow: 'Sync now',
    lastSync: (at: string): string => `Last sync: ${at}`,
    lastSyncNever: 'Last sync: never',
    working: 'Working',
    playlists: 'playlists',
    quotaAfter: (pending: number, at: string): string =>
      `Spotify quota reached with ${playlist(pending)} pending. Retry after ${at}.`,
    quotaNow: (pending: number): string =>
      `Spotify quota reached with ${playlist(pending)} pending. You can retry now.`,
    autoNote:
      'With automatic updates on, opening the app syncs Spotify when the last sync is older than 12 hours, then looks up BPM and key, then artist reach, only what is missing.',
  },
  syncStatus: {
    title: 'Sync status',
    auto: 'Automatic updates',
    on: 'On',
    off: 'Off',
    retry: 'Retry',
  },
  danger: {
    confirm: 'Disconnect and delete all local data? Server data is kept.',
    disconnect: 'Disconnect',
  },
  page: {
    version: (version: string): string => `DJ Data v${version}`,
  },
};
