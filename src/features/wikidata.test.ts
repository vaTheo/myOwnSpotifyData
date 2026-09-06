import { describe, expect, it, vi } from 'vitest';
import type { ArtistIdentityRow } from '../db/schema';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
import {
  WIKIDATA_BATCH_SIZE,
  WIKIDATA_URL,
  mbidQuery,
  needsWikidata,
  resolveByMbid,
  resolveBySpotifyId,
  spotifyIdQuery,
  wikidataBatches,
} from './wikidata';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const PEGGY = '2ye2Wgw4gimLv2eAKyk1NB';
const ANETHA = '4rIvIrjfR0PSPNPVOWl0Bc';
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const TTL = { okMs: 90 * DAY, notFoundMs: 30 * DAY };

function cell(value: string): unknown {
  return { type: 'literal', value };
}

function results(bindings: Record<string, unknown>[]): unknown {
  return {
    head: { vars: ['sid', 'item', 'sitelinks', 'en', 'fr'] },
    results: { bindings },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/sparql-results+json' },
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const deps = { fetchFn: fetchFn as unknown as typeof fetch };
  return { deps, fetchFn };
}

function identity(over: Partial<ArtistIdentityRow>): ArtistIdentityRow {
  return {
    artistId: PEGGY,
    name: 'Peggy Gou',
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
    resolvedAt: NOW,
    retryAfter: null,
    ...over,
  };
}

describe('wikidataBatches', () => {
  it('cuts the ids into batches of a hundred and fifty', () => {
    const ids = Array.from({ length: 301 }, (_, i) => `id${i}`);
    const batches = wikidataBatches(ids);
    expect(WIKIDATA_BATCH_SIZE).toBe(150);
    expect(batches.map((batch) => batch.length)).toEqual([150, 150, 1]);
    expect(batches[2]).toEqual(['id300']);
    expect(wikidataBatches([])).toEqual([]);
  });
});

describe('the SPARQL builders', () => {
  it('joins pass 1 on P1902 through VALUES and never samples', () => {
    const query = spotifyIdQuery([PEGGY, ANETHA]);
    expect(query).toContain(`VALUES ?sid { "${PEGGY}" "${ANETHA}" }`);
    expect(query).toContain('?item wdt:P1902 ?sid .');
    expect(query).toContain('SELECT ?sid ?item ?sitelinks ?en ?fr WHERE {');
    expect(query).toContain('OPTIONAL { ?item wikibase:sitelinks ?sitelinks }');
    expect(query).toContain('schema:isPartOf <https://en.wikipedia.org/>');
    expect(query).toContain('schema:isPartOf <https://fr.wikipedia.org/>');
    expect(query).not.toMatch(/SAMPLE/i);
  });

  it('joins pass 2 on P434 and asks for the mbid back', () => {
    const query = mbidQuery(['9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de']);
    expect(query).toContain(
      'VALUES ?mbid { "9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de" }'
    );
    expect(query).toContain('?item wdt:P434 ?mbid .');
    expect(query).toContain('SELECT ?mbid ?item ?sitelinks ?en ?fr WHERE {');
    expect(query).not.toMatch(/SAMPLE/i);
    expect(query).not.toContain('P1902');
  });

  it('drops an id that could break out of the literal', () => {
    const query = spotifyIdQuery([`" } UNION { ?item wdt:P31 ?x`, PEGGY]);
    expect(query).toContain(`VALUES ?sid { "${PEGGY}" }`);
    expect(query).not.toContain('UNION');
  });
});

describe('resolveBySpotifyId', () => {
  it('posts the form-encoded query and reads the JSON results', async () => {
    const { deps, fetchFn } = setup([() => json(results([]))]);
    await resolveBySpotifyId([PEGGY], deps);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WIKIDATA_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('query')).toBe(spotifyIdQuery([PEGGY]));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(REACH_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  it('parses the QID, the sitelink count and both segments verbatim', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
              en: cell('https://en.wikipedia.org/wiki/Peggy_Gou'),
              fr: cell('https://fr.wikipedia.org/wiki/Ann%C3%A9e_z%C3%A9ro'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([PEGGY], deps);
    expect(batch).toEqual({
      status: 'ok',
      hits: new Map([
        [
          PEGGY,
          {
            qid: 'Q22344118',
            sitelinks: 19,
            wikiTitles: {
              en: 'Peggy_Gou',
              fr: 'Ann%C3%A9e_z%C3%A9ro',
            },
          },
        ],
      ]),
      ambiguous: new Set(),
    });
  });

  it('reads an absent sitelink count and an absent language as null', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([ANETHA], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(ANETHA)).toEqual({
      qid: 'Q60771091',
      sitelinks: null,
      wikiTitles: { en: null, fr: null },
    });
  });

  it('counts a bound article as a sitelink when the count is missing', async () => {
    // `sitelinks` and the two articles are separate OPTIONALs, so an item can
    // bind an article and no count. Spec §2's invariant `wellKnown >=
    // wikipedia` needs an article to imply at least one sitelink.
    const one = setup([
      () =>
        json(
          results([
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
              fr: cell('https://fr.wikipedia.org/wiki/Anetha'),
            },
          ])
        ),
    ]);
    const first = await resolveBySpotifyId([ANETHA], one.deps);
    if (first.status !== 'ok') throw new Error('expected an answer');
    expect(first.hits.get(ANETHA)).toEqual({
      qid: 'Q60771091',
      sitelinks: 1,
      wikiTitles: { en: null, fr: 'Anetha' },
    });
    const both = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
              en: cell('https://en.wikipedia.org/wiki/Peggy_Gou'),
              fr: cell('https://fr.wikipedia.org/wiki/Peggy_Gou'),
            },
          ])
        ),
    ]);
    const second = await resolveBySpotifyId([PEGGY], both.deps);
    if (second.status !== 'ok') throw new Error('expected an answer');
    // A real count is never lowered by the rule.
    expect(second.hits.get(PEGGY)?.sitelinks).toBe(19);
  });

  it('keeps an id whose item repeats and drops one bound to two items', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
            },
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
            },
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
            },
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q1234567'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([PEGGY, ANETHA], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(PEGGY)?.qid).toBe('Q22344118');
    expect(batch.hits.has(ANETHA)).toBe(false);
    expect([...batch.ambiguous]).toEqual([ANETHA]);
  });

  it('leaves an id the query never bound out of the map', async () => {
    const { deps } = setup([() => json(results([]))]);
    const batch = await resolveBySpotifyId([PEGGY], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.size).toBe(0);
    expect(batch.ambiguous.size).toBe(0);
  });

  it('reports a non-2xx, a transport failure and a bad body as failures', async () => {
    const server = setup([() => json({}, 500)]);
    expect(await resolveBySpotifyId([PEGGY], server.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata error 500',
    });
    const offline = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]);
    expect(await resolveBySpotifyId([PEGGY], offline.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata is unreachable: Failed to fetch',
    });
    const truncated = setup([
      () => new Response('{"results":', { status: 200 }),
    ]);
    expect(await resolveBySpotifyId([PEGGY], truncated.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata returned a malformed response',
    });
  });
});

