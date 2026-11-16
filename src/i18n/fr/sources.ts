import type { Messages } from '../index';
import { count, int } from './count';

const titre = count('titre');

export const sources: Messages['sources'] = {
  server: {
    missingTable:
      'Le serveur n’a pas encore de tables. Appliquez supabase/migrations/0001_init.sql (voir le README).',
    linkBrowser:
      'Ouvrez le lien dans le navigateur qui l’a demandé, dans les 10 minutes.',
    networkError: (reason) => `Erreur réseau\u00a0: ${reason}`,
    unexpectedAnswer: (detail) => `Réponse inattendue\u00a0: ${detail}`,
    paused:
      'Le projet du serveur est en pause. Relancez-le depuis le tableau de bord Supabase.',
    unavailable: (status) => `Serveur indisponible (HTTP ${status})`,
    tooLarge: 'Lot trop volumineux pour le serveur.',
    tooManyIn: (seconds) =>
      `Trop de requêtes. Réessayez dans ${seconds} secondes.`,
    tooManyMinute: 'Trop de requêtes. Réessayez dans une minute.',
    noTokens: 'aucun jeton dans la réponse',
    notAList: 'pas une liste',
    noCreatedRow: 'Le serveur a répondu sans la ligne créée.',
  },
  session: {
    personChanged:
      'La personne connectée a changé dans un autre onglet. Rechargez.',
    signedOut: 'Déconnecté du serveur.',
    usedElsewhere:
      'La session du serveur a servi dans un autre navigateur. Reconnectez-vous au serveur.',
    notSignedIn: 'Non connecté au serveur.',
  },
  sync: {
    updateApp:
      'Le serveur contient des données écrites par une version plus récente de l’app. Rechargez pour la mettre à jour.',
    unexpectedJobRow:
      'Le serveur a renvoyé une ligne de demande inattendue. Synchronisez et réessayez.',
    couldNotClear: (table, message) =>
      `Impossible de vider ${table}\u00a0: ${message}`,
    usageNoNumber: 'storage_used() n’a renvoyé aucun nombre.',
  },
  shared: {
    notSignedIn: 'Non connecté au serveur',
    noAnswer: 'Le serveur n’a pas répondu',
    notAList: 'Réponse inattendue\u00a0: pas une liste',
  },
  lookupPass: {
    byId: 'par identifiant de titre',
    byIsrc: 'nouvel essai par ISRC',
    years: 'années de sortie',
    rids: 'identifiants ReccoBeats',
    shared: 'base partagée',
  },
  musicbrainz: {
    unreachable: (reason) => `MusicBrainz est injoignable\u00a0: ${reason}`,
    serverError: (status) => `Erreur du serveur MusicBrainz ${status}`,
    error: (status) => `Erreur MusicBrainz ${status}`,
    malformed: 'MusicBrainz a renvoyé une réponse mal formée',
  },
  deezer: {
    unreachable: (reason) => `Deezer est injoignable\u00a0: ${reason}`,
    overQuota: (attempts, code) =>
      `Deezer a dépassé son quota\u00a0: ${int(attempts)} tentatives refusées (erreur ${code})`,
  },
  wikidata: {
    noResults: 'Wikidata n’a renvoyé aucun résultat',
    unreachable: (reason) => `Wikidata est injoignable\u00a0: ${reason}`,
    error: (status) => `Erreur Wikidata ${status}`,
    malformed: 'Wikidata a renvoyé une réponse mal formée',
  },
  reccobeats: {
    unreachable: (reason) => `ReccoBeats est injoignable\u00a0: ${reason}`,
    wait: (minutes) =>
      `ReccoBeats demande d’attendre ${minutes} min. Réessayez plus tard.`,
    rateLimited:
      'ReccoBeats\u00a0: limite de débit atteinte trop de fois de suite. Réessayez plus tard.',
    serverError: (status) => `Erreur du serveur ReccoBeats ${status}`,
    error: (status) => `Erreur ReccoBeats ${status}`,
    malformed: 'ReccoBeats a renvoyé une réponse mal formée',
  },
  jsonp: {
    failed: (url) => `Échec de la requête JSONP\u00a0: ${url}`,
    timedOut: (ms, url) =>
      `La requête JSONP a expiré après ${ms} ms\u00a0: ${url}`,
  },
  rekordbox: {
    notRekordbox:
      'Ce n’est pas une collection rekordbox. Dans rekordbox, utilisez «\u00a0File > Export Collection in xml format\u00a0», puis choisissez ce .xml ici.',
    noTracks:
      'Cette collection rekordbox n’a aucun titre. Mettez les titres dans au moins une playlist, exportez à nouveau et réessayez.',
    workerStart: (reason) =>
      `Impossible de démarrer le worker rekordbox\u00a0: ${reason}`,
    workerCrashed: 'Le worker rekordbox s’est arrêté de façon inattendue',
  },
  like: {
    checkFailed: (reason) =>
      `Impossible de vérifier vos Titres likés\u00a0: ${reason}`,
    unexpected: 'Spotify a renvoyé une réponse inattendue',
    question: (toLike, total) =>
      toLike < 2
        ? `${int(toLike)} sur ${titre(total)} de votre dernière synchronisation n’est pas encore dans vos Titres likés. Le liker\u00a0?`
        : `${int(toLike)} sur ${titre(total)} de votre dernière synchronisation ne sont pas encore dans vos Titres likés. Les liker\u00a0?`,
    liked: (n) => count('titre liké', 'titres likés')(n),
    alreadyLiked: (n) => `${int(n)} ${n < 2 ? 'déjà liké' : 'déjà likés'}`,
    oneAlready: 'Votre seul titre est déjà dans vos Titres likés',
    allAlready: (n) => `Les ${titre(n)} sont déjà dans vos Titres likés`,
    nothing: 'Aucun titre Spotify à liker',
    skipped: (n) => count('fichier local ignoré', 'fichiers locaux ignorés')(n),
    stopped: (liked, toLike, message) =>
      `${int(liked)} sur ${int(toLike)} likés, puis\u00a0: ${message}`,
    button: 'Liker tous les titres',
    liking: 'Like en cours…',
    likingOther: 'Like d’une autre playlist…',
  },
  storageFull:
    'Le stockage local est plein. Libérez de l’espace sur le téléphone et réessayez.',
  db: {
    blocked:
      'Un autre onglet de DJ Data garde l’ancienne base de données ouverte. Fermez les autres onglets de cette app (et sa fenêtre d’écran d’accueil), puis rechargez.',
    slow: 'La base de données locale met du temps à s’ouvrir. Si cela dure, fermez les autres onglets de DJ Data (et sa fenêtre d’écran d’accueil), puis rechargez.',
    superseded:
      'DJ Data a été mis à jour dans un autre onglet. Rechargez celui-ci pour continuer.',
    stillOpen:
      'Les données locales sont encore ouvertes dans un autre onglet. Fermez les autres onglets et réessayez.',
  },
};
