import { describe, expect, it } from 'vitest';
import { buildModel } from '../model/aggregate';
import {
  classics,
  finishRate,
  forgottenGems,
  heavyRotation,
} from '../model/crate';
import type { MixJobView } from '../db/schema';
import { evidenceLevel } from '../features/mix/evidence';
import { jobView } from '../features/mix/worker';
import { validateMix } from '../server/validate';
import { DEMO_NOW, buildDemo } from './demo';

const full = buildDemo('full', 1);

function iso(ms: number | null | undefined): string | null {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

/** A request as the server would send it, from the view the demo stores. */
function serverRow(url: string, v: MixJobView): Record<string, unknown> {
  const p = v.progress;
  return {
    id: v.id,
    payload: { url },
    status: v.status,
    claimed_by: v.claimedBy,
    claimed_at: iso(v.claimedAt),
    finished_at: iso(v.finishedAt),
    error: v.error,
    created_at: iso(v.createdAt),
    applied_at: iso(v.appliedAt),
    progress: p
      ? {
          step: p.step,
          done: p.done,
          total: p.total,
          percent: p.percent,
          minutes_left: p.minutesLeft,
          paused_until: iso(p.pausedUntil),
          warning: p.warning,
          at: iso(p.at),
        }
      : null,
    priority: v.priority ?? 0,
    stop_requested_at: iso(v.stopRequestedAt),
  };
}

/** Every string anywhere in a value. */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value))
    return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) =>
      strings(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}

