import { describe, expect, it } from 'vitest';
import {
  NOT_REKORDBOX_MESSAGE,
  NO_TRACKS_MESSAGE,
  RekordboxFormatError,
  parseRekordbox,
} from './rekordbox';

/**
 * Shaped like a real `File > Export Collection in xml format`: a multi-line
 * TRACK start tag with TEMPO and POSITION_MARK children, entity-escaped and
 * raw punctuation in attribute values, an unanalysed sampler entry, and a
 * PLAYLISTS section whose entries are `<TRACK Key="…"/>` references.
 */
const COLLECTION = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.2.18" Company="AlphaTheta"/>
  <COLLECTION Entries="4">
    <TRACK TrackID="1" Name="Strobe" Artist="deadmau5" Composer=""
           Album="For Lack of a Better Name" Kind="MP3 File" Size="15304192"
           TotalTime="638" AverageBpm="128.00" DateAdded="2024-01-02"
           Tonality="8A" Comments="peak time" Label="mau5trap" Mix=""
           Location="file://localhost/C:/Music/Strobe.mp3">
      <TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.025" Num="1"/>
      <POSITION_MARK Name="" Type="0" Start="128.025" Num="-1"/>
    </TRACK>
    <TRACK TrackID="2" Name="Eat Sleep Rave Repeat (Calvin Harris Remix)"
           Artist="Fatboy Slim &amp; Riva Starr" Kind="MP3 File"
           TotalTime="371" AverageBpm="126.00" Tonality="4A"
           Comments="mix in &gt; Strobe"/>
    <TRACK TrackID="3" Name="Don&#39;t You Want Me (Extended Mix)"
           Artist="Felix da Housecat" Kind="WAV File" TotalTime="402"
           AverageBpm="124.50" Tonality="F#m" Comments="rating > 4"/>
    <TRACK TrackID="4" Name="NOISE" Artist="" Kind="WAV File" TotalTime="5"
           AverageBpm="0.00" Tonality=""/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Sets" Type="1" KeyType="0" Entries="2">
        <TRACK Key="1"/>
        <TRACK Key="2"/>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;

const REFERENCES_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="0"></COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Sets" Type="1" KeyType="0" Entries="2">
        <TRACK Key="1"/>
        <TRACK Key="2"/>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;

const TRAKTOR = `<?xml version="1.0" encoding="UTF-8"?>
<NML VERSION="19">
  <COLLECTION ENTRIES="1">
    <ENTRY TITLE="Strobe" ARTIST="deadmau5"><TEMPO BPM="128"/></ENTRY>
  </COLLECTION>
</NML>
`;

describe('parseRekordbox', () => {
  it('reads every collection track, and only those', () => {
    expect(parseRekordbox(COLLECTION)).toEqual([
      {
        title: 'Strobe',
        artist: 'deadmau5',
        bpm: 128,
        key: { key: 9, major: false },
        seconds: 638,
      },
      {
        title: 'Eat Sleep Rave Repeat (Calvin Harris Remix)',
        artist: 'Fatboy Slim & Riva Starr',
        bpm: 126,
        key: { key: 5, major: false },
        seconds: 371,
      },
      {
        title: "Don't You Want Me (Extended Mix)",
        artist: 'Felix da Housecat',
        bpm: 124.5,
        key: { key: 6, major: false },
        seconds: 402,
      },
      {
        title: 'NOISE',
        artist: '',
        bpm: null,
        key: null,
        seconds: 5,
      },
    ]);
  });

  it('decodes entities and tolerates a raw > inside an attribute', () => {
    const tracks = parseRekordbox(COLLECTION);
    expect(tracks[1].artist).toBe('Fatboy Slim & Riva Starr');
    expect(tracks[2].title).toBe("Don't You Want Me (Extended Mix)");
    expect(tracks[2].bpm).toBe(124.5);
  });

  it('treats a zero BPM and an empty Tonality as unknown', () => {
    const noise = parseRekordbox(COLLECTION)[3];
    expect(noise.bpm).toBeNull();
    expect(noise.key).toBeNull();
  });

  it('rejects a file that is not a Rekordbox collection', () => {
    expect(() => parseRekordbox(TRAKTOR)).toThrow(RekordboxFormatError);
    expect(() => parseRekordbox(TRAKTOR)).toThrow(NOT_REKORDBOX_MESSAGE);
  });

  it('rejects a collection that holds only playlist references', () => {
    expect(() => parseRekordbox(REFERENCES_ONLY)).toThrow(RekordboxFormatError);
    expect(() => parseRekordbox(REFERENCES_ONLY)).toThrow(NO_TRACKS_MESSAGE);
  });
});
