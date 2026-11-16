import type { Messages } from '../index';

export const core: Messages['core'] = {
  account: {
    switchConfirm:
      'Ce compte Spotify est différent. Supprimer toutes les données locales du compte précédent\u00a0?',
    switchNotice:
      'Connecté avec un autre compte Spotify — les données locales du compte précédent ont été supprimées.',
    switchStopped:
      'Synchronisation arrêtée — un autre compte Spotify est connecté et les données locales ont été conservées.',
    mismatchNotice:
      'Connecté avec un autre compte Spotify. Synchronisez pour changer de compte\u00a0; les données locales sont conservées jusqu’à votre confirmation.',
    readFailed: (error: string): string =>
      `Impossible de lire le compte Spotify\u00a0: ${error}`,
  },
  sync: {
    offline: 'Hors ligne, données en cache affichées.',
    spotifyError: (status: number, message: string): string =>
      `Erreur Spotify ${status}\u00a0: ${message}`,
    storageFull:
      'Le stockage local est plein. Libérez de l’espace sur le téléphone et réessayez.',
    saveStateFailed: (error: string): string =>
      `Impossible d’enregistrer l’état de la synchronisation\u00a0: ${error}`,
    noItems: 'La réponse des titres de la playlist ne contenait aucun titre',
    fieldsStripped:
      'Impossible de lire les titres de la playlist\u00a0: le filtre de champs n’a renvoyé aucun élément lisible',
    readItemsFailed: 'Impossible de lire les titres de la playlist',
    stepProfile: 'Profil',
    stepTop: 'Top titres et artistes',
    stepPlaylists: 'Playlists',
  },
  spotify: {
    notAllowlisted:
      'Ce compte Spotify n’est pas dans la liste des utilisateurs de l’app. Ajoutez-le dans le tableau de bord développeur Spotify, sous User Management.',
    quotaReached: 'Quota Spotify atteint',
    networkError: (reason: string): string => `Erreur réseau\u00a0: ${reason}`,
    rateLimited: 'Limite de débit atteinte trop de fois de suite',
    serverError: (status: number): string =>
      `Erreur du serveur Spotify ${status}`,
    error: (status: number): string => `Erreur Spotify ${status}`,
  },
  quota: {
    held: {
      sync: (at: string): string =>
        `Quota Spotify atteint. Synchronisez à nouveau après ${at}.`,
      check: (at: string): string =>
        `Quota Spotify atteint. Vérifiez à nouveau après ${at}.`,
      create: (at: string): string =>
        `Quota Spotify atteint. Réessayez après ${at}.`,
      like: (at: string): string =>
        `Quota Spotify atteint. Réessayez après ${at}.`,
      account: (at: string): string =>
        `Quota Spotify atteint. Synchronisez à nouveau après ${at}.`,
    },
    readerName: {
      sync: 'Une synchronisation',
      check: '«\u00a0Vérifier sur Spotify\u00a0»',
      create: '«\u00a0Créer la playlist\u00a0»',
      like: '«\u00a0Liker tous les titres\u00a0»',
    },
    busy: {
      sync: (name: string): string =>
        `${name} lit Spotify\u00a0: synchronisez une fois la lecture terminée.`,
      check: (name: string): string =>
        `${name} lit Spotify\u00a0: vérifiez une fois la lecture terminée.`,
      create: (name: string): string =>
        `${name} lit Spotify\u00a0: créez la playlist une fois la lecture terminée.`,
      like: (name: string): string =>
        `${name} lit Spotify\u00a0: likez les titres une fois la lecture terminée.`,
      account: (name: string): string =>
        `${name} lit Spotify\u00a0: connectez-vous une fois la lecture terminée.`,
    },
  },
  auth: {
    noClientId:
      'VITE_SPOTIFY_CLIENT_ID n’est pas défini. Ajoutez-le à .env en local, ou au secret du dépôt pour le site déployé.',
    refused: (error: string): string =>
      `Spotify a refusé la connexion\u00a0: ${error}`,
    otherBrowser:
      'Cette connexion a commencé dans un autre navigateur. Recommencez depuis celui-ci.',
    stateMismatch: 'L’état de connexion ne correspond pas. Recommencez.',
    noRefreshToken: 'Spotify n’a pas renvoyé de jeton de rafraîchissement.',
    notConnected: 'Non connecté à Spotify.',
    expired:
      'La connexion Spotify a expiré (les jetons durent six mois). Reconnectez-vous.',
    tokenFailed: (status: number): string =>
      `La demande de jeton a échoué avec le statut ${status}`,
  },
  server: {
    pendingReadFailed: (error: string): string =>
      `Impossible de lire les changements à envoyer\u00a0: ${error}`,
    removeConfirm:
      'Supprimer toutes vos données du serveur\u00a0? Les données locales de ce navigateur sont conservées.',
    signedOut: (message: string): string =>
      `Déconnecté du serveur\u00a0: ${message}`,
    signOutBusy:
      'Attendez la fin de la tâche en cours avant de vous déconnecter du serveur.',
    signOutPush:
      'Attendez la fin de la synchronisation en cours avant de vous déconnecter du serveur.',
    signOutFailed: (error: string): string =>
      `Impossible de se déconnecter sur cet appareil\u00a0: ${error}`,
    removeBusy:
      'Attendez la fin de la tâche en cours avant de supprimer les données du serveur.',
    noUser:
      'Cette connexion n’indique pas de quel compte il s’agit. Envoyez-vous un nouveau lien.',
    recordUserFailed: (error: string): string =>
      `Impossible d’enregistrer qui est connecté sur cet appareil\u00a0: ${error}`,
    signInFirst: 'Connectez-vous au serveur (Réglages)',
    reachFailed: (message: string): string =>
      `Impossible de joindre le serveur\u00a0: ${message}`,
    recordRequestFailed: (message: string): string =>
      `Impossible d’enregistrer la demande\u00a0: ${message}`,
    recordedNotHere: (error: string): string =>
      `La demande est enregistrée sur le serveur mais pas ici\u00a0: ${error}`,
    alreadyRequested:
      'Déjà demandé. Votre ordinateur la prendra au prochain lancement du worker.',
    notRequestLink:
      'Le worker ne peut pas prendre ce lien\u00a0: collez un lien https vers le set.',
    readRequestsFailed: (error: string): string =>
      `Impossible de lire vos demandes\u00a0: ${error}`,
    cancelConfirm:
      'Annuler cette demande\u00a0? Elle quitte la file\u00a0; vous pourrez la refaire plus tard.',
    stopConfirm:
      'Arrêter ce scan\u00a0? L’ordinateur l’arrête dans la minute environ et garde les titres déjà trouvés.',
    cancelFailed: 'Impossible d’annuler la demande',
    moveFailed: 'Impossible de déplacer la demande',
    stopFailed: 'Impossible d’arrêter le scan',
  },
  library: {
    crateNotice:
      'Les nouvelles vues du Crate demandent de réimporter votre historique.',
    openStorageFailed: (error: string): string =>
      `Impossible d’ouvrir le stockage local\u00a0: ${error}`,
    disconnectBusy:
      'Attendez la fin de la synchronisation, de l’import d’historique, de la recherche, de l’import rekordbox ou de la recherche d’artistes avant de vous déconnecter.',
    deleteLocalFailed: (error: string): string =>
      `Impossible de supprimer les données locales\u00a0: ${error}`,
  },
  mix: {
    replacePasted:
      'Remplacer votre tracklist modifiée par les titres collés\u00a0?',
    replaceTracklistify:
      'Importer ce fichier remplace la tracklist actuelle, vos modifications comprises. Continuer\u00a0?',
    readFileFailed: (error: string): string =>
      `Impossible de lire ce fichier\u00a0: ${error}`,
    linkEmpty: 'Collez un lien de titre Spotify.',
    linkRefused: 'Ce n’est pas un lien de titre Spotify.',
    linkUnnamed: 'Cette ligne n’a pas de nom de titre à lier.',
    readSavedFailed: (error: string): string =>
      `Impossible de lire vos mix enregistrés\u00a0: ${error}`,
    saveFailed: (error: string): string =>
      `Impossible d’enregistrer le mix\u00a0: ${error}`,
    connectFirst: 'Connectez-vous d’abord à Spotify (Réglages), puis vérifiez.',
    checkFailed: (error: string): string =>
      `Impossible de vérifier sur Spotify\u00a0: ${error}`,
    removeFailed: (error: string): string =>
      `Impossible de retirer le mix\u00a0: ${error}`,
    deleteConfirm:
      'Supprimer ce mix pour toujours\u00a0? Ses titres enregistrés et l’historique de ses demandes sont supprimés et ne peuvent pas être restaurés.',
    deleteFailed: 'Impossible de supprimer le mix',
  },
};
