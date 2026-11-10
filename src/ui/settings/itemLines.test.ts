import { describe, expect, it } from 'vitest';
import type { ServerStatus } from '../../server/types';
import { formatDateTime } from '../format';
import {
  accountItemLine,
  audioItemLine,
  DANGER_LINE,
  fromUpdate,
  historyItemLine,
  ITEM_KIND,
  opensLater,
  opensOnArrival,
  reachItemLine,
  serverItemLine,
  serverStatusLine,
  stateOnly,
  spotifyStatusLine,
  syncItemLine,
  worst,
  type ItemLine,
  type ServerLineInputs,
} from './itemLines';

const T = 1_800_000_000_000;

const CONNECTED: ServerStatus = {
  status: 'connected',
  lastSyncAt: T,
  usedBytes: null,
  stamps: [],
  rejected: 0,
};

function server(over: Partial<ServerLineInputs> = {}): ItemLine {
  return serverStatusLine({
    server: CONNECTED,
    signedIn: true,
    pending: {},
    pendingError: null,
    lastSyncAt: T,
    ...over,
  });
}

const ok = (text: string): ItemLine => ({ tone: 'ok', text });

describe('worst', () => {
  it('ranks error over warning over running over waiting over ok over off', () => {
    const tones = [
      'off',
      'ok',
      'waiting',
      'running',
      'warning',
      'error',
    ] as const;
    for (let i = 1; i < tones.length; i++) {
      const lower: ItemLine = { tone: tones[i - 1], text: 'lower' };
      const higher: ItemLine = { tone: tones[i], text: 'higher' };
      expect(worst(lower, higher).text).toBe('higher');
      expect(worst(higher, lower).text).toBe('higher');
    }
  });

  it('keeps the first line on a tie and skips nulls', () => {
    expect(worst(ok('a'), null, ok('b')).text).toBe('a');
  });

  it('gives every tone a status kind; warnings and errors their own', () => {
    expect(ITEM_KIND.error).toBe('error');
    expect(ITEM_KIND.warning).toBe('warning');
    expect(ITEM_KIND.ok).toBe('success');
    expect(ITEM_KIND.running).toBe('info');
  });
});

describe('opensOnArrival (FR-005)', () => {
  it('opens a failing or running item only', () => {
    expect(opensOnArrival({ tone: 'error', text: '' })).toBe(true);
    expect(opensOnArrival({ tone: 'running', text: '' })).toBe(true);
    for (const tone of ['warning', 'waiting', 'ok', 'off'] as const) {
      expect(opensOnArrival({ tone, text: '' })).toBe(false);
    }
  });
});

describe('opensLater (fix round 1)', () => {
  it('opens when a job starts or fails while the page is open', () => {
    expect(opensLater(false, true, false)).toBe(true);
  });

  it('never against a close by hand, nor while it already wanted to', () => {
    expect(opensLater(false, true, true)).toBe(false);
    expect(opensLater(true, true, false)).toBe(false);
    expect(opensLater(false, false, false)).toBe(false);
  });
});

describe('fromUpdate', () => {
  it('keeps the words and maps the tones', () => {
    expect(fromUpdate({ tone: 'failed', text: 'Failed · boom' })).toEqual({
      tone: 'error',
      text: 'Failed · boom',
    });
    expect(fromUpdate({ tone: 'paused', text: 'p' }).tone).toBe('warning');
    expect(fromUpdate({ tone: 'waiting', text: 'w' }).tone).toBe('waiting');
    expect(fromUpdate({ tone: 'manual', text: 'm' }).tone).toBe('off');
  });
});

describe('accountItemLine', () => {
  it('says signed in, not signed in, or the missing writes as a warning', () => {
    expect(accountItemLine(true, [])).toEqual(ok('Signed in to Spotify'));
    expect(accountItemLine(false, ['Like all songs']).tone).toBe('off');
    expect(
      accountItemLine(true, ['Like all songs', 'Create playlist'])
    ).toEqual({
      tone: 'warning',
      text: 'Not allowed yet: Like all songs, Create playlist · Connect again',
    });
  });
});

