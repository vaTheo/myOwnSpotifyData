/**
 * Fills the demo database before the library loads (spec 003, research D19).
 *
 * Reached only from `main.tsx` behind `import.meta.env.DEV` and
 * `demoVariant()`, so a production build holds none of it. The database is
 * the demo's own (`spotify-dj-demo`, see `repo.ts`), wiped and refilled on
 * every boot, so a variant never inherits another one's rows or metas.
 */
import type { Signal } from '@preact/signals';
import { auth } from '../auth/browser';
import { putMeta, putMix, replaceDataset, wipeDb } from '../db/repo';
import { MIX_JOBS_META, type AllRows } from '../db/schema';
import {
  banner,
  createPlaylistState,
  importState,
  likeState,
  lookupState,
  mixError,
  mixQueueNote,
  mixState,
  reachState,
  rekordboxState,
  serverLinkSent,
  serverSession,
  serverState,
  spotifyCheckState,
  syncState,
} from '../model/state';
import { buildDemo } from './demo';
import type { DemoIds, DemoVariant } from './flag';

const STORES: (keyof AllRows)[] = [
  'playlists',
  'tracks',
  'entries',
  'topItems',
  'plays',
  'features',
  'artistIdentity',
  'artistReach',
];

/**
 * The job and message signals a shots page may set to show a state that only
 * a live job would produce: a sync running, a like failing, a banner.
 */
const CONTROLLED: Record<string, Signal<unknown>> = {
  banner,
  createPlaylistState,
  importState,
  likeState,
  lookupState,
  mixError,
  /** The 'gone' note of a queue action (T122, ruling D4). */
  mixQueueNote,
  mixState,
  reachState,
  rekordboxState,
  serverLinkSent,
  serverSession,
  serverState,
  /** Check on Spotify mid-run or finished (S08c, T117). */
  spotifyCheckState,
  /** The Spotify session, to show the missing-scope warning. */
  spotifySession: auth.session,
  syncState,
} as Record<string, Signal<unknown>>;

export interface DemoControls {
  set(name: string, value: unknown): void;
  ids: DemoIds;
}

declare global {
  interface Window {
    __demo?: DemoControls;
  }
}

export async function installDemo(variant: DemoVariant): Promise<void> {
  const demo = buildDemo(variant, 1);
  await wipeDb();
  await replaceDataset(STORES, demo.rows, demo.metas);
  for (const mix of demo.mixes) await putMix(mix);
  if (Object.keys(demo.mixJobs).length > 0) {
    await putMeta(MIX_JOBS_META, demo.mixJobs);
  }
  const reached = new Set(demo.rows.artistReach.map((r) => r.artistId));
  window.__demo = {
    ids: {
      bigPlaylist: demo.rows.playlists[0]?.id ?? null,
      playlist: demo.rows.playlists[2]?.id ?? null,
      artist:
        demo.rows.tracks.find(
          (t) => t.artists[0].id !== null && reached.has(t.artists[0].id)
        )?.artists[0].id ?? null,
      track: demo.rows.plays[0]?.trackId ?? null,
      mix: demo.mixes[0]?.url ?? null,
    },
    set(name, value) {
      const target = CONTROLLED[name];
      if (!target) throw new Error(`No demo control named ${name}`);
      target.value = value;
    },
  };
}
