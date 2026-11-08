/**
 * The shared track facts port (round 014, ADR-15): types only, so the
 * lookup and reach runs depend on this shape and never on `src/server/`.
 * The implementation is `server/sharedFacts.ts`; an absent port means no
 * call and no `shared` field anywhere (the app works without the server).
 */

export type PortResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

/** A public track fact: BPM and key as ReccoBeats answered, nothing personal. */
export interface SharedTrackFact {
  trackId: string;
  bpm: number | null;
  /** Pitch class 0..11, C = 0. */
  key: number | null;
  /** Only ever set together with `key`. */
  major: boolean | null;
}

/** One artist's listeners (ListenBrainz) or fans (Deezer) on a day. */
export interface SharedReachFact {
  artistId: string;
  source: 'listenbrainz' | 'deezer';
  value: number;
  /** Epoch ms at 00:00 UTC of the day measured. */
  measuredAt: number;
}

/** What a run took from and gave to the shared store, for Settings. */
export interface SharedRunNote {
  fromStore: number;
  sent: number;
  error: string | null;
}

export interface SharedFactsPort {
  /** At most 200 ids per call; the caller chunks. */
  readTracks(ids: string[]): Promise<PortResult<SharedTrackFact[]>>;
  /** The number of rows sent. */
  shareTracks(rows: SharedTrackFact[]): Promise<PortResult<number>>;
  readReach(ids: string[]): Promise<PortResult<SharedReachFact[]>>;
  shareReach(rows: SharedReachFact[]): Promise<PortResult<number>>;
}
