import { msg } from '../../i18n';
import { IconButton } from './IconButton';

/**
 * Play a track in the Spotify app (round 017): a 48 px play icon whose link
 * is the app's own `spotify:track:<id>`, opened in place. The Mix's found
 * track and the play column of every track table draw this one button.
 */
export function PlayOnSpotify(p: {
  id: string;
  artist: string;
  title: string;
  class?: string;
}) {
  return (
    <IconButton
      icon="play_arrow"
      class={p.class}
      label={msg().frame.play(p.artist, p.title)}
      href={`spotify:track:${p.id}`}
    />
  );
}