describe('spotifyStatusLine and syncItemLine', () => {
  const synced = { tone: 'ok' as const, text: 'Synced today' };

  it('is the Spotify job line when nothing else holds it', () => {
    expect(spotifyStatusLine(synced, null)).toEqual(ok('Synced today'));
  });

  it('shows a quota lock-out another reader met, as a warning', () => {
    expect(spotifyStatusLine(synced, 'Spotify quota reached.')).toEqual({
      tone: 'warning',
      text: 'Spotify quota reached.',
    });
  });

  it('keeps a failure over a lock-out', () => {
    expect(
      spotifyStatusLine({ tone: 'failed', text: 'Failed · x' }, 'lock').tone
    ).toBe('error');
  });

  it('adds another Spotify reader running to the item line', () => {
    expect(syncItemLine(ok('Synced'), 'Check on Spotify runs.').tone).toBe(
      'warning'
    );
    expect(syncItemLine(ok('Synced'), null)).toEqual(ok('Synced'));
  });
});

describe('historyItemLine', () => {
  it('is ok once imported, off before, and warns on a time-zone change', () => {
    expect(historyItemLine({ text: 'Imported x' }, true, null).tone).toBe('ok');
    expect(historyItemLine({ text: 'Never' }, false, null).tone).toBe('off');
    expect(
      historyItemLine({ text: 'Imported x' }, true, 'This browser is now on X.')
    ).toEqual({ tone: 'warning', text: 'This browser is now on X.' });
  });
});

describe('audioItemLine', () => {
  const features = {
    tone: 'ok' as const,
    text: '10 / 20 tracks with BPM or key',
  };
  const idle = { status: 'idle' as const };

  it('is the BPM and key line when nothing else happens', () => {
    expect(
      audioItemLine({ features, rekordbox: idle, sharedError: null })
    ).toEqual(ok('10 / 20 tracks with BPM or key'));
  });

  it('shows a running Rekordbox import, then its failure over it', () => {
    const running = audioItemLine({
      features,
      rekordbox: { status: 'running', index: 1, total: 3 },
      sharedError: null,
    });
    expect(running).toEqual({
      tone: 'running',
      text: 'Rekordbox · Running · 1 / 3 files',
      scope: 'Rekordbox',
    });
    expect(
      audioItemLine({
        features: { tone: 'running', text: 'Running · 1 / 9 tracks' },
        rekordbox: { status: 'error', message: 'bad XML' },
        sharedError: null,
      })
    ).toEqual({
      tone: 'error',
      text: 'Rekordbox · Failed · bad XML',
      scope: 'Rekordbox',
    });
  });

  it('shows the lookup failure and the shared store error', () => {
    expect(
      audioItemLine({
        features: { tone: 'failed', text: 'Failed · offline' },
        rekordbox: idle,
        sharedError: null,
      })
    ).toEqual({ tone: 'error', text: 'Failed · offline' });
    expect(
      audioItemLine({
        features,
        rekordbox: idle,
        sharedError: 'The shared store could not be used.',
      })
    ).toMatchObject({ tone: 'error', scope: 'Shared store' });
  });
});

describe('stateOnly (closed lines, FR-007)', () => {
  const words = { ok: 'Up to date', off: 'Automatic updates off' };

  it('keeps only the state words: no counts, no dates', () => {
    expect(
      stateOnly(ok('2,099 / 3,199 tracks with BPM or key'), words)
    ).toEqual(ok('Up to date'));
    expect(
      stateOnly({ tone: 'off', text: 'Off · Checked 2 Nov' }, words)
    ).toEqual({ tone: 'off', text: 'Automatic updates off' });
  });

  it('says Failed, with its part, and asks for the main action', () => {
    expect(stateOnly({ tone: 'error', text: 'Failed · boom' }, words)).toEqual({
      tone: 'error',
      text: 'Failed',
      act: true,
    });
    expect(
      stateOnly(
        { tone: 'error', text: 'Rekordbox · Failed · x', scope: 'Rekordbox' },
        words
      ).text
    ).toBe('Rekordbox failed');
  });

  it('gives a running job its percentage, or none without a total', () => {
    const running: ItemLine = { tone: 'running', text: 'Running · 14 / 40' };
    expect(stateOnly(running, words, { done: 14, total: 40 }).text).toBe(
      'Running 35 %'
    );
    expect(stateOnly(running, words, { done: 0, total: 0 }).text).toBe(
      'Running'
    );
    expect(stateOnly(running, words).text).toBe('Running');
  });

  it('keeps the first words of a warning and of changes waiting', () => {
    expect(
      stateOnly({ tone: 'warning', text: 'Offline · last sync never' }, {})
    ).toEqual({ tone: 'warning', text: 'Offline', act: true });
    expect(
      stateOnly(
        {
          tone: 'waiting',
          text: 'Changes waiting to send: 2 · Listening history, Mixes',
        },
        {}
      ).text
    ).toBe('Changes waiting to send: 2');
  });

  it('says never over an idle line and asks for the main action', () => {
    expect(stateOnly(ok('Never'), { ...words, never: 'Never synced' })).toEqual(
      { tone: 'off', text: 'Never synced', act: true }
    );
    // A running job wins over never.
    expect(
      stateOnly({ tone: 'running', text: 'x' }, { never: 'Never synced' }).tone
    ).toBe('running');
  });

  it('keeps the whole text without words, as the server line does', () => {
    expect(stateOnly(ok('Up to date · last sync x'), {}).text).toBe(
      'Up to date'
    );
    expect(stateOnly({ tone: 'off', text: 'Not set up' }, {}).text).toBe(
      'Not set up'
    );
  });
});

