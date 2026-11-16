import type { Messages } from '../index';
import { count, int } from './count';

export const n: Messages['n'] = {
  track: count('titre'),
  play: count('écoute'),
  artist: count('artiste'),
  playlist: count('playlist'),
  year: count('année'),
  month: count('mois', 'mois'),
  day: count('jour'),
  song: count('titre'),
  file: count('fichier'),
  row: count('ligne'),
};

export const months: Messages['months'] = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export const format: Messages['format'] = {
  period: {
    short_term: '4 semaines',
    medium_term: '6 mois',
    long_term: '1 an',
  },
  topLongTerm: 'Depuis toujours',
  minutes: (m) => `${m} min`,
  hours: (h) => `${int(h)} h`,
  hoursMinutes: (h, m) => `${int(h)} h ${m} min`,
  thousands: (k) => `${k}\u00A0k`,
  millions: (m) => `${m.toLocaleString('fr-FR')}\u00A0M`,
  notCounted: {
    short: (c) => `${int(c)} de moins de 30 s`,
    podcast: (c) => `${int(c)} podcast`,
    audiobook: (c) => `${int(c)} livre audio`,
    unattributed: (c) => `${int(c)} sans identifiant de titre`,
    malformed: (c) => `${int(c)} illisible`,
    line: (parts) => `Non comptées\u00A0: ${parts}`,
  },
  listeners: count('auditeur ListenBrainz', 'auditeurs ListenBrainz'),
  fans: count('fan Deezer', 'fans Deezer'),
  noReach: 'aucune donnée d’audience',
  wikipedia: (languages) => `Wikipedia · ${count('langue')(languages)}`,
  viewsPerYear: (views) => `${views} vues/an`,
  history: {
    imported: (date, plays, tracks) =>
      `Importé le ${date}\u00A0: ${plays} sur ${tracks}.`,
    range: (first, last) => `${first} – ${last}.`,
    zone: (zone) => `Mois calculés dans le fuseau ${zone}.`,
  },
  top: {
    comparing: 'Le classement de Spotify, période par période.',
    ranking: 'Le classement de Spotify pour cette période.',
    plays: 'Les écoutes viennent de votre import d’historique.',
  },
};

export const language: Messages['language'] = {
  names: { fr: 'Français', en: 'English' },
  choose: 'Langue',
  description: 'La langue dans laquelle l’application est écrite.',
  kept: 'Conservé sur cet appareil.',
};
