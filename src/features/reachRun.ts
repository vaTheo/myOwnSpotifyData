import { putIdentities, putMeta, putReach } from '../db/repo';
import { reachKey } from '../db/schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  ReachSource,
  ResolveStatus,
  TrackRow,
} from '../db/schema';
import type { Model } from '../model/aggregate';
import { isWellKnown, type ReachCoverage } from '../model/reach';
import { storageMessage } from '../util/errors';
import { candidateIsrcs, fetchDeezerFans, resolveDeezerArtist } from './deezer';
import { LB_INTERVAL_MS, fetchListeners, listenersUrl } from './listenbrainz';
import { fetchMbid } from './musicbrainz';
import {
  needsWikidata,
  resolveByMbid,
  resolveBySpotifyId,
  wikidataBatches,
  type WikidataHit,
} from './wikidata';
import { WIKIPEDIA_INTERVAL_MS, fetchPageviews } from './wikipedia';

export const ARTIST_REACH_SUMMARY_META = 'artistReachSummary';

/** Numbers, sitelink counts and titles come back after ninety days. */
export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;

/** Three consecutive failures pause one source for the rest of the run. */
export const MAX_SOURCE_FAILURES = 3;

/**
 * The five phases. `ReachSource` is the subset that produces a stored number
 * and is what `ArtistReachRow.source` holds; MusicBrainz and Wikidata resolve
 * identities, and both can pause, which is why `paused` carries this union
 * and not the narrower one.
 */
export type ReachStep = ReachSource | 'musicbrainz' | 'wikidata';

/**
 * Written at the end of every run, including one that failed or paused every
 * source: `version === 1` is the gate every reach screen reads, so a first run
 * that wrote rows and then failed must still open it. Every count describes
 * the whole store at `ranAt`, not the run's own work — which is why it extends
 * `ReachCoverage`, the same field list the live Settings line computes.
 */
export interface ArtistReachSummary extends ReachCoverage {
  version: 1;
  ranAt: number;
  /** Sources that gave up mid-run. */
  paused: ReachStep[];
}

/** What this run did, as opposed to what the store holds. */
export interface ReachRunCounts {
  /** Artists this run issued at least one request for, in any phase. */
  lookedUp: number;
  /** `ok` reach rows written this run. */
  written: number;
  /** Artists that ended the run with no `ok` row in any source. */
  unresolved: number;
}

export type ReachState =
  | { status: 'idle' }
  | {
      status: 'running';
      step: ReachStep;
      done: number;
      total: number;
      /** Sources that gave up; the card names them while the run continues. */
      paused: ReachStep[];
    }
  | {
      status: 'done';
      summary: ArtistReachSummary;
      run: ReachRunCounts;
      paused: ReachStep[];
    }
  | { status: 'error'; message: string; paused: ReachStep[] };

export interface ReachDeps {
  fetchFn: typeof fetch;
  /** Injected so the JSONP path is testable without a DOM. */
  jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onState: (state: ReachState) => void;
  /** Optional: the run is long enough that the screen must stay awake. */
  acquireWakeLock?: () => Promise<() => Promise<void>>;
}

export interface ReachCandidate {
  artistId: string;
  name: string;
  /** ISRCs of tracks credited to this artist alone, sorted, deduped. */
  isrcs: string[];
}

/**
 * Every artist in `model.artists` with a Spotify id. The ISRCs come from
 * `candidateIsrcs`, so spec §3.3's single-artist rule is written once: a
 * collaboration can never lend Deezer the wrong entity.
 */
export function reachCandidates(model: Model): ReachCandidate[] {
  const out: ReachCandidate[] = [];
  for (const agg of model.artists) {
    const artistId = agg.id;
    if (artistId === null) continue;
    const tracks: TrackRow[] = [];
    for (const trackKey of agg.trackKeys) {
      const track = model.tracksByKey.get(trackKey);
      if (track) tracks.push(track);
    }
    out.push({
      artistId,
      name: agg.name,
      isrcs: candidateIsrcs(artistId, tracks),
    });
  }
  return out;
}

/**
 * Manual, resumable and checkpointed: every row is written as it resolves, so
 * a run that stops loses nothing. Never throws — a failure ends in the error
 * state, and the summary is written on that path too.
 */