describe('reachItemLine', () => {
  const reach = { tone: 'ok' as const, text: 'Checked today' };

  it('is the job line, or a warning for a source that stopped', () => {
    expect(reachItemLine(reach, [], null)).toEqual(ok('Checked today'));
    expect(reachItemLine(reach, ['Deezer'], null)).toEqual({
      tone: 'warning',
      text: 'Deezer stopped answering · the run skipped it',
    });
    expect(reachItemLine(reach, ['Deezer'], 'shared failed').scope).toBe(
      'Shared store'
    );
  });
});

describe('serverStatusLine (FR-007a)', () => {
  it('says up to date only when connected with nothing waiting', () => {
    expect(server()).toEqual(ok(`Up to date · last sync ${formatDateTime(T)}`));
  });

  it('names the changes waiting to send, never "Up to date"', () => {
    const line = server({ pending: { history: true, mixes: true } });
    expect(line).toEqual({
      tone: 'waiting',
      text: 'Changes waiting to send: 2 · Listening history, Mixes',
    });
  });

  it('never says up to date before the flags are read', () => {
    expect(server({ pending: null })).toEqual(
      ok(`Last sync ${formatDateTime(T)}`)
    );
  });

  it('says never synced when connected without a sync', () => {
    expect(
      server({ server: { ...CONNECTED, lastSyncAt: null } as ServerStatus })
    ).toEqual({ tone: 'off', text: 'Never synced' });
  });

  it('covers the other states', () => {
    expect(server({ server: { status: 'unset' } })).toEqual({
      tone: 'off',
      text: 'Not set up',
    });
    expect(server({ signedIn: false })).toEqual({
      tone: 'off',
      text: 'Not signed in',
    });
    expect(server({ server: { status: 'signedOut' } }).text).toBe(
      'Not signed in'
    );
    expect(server({ server: { status: 'error', message: 'boom' } })).toEqual({
      tone: 'error',
      text: 'Failed · boom',
    });
    expect(server({ pendingError: 'Could not read.' })).toEqual({
      tone: 'error',
      text: 'Could not read.',
    });
    expect(
      server({ server: { status: 'offline', message: 'x' }, lastSyncAt: null })
    ).toEqual({ tone: 'warning', text: 'Offline · last sync never' });
    expect(
      server({ server: { status: 'paused', dashboardUrl: 'https://x' } }).tone
    ).toBe('warning');
    expect(
      server({
        server: { status: 'pulling', dataset: 'library', done: 2, total: 5 },
      })
    ).toEqual({ tone: 'running', text: 'Fetching library · 2 / 5 rows' });
  });

  it('names the changes waiting while offline, paused or running too', () => {
    const pending = { mixes: true as const };
    expect(
      server({
        server: { status: 'offline', message: 'x' },
        lastSyncAt: null,
        pending,
      })
    ).toEqual({
      tone: 'warning',
      text: 'Offline · last sync never · Changes waiting to send: 1 · Mixes',
    });
    expect(
      server({
        server: { status: 'paused', dashboardUrl: 'https://x' },
        pending,
      }).text
    ).toBe('Paused by the server · Changes waiting to send: 1 · Mixes');
    expect(
      server({
        server: { status: 'pushing', dataset: 'mixes', done: 1, total: 2 },
        pending,
      }).text
    ).toBe('Sending mixes · 1 / 2 rows · Changes waiting to send: 1 · Mixes');
  });

  it('adds rejected rows to the server item line', () => {
    expect(serverItemLine(server(), 3)).toEqual({
      tone: 'warning',
      text: '3 rows rejected by the safety check',
    });
    expect(serverItemLine(server(), 0)).toEqual(server());
  });
});

describe('DANGER_LINE', () => {
  it('says the consequence and is never a problem', () => {
    expect(DANGER_LINE.tone).toBe('off');
    expect(DANGER_LINE.text).toMatch(/server data is kept/);
  });
});