describe('resolveByMbid', () => {
  it('keys the answer on the mbid it asked for', async () => {
    const mbid = '9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de';
    const { deps, fetchFn } = setup([
      () =>
        json(
          results([
            {
              mbid: cell(mbid),
              item: cell('http://www.wikidata.org/entity/Q317521'),
              sitelinks: cell('4'),
              en: cell('https://en.wikipedia.org/wiki/Overmono'),
            },
          ])
        ),
    ]);
    const batch = await resolveByMbid([mbid], deps);
    const body = new URLSearchParams(String(fetchFn.mock.calls[0][1]?.body));
    expect(body.get('query')).toBe(mbidQuery([mbid]));
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(mbid)).toEqual({
      qid: 'Q317521',
      sitelinks: 4,
      wikiTitles: { en: 'Overmono', fr: null },
    });
  });
});

describe('needsWikidata', () => {
  it('takes an artist with no row and an unchecked QID', () => {
    expect(needsWikidata(undefined, NOW, TTL)).toBe(true);
    expect(needsWikidata(identity({}), NOW, TTL)).toBe(true);
  });

  it('re-asks a notFound after thirty days and an ok after ninety', () => {
    const missing = { qidStatus: 'notFound' as const, qid: null };
    expect(
      needsWikidata(
        identity({ ...missing, qidCheckedAt: NOW - 30 * DAY }),
        NOW,
        TTL
      )
    ).toBe(true);
    expect(
      needsWikidata(
        identity({ ...missing, qidCheckedAt: NOW - 30 * DAY + 1 }),
        NOW,
        TTL
      )
    ).toBe(false);
    const found = { qidStatus: 'ok' as const, qid: 'Q22344118' };
    expect(
      needsWikidata(
        identity({ ...found, qidCheckedAt: NOW - 90 * DAY }),
        NOW,
        TTL
      )
    ).toBe(true);
    expect(
      needsWikidata(
        identity({ ...found, qidCheckedAt: NOW - 89 * DAY }),
        NOW,
        TTL
      )
    ).toBe(false);
  });

  it('reads its own clock, not the one the other two steps bump', () => {
    // The MusicBrainz and Deezer steps rewrite `resolvedAt` every thirty days
    // for a `notFound`; the ninety-day sitelink refresh must still come due.
    const stale = identity({
      qidStatus: 'ok',
      qid: 'Q22344118',
      qidCheckedAt: NOW - 90 * DAY,
      resolvedAt: NOW,
    });
    expect(needsWikidata(stale, NOW, TTL)).toBe(true);
    // A row Wikidata has never answered about enters pass 1 whatever the
    // status field says.
    expect(
      needsWikidata(
        identity({ qidStatus: 'ok', qid: 'Q1', qidCheckedAt: null }),
        NOW,
        TTL
      )
    ).toBe(true);
  });

  it('holds a retryLater back until its own retryAfter has passed', () => {
    const waiting = identity({
      qidStatus: 'retryLater',
      qidCheckedAt: NOW - 200 * DAY,
      retryAfter: NOW + 1,
    });
    expect(needsWikidata(waiting, NOW, TTL)).toBe(false);
    expect(needsWikidata({ ...waiting, retryAfter: NOW }, NOW, TTL)).toBe(true);
    expect(needsWikidata({ ...waiting, retryAfter: null }, NOW, TTL)).toBe(
      true
    );
  });
});
