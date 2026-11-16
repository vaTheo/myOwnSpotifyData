import { normalizeMixUrl } from './url';

/** The only iframe src prefix the app will build a player from (spec §5.3). */
export const SC_PLAYER_PREFIX = 'https://w.soundcloud.com/player/';

/**
 * The player src of a mix that stored none (a mix made by the worker or a
 * Tracklistify import): the literal SC_PLAYER_PREFIX and the encoded
 * permalink, so no request is made and nothing foreign is injected. null
 * when the url is not a SoundCloud permalink (a short link, free text).
 */
export function soundcloudPlayerSrc(url: string): string | null {
  const norm = normalizeMixUrl(url);
  return norm === null
    ? null
    : `${SC_PLAYER_PREFIX}?url=${encodeURIComponent(norm)}&visual=true`;
}
