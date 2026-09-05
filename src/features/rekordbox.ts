import { parseKeyText } from '../model/keys';

export interface RbTrack {
  title: string;
  artist: string;
  bpm: number | null;
  key: { key: number; major: boolean } | null;
  /** Whole seconds, as rekordbox writes TotalTime; null when unknown. */
  seconds: number | null;
}

/** What `rekordbox.worker.ts` posts back; mirrors `ImportMessage`. */
export type RekordboxMessage =
  { type: 'parsed'; tracks: RbTrack[] } | { type: 'error'; message: string };

export class RekordboxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RekordboxFormatError';
  }
}

export const NOT_REKORDBOX_MESSAGE =
  'This is not a Rekordbox collection. In Rekordbox use File > Export Collection in xml format, then pick that .xml here.';

export const NO_TRACKS_MESSAGE =
  'This Rekordbox collection has no tracks. Put the tracks in at least one playlist, export again and retry.';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** The five named entities plus &#NNN; and &#xHH;. Never throws. */
function decodeEntities(value: string): string {
  return value.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g, (match) => {
    const body = match.slice(1, -1);
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(
        hex ? body.slice(2) : body.slice(1),
        hex ? 16 : 10
      );
      const valid = Number.isFinite(code) && code >= 0 && code <= 0x10ffff;
      return valid ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(tag)) !== null) {
    out[match[1]] = decodeEntities(match[2]);
  }
  return out;
}

/**
 * Index just past the '>' that closes the start tag beginning at `from`.
 * Quote-aware, because a raw '>' inside an attribute value is legal XML.
 */
function tagEnd(text: string, from: number): number {
  let quoted = false;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '>' && !quoted) return i + 1;
  }
  return -1;
}

/** Every `<TRACK …>` start tag, children and end tags ignored. */
function* trackTags(text: string): Generator<string> {
  const start = /<TRACK(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(text)) !== null) {
    const end = tagEnd(text, match.index);
    if (end === -1) return;
    yield text.slice(match.index, end);
    start.lastIndex = end;
  }
}

/**
 * The COLLECTION element only: the PLAYLISTS section repeats every track as
 * `<TRACK Key="5"/>`, which is a reference and not a track.
 */
function collectionText(text: string): string {
  const start = text.indexOf('<COLLECTION');
  if (start === -1) return text;
  const end = text.indexOf('</COLLECTION>', start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** AverageBpm is "0.00" on an unanalysed track. */
function parseBpm(value: string): number | null {
  const bpm = Number.parseFloat(value);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function parseSeconds(value: string): number | null {
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function parseRekordbox(text: string): RbTrack[] {
  if (!text.includes('<DJ_PLAYLISTS')) {
    throw new RekordboxFormatError(NOT_REKORDBOX_MESSAGE);
  }
  const tracks: RbTrack[] = [];
  for (const tag of trackTags(collectionText(text))) {
    const attrs = attributes(tag);
    // A playlist reference carries Key and nothing else.
    if (!('Name' in attrs)) continue;
    tracks.push({
      title: (attrs.Name ?? '').trim(),
      artist: (attrs.Artist ?? '').trim(),
      bpm: parseBpm(attrs.AverageBpm ?? ''),
      key: parseKeyText(attrs.Tonality ?? ''),
      seconds: parseSeconds(attrs.TotalTime ?? ''),
    });
  }
  if (tracks.length === 0) {
    throw new RekordboxFormatError(NO_TRACKS_MESSAGE);
  }
  return tracks;
}
