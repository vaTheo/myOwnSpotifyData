import { describe, expect, it } from 'vitest';
import { buildModel } from '../model/aggregate';
import {
  classics,
  finishRate,
  forgottenGems,
  heavyRotation,
} from '../model/crate';
import { DEMO_NOW, buildDemo } from './demo';

const full = buildDemo('full', 1);

describe('buildDemo full', () => {
  it('has the library sizes the shots need', () => {
    expect(full.rows.playlists).toHaveLength(40);
    expect(full.rows.tracks).toHaveLength(3000);
    expect(full.rows.plays).toHaveLength(2000);
    expect(full.mixes).toHaveLength(2);
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
