import { count, int } from './count';

const song = count('song');

/** The texts of the server and the external sources: `src/server`, `src/features`, `src/util`, `src/db`. */
export const sources = {
  /** `src/server/client.ts`: a failed request to the owner's server. */
  server: {
    missingTable:
      'The server has no tables yet. Apply supabase/migrations/0001_init.sql (see the README).',
    linkBrowser:
      'Open the link in the browser that asked for it, within 10 minutes.',
    networkError: (reason: string): string => `Network error: ${reason}`,
    unexpectedAnswer: (detail: string): string =>
      `Unexpected answer: ${detail}`,
    paused:
      'The server project is paused. Resume it from the Supabase dashboard.',
    unavailable: (status: number): string =>
      `Server unavailable (HTTP ${status})`,
    tooLarge: 'Batch too large for the server.',
    tooManyIn: (seconds: string): string =>
      `Too many requests. Try again in ${seconds} seconds.`,
    tooManyMinute: 'Too many requests. Try again in a minute.',
    noTokens: 'no tokens in the answer',
    notAList: 'not a list',
    noCreatedRow: 'The server answered without the created row.',
  },
  /** `src/server/session.ts`. */
  session: {
    personChanged: 'The signed-in person changed in another tab. Reload.',
    signedOut: 'Signed out of the server.',
    usedElsewhere:
      'The server session was used by another browser. Sign in again.',
    notSignedIn: 'Not signed in to the server.',
  },
  /** `src/server/sync.ts`. */
  sync: {
    updateApp:
      'The server holds data written by a newer version of the app. Reload to update.',
    unexpectedJobRow:
      'The server answered an unexpected request row. Sync and try again.',
    couldNotClear: (table: string, message: string): string =>
      `Could not clear ${table}: ${message}`,
    usageNoNumber: 'storage_used() gave no number.',
  },
  /** The shared store of public facts (ADR-15). */
  shared: {
    notSignedIn: 'Not signed in to the server',
    noAnswer: 'The server did not answer',
    notAList: 'Unexpected answer: not a list',
  },
  /** `src/features/lookup.ts`: the pass a BPM and key lookup is in. */
  lookupPass: {
    byId: 'by track id',
    byIsrc: 'retry by ISRC',
    years: 'release years',
    rids: 'ReccoBeats ids',
    shared: 'shared store',
  },
  musicbrainz: {
    unreachable: (reason: string): string =>
      `MusicBrainz is unreachable: ${reason}`,
    serverError: (status: number): string =>
      `MusicBrainz server error ${status}`,
    error: (status: number): string => `MusicBrainz error ${status}`,
    malformed: 'MusicBrainz returned a malformed response',
  },
  deezer: {
    unreachable: (reason: string): string => `Deezer is unreachable: ${reason}`,
    overQuota: (attempts: number, code: number): string =>
      `Deezer is over quota: it refused ${int(attempts)} attempts (error ${code})`,
  },
  wikidata: {
    noResults: 'Wikidata returned no results',
    unreachable: (reason: string): string =>
      `Wikidata is unreachable: ${reason}`,
    error: (status: number): string => `Wikidata error ${status}`,
    malformed: 'Wikidata returned a malformed response',
  },
  reccobeats: {
    unreachable: (reason: string): string =>
      `ReccoBeats is unreachable: ${reason}`,
    wait: (minutes: number): string =>
      `ReccoBeats asked us to wait ${minutes} min. Try again later.`,
    rateLimited:
      'ReccoBeats rate limited the lookup too many times. Try again later.',
    serverError: (status: number): string =>
      `ReccoBeats server error ${status}`,
    error: (status: number): string => `ReccoBeats error ${status}`,
    malformed: 'ReccoBeats returned a malformed response',
  },
  /** `src/features/jsonp.ts`: the Deezer transport. */
  jsonp: {
    failed: (url: string): string => `JSONP request failed: ${url}`,
    timedOut: (ms: number, url: string): string =>
      `JSONP request timed out after ${ms} ms: ${url}`,
  },
  /** `src/features/rekordbox.ts` and `rekordboxImport.ts`. */
  rekordbox: {
    notRekordbox:
      'This is not a Rekordbox collection. In Rekordbox use File > Export Collection in xml format, then pick that .xml here.',
    noTracks:
      'This Rekordbox collection has no tracks. Put the tracks in at least one playlist, export again and retry.',
    workerStart: (reason: string): string =>
      `Could not start the Rekordbox worker: ${reason}`,
    workerCrashed: 'Rekordbox worker crashed',
  },
  /** `src/features/like/likePlaylist.ts`: Like all songs, inline only. */
  like: {
    checkFailed: (reason: string): string =>
      `Could not check your Liked Songs: ${reason}`,
    unexpected: 'Spotify returned an unexpected answer',
    question: (toLike: number, total: number): string =>
      `${int(toLike)} of ${song(total)} from your last sync ${toLike === 1 ? "isn't" : "aren't"} in your Liked Songs yet. Like ${toLike === 1 ? 'it' : 'them'}?`,
    liked: (n: number): string => `Liked ${song(n)}`,
    alreadyLiked: (n: number): string =>
      `${int(n)} ${n === 1 ? 'was' : 'were'} already liked`,
    oneAlready: 'Your 1 song is already in your Liked Songs',
    allAlready: (n: number): string =>
      `All ${song(n)} are already in your Liked Songs`,
    nothing: 'No Spotify songs to like',
    skipped: (n: number): string => `${count('local file')(n)} skipped`,
    stopped: (liked: number, toLike: number, message: string): string =>
      `Liked ${int(liked)} of ${int(toLike)}, then: ${message}`,
    button: 'Like all songs',
    liking: 'Liking…',
    likingOther: 'Liking another playlist…',
  },
  /** `src/util/errors.ts`. */
  storageFull: 'Local storage is full. Free space on the phone and try again.',
  /** `src/db/repo.ts`. */
  db: {
    blocked:
      'Another tab of DJ Data is holding the old database open. Close the other tabs of this app (and its home-screen window), then reload.',
    slow: 'The local database is taking long to open. If this lasts, close the other tabs of DJ Data (and its home-screen window), then reload.',
    superseded:
      'DJ Data was updated in another tab. Reload this one to continue.',
    stillOpen:
      'Local data is still open in another tab. Close the other tabs and try again.',
  },
};
