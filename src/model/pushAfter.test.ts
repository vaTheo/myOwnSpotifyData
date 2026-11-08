import { describe, expect, it } from 'vitest';
import type { ArtistReachSummary } from '../features/reachRun';
import { featuresChanged, reachChanged } from './pushAfter';

const summary = { ranAt: 1 } as ArtistReachSummary;

describe('featuresChanged', () => {
  it('is false for a run with nothing looked up', () => {
    expect(
      featuresChanged({
        status: 'done',
        found: 0,
        notFound: 0,
        total: 0,
        years: 0,
      })
    ).toBe(false);
  });
  it('is true for a run served only by the shared store', () => {
    expect(
      featuresChanged({
        status: 'done',
        found: 2,
        notFound: 0,
        total: 2,
        years: 0,
        shared: { fromStore: 2, sent: 0, error: null },
      })
    ).toBe(true);
  });
  it('is true when tracks were looked up', () => {
    expect(
      featuresChanged({
        status: 'done',
        found: 1,
        notFound: 2,
        total: 3,
        years: 0,
      })
    ).toBe(true);
  });
  it('is true when only years were found', () => {
    expect(
      featuresChanged({
        status: 'done',
        found: 0,
        notFound: 0,
        total: 0,
        years: 4,
      })
    ).toBe(true);
  });
  it('is false for an error or idle', () => {
    expect(featuresChanged({ status: 'error', message: 'x' })).toBe(false);
    expect(featuresChanged({ status: 'idle' })).toBe(false);
  });
});

describe('reachChanged', () => {
  it('is false for a run with nothing looked up', () => {
    expect(
      reachChanged({
        status: 'done',
        summary,
        run: { lookedUp: 0, written: 0, unresolved: 0 },
        paused: [],
      })
    ).toBe(false);
  });
  it('is true when artists were looked up', () => {
    expect(
      reachChanged({
        status: 'done',
        summary,
        run: { lookedUp: 2, written: 0, unresolved: 2 },
        paused: [],
      })
    ).toBe(true);
  });
  it('is false for an error', () => {
    expect(reachChanged({ status: 'error', message: 'x', paused: [] })).toBe(
      false
    );
  });
});