export async function runReach(
  deps: ReachDeps,
  candidates: ReachCandidate[],
  identities: ArtistIdentityRow[],
  reach: ArtistReachRow[]
): Promise<void> {
  // The run threads its own writes: later phases read what earlier phases
  // wrote without a model reload. The arrays are the starting point only.
  const idRows = new Map(identities.map((row) => [row.artistId, row]));
  // Freshness for the MBID and Deezer steps is judged against the row as the
  // run found it. One row carries three steps and a single `resolvedAt`, so a
  // MusicBrainz write earlier in the same run must not make a later step's
  // clock — or another step's `retryAfter` gate — look fresh.
  const startRows = new Map(identities.map((row) => [row.artistId, row]));
  const reachRows = new Map(reach.map((row) => [row.key, row]));
  const startedAt = deps.now();
  const paused: ReachStep[] = [];
  const lookedUp = new Set<string>();
  let written = 0;
  let step: ReachStep = 'musicbrainz';
  let done = 0;
  let total = 0;
  let failures = 0;

  function running(): void {
    deps.onState({ status: 'running', step, done, total, paused: [...paused] });
  }

  function begin(next: ReachStep, count: number): void {
    step = next;
    done = 0;
    total = count;
    failures = 0;
    running();
  }

  function advance(): void {
    done += 1;
    running();
  }

  /** Counts a source's answer and reports whether the phase must stop. */
  function record(ok: boolean): boolean {
    if (ok) {
      failures = 0;
      return false;
    }
    failures += 1;
    if (failures < MAX_SOURCE_FAILURES) return false;
    paused.push(step);
    return true;
  }

  /** The 1-day floor, or the longer wait the source named. */
  function retryAt(namedMs: number | null): number {
    return startedAt + Math.max(REACH_RETRY_LATER_TTL_MS, namedMs ?? 0);
  }

  /** The refresh table: `ok` 90 days, `notFound` 30, `retryLater` its gate. */
  function isDue(
    status: ResolveStatus | undefined,
    clock: number,
    retryAfter: number | null
  ): boolean {
    if (status === 'ok') return startedAt - clock >= REACH_TTL_MS;
    if (status === 'notFound') {
      return startedAt - clock >= REACH_NOT_FOUND_TTL_MS;
    }
    if (status === 'retryLater') {
      return retryAfter === null || startedAt >= retryAfter;
    }
    return true;
  }

  function identityOf(candidate: ReachCandidate): ArtistIdentityRow {
    const row = idRows.get(candidate.artistId);
    // The Spotify name is refreshed on every write: it is what the sources
    // are checked against.
    if (row) return { ...row, name: candidate.name };
    return {
      artistId: candidate.artistId,
      name: candidate.name,
      mbid: null,
      mbidStatus: 'unchecked',
      qid: null,
      qidStatus: 'unchecked',
      qidCheckedAt: null,
      sitelinks: null,
      wikiTitles: { en: null, fr: null },
      deezerArtistId: null,
      deezerName: null,
      deezerStatus: 'unchecked',
      resolvedAt: 0,
      retryAfter: null,
    };
  }

  async function writeIdentity(
    row: ArtistIdentityRow,
    patch: Partial<ArtistIdentityRow>,
    retryAfter?: number
  ): Promise<void> {
    const next: ArtistIdentityRow = {
      ...row,
      ...patch,
      resolvedAt: startedAt,
      // A `retryLater` step is the field's only writer, so an `ok` or
      // `notFound` step leaves another step's gate exactly as it was.
      retryAfter: retryAfter ?? row.retryAfter,
    };
    // Persisted before the map is updated, so the run's own view of the
    // store can never be ahead of what IndexedDB actually holds.
    await putIdentities([next]);
    idRows.set(next.artistId, next);
  }

  async function writeReach(row: ArtistReachRow): Promise<void> {
    await putReach([row]);
    reachRows.set(row.key, row);
    if (row.status === 'ok') written += 1;
  }

  function reachDue(artistId: string, source: ReachSource): boolean {
    const row = reachRows.get(reachKey(artistId, source));
    return isDue(row?.status, row?.fetchedAt ?? 0, row?.retryAfter ?? null);
  }

  async function musicbrainzPhase(): Promise<void> {
    const todo = candidates.filter((candidate) => {
      const row = startRows.get(candidate.artistId);
      if (row === undefined) return true;
      // An MBID never changes, so an `ok` row is never asked again.
      if (row.mbidStatus === 'ok') return false;
      return isDue(row.mbidStatus, row.resolvedAt, row.retryAfter);
    });
    begin('musicbrainz', todo.length);
    for (const candidate of todo) {
      const row = identityOf(candidate);
      // The client sleeps MB_INTERVAL_MS before every attempt of its own.
      const result = await fetchMbid(candidate.artistId, deps);
      lookedUp.add(candidate.artistId);
      if (result.status === 'ok') {
        await writeIdentity(row, { mbid: result.mbid, mbidStatus: 'ok' });
      } else if (result.status === 'notFound') {
        await writeIdentity(row, { mbidStatus: 'notFound' });
      } else {
        await writeIdentity(row, { mbidStatus: 'retryLater' }, retryAt(null));
      }
      advance();
      if (record(result.status !== 'retryLater')) return;
    }
  }

  async function listenbrainzPhase(): Promise<void> {
    const todo = candidates.filter((candidate) => {
      const mbid = idRows.get(candidate.artistId)?.mbid ?? null;
      return mbid !== null && reachDue(candidate.artistId, 'listenbrainz');
    });
    begin('listenbrainz', todo.length);
    for (const [index, candidate] of todo.entries()) {
      const mbid = idRows.get(candidate.artistId)?.mbid;
      if (mbid == null) continue;
      // One request per second: this client sleeps only for its own retries,
      // so the pace between artists is the run's to keep (spec §4.3).
      await deps.sleep(LB_INTERVAL_MS);
      const result = await fetchListeners(mbid, candidate.name, deps);
      lookedUp.add(candidate.artistId);
      const base = {
        key: reachKey(candidate.artistId, 'listenbrainz'),
        artistId: candidate.artistId,
        source: 'listenbrainz' as const,
        fetchedAt: startedAt,
        sourceUrl: listenersUrl(mbid),
      };
      if (result.status === 'retryLater') {
        const after = retryAt(result.pauseForMs ?? null);
        await writeReach({
          ...base,
          status: 'retryLater',
          value: null,
          retryAfter: after,
        });
        advance();
        if (result.pauseForMs !== undefined) {
          // The source named a wait longer than a minute. Pause it, and stamp
          // every artist still owed a request so the next run does not ask
          // before ListenBrainz said it would answer.
          paused.push('listenbrainz');
          for (const rest of todo.slice(index + 1)) {
            const restMbid = idRows.get(rest.artistId)?.mbid;
            if (restMbid == null) continue;
            await writeReach({
              key: reachKey(rest.artistId, 'listenbrainz'),
              artistId: rest.artistId,
              source: 'listenbrainz',
              status: 'retryLater',
              value: null,
              fetchedAt: startedAt,
              retryAfter: after,
              sourceUrl: listenersUrl(restMbid),
            });
          }
          return;
        }
        if (record(false)) return;
        continue;
      }
      await writeReach({
        ...base,
        status: result.status,
        value: result.value,
        ...(result.listens === null
          ? {}
          : { extra: { listens: result.listens } }),
        retryAfter: null,
      });
      advance();
      record(true);
    }
  }

  async function deezerPhase(): Promise<void> {
    function needsId(row: ArtistIdentityRow | undefined): boolean {
      if (row === undefined) return true;
      // A Deezer artist id is permanent once found.
      if (row.deezerStatus === 'ok') return false;
      return isDue(row.deezerStatus, row.resolvedAt, row.retryAfter);
    }
    const todo = candidates.filter((candidate) => {
      const hasId =
        (idRows.get(candidate.artistId)?.deezerArtistId ?? null) !== null;
      return (
        needsId(startRows.get(candidate.artistId)) ||
        (hasId && reachDue(candidate.artistId, 'deezer'))
      );
    });
    begin('deezer', todo.length);
    for (const candidate of todo) {
      const row = identityOf(candidate);
      let artistId = row.deezerArtistId;
      if (artistId === null && needsId(startRows.get(candidate.artistId))) {
        if (candidate.isrcs.length === 0) {
          // No single-artist ISRC: there is nothing to ask, and a number from
          // a collaboration would be worse than none.
          await writeIdentity(row, { deezerStatus: 'notFound' });
          advance();
          continue;
        }
        // The client sleeps DEEZER_INTERVAL_MS before each of its requests
        // and caps the candidate list at MAX_ISRC_CANDIDATES.
        const match = await resolveDeezerArtist(
          candidate.name,
          candidate.isrcs,
          deps
        );
        lookedUp.add(candidate.artistId);
        if (match.status === 'retryLater') {
          await writeIdentity(
            row,
            { deezerStatus: 'retryLater' },
            retryAt(null)
          );
          advance();
          if (record(false)) return;
          continue;
        }
        if (match.status === 'ok') {
          await writeIdentity(row, {
            deezerArtistId: match.artistId,
            deezerName: match.name,
            deezerStatus: 'ok',
          });
          artistId = match.artistId;
        } else {
          await writeIdentity(row, { deezerStatus: 'notFound' });
        }
        record(true);
      }
      if (artistId === null || !reachDue(candidate.artistId, 'deezer')) {
        advance();
        continue;
      }
      const fans = await fetchDeezerFans(artistId, deps);
      lookedUp.add(candidate.artistId);
      await writeReach({
        key: reachKey(candidate.artistId, 'deezer'),
        artistId: candidate.artistId,
        source: 'deezer',
        status: fans.status,
        value: fans.status === 'ok' ? fans.fans : null,
        fetchedAt: startedAt,
        retryAfter: fans.status === 'retryLater' ? retryAt(null) : null,
        sourceUrl: fans.sourceUrl,
      });
      advance();
      if (record(fans.status !== 'retryLater')) return;
    }
  }

  async function wikidataPhase(): Promise<void> {
    async function keep(
      candidate: ReachCandidate,
      hit: WikidataHit
    ): Promise<void> {
      await writeIdentity(identityOf(candidate), {
        qid: hit.qid,
        qidStatus: 'ok',
        qidCheckedAt: startedAt,
        sitelinks: hit.sitelinks,
        wikiTitles: hit.wikiTitles,
      });
    }
    async function miss(candidate: ReachCandidate): Promise<void> {
      const row = identityOf(candidate);
      // A QID is permanent: a miss on a refresh only restarts the clock.
      if (row.qid !== null) {
        return writeIdentity(row, { qidCheckedAt: startedAt });
      }
      return writeIdentity(row, {
        qidStatus: 'notFound',
        qidCheckedAt: startedAt,
      });
    }

    const byId = new Map(candidates.map((c) => [c.artistId, c]));
    // `ok` is included past ninety days: the sitelink count is the whole
    // well-known rule, so a new article must be able to move an artist.
    const pass1 = candidates.filter((candidate) =>
      needsWikidata(startRows.get(candidate.artistId), startedAt, {
        okMs: REACH_TTL_MS,
        notFoundMs: REACH_NOT_FOUND_TTL_MS,
      })
    );
    const batches = wikidataBatches(pass1.map((c) => c.artistId));
    begin('wikidata', batches.length);
    const missed: ReachCandidate[] = [];
    for (const ids of batches) {
      const batch = await resolveBySpotifyId(ids, deps);
      for (const id of ids) lookedUp.add(id);
      if (batch.status !== 'ok') {
        // The whole batch stays `unchecked`, so the next run asks again.
        advance();
        if (record(false)) return;
        continue;
      }
      for (const id of ids) {
        const candidate = byId.get(id);
        if (!candidate) continue;
        // An id bound to two items is absent from `hits`, so it reads as a
        // miss here and is never promoted on evidence the app cannot resolve.
        const hit = batch.hits.get(id);
        if (hit) {
          await keep(candidate, hit);
        } else if ((idRows.get(id)?.mbid ?? null) !== null) {
          missed.push(candidate);
        } else {
          await miss(candidate);
        }
      }
      advance();
      record(true);
    }

    const byMbid = new Map<string, ReachCandidate[]>();
    for (const candidate of missed) {
      const mbid = idRows.get(candidate.artistId)?.mbid;
      if (mbid == null) continue;
      byMbid.set(mbid, [...(byMbid.get(mbid) ?? []), candidate]);
    }
    const pass2 = wikidataBatches([...byMbid.keys()]);
    if (pass2.length === 0) return;
    // The second pass's batch count is unknown until the first has missed.
    total += pass2.length;
    running();
    for (const mbids of pass2) {
      const batch = await resolveByMbid(mbids, deps);
      if (batch.status !== 'ok') {
        advance();
        if (record(false)) return;
        continue;
      }
      for (const mbid of mbids) {
        const hit = batch.hits.get(mbid);
        for (const candidate of byMbid.get(mbid) ?? []) {
          if (hit) await keep(candidate, hit);
          else await miss(candidate);
        }
      }
      advance();
      record(true);
    }
  }

  async function wikipediaPhase(): Promise<void> {
    function titlesOf(artistId: string): {
      en: string | null;
      fr: string | null;
    } {
      return idRows.get(artistId)?.wikiTitles ?? { en: null, fr: null };
    }
    const todo = candidates.filter((candidate) => {
      const titles = titlesOf(candidate.artistId);
      if (titles.en === null && titles.fr === null) return false;
      return reachDue(candidate.artistId, 'wikipedia');
    });
    begin('wikipedia', todo.length);
    for (const candidate of todo) {
      // The client paces its own two language requests; between artists the
      // pace is the run's (spec §4.4).
      await deps.sleep(WIKIPEDIA_INTERVAL_MS);
      const views = await fetchPageviews(titlesOf(candidate.artistId), deps);
      lookedUp.add(candidate.artistId);
      const extra: ArtistReachRow['extra'] = { months: views.months };
      if (views.en !== null) extra.en = views.en;
      if (views.fr !== null) extra.fr = views.fr;
      await writeReach({
        key: reachKey(candidate.artistId, 'wikipedia'),
        artistId: candidate.artistId,
        source: 'wikipedia',
        status: views.status,
        value: views.value,
        ...(views.status === 'ok' ? { extra } : {}),
        fetchedAt: startedAt,
        retryAfter: views.status === 'retryLater' ? retryAt(null) : null,
        sourceUrl: views.sourceUrl,
      });
      advance();
      if (record(views.status !== 'retryLater')) return;
    }
  }

  /** Every count describes the whole store at `ranAt`, not the run's work. */
  function summarise(): ArtistReachSummary {
    let covered = 0;
    for (const candidate of candidates) {
      const sources: ReachSource[] = ['listenbrainz', 'deezer', 'wikipedia'];
      const any = sources.some(
        (source) =>
          reachRows.get(reachKey(candidate.artistId, source))?.status === 'ok'
      );
      if (any) covered += 1;
    }
    let resolved = 0;
    let wikipedia = 0;
    let wellKnown = 0;
    for (const row of idRows.values()) {
      if (row.mbid !== null) resolved += 1;
      if (row.wikiTitles.en !== null || row.wikiTitles.fr !== null) {
        wikipedia += 1;
      }
      if (isWellKnown(row)) wellKnown += 1;
    }
    let listenbrainz = 0;
    let deezer = 0;
    for (const row of reachRows.values()) {
      if (row.status !== 'ok') continue;
      if (row.source === 'listenbrainz') listenbrainz += 1;
      if (row.source === 'deezer') deezer += 1;
    }
    return {
      version: 1,
      ranAt: startedAt,
      artists: candidates.length,
      covered,
      resolved,
      listenbrainz,
      deezer,
      wikipedia,
      wellKnown,
      paused: [...paused],
    };
  }

  async function finish(): Promise<ArtistReachSummary> {
    const summary = summarise();
    await putMeta(ARTIST_REACH_SUMMARY_META, summary);
    return summary;
  }

  const release = deps.acquireWakeLock
    ? await deps.acquireWakeLock().catch(() => null)
    : null;
  try {
    await musicbrainzPhase();
    await listenbrainzPhase();
    await deezerPhase();
    await wikidataPhase();
    await wikipediaPhase();
    const summary = await finish();
    deps.onState({
      status: 'done',
      summary,
      run: {
        lookedUp: lookedUp.size,
        written,
        unresolved: summary.artists - summary.covered,
      },
      paused: [...paused],
    });
  } catch (err) {
    const message = storageMessage(err);
    try {
      // The gate is this record: a first run that wrote a few hundred rows
      // and then failed must not leave the pre-run card on screen.
      await finish();
    } catch {
      // The run's own message is already on its way to the screen.
    }
    deps.onState({ status: 'error', message, paused: [...paused] });
  } finally {
    if (release) await release().catch(() => undefined);
  }
}
