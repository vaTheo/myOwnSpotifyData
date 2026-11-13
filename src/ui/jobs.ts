import { PASS_RIDS, PASS_YEARS, type LookupState } from '../features/lookup';
import type { ReachState } from '../features/reachRun';
import type { RekordboxState } from '../features/rekordboxImport';
import type { ImportState } from '../history/importer';
import type {
  CreatePlaylistJob,
  LikeState,
  MixState,
  SpotifyCheckState,
} from '../model/state';
import { routeHref } from '../router';
import type { ServerStatus } from '../server/types';
import type { SectionId } from './settings/sections';
import type { SyncState } from '../sync/runner';

/** The job signals of `model/state.ts`, read and never written here. */
export interface JobStates {
  sync: SyncState;
  import: ImportState;
  lookup: LookupState;
  rekordbox: RekordboxState;
  reach: ReachState;
  server: ServerStatus;
  like: LikeState;
  createPlaylist: CreatePlaylistJob;
  mix: MixState;
  spotifyCheck: SpotifyCheckState;
}

export interface ActiveJob {
  id:
    | 'sync'
    | 'import'
    | 'lookup'
    | 'rekordbox'
    | 'reach'
    | 'server'
    | 'like'
    | 'createPlaylist'
    | 'spotifyCheck'
    | 'mixLookup';
  label: string;
  done: number | null;
  total: number | null;
  /** The screen or Settings section that owns the job. */
  href: string;
}

/**
 * A Settings job opens the item that shows it (spec 029, FR-017), not the
 * top of the page.
 */
function settingsItem(item: SectionId): string {
  return routeHref({ name: 'settings', item });
}
const MIX = routeHref({ name: 'mix' });

/**
 * Every running job, in a fixed order, for the activity button of the frame
 * (spec 003, FR-007, data-model §7). Derived from the job states, so it
 * cannot drift from what Settings shows; it starts, stops and retries
 * nothing.
 */
export function activeJobs(s: JobStates): ActiveJob[] {
  const jobs: ActiveJob[] = [];
  if (s.sync.status === 'running') {
    jobs.push({
      id: 'sync',
      label: 'Syncing playlists',
      done: s.sync.done,
      total: s.sync.total,
      href: settingsItem('sync'),
    });
  }
  if (s.import.status === 'running') {
    jobs.push({
      id: 'import',
      label: 'Importing history',
      done: s.import.index,
      total: s.import.total,
      href: routeHref({ name: 'import' }),
    });
  }
  if (s.lookup.status === 'running') {
    jobs.push({
      id: 'lookup',
      // The run's last passes date the songs (round 005; the id lookups
      // that prepare them count too).
      label:
        s.lookup.pass === PASS_YEARS || s.lookup.pass === PASS_RIDS
          ? 'Looking up release years'
          : 'Looking up BPM and key',
      done: s.lookup.done,
      total: s.lookup.total,
      href: settingsItem('audio'),
    });
  }
  if (s.rekordbox.status === 'running') {
    jobs.push({
      id: 'rekordbox',
      label: 'Importing Rekordbox',
      done: s.rekordbox.index,
      total: s.rekordbox.total,
      href: settingsItem('audio'),
    });
  }
  if (s.reach.status === 'running') {
    jobs.push({
      id: 'reach',
      label: 'Looking up artists',
      done: s.reach.done,
      total: s.reach.total,
      href: settingsItem('reach'),
    });
  }
  if (s.server.status === 'pushing' || s.server.status === 'pulling') {
    jobs.push({
      id: 'server',
      label:
        s.server.status === 'pushing'
          ? 'Saving to server'
          : 'Loading from server',
      done: s.server.done,
      total: s.server.total,
      href: settingsItem('server'),
    });
  }
  if (s.like.status === 'checking' || s.like.status === 'liking') {
    jobs.push({
      id: 'like',
      label: 'Liking songs',
      done: s.like.done,
      total: s.like.total,
      href: routeHref({ name: 'playlist', id: s.like.playlistId }),
    });
  }
  const create = s.createPlaylist;
  if (
    create.status === 'resolving' ||
    create.status === 'creating' ||
    create.status === 'adding'
  ) {
    jobs.push({
      id: 'createPlaylist',
      label: 'Creating playlist',
      done: create.status === 'resolving' ? create.done : null,
      total: create.status === 'resolving' ? create.total : null,
      href:
        create.mixUrl !== undefined
          ? routeHref({ name: 'mix', key: create.mixUrl })
          : MIX,
    });
  }
  // Check on Spotify reads Spotify for minutes (S13, FR-007): shown from
  // every screen, with a link back to its mix.
  if (s.spotifyCheck.status === 'running') {
    jobs.push({
      id: 'spotifyCheck',
      label: 'Checking on Spotify',
      done: s.spotifyCheck.done,
      total: s.spotifyCheck.total,
      href: routeHref({ name: 'mix', key: s.spotifyCheck.url }),
    });
  }
  if (s.mix.status === 'looking') {
    jobs.push({
      id: 'mixLookup',
      label: 'Looking up mix',
      done: null,
      total: null,
      href: MIX,
    });
  }
  return jobs;
}
