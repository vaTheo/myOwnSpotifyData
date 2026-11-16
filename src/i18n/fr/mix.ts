import type { Messages } from '../index';
import { count, int, word } from './count';

const refusesOften =
  'Shazam refuse souvent\u00a0: un VPN ou un réseau partagé\u00a0?';

export const mix: Messages['mix'] = {
  common: {
    cancel: 'Annuler',
    stop: 'Arrêter',
    stopping: 'Arrêt…',
    askAgain: 'Redemander',
    removeLink: 'Retirer le lien',
    moreFor: (name) => `Plus d’actions pour ${name}`,
    mixes: 'Mix',
  },
  columns: {
    time: 'Temps',
    artist: 'Artiste',
    title: 'Titre',
    label: 'Label',
    evidence: 'Fiabilité',
    released: 'Sortie',
    spotify: 'Spotify',
    listen: 'Écouter',
    review: 'Vérif.',
    more: 'Plus',
  },
  create: {
    title: 'Créer la playlist',
    notFound: (n) => count('introuvable')(n),
    notFoundSongs: (n, tracks) =>
      `${count('introuvable')(n)} (${count('titre')(tracks)})`,
    busyElsewhere:
      'La création de playlist tourne pour un autre mix\u00a0: lancez celle-ci quand elle se termine.',
    willAdd: (n) =>
      `${count('titre')(n)} ${word('sera ajouté', 'seront ajoutés')(n)}, dans l’ordre du set.`,
    creatingButton: 'Création de la playlist…',
    button: 'Créer la playlist depuis le mix',
    nothing: 'Aucun titre identifié à ajouter pour l’instant.',
    needScope:
      'Cette app ne peut pas encore créer de playlists — reconnectez-vous pour l’autoriser. Vos mix enregistrés restent dans ce navigateur.',
    connectAgain: 'Se reconnecter pour autoriser les playlists',
    matching: 'Correspondance des titres',
    unit: 'titres',
    creating: 'Création de la playlist…',
    adding: 'Ajout des titres…',
    created: (name, added, total) =>
      `Playlist «\u00a0${name}\u00a0» créée — ${int(added)} sur ${count('titre')(total)}`,
    failed: (message) => `Impossible de créer la playlist\u00a0: ${message}`,
    playlistCreated: 'Playlist créée ·',
    addedBefore: (added, total) =>
      `${int(added)} sur ${int(total)} ajoutés avant l’erreur.`,
  },
  rowLink: {
    label: 'Lien de titre Spotify',
    link: 'Lier',
  },
  detail: {
    fromTrackid: (n) => `Depuis TrackId.net · ${count('titre')(n)}`,
    openTrackid: 'Ouvrir sur TrackId.net ›',
    trackidEmpty:
      'TrackId.net connaît ce mix mais n’a encore identifié aucun titre ·',
    fromTracklistify: (n) => `Depuis Tracklistify · ${count('titre')(n)}`,
    fromComputer: (n) => `Depuis votre ordinateur · ${count('titre')(n)}`,
    fromComputerOn: (n, date) =>
      `Depuis votre ordinateur · ${count('titre')(n)} · ${date}`,
    fromDescription: 'Depuis la description du mix',
    linkOut: 'La description renvoie à une tracklist complète ·',
    nothingFound:
      'Rien trouvé automatiquement — collez une tracklist ci-dessous, ou lisez les commentaires du lecteur.',
    player: 'Lecteur SoundCloud',
    largerPlayer: 'Lecteur plus grand',
    pasteLinkOnly:
      'Cela ressemble à un lien vers une tracklist, pas à une tracklist. Ouvrez-le, copiez les titres et collez-les ici.',
    pasteNone: 'Aucun titre trouvé dans ce texte.',
    paste: 'Coller une tracklist',
    pastePlaceholder: 'p. ex. depuis MixesDB ou un commentaire du lecteur',
    addTracks: 'Ajouter ces titres',
    close: 'Fermer ce mix',
  },
  pane: {
    linkPlaceholder:
      'Collez un lien de mix (SoundCloud, ou tout set pour votre ordinateur)',
    earlier: (n) => `Demandes précédentes (${int(n)})`,
    importLabel: 'Ou importez un tracklist.json de Tracklistify',
    importHint: 'ou déposez-le ici',
    confirmRemove: 'Retirer ce mix enregistré\u00a0?',
    moveToTop: 'Placer en tête',
    saved: (date) => `enregistré le ${date}`,
    remove: 'Retirer',
    deleteForever: 'Supprimer définitivement',
    waiting: (n) =>
      `${count('demande')(n)} en attente ou en cours · vérification chaque minute.`,
    nothingWaiting: 'Rien en attente.',
    checking: 'Vérification…',
    checkNow: 'Vérifier maintenant',
    noSaved: 'Aucun mix enregistré pour l’instant.',
  },
  help: {
    summary: 'Lancer le worker sur votre ordinateur',
    introBefore:
      'Le worker prend les demandes ci-dessus, télécharge le set, l’identifie avec Shazam et renvoie la tracklist\u00a0; l’audio ne quitte jamais votre ordinateur. Téléchargez le fichier de votre système depuis la dernière',
    release: 'version',
    introAfterRelease:
      'et placez-le dans un dossier à part. Au premier démarrage, il écrit',
    introAfterEnv: 'à côté de lui\u00a0: remplissez',
    and: 'et',
    introAfterKey:
      '(les mêmes valeurs publiques que le serveur de l’app), relancez-le, saisissez votre e-mail et cliquez sur le lien du mail sur cet ordinateur. Il vérifie ensuite les demandes chaque minute jusqu’à ce que vous le fermiez.',
    file: 'Fichier',
    windows:
      '. Double-cliquez dessus\u00a0; à «\u00a0Windows a protégé votre ordinateur\u00a0», choisissez Informations complémentaires → Exécuter quand même (le fichier n’est pas signé).',
    macArm: '(Apple silicon\u00a0: M1 et suivants) ou',
    macIntel: '(Intel). Dans le Terminal, dans son dossier\u00a0:',
    macThen:
      ', puis clic droit dessus dans le Finder → Ouvrir la première fois (non signé), ou lancez',
    linuxFolder: '. Dans un terminal, dans son dossier\u00a0:',
    then: 'puis',
    codeSummary: 'Depuis le code (tout système, Python 3.11–3.13 et uv)',
    codeCopy: ', copiez',
    codeTo: 'en',
    codeFill: 'et remplissez les deux valeurs, puis',
    vpn: `Ne lancez pas le worker derrière un VPN\u00a0: Shazam compte les appels par adresse, et l’adresse d’un VPN est partagée par beaucoup de monde, il refuse donc souvent. Si le téléphone affiche «\u00a0${refusesOften}\u00a0», coupez le VPN.`,
    youtube:
      'Les liens YouTube demandent aussi Node ou Deno installé sur l’ordinateur\u00a0; SoundCloud, Mixcloud et les autres n’ont besoin de rien.',
    manual: 'Manuel complet ›',
  },
  workspace: {
    hasError: '(a une erreur)',
    notHere: 'Ce mix enregistré n’est pas dans ce navigateur.',
    back: 'Retour à vos mix',
    empty: 'Collez un lien, importez un JSON ou choisissez un mix enregistré',
  },
  review: {
    busyOther:
      'Vérifier sur Spotify lit un autre mix\u00a0: vérifiez celui-ci quand il se termine.',
    check: 'Vérifier sur Spotify',
    checked: (done, total) =>
      `${int(done)} ${word('vérifié', 'vérifiés')(done)} sur ${int(total)}`,
    stopped: (line) => `Arrêté · ${line}`,
    line: (n, found, notFound) =>
      `${count('titre')(n)} · ${int(found)} sur Spotify · ${count('introuvable')(notFound)}`,
    filterCaption:
      'Masqués, pas supprimés. Créer la playlist ajoute tous les titres identifiés, pas seulement ceux du filtre.',
    chips: {
      all: 'Tous',
      notOnSpotify: 'Pas sur Spotify',
      heardOnce: 'Entendu une fois',
      solid: 'Solide',
      flagged: 'Signalés',
    },
    chip: (label, n) => `${label} (${int(n)})`,
  },
  run: {
    warnings: count('avertissement'),
  },
  row: {
    playOnSpotify: 'Écouter sur Spotify',
    shazam: (track) => `Ouvrir ${track} dans Shazam`,
    searchSoundcloud: (track) => `Chercher ${track} sur SoundCloud`,
    secondListen: 'deuxième écoute',
    secondListenSpeed: (speed) => `deuxième écoute · ${speed}`,
    fromDescription: 'depuis la description',
    fromChapter: 'depuis un chapitre',
    fromComment: 'depuis un commentaire',
    fromTrackid: 'depuis TrackId.net',
    fromTrackidSpan: (start, end) => `depuis TrackId.net · ${start} à ${end}`,
    fromTrackidRefs: (start, end, refs) =>
      `depuis TrackId.net · ${start} à ${end} · ${count('référence')(refs)}`,
    shazamAgrees: 'Shazam est d’accord',
    shazamNoMatch: 'Shazam\u00a0: aucune correspondance',
    shazamInstead: (artist, title) =>
      `Shazam a entendu ${artist} - ${title} à la place`,
    shazamElse: 'Shazam a entendu autre chose',
    heardBest: (hits, best) => `entendu ${hits}× · meilleur ${best}\u00a0%`,
    match: (best) => `${best}\u00a0% de correspondance`,
    decimal: (x) =>
      x.toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    originalSpeed: 'joué à sa vitesse d’origine',
    faster: (pct) => `joué ${pct}\u00a0% plus vite`,
    slower: (pct) => `joué ${pct}\u00a0% plus lentement`,
    level: {
      solid: 'Solide',
      once: 'Entendu une fois',
      outOfStep: 'Décalé',
      candidates: 'Nombreux candidats',
    },
    solidLong: 'Solide\u00a0: la position dans le titre avance au même rythme',
    solidHeard: (hits) =>
      `Solide\u00a0: entendu ${hits}×, la position dans le titre avance au même rythme`,
    outOfStepLong: 'Décalé\u00a0: la position dans le titre saute',
    outOfStepHeard: (hits) =>
      `Décalé\u00a0: entendu ${hits}×, la position dans le titre saute`,
    candidatesLong: (n) =>
      `Nombreux candidats\u00a0: Shazam en a listé ${n} pour cette réponse`,
    otherMixes: count('autre mix', 'autres mix'),
    yearFrom: {
      shazam: 'd’après Shazam',
      catalogue: 'd’après l’ISRC (Deezer ou MusicBrainz)',
      spotify: 'd’après Spotify (Créer la playlist ou Vérifier sur Spotify)',
    },
    year: (year, from) => `${year}, ${from}`,
    wideDescription: (n) =>
      `Tracklist de la description (${count('ligne')(n)}, sans repères de temps)`,
    wideComments: (n) =>
      `Tracklist des commentaires (${count('ligne')(n)}, sans repères de temps)`,
    gapClues: (n) => `${count('indice')(n)} dans ce passage`,
  },
  table: {
    tracklist: 'Tracklist',
    inPlaylists: (n) => `dans ${count('playlist')(n)}`,
    notHeard: 'non entendu',
    status: {
      unchecked: 'Non vérifié',
      found: 'Sur Spotify',
      notFound: 'Introuvable sur Spotify',
    },
    linkTo: (name) => `Lier un titre Spotify à ${name}`,
    notFoundLink: (name) =>
      `Introuvable sur Spotify\u00a0: lier un titre Spotify à ${name}`,
    remove: (name) => `Retirer ${name}`,
    listenTo: (name) => `Écouter ${name}`,
    edit: 'Modifier',
    delete: 'Supprimer',
    searchSpotify: 'Chercher sur Spotify',
    replaceLink: 'Remplacer le lien',
    listenMenu: 'Écouter…',
    gap: 'ID · non identifié',
    deleteGap: 'Supprimer ce passage',
    labelOptional: 'Label (facultatif)',
    timeOptional: 'Temps (m:ss, facultatif)',
    save: 'Enregistrer',
    sort: 'Tri',
    setOrder: 'Ordre du set',
    ascending: 'Croissant, touchez pour décroissant',
    descending: 'Décroissant, touchez pour croissant',
    decade: 'Décennie',
    allDecades: 'Toutes les décennies',
    addTrack: 'Ajouter un titre',
    saved: 'Enregistré ✓',
    saveMix: 'Enregistrer le mix',
  },
  menu: {
    back: '‹ Retour',
  },
  queue: {
    migration:
      'Appliquez la migration 0003 sur le serveur pour utiliser Annuler, Placer en tête et Arrêter',
    taken: 'Déjà pris par votre ordinateur',
    finished: 'Déjà terminé',
    unconfirmed:
      'La demande avait déjà avancé\u00a0; Vérifier maintenant pour voir où elle en est',
    failure: (prefix, message) => `${prefix}\u00a0: ${message}`,
  },
  chip: {
    playlistMade: 'Playlist créée',
    savedTracks: (n) => `Enregistré · ${count('titre')(n)}`,
    saved: 'Enregistré',
    queued: 'En file',
    stopping: 'Arrêt…',
    paused: 'En pause',
    identifying: 'Identification',
    failed: 'Échec',
    rejected: 'Refusé',
    found: 'Titres trouvés',
  },
  worker: {
    refusesOften,
    secondPass: (places, found) =>
      `Deuxième passage\u00a0: ${count('endroit')(places)} · ${count('trouvé')(found)}`,
    secondPassStopped: (places, found, why) =>
      `Deuxième passage\u00a0: ${count('endroit')(places)} · ${count('trouvé')(found)} · arrêté (${why})`,
    resumed: (kept) =>
      `Repris (${count('extrait conservé', 'extraits conservés')(kept)})`,
    stoppedEarly: (at, reason) => `Arrêté prématurément à ${at} (${reason})`,
    ask: 'Identifier sur mon ordinateur',
    steps: {
      download: 'Téléchargement',
      first: 'Premier passage',
      clues: 'Lecture des commentaires',
      send: 'Envoi',
      paused: 'En pause (Shazam)',
    },
    second: 'Deuxième passage',
    secondAt: (rest) => `Deuxième passage ${rest}`,
    pausedUntil: (time) => `En pause (Shazam) jusqu’à ${time}`,
    minutesLeft: (n) => `environ ${n}\u00a0min restantes`,
    stale: (time) =>
      `dernières nouvelles ${time}\u00a0: l’ordinateur n’envoie plus de nouvelles`,
    stoppingNote: 'arrêt…',
    waiting: (when) => `En attente de votre ordinateur depuis ${when}`,
    runningOn: (by, when) => `En cours sur ${by} depuis ${when}`,
    runningHere: (when) => `En cours sur votre ordinateur depuis ${when}`,
    rejected: 'Résultat refusé — redemandez',
    done: (when) => `Terminé ${when}`,
    doneNote: (when, note) => `Terminé ${when} · ${note}`,
    failed: (when, reason) => `Échec ${when}\u00a0: ${reason}`,
    failedNoReason: (when) => `Échec ${when}\u00a0: aucune raison donnée`,
    server: {
      unset: 'Serveur non configuré (Réglages)',
      signedOut: 'Connectez-vous au serveur (Réglages)',
      offline: 'Serveur injoignable',
      paused: 'Serveur en pause — relancez-le depuis le tableau de bord',
      syncing: 'Synchronisation avec le serveur…',
    },
  },
  read: {
    notJson: 'Ce n’est pas un fichier JSON.',
    notTracklistify:
      'Cela ne ressemble pas à un tracklist.json de Tracklistify.',
    noTracks: 'Aucun titre trouvé dans ce fichier.',
  },
};
