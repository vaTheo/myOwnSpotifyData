import type { Messages } from '../index';
import { count, int, word } from './count';

const track = count('titre');
const artist = count('artiste');
const playlist = count('playlist');
const file = count('fichier');
const row = count('ligne');
/** A size in megabytes, one decimal, French form: `1,5`. */
const mb = (n: number): string =>
  n.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export const settings: Messages['settings'] = {
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
  words: {
    upToDate: 'À jour',
    waiting: 'En attente',
    failed: 'Échec',
    running: 'En cours',
    autoOff: 'Mises à jour automatiques désactivées',
    neverSynced: 'Jamais synchronisé',
    synced: 'Synchronisé',
    imported: 'Importé',
    notImported: 'Non importé',
    noTracks: 'Aucun titre pour l’instant',
    noArtists: 'Aucun artiste pour l’instant',
    notLookedUp: 'Pas encore recherché',
    syncing: 'Synchronisation',
    updating: 'Mise à jour',
    importing: 'Import',
    spotifyLimit: 'En pause (Spotify)',
    offline: 'Hors ligne',
    paused: 'En pause',
    changesToSend: 'Modifications à envoyer',
    never: 'Jamais',
    off: 'Désactivé',
    bpmKey: 'BPM et tonalité',
    lastError: (message) => `Dernière erreur\u00A0: ${message}`,
    lookingUp: 'Recherche…',
    waitingButton: 'En attente…',
    nothingNew: 'Rien de nouveau à rechercher.',
  },
  datasets: {
    library: 'bibliothèque',
    history: 'historique',
    features: 'données audio',
    reach: 'audience',
    mixes: 'mix',
  },
  lines: {
    usedShare: (usedMb, freeMb) =>
      `${mb(usedMb)}\u00A0Mo sur ${mb(freeMb)}\u00A0Mo utilisés sur le serveur`,
    signedInAs: (email) => `Connecté au serveur en tant que ${email}.`,
    signedInOwner: 'Connecté au serveur en tant que propriétaire.',
    coverage: (covered, total) =>
      `BPM et tonalité pour ${int(covered)} sur ${track(total)}`,
    years: (dated, total) =>
      `Années de sortie\u00A0: ${int(dated)} sur ${track(total)}`,
    found: (n) => `${int(n)} ${word('trouvé', 'trouvés')(n)}`,
    notFound: (n) => `${int(n)} ${word('non trouvé', 'non trouvés')(n)}`,
    yearsFound: (n) => count('année')(n),
    sharedNoticeBpm:
      'Les BPM et tonalités trouvés par une recherche sont partagés avec les autres personnes de ce serveur\u00A0; votre bibliothèque, vos écoutes, vos valeurs rekordbox et vos mix ne le sont jamais.',
    sharedNoticeReach:
      'Les auditeurs et fans trouvés par une recherche sont partagés avec les autres personnes de ce serveur\u00A0; votre bibliothèque, vos écoutes, vos valeurs rekordbox et vos mix ne le sont jamais.',
    sharedError: (error) =>
      `La base partagée n’a pas pu être utilisée (${error})\u00A0; tout a été recherché directement auprès des sources, comme avant.`,
    sharedTracks: (fromStore, sent) =>
      `Depuis la base partagée\u00A0: ${track(fromStore)}, sans recherche. Partagés\u00A0: ${count('nouveau', 'nouveaux')(sent)}.`,
    sharedArtists: (fromStore, sent) =>
      `Depuis la base partagée\u00A0: les chiffres de ${artist(fromStore)}, sans recherche. Partagés\u00A0: ${count('nouveau', 'nouveaux')(sent)}.`,
    parsed: (n) => `${int(n)} ${word('lu', 'lus')(n)}`,
    withBpm: (n) => `${int(n)} avec BPM`,
    withKey: (n) => `${int(n)} avec tonalité`,
    matched: (n) => `${int(n)} ${word('associé', 'associés')(n)}`,
    unmatched: (n) => `${int(n)} ${word('non associé', 'non associés')(n)}`,
    reachFor: (covered, artists) =>
      `Audience connue pour ${int(covered)} sur ${artist(artists)}`,
    wellKnown: (n) => `${int(n)} ${word('connu', 'connus')(n)}`,
    lookedUp: (n) => `${artist(n)} ${word('recherché', 'recherchés')(n)}`,
    newNumbers: count('nouveau chiffre', 'nouveaux chiffres'),
    unresolved: (n) => `${int(n)} ${word('non résolu', 'non résolus')(n)}`,
    paused: (source) =>
      `${source} ne répond plus après trois essais\u00A0; cette source est ignorée pour le reste de cette recherche.`,
    pending: {
      library: 'Bibliothèque',
      history: 'Historique d’écoute',
      features: 'Données audio',
      reach: 'Audience des artistes',
      mixes: 'Mix',
    },
    pendingLine: (value) => `Modifications en attente d’envoi\u00A0: ${value}`,
    deviceUsers: (n) =>
      `${count('personne')(n)} ${word('utilise', 'utilisent')(n)} cet appareil`,
    dangerServer:
      'Retire votre connexion Spotify et supprime de ce navigateur vos playlists et nombres d’écoutes en cache. Vos données sur le serveur et celles des autres personnes sur cet appareil sont conservées.',
    dangerLocal:
      'Retire la connexion Spotify et supprime de ce navigateur toutes les playlists et tous les nombres d’écoutes en cache. Les données du serveur sont conservées.',
  },
  status: {
    syncing: (done, total) =>
      `Synchronisation · ${int(done)} sur ${playlist(total)}`,
    updatingTracks: (done, total) =>
      `Mise à jour · ${int(done)} sur ${track(total)}`,
    updatingArtists: (done, total) =>
      `Mise à jour · ${int(done)} sur ${artist(total)}`,
    importing: (done, total) => `Import · ${int(done)} sur ${file(total)}`,
  },
  closed: {
    scopeFailed: (scope) => `${scope} en échec`,
    runningPct: (pct) => `En cours ${pct}\u00A0%`,
    scopeRunning: (scope) => `${scope} en cours`,
    scopeRunningPct: (scope, pct) => `${scope} en cours ${pct}\u00A0%`,
    sharedStore: 'Base partagée',
    notSignedInSpotify: 'Non connecté à Spotify',
    notAllowed: (writes) => `Pas encore autorisé\u00A0: ${writes}`,
    connectAgain: 'Se reconnecter',
    signedInSpotify: 'Connecté à Spotify',
    files: (done, total) => `${int(done)} / ${file(total)}`,
    stopped: (n, sources) =>
      `${sources} ${n < 2 ? 'ne répond plus' : 'ne répondent plus'}`,
    skipped: (n) =>
      n < 2
        ? 'source ignorée pour le reste de la recherche'
        : 'sources ignorées pour le reste de la recherche',
    notSetUp: 'Non configuré',
    notSignedIn: 'Non connecté',
    lastSync: (at) => `dernière synchro ${at}`,
    lastSyncNever: 'jamais synchronisé',
    lastSyncCap: (at) => `Dernière synchro ${at}`,
    pausedByServer: 'En pause côté serveur',
    sending: (dataset) => `Envoi\u00A0: ${dataset}`,
    fetching: (dataset) => `Récupération\u00A0: ${dataset}`,
    rows: (done, total) => `${int(done)} / ${row(total)}`,
    rejected: (n) =>
      `${row(n)} ${n < 2 ? 'rejetée' : 'rejetées'} par le contrôle de sécurité`,
    danger:
      'Se déconnecter supprime les données de ce navigateur · celles du serveur sont conservées',
  },
  updates: {
    labelHistory: 'Historique',
    playlists: (done, total) => `${int(done)} / ${playlist(total)}`,
    tracks: (done, total) => `${int(done)} / ${track(total)}`,
    artists: (done, total) => `${int(done)} / ${artist(total)}`,
    syncedAt: (at) => `Synchronisé le ${at}`,
    nextAfter: (at) => `prochaine synchro après le ${at}`,
    pausedSpotify: (at) => `En pause (Spotify) jusqu’au ${at}`,
    withBpm: (covered, total) =>
      `${int(covered)} / ${track(total)} avec BPM ou tonalité`,
    checked: (at) => `Vérifié le ${at}`,
    needsFile: 'il faut un fichier',
    importedAt: (at) => `Importé le ${at}`,
    needsExport: 'il faut un nouvel export',
    needsXml: 'il faut un nouveau XML',
  },
  account: {
    description:
      'La connexion Spotify avec laquelle ce navigateur lit votre bibliothèque. Elle permet aussi les deux écritures que vous lancez d’un geste\u00A0: Créer la playlist et Liker tous les titres.',
    likeAll: 'Liker tous les titres',
    createPlaylist: 'Créer la playlist',
    signedIn: 'Connecté à Spotify.',
    notSignedIn: 'Non connecté à Spotify.',
    notAllowed: (writes, n) =>
      `Pas encore autorisé\u00A0: ${writes}. Reconnectez-vous pour ${n < 2 ? 'l’autoriser' : 'les autoriser'}.`,
    note: 'Se reconnecter vous déconnecte puis vous reconnecte. Rien n’est supprimé dans ce navigateur.',
  },
  audio: {
    description:
      'BPM et tonalité de vos titres, depuis ReccoBeats et votre collection rekordbox\u00A0; années de sortie depuis ReccoBeats.',
    lookUp: 'Rechercher BPM et tonalité',
    classic: 'Classique',
    syncFirst: 'Synchronisez ou importez d’abord un historique.',
    lookingUpPass: (pass) => `Recherche · ${pass}`,
    passById: 'par identifiant de titre',
    passByIsrc: 'nouvel essai par ISRC',
    passYears: 'années de sortie',
    passRids: 'identifiants ReccoBeats',
    passShared: 'base partagée',
    tracks: 'titres',
    files: 'fichiers',
    xmlLabel:
      'XML de la collection rekordbox («\u00A0File > Export Collection in xml format\u00A0»)',
    xmlHint: 'Déposez le XML ici ou choisissez-le',
    importedOn: (date) => `importé le ${date}`,
    keyNotation: 'Notation des tonalités',
    credit: 'Données audio via ReccoBeats (audio features de Spotify).',
  },
  history: {
    description:
      'Nombres d’écoutes depuis votre export de l’historique de streaming étendu de Spotify.',
    zoneWarning: (zone) =>
      `Ce navigateur est maintenant sur ${zone}. Réimportez pour regrouper les mois à nouveau.`,
    update: 'Mettre à jour',
    import: 'Importer l’historique',
    none: 'Aucun historique importé pour l’instant.',
  },
  reach: {
    description:
      'Auditeurs et fans de vos artistes, pour Sous le radar\u00A0: environ 45 à 50 minutes pour 1\u00A0000 artistes, et vous pouvez l’arrêter et reprendre plus tard.',
    lookUp: 'Rechercher les artistes',
    syncFirst: 'Synchronisez d’abord vos playlists.',
    asOf: (date) => `au ${date}`,
    resolving: (source) => `Résolution des artistes · ${source}`,
    batches: 'lots',
    artists: 'artistes',
    credit:
      'Données d’artistes via MusicBrainz et ListenBrainz · Deezer · Wikidata (CC0) · Wikipedia (CC BY-SA)',
  },
  server: {
    description:
      'Facultatif\u00A0: votre propre serveur garde vos données à jour entre vos appareils.',
    signInHelp:
      'Connectez-vous au serveur avec un lien envoyé à votre e-mail. Ouvrez le lien dans ce navigateur, dans les 10 minutes.',
    syncNow: 'Synchroniser avec le serveur',
    unset:
      'Aucun serveur configuré. Ce navigateur garde ses propres données. Pour les partager entre vos appareils, renseignez les deux valeurs de serveur décrites dans le README.',
    offline: (message, at) =>
      `Serveur hors ligne\u00A0: ${message} Dernière synchro le ${at}. Les données locales sont utilisées.`,
    offlineNever: (message) =>
      `Serveur hors ligne\u00A0: ${message} Jamais synchronisé. Les données locales sont utilisées.`,
    pausedBefore: 'Serveur en pause. Relancez-le depuis le ',
    pausedLink: 'tableau de bord Supabase',
    pausedAfter: ', puis rouvrez l’app. Les données locales sont utilisées.',
    lastSync: (at) => `Dernière synchro avec le serveur\u00A0: ${at}`,
    lastSyncNever: 'Dernière synchro avec le serveur\u00A0: jamais',
    data: 'Données',
    here: 'Ici',
    server: 'Serveur',
    rows: 'Lignes',
    rejected: (n) =>
      n < 2
        ? `${row(n)} rejetée par le contrôle de sécurité et écartée.`
        : `${row(n)} rejetées par le contrôle de sécurité et écartées.`,
    rowsUnit: 'lignes',
    signOut: 'Déconnexion serveur',
    remove: 'Supprimer les données du serveur',
    note: 'Déconnexion serveur garde vos données ici et sur le serveur. Supprimer les données du serveur efface toutes vos données sur le serveur et garde la copie de ce navigateur.',
  },
  sync: {
    description:
      'Copie vos playlists depuis Spotify dans ce navigateur, seulement quand vous touchez Synchroniser maintenant.',
    syncing: 'Synchronisation…',
    syncNow: 'Synchroniser maintenant',
    lastSync: (at) => `Dernière synchro\u00A0: ${at}`,
    lastSyncNever: 'Dernière synchro\u00A0: jamais',
    working: 'En cours',
    playlists: 'playlists',
    quotaAfter: (pending, at) =>
      `Quota Spotify atteint, ${playlist(pending)} en attente. Réessayez après le ${at}.`,
    quotaNow: (pending) =>
      `Quota Spotify atteint, ${playlist(pending)} en attente. Vous pouvez réessayer maintenant.`,
    autoNote:
      'Avec les mises à jour automatiques activées, ouvrir l’app synchronise Spotify quand la dernière synchro date de plus de 12 heures, puis recherche BPM et tonalité, puis l’audience des artistes, seulement ce qui manque.',
  },
  syncStatus: {
    title: 'État de la synchronisation',
    auto: 'Mises à jour automatiques',
    on: 'Activé',
    off: 'Désactivé',
    retry: 'Réessayer',
  },
  danger: {
    confirm:
      'Se déconnecter et supprimer toutes les données locales\u00A0? Les données du serveur sont conservées.',
    disconnect: 'Se déconnecter',
  },
  page: {
    version: (version) => `DJ Data v${version}`,
  },
};