describe('buildDemo Mix (T128)', () => {
  it('seeds mixes that pass validateMix', () => {
    for (const mix of full.mixes) expect(validateMix(mix).ok).toBe(true);
  });

  it('seeds requests that pass jobView unchanged', () => {
    for (const [url, history] of Object.entries(full.mixJobs)) {
      for (const v of history) {
        // `rejected` is this browser's own flag, never on the server.
        const server: MixJobView = { ...v };
        delete server.rejected;
        expect(jobView(serverRow(url, v))).toEqual(server);
      }
    }
  });

  it('covers every request state the Mixes list shows', () => {
    const latest = Object.values(full.mixJobs).map((h) => h[0]);
    const running = latest.filter((v) => v.status === 'claimed');
    const steps = running.map((v) => v.progress?.step);
    expect(steps).toEqual(
      expect.arrayContaining(['first', 'second ×1.04', 'paused'])
    );
    expect(running.some((v) => v.progress?.minutesLeft !== null)).toBe(true);
    expect(
      running.some(
        (v) => v.progress?.at != null && DEMO_NOW - v.progress.at > 600_000
      )
    ).toBe(true);
    expect(running.some((v) => v.stopRequestedAt != null)).toBe(true);
    const queued = latest
      .filter((v) => v.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);
    expect(queued).toHaveLength(2);
    expect(queued[1].priority ?? 0).toBeGreaterThan(queued[0].priority ?? 0);
    expect(latest.some((v) => v.status === 'failed')).toBe(true);
    expect(
      latest.some((v) => v.status === 'done' && v.error?.startsWith('Stopped'))
    ).toBe(true);
    expect(
      latest.some(
        (v) => v.status === 'done' && v.appliedAt === null && !v.rejected
      )
    ).toBe(true);
  });

  it('seeds the round 003–004 rows', () => {
    const rows = full.mixes.flatMap((m) => m.rows);
    expect(rows.some((r) => r.speedPercent === 4)).toBe(true);
    expect(rows.some((r) => r.speedPercent === -4)).toBe(true);
    expect(rows.some((r) => r.origin === 'clue' && r.clue)).toBe(true);
    expect(rows.some((r) => r.hits === 1)).toBe(true);
    expect(rows.some((r) => (r.hits ?? 0) > 1)).toBe(true);
    expect(rows.some((r) => r.gap && (r.clues?.length ?? 0) > 0)).toBe(true);
    expect(full.mixes.some((m) => (m.clues?.length ?? 0) > 0)).toBe(true);
  });

  it('seeds every evidence level with coherent values (spec 029)', () => {
    const heard = (title: string) =>
      full.mixes
        .find((m) => m.title?.startsWith(title))!
        .rows.filter(
          (r) => !r.gap && r.origin !== 'clue' && r.source === 'tracklistify'
        );
    const sunrise = heard('Sunrise');
    const dock = heard('Closing set at the Dock');
    expect(sunrise.length).toBeGreaterThan(0);
    expect(dock.length).toBeGreaterThan(0);
    for (const level of ['solid', 'once', 'out_of_step', 'candidates']) {
      expect(sunrise.some((r) => r.evidence === level)).toBe(true);
    }
    for (const r of [...sunrise, ...dock]) {
      expect(evidenceLevel(r)).not.toBeNull();
      if (r.evidence === 'solid' || r.evidence === 'out_of_step') {
        expect(r.hits).toBeGreaterThanOrEqual(2);
      } else {
        expect(r.hits).toBe(1);
      }
      if (r.evidence === 'candidates') {
        expect(r.candidates).toBeGreaterThanOrEqual(10);
      } else if (r.candidates !== undefined) {
        expect(r.candidates).toBeLessThan(10);
      }
      expect(typeof r.mixSpeed).toBe('number');
      const speed = r.mixSpeed!;
      expect(Math.round(speed * 10) / 10).toBe(speed);
      expect(speed).toBeGreaterThanOrEqual(-8);
      expect(speed).toBeLessThanOrEqual(5);
    }
    expect(
      sunrise.some(
        (r) =>
          r.origin === 'replay' &&
          r.mixSpeed !== undefined &&
          r.mixSpeed !== r.speedPercent
      )
    ).toBe(true);
  });

  it('seeds the review: runs, checked and removed (S08c)', () => {
    const rows = full.mixes.flatMap((m) => m.rows);
    // Round 010: nothing sets `validated` any more.
    expect(rows.some((r) => r.validated !== undefined)).toBe(false);
    // Some scan rows carry a Shazam page, for the row's Shazam icon.
    expect(rows.some((r) => typeof r.shazamUrl === 'string')).toBe(true);
    expect(rows.some((r) => typeof r.spotify === 'object')).toBe(true);
    expect(rows.some((r) => r.spotify === 'not-found')).toBe(true);
    expect(rows.some((r) => !r.gap && r.spotify === undefined)).toBe(true);
    expect(full.mixes.some((m) => (m.removed?.length ?? 0) > 0)).toBe(true);
    const runs = full.mixes.map((m) => m.run).filter((r) => r !== undefined);
    expect(runs.some((r) => r.secondPass && r.resumed)).toBe(true);
    expect(runs.some((r) => r.stoppedEarly)).toBe(true);
    expect(runs.some((r) => (r.warnings?.length ?? 0) > 0)).toBe(true);
    // A removed track never shows in its mix (T125).
    for (const m of full.mixes) {
      for (const t of m.removed ?? []) {
        expect(
          m.rows.some((r) => r.artist === t.artist && r.title === t.title)
        ).toBe(false);
      }
    }
  });

  it('holds no external URL as a link: only in clue text, which is plain', () => {
    const texts = [
      ...strings(full.mixes, 'mixes'),
      ...strings(full.mixJobs, 'jobs'),
    ];
    for (const { text } of texts) expect(text).not.toMatch(/<a\b|href=/i);
    // A mix's own link fields (its url, playlist, a row's Spotify and Shazam
    // pages) hold URLs by design; a request's link is its
    // map key, not a value, so no request string may hold one.
    const inText = texts.filter(
      ({ path, text }) =>
        /https?:\/\//.test(text) &&
        !/^mixes\[\d+\]\.(url|playlistUrl|rows\[\d+\]\.(spotify\.url|shazamUrl))$/.test(
          path
        )
    );
    for (const { path } of inText) expect(path).toMatch(/^mixes\[.*\.text$/);
    expect(inText.length).toBeGreaterThan(0);
  });
});

describe('buildDemo full', () => {
  it('has the library sizes the shots need', () => {
    expect(full.rows.playlists).toHaveLength(40);
    expect(full.rows.tracks).toHaveLength(3000);
    expect(full.rows.plays).toHaveLength(2000);
    expect(full.mixes).toHaveLength(3);
    const model = buildModel(full.rows);
    expect(model.artists).toHaveLength(1200);
  });

  it('spreads the history over six years of months', () => {
    const keys = full.rows.plays.flatMap((p) => Object.keys(p.months ?? {}));
    const sorted = [...new Set(keys)].sort();
    const [fy, fm] = sorted[0].split('-').map(Number);
    const [ly, lm] = sorted[sorted.length - 1].split('-').map(Number);
    expect((ly - fy) * 12 + (lm - fm)).toBeGreaterThanOrEqual(71);
    for (const row of full.rows.plays) {
      const sum = Object.values(row.months ?? {}).reduce((a, b) => a + b, 0);
      expect(sum).toBe(row.plays);
    }
  });

  it('gives BPM or key to about 70% of tracks and reach to about 80% of artists', () => {
    const withId = full.rows.tracks.filter((t) => t.id !== null).length;
    const withValue = full.rows.features.filter((f) => {
      const recco = f.reccobeats && !('notFound' in f.reccobeats);
      return recco || f.rekordbox !== undefined;
    }).length;
    expect(withValue / withId).toBeGreaterThan(0.67);
    expect(withValue / withId).toBeLessThan(0.73);
    const artists = buildModel(full.rows).artists.filter((a) => a.id !== null);
    const reached = new Set(full.rows.artistReach.map((r) => r.artistId));
    expect(reached.size / artists.length).toBeGreaterThan(0.77);
    expect(reached.size / artists.length).toBeLessThan(0.83);
  });

  it('holds one worker request per status', () => {
    const jobs = Object.values(full.mixJobs).flat();
    const statuses = jobs.map((j) => (j.rejected ? 'rejected' : j.status));
    expect(new Set(statuses)).toEqual(
      new Set(['queued', 'claimed', 'done', 'failed', 'rejected'])
    );
  });

  it('carries the edge cases', () => {
    expect(full.rows.tracks.some((t) => t.name.length === 120)).toBe(true);
    const local = full.rows.tracks.find((t) => t.isLocal);
    expect(local?.id).toBeNull();
    expect(local?.spotifyUrl).toBeNull();
    expect(
      full.rows.features.some(
        (f) =>
          f.rekordbox && f.rekordbox.bpm !== null && f.rekordbox.key === null
      )
    ).toBe(true);
    const model = buildModel(full.rows);
    const reached = new Set(full.rows.artistReach.map((r) => r.artistId));
    expect(model.artists.some((a) => a.id !== null && !reached.has(a.id))).toBe(
      true
    );
    const sizes = full.rows.playlists.map(
      (p) => full.rows.entries.filter((e) => e.playlistId === p.id).length
    );
    expect(sizes).toContain(500);
  });

  it('feeds every Crate view', () => {
    const now = new Date(DEMO_NOW);
    expect(heavyRotation(full.rows.plays, now, 3).length).toBeGreaterThan(20);
    expect(forgottenGems(full.rows.plays, now, 12).length).toBeGreaterThan(20);
    expect(classics(full.rows.plays, 'years').length).toBeGreaterThan(20);
    expect(finishRate(full.rows.plays, 'finished').length).toBeGreaterThan(20);
  });

  it('loads no image from the network', () => {
    const urls = [
      ...full.rows.playlists.map((p) => p.imageUrl),
      ...full.rows.topItems.flatMap((t) => t.items.map((i) => i.imageUrl)),
    ].filter((u) => u !== null);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('data:')).toBe(true);
    for (const mix of full.mixes) expect(mix.playerSrc).toBeNull();
  });

  it('stores the summaries the screens gate on', () => {
    expect(full.metas.historySummary).toMatchObject({ version: 2 });
    expect(full.metas.artistReachSummary).toMatchObject({ version: 1 });
    expect(full.metas.rekordboxSummary).toBeDefined();
  });
});

