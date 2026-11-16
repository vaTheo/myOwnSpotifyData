import type { Messages } from '../index';
import { count, int } from './count';

const lastMonths = (months: number): string =>
  months < 2 ? 'le dernier mois' : `les ${int(months)} derniers mois`;

export const overview: Messages['overview'] = {
  screen: {
    label: 'Vue d’ensemble',
    playsPerMonth: 'Écoutes par mois',
    listenTo: (artist, title) => `Écouter ${artist} – ${title}`,
  },
  actions: {
    importHistory: 'Importer l’historique',
    syncInSettings: 'Synchro dans Réglages',
    importAgain: 'Importer à nouveau',
    lookUp: 'Rechercher dans Réglages',
    openMix: 'Ouvrir Mix',
    signIn: 'Se connecter au serveur dans Réglages',
  },
  listening: {
    title: 'Écoute',
    noHistory: 'Aucun historique d’écoute pour l’instant.',
    plays: 'Écoutes',
    time: 'Temps d’écoute',
    years: 'Années',
    imported: 'Importé',
    stale: (month) =>
      `L’historique s’arrête en ${month}. Importez un export plus récent pour les dernières écoutes.`,
  },
  rotation: {
    title: 'Rotation intensive',
    empty:
      'La rotation intensive est calculée à partir de votre historique d’écoute.',
    reimport: 'Votre historique doit être réimporté pour les vues par mois.',
    tracks: 'Titres',
    window: 'Période',
    windowValue: (months) => lastMonths(months),
    nothing: (months) => `Rien sur ${lastMonths(months)}.`,
  },
  top: {
    title: 'Top du mois',
    empty: 'Aucun top pour l’instant.',
  },
  library: {
    title: 'Bibliothèque',
    empty: 'Aucune playlist pour l’instant.',
    playlists: 'Playlists',
    tracks: 'Titres',
    lastSync: 'Dernière synchro',
    never: 'jamais',
    retryAfter: (date) => `Réessayez après le ${date}.`,
    retryNow: 'Vous pouvez réessayer maintenant.',
    quota: (pending) =>
      `Quota Spotify atteint, ${count('playlist')(pending)} en attente.`,
    pendingError: (pending, message) =>
      `${count('playlist')(pending)} en attente. Dernière erreur\u00A0: ${message}`,
    lastError: (message) => `Dernière erreur\u00A0: ${message}`,
  },
  coverage: {
    title: 'Couverture',
    empty: 'Aucun titre ni artiste à rechercher pour l’instant.',
    audio: 'Données audio',
    audioValue: (covered, total) =>
      `${int(covered)} sur ${count('titre')(total)}`,
    reach: 'Audience des artistes',
    reachValue: (covered, total) =>
      `${int(covered)} sur ${count('artiste')(total)}`,
    rekordbox: 'Import rekordbox',
    reachAsOf: 'Audience au',
    gated: 'Sous le radar a besoin de l’audience de vos artistes.',
  },
  mix: {
    title: 'Dernier mix enregistré',
    reading: 'Lecture de vos mix enregistrés…',
    empty: 'Aucun mix enregistré pour l’instant.',
    saved: 'Enregistré',
  },
  server: {
    title: 'Serveur',
    signedOut: 'Déconnecté de votre serveur.',
    lastSync: 'Dernière synchro',
    never: 'jamais',
    waiting: 'En attente d’envoi',
    now: 'En cours',
    saving: 'Envoi au serveur',
    loading: 'Chargement depuis le serveur',
    offline: (message) =>
      `Serveur hors ligne\u00A0: ${message} Les données locales sont utilisées.`,
    paused:
      'Serveur en pause. Relancez-le depuis le tableau de bord Supabase, puis rouvrez l’app.',
    rejected: (rows) =>
      rows < 2
        ? `${count('ligne')(rows)} rejetée par le contrôle de sécurité et écartée.`
        : `${count('ligne')(rows)} rejetées par le contrôle de sécurité et écartées.`,
  },
  topScreen: {
    tracks: 'Titres',
    artists: 'Artistes',
    compare: 'Comparer les périodes',
    name: 'Nom',
    savedTracks: 'Titres enregistrés',
    savedTrackOne: 'titre enregistré',
    savedTrackMany: 'titres enregistrés',
    playlists: 'Playlists',
    playlistOne: 'playlist',
    playlistMany: 'playlists',
    tracksLabel: (period) => `Top titres · ${period}`,
    artistsLabel: (period) => `Top artistes · ${period}`,
  },
  search: {
    groups: {
      track: 'Titres',
      artist: 'Artistes',
      playlist: 'Playlists',
      mix: 'Mix',
    },
    recent: 'Récents',
    showAll: (total) => `Afficher les ${int(total)}`,
    label: 'Recherche',
    close: 'Fermer la recherche',
    field: 'Rechercher des titres, artistes, playlists et mix',
    placeholder: 'Rechercher titres, artistes, playlists, mix',
    clear: 'Effacer la recherche',
    loading: 'Votre bibliothèque est encore en chargement.',
    prompt:
      'Recherchez les titres, artistes, playlists et mix enregistrés dans ce navigateur.',
    nothing: (query) => `Aucun résultat pour «\u00A0${query}\u00A0»`,
    results: 'Résultats',
    withPlays: (artist, plays) => `${artist} · ${count('écoute')(plays)}`,
    unknownArtist: 'Artiste inconnu',
    savedTracks: count('titre enregistré', 'titres enregistrés'),
    inTopArtists: 'Dans votre top artistes',
    savedOn: (date) => `enregistré le ${date}`,
  },
};
