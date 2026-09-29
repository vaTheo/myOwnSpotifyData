import { describe, expect, it } from 'vitest';
import { parseTracklistifyJson } from './tracklistify';

function fixture(
  overrides: {
    mixInfo?: { title?: unknown; audio_filename?: unknown };
    tracks?: unknown;
  } = {}
): string {
  const mix_info = {
    title:
      'pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113]',
    artist: 'Unknown artist',
    audio_filename:
      'pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113].m4a',
    ...overrides.mixInfo,
  };
  const tracks =
    overrides.tracks !== undefined
      ? overrides.tracks
      : [
          {
            song_name: 'Noble Booth',
            artist: 'Stefan Gubatz',
            time_in_mix: '00:00:00',
            confidence: 86.11812625600001,
            duration: null,
            metadata: {
              isrc: 'DECH62001634',
              album: 'Fliester Dubs - EP',
              label: 'Primary Colours',
              release_date: '2025',
              genres: ['Electronic'],
              shazam_id: '825039928',
            },
          },
          {
            song_name: 'Katerina',
            artist: 'Mixxwave',
            time_in_mix: '00:25:50',
            confidence: 97.79107572,
            duration: null,
            metadata: {
              genres: ['Electronic'],
              shazam_id: '836945321',
              links: {
                shazam: 'https://www.shazam.com/track/836945321/katerina',
              },
            },
          },
          {
            song_name: 'Pep A Cat Up (Original Mix)',
            artist: 'Chris Carrier & DJ W!ld',
            time_in_mix: '01:55:50',
            confidence: 95.170307262,
            duration: null,
            metadata: {
              shazam_id: '81243411',
              links: {
                shazam:
                  'https://www.shazam.com/track/81243411/pep-a-cat-up-original-mix',
              },
            },
          },
        ];
  return JSON.stringify({ mix_info, tracks });
}

describe('parseTracklistifyJson', () => {
  it('parses a real-shaped file into rows, the synthetic url and a cleaned title', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.url).toBe(
      'tracklistify:pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113].m4a'
    );
    // ⧸ (U+29F8) restored to a plain slash in the title; the url key keeps
    // the raw audio_filename unmodified.
    expect(result.title).toBe(
      'pi/live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113]'
    );
    expect(result.rows).toHaveLength(3);
  });

  it('maps the full-metadata row exactly', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0]).toEqual({
      startSec: 0,
      endSec: null,
      artist: 'Stefan Gubatz',
      title: 'Noble Booth',
      label: 'Primary Colours',
      source: 'tracklistify',
      gap: false,
      detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
      referenceCount: null,
      confidence: 86.11812625600001,
      isrc: 'DECH62001634',
      shazamUrl: null,
    });
  });

  it('keeps the Shazam link of the identified track', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[1].shazamUrl).toBe(
      'https://www.shazam.com/track/836945321/katerina'
    );
  });

  it('drops a Shazam link that is not an https shazam.com URL', () => {
    const track = (shazam: unknown) => ({
      song_name: 'Katerina',
      artist: 'Mixxwave',
      metadata: { links: { shazam } },
    });
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          track('javascript:alert(1)'),
          track('http://www.shazam.com/track/1/x'),
          track('https://www.shazam.com.evil.example/track/1/x'),
          track(42),
          track('not a url'),
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows.map((r) => r.shazamUrl)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('parses time_in_mix past the first hour', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[2].startSec).toBe(1 * 3600 + 55 * 60 + 50);
  });

  it('degrades sparse metadata to null fields, not a crash', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[1].isrc).toBeNull(); // "Katerina": no isrc, no label
    expect(result.rows[1].label).toBeNull();
    expect(result.rows[2].isrc).toBeNull(); // "Pep A Cat Up": sparsest row
    expect(result.rows[2].label).toBeNull();
  });

  it('degrades a track with no metadata key at all', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'No Metadata Track',
            artist: 'Someone',
            time_in_mix: '00:01:00',
            confidence: 90,
            duration: null,
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].label).toBeNull();
    expect(result.rows[0].isrc).toBeNull();
  });

  it('degrades wrong-typed confidence/isrc rather than accepting them', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'Bad Types',
            artist: 'Someone',
            time_in_mix: '00:01:00',
            confidence: '90%', // wrong type: string, not number
            duration: null,
            metadata: { isrc: 12345, label: 'Real Label' }, // isrc: number
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].confidence).toBeNull();
    expect(result.rows[0].isrc).toBeNull();
    expect(result.rows[0].label).toBe('Real Label');
  });

  it('degrades an unparseable time_in_mix to a null startSec, not a failure', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'No Time',
            artist: 'Someone',
            time_in_mix: 'unknown',
            confidence: 90,
            duration: null,
            metadata: {},
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].startSec).toBeNull();
  });

  it('drops a malformed track entry but keeps the good ones', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          { song_name: '', artist: 'Missing Title Artist' },
          {
            song_name: 'Kept Track',
            artist: 'Kept Artist',
            time_in_mix: '00:02:00',
            confidence: 80,
            duration: null,
            metadata: {},
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Kept Track');
  });

  it('errors when every track entry is malformed', () => {
    const result = parseTracklistifyJson(fixture({ tracks: [{}] }));
    expect(result).toEqual({
      status: 'error',
      message: 'No tracks found in that file.',
    });
  });

  it('errors on invalid JSON', () => {
    const result = parseTracklistifyJson('not json {');
    expect(result.status).toBe('error');
  });

  it('does not throw when the JSON is a bare null value', () => {
    const result = parseTracklistifyJson('null');
    expect(result.status).toBe('error');
  });

  it('drops a null entry in tracks rather than throwing', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          null,
          {
            song_name: 'Kept Track',
            artist: 'Kept Artist',
            time_in_mix: '00:02:00',
            confidence: 80,
            duration: null,
            metadata: {},
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Kept Track');
  });

  it('errors when mix_info.title is missing', () => {
    const result = parseTracklistifyJson(
      fixture({ mixInfo: { title: undefined } })
    );
    expect(result).toEqual({
      status: 'error',
      message: "That doesn't look like a Tracklistify tracklist.json.",
    });
  });

  it('errors when mix_info.audio_filename is missing', () => {
    const result = parseTracklistifyJson(
      fixture({ mixInfo: { audio_filename: undefined } })
    );
    expect(result.status).toBe('error');
  });

  it('errors when tracks is missing or not an array', () => {
    const missingTracks = JSON.stringify({
      mix_info: { title: 'x', audio_filename: 'x.m4a' },
    });
    expect(parseTracklistifyJson(missingTracks).status).toBe('error');
    const wrongType = JSON.stringify({
      mix_info: { title: 'x', audio_filename: 'x.m4a' },
      tracks: 'not-an-array',
    });
    expect(parseTracklistifyJson(wrongType).status).toBe('error');
  });
});
