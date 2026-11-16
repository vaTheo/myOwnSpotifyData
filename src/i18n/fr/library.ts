import type { Messages } from '../index';
import { count, int, word } from './count';

export const library: Messages['library'] = {
  columns: {
    name: 'Nom',
    tracks: 'Titres',
    playlists: 'Playlists',
    plays: 'Écoutes',
    listeners: 'Auditeurs',
    fans: 'Fans',
    trackUnit: word('titre'),
    playlistUnit: word('playlist'),
    listenerUnit: word('auditeur'),
    fanUnit: word('fan'),
  },
  playlists: {
    title: 'Playlists',
    lastSynced: 'Dernière synchro',
    syncedPrefix: 'synchro le ',
    status: 'État',
    pending: 'en attente',
    filter: 'Filtrer les playlists',
    clearFilter: 'Effacer le filtre',
    noMatch: (query) =>
      `Aucune playlist ne correspond à «\u00A0${query}\u00A0».`,
  },
  playlist: {
    notSynced: 'Playlist pas encore synchronisée.',
    back: 'Retour aux playlists',
    others: count('autre'),
    noPlays: 'Pas encore de nombre d’écoutes —',
    importLink: 'importez votre historique',
    byPlays: 'Par écoutes',
    playlistOrder: 'Ordre de la playlist',
    match: 'Compatibles',
    filters: 'Filtres',
    tableLabel: {
      matches: (name) => `${name}, compatibles`,
      order: (name) => `${name}, ordre de la playlist`,
      plays: (name) => `${name}, par écoutes`,
    },
    syncing: 'Synchronisation…',
    syncThis: 'Synchroniser cette playlist',
  },
  match: {
    selectSeed: 'Choisissez un titre de référence',
    matching: (name) => `Compatibles avec ${name}`,
    bpm: (bpm) => `${bpm} BPM`,
    clear: 'Effacer',
    noFeature: 'Pas encore de BPM ni de tonalité pour ce titre',
    noBpm: 'Pas de BPM pour ce titre — comparaison par tonalité seule',
    relation: 'Lien',
    noData: 'aucune donnée',
    sameKey: 'même tonalité',
    relative: 'relatif',
    boost: 'montée',
  },
  like: {
    needScope:
      'Cette app ne peut pas encore liker de titres — reconnectez-vous pour l’autoriser. Votre bibliothèque reste dans ce navigateur.',
    connectAgain: 'Se reconnecter pour autoriser les likes',
    checking: 'Vérification de vos Titres likés…',
    liking: 'Like en cours…',
    songs: 'titres',
  },
  artists: {
    bySavedTracks: 'Artistes par titres enregistrés',
    savedTracks: 'Titres enregistrés',
    underRadar: 'Sous le radar',
    filter: 'Filtrer les artistes',
  },
  artist: {
    noSaved: 'Aucun titre enregistré pour cet artiste.',
    back: 'Retour aux artistes',
    meta: (tracks, playlists) =>
      `${count('titre enregistré', 'titres enregistrés')(tracks)} dans ${count('playlist')(playlists)}`,
    noTracks: (name) => `Aucun titre enregistré de ${name} dans vos playlists.`,
    tableLabel: (name) => `Titres enregistrés de ${name}`,
    listeners: 'Auditeurs ListenBrainz',
    fans: 'Fans Deezer',
    noReach: 'Aucune donnée d’audience',
    asOf: (date) => `au ${date}`,
    wikiCredit: 'Chiffres Wikipedia CC BY-SA 4.0',
    lookUp: 'Rechercher les artistes',
  },
  radar: {
    noReach: 'Aucune donnée d’audience',
    unresolved: 'Pas encore résolus ·',
    lookUpLink: 'Rechercher les artistes ›',
    wellKnown: 'Connus',
    noRunTitle: 'Pas encore de données d’audience',
    noRunText:
      'Sous le radar montre les artistes de vos playlists qui ont la plus petite audience sur ListenBrainz et Deezer, et place en bas ceux qui ont un article Wikipedia. Il faut d’abord une recherche\u00A0: environ 45 à 50 minutes pour 1\u00A0000 artistes, et vous pouvez l’arrêter et la reprendre plus tard.',
    mostPlayed: 'Plus écoutés',
    fewestListeners: 'Moins d’auditeurs',
    fewestFans: 'Moins de fans',
    coverage: (covered, artists, date) =>
      `Données d’audience pour ${int(covered)} ${word('artiste')(covered)} sur ${int(artists)} · au ${date}`,
    noneYet: 'Pas encore d’artiste sous le radar.',
  },
  listen: {
    play: 'Écouter sur Spotify',
    webPage: 'Ouvrir la page web Spotify',
  },
  keys: {
    minor: (name) => `${name} mineur`,
  },
};
