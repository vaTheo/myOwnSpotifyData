/** The texts of the texts built below the UI: `src/model`, `src/sync`, `src/spotify`, `src/auth`. */
export const core = {
  /** The Spotify account of a sync or a Connect (`sync/runner.ts`, `model/state.ts`). */
  account: {
    switchConfirm:
      'This is a different Spotify account. Delete all local data for the previous account?',
    switchNotice:
      'Signed in as a different Spotify account — local data for the previous account was cleared.',
    switchStopped:
      'Sync stopped — a different Spotify account is signed in and the local data was kept.',
    mismatchNotice:
      'Signed in as a different Spotify account. Sync now to switch; local data is kept until you confirm.',
    readFailed: (error: string): string =>
      `Could not read the Spotify account: ${error}`,
  },
  /** The sync job (`sync/runner.ts`). */
  sync: {
    offline: 'Offline, showing cached data.',
    spotifyError: (status: number, message: string): string =>
      `Spotify error ${status}: ${message}`,
    storageFull:
      'Local storage is full. Free space on the phone and try again.',
    saveStateFailed: (error: string): string =>
      `Could not save sync state: ${error}`,
    noItems: 'Playlist items response had no items',
    fieldsStripped:
      'Could not read playlist items: the fields filter returned no playable objects',
    readItemsFailed: 'Could not read playlist items',
    /** The step the progress line names. */
    stepProfile: 'Profile',
    stepTop: 'Top tracks and artists',
    stepPlaylists: 'Playlists',
  },
  /** The Spotify client and its errors (`spotify/client.ts`, `spotify/errors.ts`). */
  spotify: {
    notAllowlisted:
      "This Spotify account is not in the app's user list. Add it in the Spotify developer dashboard under User Management.",
    quotaReached: 'Spotify quota reached',
    networkError: (reason: string): string => `Network error: ${reason}`,
    rateLimited: 'Rate limited too many times in a row',
    serverError: (status: number): string => `Spotify server error ${status}`,
    error: (status: number): string => `Spotify error ${status}`,
  },
  /** The quota lock-out and one reader at a time (`spotify/quotaLock.ts`). */
  quota: {
    /** The refusal while the lock holds; `at` is the lock's end, formatted. */
    held: {
      sync: (at: string): string =>
        `Spotify quota reached. Sync again after ${at}.`,
      check: (at: string): string =>
        `Spotify quota reached. Check again after ${at}.`,
      create: (at: string): string =>
        `Spotify quota reached. Try again after ${at}.`,
      like: (at: string): string =>
        `Spotify quota reached. Try again after ${at}.`,
      account: (at: string): string =>
        `Spotify quota reached. Sync again after ${at}.`,
    },
    /** The reader already running, the subject of `busy`. */
    readerName: {
      sync: 'A sync',
      check: 'Check on Spotify',
      create: 'Create playlist',
      like: 'Like all songs',
    },
    /** The refusal while another reader runs; `name` is a `readerName`. */
    busy: {
      sync: (name: string): string =>
        `${name} is reading Spotify: sync once it ends.`,
      check: (name: string): string =>
        `${name} is reading Spotify: check once it ends.`,
      create: (name: string): string =>
        `${name} is reading Spotify: create the playlist once it ends.`,
      like: (name: string): string =>
        `${name} is reading Spotify: like the songs once it ends.`,
      account: (name: string): string =>
        `${name} is reading Spotify: connect once it ends.`,
    },
  },
  /** The Spotify login (`auth/session.ts`, `auth/pkce.ts`). */
  auth: {
    noClientId:
      'VITE_SPOTIFY_CLIENT_ID is not set. Add it to .env locally, or to the repository secret for the deployed site.',
    refused: (error: string): string => `Spotify refused the login: ${error}`,
    otherBrowser:
      'This login was started in another browser. Start again from here.',
    stateMismatch: 'Login state mismatch. Start again.',
    noRefreshToken: 'Spotify did not return a refresh token.',
    notConnected: 'Not connected to Spotify.',
    expired:
      'Spotify login expired (refresh tokens last six months). Connect again.',
    tokenFailed: (status: number): string =>
      `Token request failed with status ${status}`,
  },
  /** The owner's server and the identify requests (`model/state.ts`). */
  server: {
    pendingReadFailed: (error: string): string =>
      `Could not read the changes waiting to send: ${error}`,
    removeConfirm:
      'Remove all your data from the server? Local data on this browser is kept.',
    signedOut: (message: string): string =>
      `Signed out of the server: ${message}`,
    signOutBusy: 'Wait for the current job to finish before signing out.',
    signOutPush: 'Wait for the current sync to finish before signing out.',
    signOutFailed: (error: string): string =>
      `Could not sign out on this device: ${error}`,
    removeBusy:
      'Wait for the current job to finish before removing server data.',
    noUser:
      'This sign-in did not say which account it is. Send yourself a new link.',
    recordUserFailed: (error: string): string =>
      `Could not record who is signed in on this device: ${error}`,
    signInFirst: 'Sign in to the server (Settings)',
    reachFailed: (message: string): string =>
      `Could not reach the server: ${message}`,
    recordRequestFailed: (message: string): string =>
      `Could not record the request: ${message}`,
    recordedNotHere: (error: string): string =>
      `The request is recorded on the server but not here: ${error}`,
    alreadyRequested:
      'Already requested. Your computer takes it the next time the worker runs.',
    notRequestLink:
      'That is not a link the worker can take: paste an https link to the set.',
    readRequestsFailed: (error: string): string =>
      `Could not read your requests: ${error}`,
    cancelConfirm:
      'Cancel this request? It leaves the queue; you can ask again later.',
    stopConfirm:
      'Stop this scan? The computer ends it within about a minute and keeps the tracks found so far.',
    cancelFailed: 'Could not cancel the request',
    moveFailed: 'Could not move the request',
    stopFailed: 'Could not stop the scan',
  },
  /** The local library and its storage (`model/state.ts`). */
  library: {
    crateNotice: 'The new Crate views need your history imported again.',
    openStorageFailed: (error: string): string =>
      `Could not open local storage: ${error}`,
    disconnectBusy:
      'Wait for the current sync, history import, lookup, Rekordbox import or artist lookup to finish before disconnecting.',
    deleteLocalFailed: (error: string): string =>
      `Could not delete local data: ${error}`,
  },
  /** The Mix screen's jobs (`model/state.ts`). */
  mix: {
    notALink:
      "That is not a SoundCloud track link. Paste the link to the mix's page.",
    replaceDescription:
      'Replace your edited tracklist with the one from the description?',
    replacePasted: 'Replace your edited tracklist with the pasted tracks?',
    replaceLookup:
      'Looking up again replaces the current tracklist, including your edits. Continue?',
    replaceTracklistify:
      'Importing this file replaces the current tracklist, including your edits. Continue?',
    readFileFailed: (error: string): string =>
      `Could not read that file: ${error}`,
    linkEmpty: 'Paste a Spotify track link.',
    linkRefused: 'That is not a Spotify track link.',
    linkUnnamed: 'This row has no track name to link.',
    readSavedFailed: (error: string): string =>
      `Could not read your saved mixes: ${error}`,
    saveFailed: (error: string): string => `Could not save the mix: ${error}`,
    connectFirst: 'Connect to Spotify first (Settings), then check.',
    checkFailed: (error: string): string =>
      `Could not check on Spotify: ${error}`,
    removeFailed: (error: string): string =>
      `Could not remove the mix: ${error}`,
    deleteConfirm:
      "Delete this mix forever? Its saved tracks and request history are removed and can't be restored.",
    deleteFailed: 'Could not delete the mix',
  },
};
