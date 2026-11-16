import { count, int } from './count';

const refusesOften = 'Shazam refuses often: a VPN or a shared network?';

/** The texts of Mix (`src/ui/mix`, `src/features/mix`). */
export const mix = {
  /** Words used on several Mix screens. */
  common: {
    cancel: 'Cancel',
    stop: 'Stop',
    stopping: 'Stopping…',
    askAgain: 'Ask again',
    lookUpAgain: 'Look up again',
    removeLink: 'Remove link',
    moreFor: (name: string): string => `More for ${name}`,
    mixes: 'Mixes',
  },
  /** The tracklist's columns, also the Sort select's choices. */
  columns: {
    time: 'Time',
    artist: 'Artist',
    title: 'Title',
    label: 'Label',
    evidence: 'Evidence',
    released: 'Released',
    spotify: 'Spotify',
    listen: 'Listen',
    review: 'Review',
    more: 'More',
  },
  /** `CreatePlaylistCard.tsx`. */
  create: {
    title: 'Create playlist',
    notFound: (n: number): string => `${int(n)} not found`,
    notFoundSongs: (n: number, tracks: number): string =>
      `${int(n)} not found (${count('track')(tracks)})`,
    busyElsewhere:
      'Create playlist is running for another mix: create this one once it ends.',
    willAdd: (n: number): string =>
      `${count('track')(n)} will be added, in set order.`,
    creatingButton: 'Creating playlist…',
    button: 'Create playlist from mix',
    nothing: 'No identified track to add yet.',
    needScope:
      'This app cannot create playlists yet — connect again to allow it. Your saved mixes stay on this browser.',
    connectAgain: 'Connect again to allow playlists',
    matching: 'Matching tracks',
    unit: 'tracks',
    creating: 'Creating the playlist…',
    adding: 'Adding tracks…',
    created: (name: string, added: number, total: number): string =>
      `Created ‘${name}’ — ${int(added)} of ${int(total)} tracks`,
    failed: (message: string): string =>
      `Could not create the playlist: ${message}`,
    playlistCreated: 'Playlist created ·',
    addedBefore: (added: number, total: number): string =>
      `Added ${int(added)} of ${int(total)} before the error.`,
  },
  /** `LinkForm.tsx`: a Spotify link pasted on a row. */
  rowLink: {
    label: 'Spotify track link',
    link: 'Link',
  },
  /** `MixDetail.tsx`. */
  detail: {
    shortLink:
      'This is a mobile share link, so the TrackId.net lookup could not be confirmed for it. The player and any tracklist in the description are shown below — or paste a tracklist. Identify on my computer works with this link. On a computer, open the mix and copy its full soundcloud.com/… link for a TrackId lookup.',
    fromTrackid: (n: number): string =>
      `From TrackId.net · ${count('track')(n)}`,
    identifiedShare: (pct: number): string => `${pct}% of the mix identified`,
    openTrackid: 'Open on TrackId.net ›',
    trackidEmpty: 'TrackId.net has this mix but identified no tracks yet ·',
    fromTracklistify: (n: number): string =>
      `From Tracklistify · ${count('track')(n)}`,
    fromComputer: (n: number): string =>
      `From your computer · ${count('track')(n)}`,
    fromComputerOn: (n: number, date: string): string =>
      `From your computer · ${count('track')(n)} · ${date}`,
    fromDescription: 'From the mix description',
    linkOut: 'The description links a full tracklist ·',
    nothingFound:
      "Nothing found automatically — paste a tracklist below, or read the player's comments.",
    trackidError: (message: string): string =>
      `TrackId.net could not be reached: ${message}`,
    oembedError: (message: string): string =>
      `The mix page could not be read: ${message}`,
    player: 'SoundCloud player',
    largerPlayer: 'Larger player',
    pasteLinkOnly:
      'That looks like a link to a tracklist, not a tracklist. Open it, copy the tracks, and paste them here.',
    pasteNone: 'No tracks found in that text.',
    paste: 'Paste a tracklist',
    pastePlaceholder: 'e.g. from MixesDB or a player comment',
    addTracks: 'Add these tracks',
    close: 'Close this mix',
    replace: 'Replace with the description tracklist',
  },
  /** `MixListPane.tsx`: the link field, the requests, the Mixes list. */
  pane: {
    linkPlaceholder:
      'Paste a mix link (SoundCloud, or any set for your computer)',
    lookingUp: 'Looking up…',
    lookUp: 'Look up',
    lookingUpMix: 'Looking up the mix…',
    notSoundcloud:
      'That is not a SoundCloud track link, so there is nothing to look up here. Any set link can still be sent to your computer with the button above.',
    earlier: (n: number): string => `Earlier requests (${int(n)})`,
    importLabel: 'Or import a Tracklistify tracklist.json',
    importHint: 'or drop it here',
    confirmRemove: 'Remove this saved mix?',
    moveToTop: 'Move to top',
    saved: (date: string): string => `saved ${date}`,
    remove: 'Remove',
    deleteForever: 'Delete forever',
    waiting: (n: number): string =>
      `${count('request')(n)} waiting or running · checked every minute.`,
    nothingWaiting: 'Nothing waiting.',
    checking: 'Checking…',
    checkNow: 'Check now',
    noSaved: 'No saved mixes yet.',
  },
  /** `MixListPane.tsx`, `WorkerHelp`: split around its links and code. */
  help: {
    summary: 'Run the worker on your computer',
    introBefore:
      'The worker takes the requests above, downloads the set, identifies it with Shazam and sends the tracklist back; the audio never leaves your computer. Download the file for your system from the latest',
    release: 'release',
    introAfterRelease:
      'and put it in a folder of its own. The first start writes',
    introAfterEnv: 'next to it: fill',
    and: 'and',
    introAfterKey:
      "(the same public values as the app's server), start again, type your email and click the mail's link on that computer. It then checks for requests every minute until you close it.",
    file: 'File',
    windows:
      '. Double-click it; on "Windows protected your PC", choose More info → Run anyway (the file is not signed).',
    macArm: '(Apple silicon: M1 and later) or',
    macIntel: '(Intel). In Terminal, in its folder:',
    macThen:
      ', then right-click it in Finder → Open the first time (unsigned), or run',
    linuxFolder: '. In a terminal, in its folder:',
    then: 'then',
    codeSummary: 'From the code (any system, Python 3.11–3.13 and uv)',
    codeCopy: ', copy',
    codeTo: 'to',
    codeFill: 'and fill the two values, then',
    vpn: `Don't run the worker on a VPN: Shazam counts calls per address, and a VPN's address is shared with many people, so it refuses often. If the phone says "${refusesOften}", turn the VPN off.`,
    youtube:
      'YouTube links also need Node or Deno installed on the computer; SoundCloud, Mixcloud and the others need nothing.',
    manual: 'Full manual ›',
  },
  /** `Workspace.tsx`. */
  workspace: {
    hasError: '(has an error)',
    notHere: 'This saved mix is not in this browser.',
    back: 'Back to your mixes',
    empty: 'Paste a link, import a JSON, or pick a saved mix',
  },
  /** `ReviewHead.tsx`, `features/mix/review.ts`, `spotifyCheck.ts`. */
  review: {
    busyOther:
      'Check on Spotify is reading another mix: check this one once it ends.',
    check: 'Check on Spotify',
    checked: (done: number, total: number): string =>
      `Checked ${int(done)} of ${int(total)}`,
    stopped: (line: string): string => `Stopped · ${line}`,
    line: (n: number, found: number, notFound: number): string =>
      `${int(n)} ${n === 1 ? 'track' : 'tracks'} · ${int(found)} on Spotify · ${int(notFound)} not found`,
    filterCaption:
      'Hidden, not deleted. Create playlist adds every identified track, not this filter.',
    chips: {
      all: 'All',
      notOnSpotify: 'Not on Spotify',
      heardOnce: 'Heard once',
      solid: 'Solid',
      flagged: 'Flagged',
    },
    chip: (label: string, n: number): string => `${label} (${int(n)})`,
  },
  /** `RunLine.tsx`. */
  run: {
    warnings: count('warning'),
  },
  /** `rowText.ts`: the words of one tracklist row. */
  row: {
    playOnSpotify: 'Play on Spotify',
    shazam: (track: string): string => `Shazam ${track}`,
    searchSoundcloud: (track: string): string =>
      `Search SoundCloud for ${track}`,
    secondListen: 'second listen',
    secondListenSpeed: (speed: string): string => `second listen · ${speed}`,
    fromDescription: 'from the description',
    fromChapter: 'from a chapter',
    fromComment: 'from a comment',
    fromTrackid: 'from TrackId.net',
    fromTrackidSpan: (start: string, end: string): string =>
      `from TrackId.net · ${start} to ${end}`,
    fromTrackidRefs: (start: string, end: string, refs: number): string =>
      `from TrackId.net · ${start} to ${end} · ${count('reference')(refs)}`,
    shazamAgrees: 'Shazam agrees',
    shazamNoMatch: 'Shazam: no match',
    shazamInstead: (artist: string, title: string): string =>
      `Shazam heard ${artist} - ${title} instead`,
    shazamElse: 'Shazam heard something else',
    heardBest: (hits: number, best: number): string =>
      `heard ${hits}× · best ${best} %`,
    match: (best: number): string => `${best}% match`,
    /** A speed with one decimal, `5.8`. */
    decimal: (x: number): string => x.toFixed(1),
    originalSpeed: 'played at original speed',
    faster: (pct: string): string => `played ${pct} % faster`,
    slower: (pct: string): string => `played ${pct} % slower`,
    level: {
      solid: 'Solid',
      once: 'Heard once',
      outOfStep: 'Out of step',
      candidates: 'Many candidates',
    },
    solidLong: 'Solid: the position in the track advances in step',
    solidHeard: (hits: number): string =>
      `Solid: heard ${hits}×, the position in the track advances in step`,
    outOfStepLong: 'Out of step: the position in the track jumps',
    outOfStepHeard: (hits: number): string =>
      `Out of step: heard ${hits}×, the position in the track jumps`,
    candidatesLong: (n: number): string =>
      `Many candidates: Shazam listed ${n} for this answer`,
    otherMixes: count('other mix', 'other mixes'),
    yearFrom: {
      shazam: 'from Shazam',
      catalogue: 'from the ISRC (Deezer or MusicBrainz)',
      spotify: 'from Spotify (Create playlist or Check on Spotify)',
    },
    year: (year: number, from: string): string => `${year}, ${from}`,
    wideDescription: (n: number): string =>
      `Tracklist from the description (${count('line')(n)}, no times)`,
    wideComments: (n: number): string =>
      `Tracklist from the comments (${count('line')(n)}, no times)`,
    gapClues: (n: number): string => `${count('clue')(n)} around here`,
  },
  /** `TracklistTable.tsx`. */
  table: {
    tracklist: 'Tracklist',
    inPlaylists: (n: number): string => `in ${count('playlist')(n)}`,
    notHeard: 'not heard',
    status: {
      unchecked: 'Not checked',
      found: 'On Spotify',
      notFound: 'Not found on Spotify',
    },
    linkTo: (name: string): string => `Link a Spotify track to ${name}`,
    notFoundLink: (name: string): string =>
      `Not found on Spotify: link a Spotify track to ${name}`,
    remove: (name: string): string => `Remove ${name}`,
    listenTo: (name: string): string => `Listen to ${name}`,
    edit: 'Edit',
    delete: 'Delete',
    searchSpotify: 'Search on Spotify',
    replaceLink: 'Replace link',
    listenMenu: 'Listen…',
    gap: 'ID · unidentified',
    deleteGap: 'Delete this gap',
    labelOptional: 'Label (optional)',
    timeOptional: 'Time (m:ss, optional)',
    save: 'Save',
    sort: 'Sort',
    setOrder: 'Set order',
    ascending: 'Ascending, tap for descending',
    descending: 'Descending, tap for ascending',
    decade: 'Decade',
    allDecades: 'All decades',
    addTrack: 'Add track',
    saved: 'Saved ✓',
    saveMix: 'Save mix',
  },
  /** `RowMenu.tsx`. */
  menu: {
    back: '‹ Back',
  },
  /** `features/mix/queue.ts`: the queue actions' outcomes. */
  queue: {
    migration:
      'Apply migration 0003 on the server to use Cancel, Move to top and Stop',
    taken: 'Already taken by your computer',
    finished: 'Already finished',
    unconfirmed:
      'The request had already moved on; Check now to see where it is',
    failure: (prefix: string, message: string): string =>
      `${prefix}: ${message}`,
  },
  /** `features/mix/mixList.ts`: the Mixes list's chips. */
  chip: {
    playlistMade: 'Playlist made',
    savedTracks: (n: number): string =>
      `Saved · ${int(n)} ${n === 1 ? 'track' : 'tracks'}`,
    saved: 'Saved',
    queued: 'Queued',
    stopping: 'Stopping…',
    paused: 'Paused',
    identifying: 'Identifying',
    failed: 'Failed',
    rejected: 'Rejected',
    found: 'Found tracks',
  },
  /** `features/mix/worker.ts`: the request's lines, the run line. */
  worker: {
    refusesOften,
    secondPass: (places: number, found: number): string =>
      `Second pass: ${places} ${places === 1 ? 'place' : 'places'} · ${found} found`,
    secondPassStopped: (places: number, found: number, why: string): string =>
      `Second pass: ${places} ${places === 1 ? 'place' : 'places'} · ${found} found · stopped (${why})`,
    resumed: (kept: number): string => `Resumed (${kept} clips kept)`,
    stoppedEarly: (at: string, reason: string): string =>
      `Stopped early at ${at} (${reason})`,
    ask: 'Identify on my computer',
    steps: {
      download: 'Downloading',
      first: 'First pass',
      clues: 'Reading the comments',
      send: 'Sending',
      paused: 'Paused by Shazam',
    },
    second: 'Second pass',
    secondAt: (rest: string): string => `Second pass ${rest}`,
    pausedUntil: (time: string): string => `Paused by Shazam until ${time}`,
    minutesLeft: (n: number): string => `about ${n} min left`,
    stale: (time: string): string =>
      `last news ${time}: the computer stopped sending news`,
    stoppingNote: 'stopping…',
    waiting: (when: string): string =>
      `Waiting for your computer since ${when}`,
    runningOn: (by: string, when: string): string =>
      `Running on ${by} since ${when}`,
    runningHere: (when: string): string =>
      `Running on your computer since ${when}`,
    rejected: 'Result rejected — ask again',
    done: (when: string): string => `Done ${when}`,
    doneNote: (when: string, note: string): string => `Done ${when} · ${note}`,
    failed: (when: string, reason: string): string =>
      `Failed ${when}: ${reason}`,
    failedNoReason: (when: string): string => `Failed ${when}: no reason given`,
    server: {
      unset: 'Server not set up (Settings)',
      signedOut: 'Sign in to the server (Settings)',
      offline: 'Server unreachable',
      paused: 'Server paused — resume it from the dashboard',
      syncing: 'Syncing with the server…',
    },
  },
  /** `features/mix/tracklistify.ts`, `oembed.ts`: read failures. */
  read: {
    notJson: 'That is not a JSON file.',
    notTracklistify: "That doesn't look like a Tracklistify tracklist.json.",
    noTracks: 'No tracks found in that file.',
    pageNotJson: 'the mix page was not readable JSON',
  },
};
