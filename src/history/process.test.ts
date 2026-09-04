import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { processFiles, type ImportMessage } from './process';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-01T00:00:00Z',
    ms_played: 200000,
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:t1',
    spotify_episode_uri: null,
    audiobook_uri: null,
    ...over,
  };
}

function zipFile(entries: Record<string, string>): File {
  const data = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, body]) => [name, strToU8(body)])
    )
  );
  return new File([new Uint8Array(data).buffer], 'my_spotify_data.zip');
}

function jsonFile(name: string, body: unknown): File {
  return new File([JSON.stringify(body)], name);
}

async function collect(files: File[]): Promise<ImportMessage[]> {
  const messages: ImportMessage[] = [];
  await processFiles(files, (m) => messages.push(m));
  return messages;
}

describe('processFiles', () => {
  it('reads a zip in numeric file order, aggregates plays and reports counts', async () => {
    const messages = await collect([
      zipFile({
        'Spotify Extended Streaming History/Streaming_History_Audio_2022-2023_11.json':
          JSON.stringify([rec({ ts: '2023-05-01T00:00:00Z' })]),
        'Spotify Extended Streaming History/Streaming_History_Audio_2020_2.json':
          JSON.stringify([
            rec({ ts: '2020-02-02T00:00:00Z' }),
            rec({ ms_played: 5000 }),
            rec({ spotify_track_uri: null }),
          ]),
        'Spotify Extended Streaming History/Streaming_History_Video_2024.json':
          JSON.stringify([
            rec({
              spotify_track_uri: 'spotify:track:t2',
              ts: '2024-06-01T00:00:00Z',
            }),
          ]),
        'Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf':
          '%PDF-1.4',
      }),
    ]);
    expect(
      messages
        .filter((m) => m.type === 'progress')
        .map((m) => m.type === 'progress' && m.file)
    ).toEqual([
      'Streaming_History_Audio_2020_2.json',
      'Streaming_History_Audio_2022-2023_11.json',
      'Streaming_History_Video_2024.json',
    ]);
    const done = messages.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.counts).toMatchObject({
      credited: 3,
      short: 1,
      unattributed: 1,
    });
    expect(done.plays.map((p) => [p.trackId, p.plays])).toEqual([
      ['t1', 2],
      ['t2', 1],
    ]);
    expect(done.range).toEqual({
      first: '2020-02-02T00:00:00Z',
      last: '2024-06-01T00:00:00Z',
    });
    expect(done.processed).toHaveLength(3);
    expect(done.skipped).toEqual([]);
  });

  it('accepts loose json files and skips unreadable ones', async () => {
    const messages = await collect([
      jsonFile('Streaming_History_Audio_2021_0.json', [rec()]),
      new File(['{not json'], 'Streaming_History_Audio_2021_1.json'),
      jsonFile('Streaming_History_Audio_2021_2.json', { not: 'an array' }),
    ]);
    const done = messages.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.processed).toEqual(['Streaming_History_Audio_2021_0.json']);
    expect(done.skipped.map((s) => s.name)).toEqual([
      'Streaming_History_Audio_2021_1.json',
      'Streaming_History_Audio_2021_2.json',
    ]);
    expect(done.skipped[0].reason).toMatch(/unreadable/);
    expect(done.skipped[1].reason).toBe('not a JSON array');
  });

  it('rejects the Account data package by file name', async () => {
    const messages = await collect([
      zipFile({
        'MyData/StreamingHistory_music_0.json': JSON.stringify([
          {
            endTime: '2024-01-01 10:00',
            artistName: 'A',
            trackName: 'T',
            msPlayed: 1,
          },
        ]),
      }),
    ]);
    expect(messages).toEqual([
      {
        type: 'error',
        code: 'account-data-package',
        message: expect.stringContaining('Extended streaming history'),
      },
    ]);
  });

  it('rejects the Account data package by record shape', async () => {
    const messages = await collect([
      jsonFile('Streaming_History_Audio_2024_0.json', [
        {
          endTime: '2024-01-01 10:00',
          artistName: 'A',
          trackName: 'T',
          msPlayed: 1,
        },
      ]),
    ]);
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      code: 'account-data-package',
    });
  });

  it('reports when nothing matches', async () => {
    const messages = await collect([jsonFile('Playlist1.json', [])]);
    expect(messages).toEqual([
      {
        type: 'error',
        code: 'no-files',
        message: expect.stringContaining('Streaming_History_Audio'),
      },
    ]);
  });
});
