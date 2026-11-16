import type { Messages } from '../index';
import { count } from './count';

export const frame: Messages['frame'] = {
  nav: {
    main: 'Principale',
    overview: 'Vue d’ensemble',
    overviewShort: 'Accueil',
    listening: 'Écoute',
    library: 'Bibliothèque',
    mix: 'Mix',
    settings: 'Réglages',
  },
  tabs: {
    top: 'Top',
    crate: 'Crate',
    playlists: 'Playlists',
    artists: 'Artistes',
  },
  crateViews: {
    rotation: 'Rotation intensive',
    gems: 'Pépites oubliées',
    classics: 'Classiques',
    year: 'Par année',
    finish: 'Taux d’écoute complète',
    'rarely-played': 'Rarement joués',
  },
  titles: {
    playlist: 'Playlist',
    artist: 'Artiste',
    import: 'Importer l’historique d’écoute',
  },
  topBar: {
    back: 'Retour',
    search: 'Recherche',
  },
  loading: 'Chargement de votre bibliothèque…',
  closeDetails: 'Fermer les détails',
  listDetail: {
    showing: (shown: string, total: string): string =>
      `${shown} affichés sur ${total}`,
    showMore: (n: string): string => `Afficher ${n} de plus`,
  },
  activity: {
    running: (label: string): string => `En cours\u00a0: ${label}`,
    jobsRunning: (n: number): string => `${count('tâche')(n)} en cours`,
    panel: 'Tâches en cours',
  },
  jobs: {
    sync: 'Synchronisation des playlists',
    import: 'Import de l’historique',
    years: 'Recherche des années de sortie',
    bpmKey: 'Recherche du BPM et de la tonalité',
    rekordbox: 'Import rekordbox',
    reach: 'Recherche des artistes',
    push: 'Envoi au serveur',
    pull: 'Chargement depuis le serveur',
    like: 'Ajout aux Titres likés',
    createPlaylist: 'Création de la playlist',
    spotifyCheck: 'Vérification sur Spotify',
    mixLookup: 'Recherche du mix',
  },
  banner: { dismiss: 'Fermer' },
  empty: {
    playlists: 'Aucune playlist pour l’instant.',
    topLists: 'Aucun classement Top pour l’instant.',
    artists: 'Aucun artiste pour l’instant.',
    action: 'Synchro dans Réglages',
  },
  noData: 'aucune donnée',
  noMatch: {
    artists: (query: string): string =>
      `Aucun artiste ne correspond à «\u00a0${query}\u00a0».`,
    clear: 'Effacer le filtre',
  },
  play: (artist: string, title: string): string =>
    `Écouter ${artist} – ${title} sur Spotify`,
  openInSpotify: 'Ouvrir dans Spotify',
  dig: {
    search: (site: string): string => `Chercher sur ${site}`,
    openInShazam: 'Ouvrir dans Shazam',
  },
  fileDrop: {
    refused: (name: string, types: string): string =>
      `${name} ne peut pas servir ici\u00a0: déposez un fichier ${types}.`,
    matching: 'du bon type',
    or: (head: string, last: string): string => `${head} ou ${last}`,
  },
  progressUnit: 'playlists',
  loginFailed: (reason: string): string =>
    `Échec de la connexion\u00a0: ${reason}`,
};
