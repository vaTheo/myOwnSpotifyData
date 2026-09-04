import { describe, expect, it } from 'vitest';
import {
  baseName,
  historyFileIndex,
  isAccountDataFile,
  isAccountDataRecord,
  isHistoryFile,
  sortHistoryFiles,
} from './files';

describe('history file names', () => {
  it('matches audio and video files in any folder, year range or single year', () => {
    expect(
      isHistoryFile('MyData/Streaming_History_Audio_2013-2015_0.json')
    ).toBe(true);
    expect(
      isHistoryFile(
        'Spotify Extended Streaming History/Streaming_History_Audio_2024_13.json'
      )
    ).toBe(true);
    expect(isHistoryFile('MyData/Streaming_History_Video_2018-2023.json')).toBe(
      true
    );
    expect(isHistoryFile('Streaming_History_Video_2024.json')).toBe(true);
    expect(isHistoryFile('streaming_history_audio_2020_1.JSON')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isHistoryFile('ReadMeFirst_ExtendedStreamingHistory.pdf')).toBe(
      false
    );
    expect(isHistoryFile('StreamingHistory_music_0.json')).toBe(false);
    expect(isHistoryFile('Streaming_History_Audio.json')).toBe(false);
    expect(isHistoryFile('Playlist1.json')).toBe(false);
  });

  it('orders by the numeric suffix, not lexically, suffix-less files last', () => {
    const names = [
      'x/Streaming_History_Video_2024.json',
      'x/Streaming_History_Audio_2022-2023_11.json',
      'x/Streaming_History_Audio_2022_10.json',
      'x/Streaming_History_Audio_2020_2.json',
    ].map((name) => ({ name }));
    expect(sortHistoryFiles(names).map((f) => f.name)).toEqual([
      'x/Streaming_History_Audio_2020_2.json',
      'x/Streaming_History_Audio_2022_10.json',
      'x/Streaming_History_Audio_2022-2023_11.json',
      'x/Streaming_History_Video_2024.json',
    ]);
    expect(historyFileIndex('Streaming_History_Audio_2022_10.json')).toBe(10);
    expect(historyFileIndex('Streaming_History_Video_2024.json')).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });

  it('extracts base names', () => {
    expect(baseName('a/b\\c.json')).toBe('c.json');
    expect(baseName('c.json')).toBe('c.json');
  });

  it('recognises the Account data package by name and by record shape', () => {
    expect(isAccountDataFile('MyData/StreamingHistory_music_3.json')).toBe(
      true
    );
    expect(isAccountDataFile('StreamingHistory_podcast_0.json')).toBe(true);
    expect(isAccountDataFile('Streaming_History_Audio_2020_0.json')).toBe(
      false
    );
    expect(
      isAccountDataRecord({
        endTime: '2024-01-01 10:00',
        artistName: 'A',
        trackName: 'T',
        msPlayed: 1,
      })
    ).toBe(true);
    expect(isAccountDataRecord({ ts: 'x', ms_played: 1 })).toBe(false);
    expect(isAccountDataRecord(null)).toBe(false);
  });
});
