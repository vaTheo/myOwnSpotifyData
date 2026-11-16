import { count } from './count';

/** The texts of sign-in, Connect and Import (`src/ui/signin`, `src/history`). */
export const signin = {
  /** Shown on both cards while a link or Spotify hands back. */
  signingIn: 'Signing you in…',
  /** `src/ui/signin/SignInGate.tsx` and `gate.ts`. */
  gate: {
    purpose:
      'Sign in with a link sent to your email. Open the link in this browser, within 10 minutes.',
    pausedBefore: 'Server paused. Resume it from the ',
    pausedLink: 'Supabase dashboard',
    pausedAfter: ', then send the link again.',
    offline: (message: string): string =>
      `Server offline: ${message} Send the link again once you are online.`,
    spotifyBeforeSignIn:
      'Sign in to the app first, then connect Spotify again.',
  },
  /** `src/ui/signin/ServerLinkForm.tsx`. */
  linkForm: {
    email: 'Email',
    send: 'Send me a link',
    sent: (email: string): string =>
      `If this email has an account, a link was sent to ${email}. Open it in this browser within 10 minutes.`,
  },
  /** `src/ui/Connect.tsx`. */
  connect: {
    purpose: 'Your Spotify listening, ranked for DJ set preparation.',
    readsTop: 'Your top lists: 4 weeks, 6 months and all time',
    readsPlaylists: 'The playlists you own, when you sync them',
    readsHistory: 'Your listening history, when you import it',
    privacySummary: 'What leaves this browser',
    privacy:
      'Your most played tracks, your playlists ranked by plays, and the artists you have saved the most. Reads your top lists and the playlists you own. Nothing leaves this browser except the track ids sent to ReccoBeats when you look up BPM and key, and the artist ids, ISRCs and article titles sent to MusicBrainz, ListenBrainz, Deezer, Wikidata and Wikimedia when you look up artists.',
    connectSpotify: 'Connect Spotify',
    signOut: 'Sign out',
  },
  /** `src/ui/Import.tsx`. */
  import: {
    starts: count('start'),
    startsPlayedThrough: (attempts: number, pct: number): string =>
      `${count('start')(attempts)}, ${pct}% played through`,
    creditedAcross: (plays: number, tracks: number): string =>
      `${count('play')(plays)} credited across ${count('track')(tracks)}`,
    matched: (tracks: number): string =>
      `${count('track')(tracks)} matched your playlists`,
    range: (first: string, last: string): string => `From ${first} to ${last}`,
    zone: (zone: string): string =>
      `Months use ${zone}, this browser's zone at import`,
    imported: (when: string, files: number): string =>
      `Imported ${when} from ${count('file')(files)}`,
    skipped: (name: string, reason: string): string =>
      `Skipped ${name}: ${reason}`,
    lastImport: 'Last import',
    howTo: 'How to get the file',
    theFile: 'The file',
    dropCompact: 'Choose my_spotify_data.zip or the JSON files inside it',
    drop: 'Drop my_spotify_data.zip here or choose a file',
    hint: 'The JSON files inside it work too.',
    unitFiles: 'files',
    lastError: (message: string): string => `Last error: ${message}`,
    step1: 'Open spotify.com/account/privacy and sign in.',
    step2Before: 'Under "Download your data", tick ',
    step2Strong: 'Extended streaming history',
    step2After: ' only, then request it.',
    step3: 'Confirm the email Spotify sends within 14 days.',
    step4:
      'When the "your data is ready" email arrives (hours to a few weeks), download my_spotify_data.zip to this device.',
    step5:
      'Pick that zip on this screen. Nothing is uploaded; the file is read here and only per-track play counts are kept.',
  },
  /** `src/history/importer.ts`: messages written on the page side. */
  importer: {
    cancelled: 'Import cancelled. Your existing history was kept.',
    replaceEmpty: (current: string): string =>
      `This import covers no plays at all; your current history covers ${current}. Replace it?`,
    replaceNarrower: (incoming: string, current: string): string =>
      `This import covers ${incoming}; your current history covers ${current}. Replace it?`,
    noFileRead: 'No file could be read.',
    noFileReadDetail: (detail: string): string =>
      `No file could be read: ${detail}`,
    workerStart: (error: string): string =>
      `Could not start the import worker: ${error}`,
    workerCrashed: 'Import worker crashed',
    whileReading: (reason: string, file: string): string =>
      `${reason} (while reading ${file})`,
    readingFiles: 'Reading files',
    accountData:
      'These files are the "Account data" package, which has no track ids. Request "Extended streaming history" instead: Spotify account, Privacy settings, Download your data.',
    noFiles:
      'No Streaming_History_Audio_*.json files found. Pick my_spotify_data.zip or the JSON files inside it.',
    skipNotArray: 'not a JSON array',
    skipUnreadable: (reason: string): string => `unreadable: ${reason}`,
  },
};
