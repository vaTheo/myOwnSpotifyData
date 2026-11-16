import { intIn } from './fmt';
import type { Messages } from './index';

/**
 * Every text the app writes, in French (spec 031, ADR-18). Same shape as
 * `en.ts`; the names are the ones of the round's glossary. French agrees 0
 * and 1 in the singular, and keeps a no-break space before `:`, `?`, `!`.
 */
const int = (n: number): string => intIn('fr', n);
const count =
  (one: string, many: string) =>
  (n: number): string =>
    `${int(n)} ${n < 2 ? one : many}`;

export const fr: Messages = {
  n: {
    track: count('titre', 'titres'),
    play: count('écoute', 'écoutes'),
    artist: count('artiste', 'artistes'),
    playlist: count('playlist', 'playlists'),
    year: count('année', 'années'),
    month: count('mois', 'mois'),
    day: count('jour', 'jours'),
    song: count('titre', 'titres'),
    file: count('fichier', 'fichiers'),
    row: count('ligne', 'lignes'),
  },
  settings: {
    groups: {
      spotify: 'Spotify',
      data: 'Vos données',
      devices: 'Entre appareils',
      device: 'Cet appareil',
    },
    items: {
      account: 'Compte Spotify',
      sync: 'Synchronisation Spotify',
      history: 'Historique d’écoute',
      audio: 'Données audio',
      reach: 'Audience des artistes',
      server: 'Serveur',
      language: 'Langue',
      danger: 'Zone de danger',
    },
  },
  language: {
    names: { fr: 'Français', en: 'English' },
    choose: 'Langue',
    description: 'La langue dans laquelle l’application est écrite.',
    kept: 'Conservé sur cet appareil.',
  },
};
