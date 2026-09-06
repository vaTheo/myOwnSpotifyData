import { describe, expect, it, vi } from 'vitest';
import { OEMBED_URL, extractPlayerSrc, fetchOembed, oembedUrl } from './oembed';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The mix the spec probed on 2026-09-06. */
const URL = 'https://soundcloud.com/xlr8r/exclusive-shonky-may-mix';

/** The player src the probe returned, verbatim (spec §3.2). */
const PLAYER_SRC =
  'https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F268511571&show_artwork=true';

const HTML = `<iframe width="100%" height="400" scrolling="no" frameborder="no" src="${PLAYER_SRC}"></iframe>`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function once(response: () => Response | Promise<Response>) {
  const fetchFn = vi.fn<FetchLike>(async () => response());
  return { fetchFn, fetchArg: fetchFn as unknown as typeof fetch };
}

const BODY = {
  version: 1,
  type: 'rich',
  provider_name: 'SoundCloud',
  title: 'Exclusive: Shonky - May Mix by XLR8R',
  description: 'A mix.\r\nMore &amp; more <b>house</b>.',
  author_name: 'XLR8R',
  author_url: 'https://soundcloud.com/xlr8r',
  html: HTML,
};

describe('oembedUrl', () => {
  it('builds the format=json GET and percent-encodes the mix url', () => {
    expect(oembedUrl(URL)).toBe(
      `${OEMBED_URL}?format=json&url=${encodeURIComponent(URL)}`
    );
    expect(oembedUrl(URL)).toContain('url=https%3A%2F%2Fsoundcloud.com%2F');
  });
});

describe('extractPlayerSrc', () => {
  it('reads the iframe src and keeps a w.soundcloud.com/player/ one', () => {
    expect(extractPlayerSrc(HTML)).toBe(PLAYER_SRC);
  });

  it('rejects a src from a foreign host to null', () => {
    const foreign =
      '<iframe src="https://evil.example/player/?url=x"></iframe>';
    expect(extractPlayerSrc(foreign)).toBeNull();
  });

  it('is null when the html has no src, or is not a string', () => {
    expect(extractPlayerSrc('<iframe></iframe>')).toBeNull();
    expect(extractPlayerSrc(undefined)).toBeNull();
    expect(extractPlayerSrc(42)).toBeNull();
  });
});

describe('fetchOembed', () => {
  it('requests the encoded oembed url with default credentials', async () => {
    const { fetchFn, fetchArg } = once(() => json(BODY));
    await fetchOembed(fetchArg, URL);
    expect(fetchFn.mock.calls[0][0]).toBe(oembedUrl(URL));
    // Never credentials: 'include' — both TrackId endpoints allow credentials
    // and the app wants none of it (spec §3).
    expect(fetchFn.mock.calls[0][1]?.credentials).toBeUndefined();
  });

  it('maps a 200 to title, author and the raw description', async () => {
    const { fetchArg } = once(() => json(BODY));
    const result = await fetchOembed(fetchArg, URL);
    expect(result).toEqual({
      status: 'ok',
      title: 'Exclusive: Shonky - May Mix by XLR8R',
      author: 'XLR8R',
      authorUrl: 'https://soundcloud.com/xlr8r',
      // Passed on raw: entities and \r\n intact for the parser to clean.
      description: 'A mix.\r\nMore &amp; more <b>house</b>.',
      playerSrc: PLAYER_SRC,
    });
  });

  it('reads authorUrl from author_url (the profile a short link resolves to)', async () => {
    const { fetchArg } = once(() => json(BODY));
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.authorUrl).toBe('https://soundcloud.com/xlr8r');
  });

  it('keeps the player src without appending show_comments', async () => {
    const { fetchArg } = once(() => json(BODY));
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // The screen (§5.2) appends &show_comments=true when it builds the iframe;
    // the stored playerSrc must not carry it.
    expect(result.playerSrc).toBe(PLAYER_SRC);
    expect(result.playerSrc).not.toContain('show_comments');
  });

  it('sets playerSrc null when the html carries a foreign src', async () => {
    const { fetchArg } = once(() =>
      json({ ...BODY, html: '<iframe src="https://evil.example/x"></iframe>' })
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.playerSrc).toBeNull();
  });

  it('reads a 404 as notFound, not error', async () => {
    const { fetchArg } = once(() => json({ error: 'not found' }, 404));
    expect(await fetchOembed(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('reads any other non-2xx as notFound', async () => {
    const { fetchArg } = once(() => json({}, 403));
    expect(await fetchOembed(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('reads a transport failure as error with a bare reason', async () => {
    const { fetchArg } = once(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    // Bare reason: the screen wraps it as "The mix page could not be read: …".
    expect(result.message).toBe('Failed to fetch');
  });

  it('reads a non-JSON body as error', async () => {
    const { fetchArg } = once(
      () =>
        new Response('<html>nope</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('error');
  });
});