describe('buildDemo variants', () => {
  it('empty and signed-out hold nothing', () => {
    for (const variant of ['empty', 'signed-out'] as const) {
      const d = buildDemo(variant, 1);
      for (const rows of Object.values(d.rows)) expect(rows).toHaveLength(0);
      expect(d.mixes).toHaveLength(0);
      expect(d.metas).toEqual({});
    }
  });

  it('old-import stores a summary without version 2', () => {
    const d = buildDemo('old-import', 1);
    const summary = d.metas.historySummary as { version?: number };
    expect(summary).toBeDefined();
    expect(summary.version).toBeUndefined();
  });

  it('no-reach has no reach summary or rows', () => {
    const d = buildDemo('no-reach', 1);
    expect(d.metas.artistReachSummary).toBeUndefined();
    expect(d.rows.artistReach).toHaveLength(0);
    expect(d.rows.artistIdentity).toHaveLength(0);
  });

  it('locked stores a quota lock with pending playlists', () => {
    const d = buildDemo('locked', 1);
    expect(d.metas.syncState).toMatchObject({ status: 'locked' });
    const state = d.metas.syncState as { pending: string[]; retryAt: number };
    expect(state.pending.length).toBeGreaterThan(0);
    expect(state.retryAt).toBeGreaterThan(DEMO_NOW);
  });
});

describe('buildDemo determinism', () => {
  it('gives the same rows for the same seed, and others for another', () => {
    expect(JSON.stringify(buildDemo('full', 7))).toBe(
      JSON.stringify(buildDemo('full', 7))
    );
    expect(JSON.stringify(buildDemo('full', 8))).not.toBe(
      JSON.stringify(buildDemo('full', 7))
    );
  });
});
