import type { Messages } from '../index';
import { count, word } from './count';

export const signin: Messages['signin'] = {
  signingIn: 'Connexion en cours…',
  gate: {
    purpose:
      'Connectez-vous au serveur avec un lien envoyé à votre e-mail. Ouvrez-le dans ce navigateur, dans les 10 minutes.',
    pausedBefore: 'Serveur en pause. Relancez-le depuis le ',
    pausedLink: 'tableau de bord Supabase',
    pausedAfter: ', puis renvoyez le lien.',
    offline: (message: string): string =>
      `Serveur hors ligne\u00a0: ${message} Renvoyez le lien une fois en ligne.`,
    spotifyBeforeSignIn:
      'Connectez-vous d’abord au serveur, puis connectez de nouveau Spotify.',
  },
  linkForm: {
    email: 'E-mail',
    send: 'M’envoyer un lien',
    sent: (email: string): string =>
      `Si cet e-mail a un compte, un lien a été envoyé à ${email}. Ouvrez-le dans ce navigateur dans les 10 minutes.`,
  },
  connect: {
    purpose: 'Votre écoute Spotify, classée pour préparer vos sets de DJ.',
    readsTop: 'Vos tops\u00a0: 4 semaines, 6 mois et depuis toujours',
    readsPlaylists: 'Vos propres playlists, quand vous les synchronisez',
    readsHistory: 'Votre historique d’écoute, quand vous l’importez',
    privacySummary: 'Ce qui sort de ce navigateur',
    privacy:
      'Vos titres les plus écoutés, vos playlists classées par écoutes et les artistes dont vous avez enregistré le plus de titres. Lit vos tops et vos propres playlists. Rien ne sort de ce navigateur, sauf les id de titres envoyés à ReccoBeats quand vous cherchez le BPM et la tonalité, et les id d’artistes, ISRC et titres d’articles envoyés à MusicBrainz, ListenBrainz, Deezer, Wikidata et Wikimedia quand vous cherchez des artistes.',
    connectSpotify: 'Connecter Spotify',
    signOut: 'Se déconnecter',
  },
  import: {
    starts: count('lancement'),
    startsPlayedThrough: (attempts: number, pct: number): string =>
      `${count('lancement')(attempts)}, dont ${pct}\u00a0% jusqu’au bout`,
    creditedAcross: (plays: number, tracks: number): string =>
      `${count('écoute')(plays)} ${word('comptée', 'comptées')(plays)} sur ${count('titre')(tracks)}`,
    matched: (tracks: number): string =>
      `${count('titre')(tracks)} ${word('présent', 'présents')(tracks)} dans vos playlists`,
    range: (first: string, last: string): string => `Du ${first} au ${last}`,
    zone: (zone: string): string =>
      `Les mois suivent ${zone}, le fuseau de ce navigateur à l’import`,
    imported: (when: string, files: number): string =>
      `Importé le ${when} depuis ${count('fichier')(files)}`,
    skipped: (name: string, reason: string): string =>
      `${name} ignoré\u00a0: ${reason}`,
    lastImport: 'Dernier import',
    howTo: 'Comment obtenir le fichier',
    theFile: 'Le fichier',
    dropCompact:
      'Choisir my_spotify_data.zip ou les fichiers JSON qu’il contient',
    drop: 'Déposez my_spotify_data.zip ici ou choisissez un fichier',
    hint: 'Les fichiers JSON qu’il contient marchent aussi.',
    unitFiles: 'fichiers',
    lastError: (message: string): string => `Dernière erreur\u00a0: ${message}`,
    step1: 'Ouvrez spotify.com/account/privacy et connectez-vous.',
    step2Before:
      'Sous «\u00a0Télécharger vos données\u00a0», cochez seulement ',
    step2Strong: 'Historique de streaming étendu',
    step2After: ', puis faites la demande.',
    step3: 'Confirmez l’e-mail que Spotify envoie, dans les 14 jours.',
    step4:
      'Quand l’e-mail «\u00a0vos données sont prêtes\u00a0» arrive (de quelques heures à quelques semaines), téléchargez my_spotify_data.zip sur cet appareil.',
    step5:
      'Choisissez ce zip sur cet écran. Rien n’est envoyé\u00a0: le fichier est lu ici et seul le nombre d’écoutes par titre est gardé.',
  },
  importer: {
    cancelled: 'Import annulé. Votre historique actuel est conservé.',
    replaceEmpty: (current: string): string =>
      `Cet import ne contient aucune écoute\u00a0; votre historique actuel couvre ${current}. Le remplacer\u00a0?`,
    replaceNarrower: (incoming: string, current: string): string =>
      `Cet import couvre ${incoming}\u00a0; votre historique actuel couvre ${current}. Le remplacer\u00a0?`,
    noFileRead: 'Aucun fichier n’a pu être lu.',
    noFileReadDetail: (detail: string): string =>
      `Aucun fichier n’a pu être lu\u00a0: ${detail}`,
    workerStart: (error: string): string =>
      `Impossible de lancer le worker d’import\u00a0: ${error}`,
    workerCrashed: 'Le worker d’import a planté',
    whileReading: (reason: string, file: string): string =>
      `${reason} (pendant la lecture de ${file})`,
    readingFiles: 'Lecture des fichiers',
    accountData:
      'Ces fichiers sont le paquet «\u00a0Données du compte\u00a0», sans id de titre. Demandez plutôt «\u00a0Historique de streaming étendu\u00a0»\u00a0: compte Spotify, Confidentialité, Télécharger vos données.',
    noFiles:
      'Aucun fichier Streaming_History_Audio_*.json trouvé. Choisissez my_spotify_data.zip ou les fichiers JSON qu’il contient.',
    skipNotArray: 'pas un tableau JSON',
    skipUnreadable: (reason: string): string => `illisible\u00a0: ${reason}`,
  },
};
