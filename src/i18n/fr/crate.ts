import type { Messages } from '../index';
import { count, int } from './count';

const months = count('mois', 'mois');
const years = count('an');
const plays = count('écoute');

/** `6 mois`, `1 an`, `2 ans` : une période des Pépites oubliées. */
const gemWindow = (m: number): string =>
  m % 12 === 0 ? years(m / 12) : months(m);

/** `le dernier mois`, `les 3 derniers mois`. */
const theLast = (m: number): string =>
  m === 1 ? 'le dernier mois' : `les ${m} derniers mois`;

export const crate: Messages['crate'] = {
  seasons: {
    winter: 'Hiver',
    spring: 'Printemps',
    summer: 'Été',
    autumn: 'Automne',
  },
  seasonYear: {
    winter: (year) => `hiver ${year}`,
    spring: (year) => `printemps ${year}`,
    summer: (year) => `été ${year}`,
    autumn: (year) => `automne ${year}`,
  },
  decade: (year) => `années ${year}`,

  labels: {
    unknownTitle: 'Titre inconnu',
    unknownArtist: 'Artiste inconnu',
    window: (m) => (m === 1 ? 'mois' : `${m} mois`),
  },

  switch: {
    picker: 'Vue du Crate',
    nav: 'Vues du Crate',
  },

  empty: {
    emptyHeading: 'Votre Crate est vide',
    reimportHeading: 'Votre historique doit être réimporté',
    emptyBody:
      'Ces six vues sont construites à partir de votre historique de streaming étendu Spotify (Extended streaming history), le zip que vous demandez à Spotify. L’API Web ne donne aucun nombre d’écoutes\u00a0: rien ici ne peut donc venir d’une synchronisation.',
    reimportBody:
      'Les vues du Crate ont besoin de données que l’ancien import n’a pas gardées. Vos nombres d’écoutes fonctionnent toujours partout ailleurs.',
    importHistory: 'Importer l’historique',
    spotifyTop: 'Les tops de Spotify ›',
  },

  hub: {
    description: {
      rotation: 'Ce que vous écoutez le plus en ce moment',
      gems: 'Des titres adorés, puis délaissés',
      classics: 'Les titres auxquels vous revenez année après année',
      year: 'Vos titres d’une année, d’une saison ou d’un mois',
      finish: 'Ce que vous écoutez jusqu’au bout, et ce que vous passez',
      'rarely-played': 'Des titres de vos playlists à peine écoutés',
    },
    top: (artist, title) => `En tête\u00a0: ${artist} — ${title}`,
    topIn: (year, artist, title) =>
      `En tête en ${year}\u00a0: ${artist} — ${title}`,
    first: (artist, title) => `Premier\u00a0: ${artist} — ${title}`,
    nothingYet: 'Rien pour l’instant',
    nothingInLast: (m) =>
      m === 1 ? 'Rien ce dernier mois' : `Rien ces ${m} derniers mois`,
    nothingIn: (label) => `Rien en ${label}`,
    lastMonths: (m) => (m === 1 ? 'dernier mois' : `${m} derniers mois`),
    unplayedMonths: (m) => `${months(m)}+ sans écoute`,
    unplayedYears: (y) => `${years(y)}+ sans écoute`,
    yearsPlus: (y) => `${y}+ ans`,
    outcomesPlus: (n) => `${n}+ issues`,
    neverPlayed: 'jamais écoutés',
    playsList: (list) => `${list} écoutes`,
    playsPerYear: 'Écoutes par an',
    reached: (parts) => `Titres écoutés\u00a0: ${parts}`,
    reachedPart: (y, tracks) => `${y}+ ans ${tracks}`,
    topFinished: 'Premier titre écouté en entier',
    imported: (date) => `Importé le ${date}`,
    updateImport: 'Mettre à jour l’import',
    historyEnds: (month) => `Historique jusqu’à ${month}`,
    reimport: 'réimporter',
  },

  common: {
    artist: 'Artiste',
    flag: 'Indicateur',
    notInPlaylist: 'dans aucune playlist',
    plays: 'Écoutes',
    playsPerMonth: 'Écoutes par mois',
    playsPerYear: 'Écoutes par an',
    unitPlay: 'écoute',
    unitPlays: 'écoutes',
    tryMonths: (m) => `Essayer ${m} mois`,
    playsPlus: (n) => `${n}+ écoutes`,
  },

  rotation: {
    option: (m) => months(m),
    dayIn: (month, days) =>
      `${month}\u00a0: ${int(days)} ${days < 2 ? 'jour écoulé' : 'jours écoulés'}`,
    new: 'Nouveau',
    ofPlays: (window, total) => `${int(window)} sur ${plays(total)}`,
    inWindow: 'Écoutes sur la période',
    lifetime: 'Au total',
    lastWindow: (m) => (m === 1 ? 'Dernier mois' : `${m} derniers mois`),
    staleEmpty: (month, m) =>
      `Votre historique s’arrête en ${month}\u00a0: rien ne tombe dans ${theLast(m)}.`,
    importFresh: 'Importer un export récent',
    nothingSince: (min, month) => `Rien avec ${min}+ écoutes depuis ${month}.`,
    table: (m) =>
      `Rotation intensive, ${m === 1 ? 'dernier mois' : `${m} derniers mois`}`,
  },

  gems: {
    option: gemWindow,
    yearsOfLast: (active, span, date) =>
      `${int(active)} sur ${years(span)} · dernière écoute le ${date}`,
    lastPlayed: 'Dernière écoute',
    lastTwoYears: '2 dernières années',
    caption: (min, since) => `Écouté ${min}+ fois, rien depuis ${since}`,
    empty: (min, m) =>
      `Rien d’oublié. Tout ce que vous avez écouté ${min}+ fois est revenu au cours ${
        m === 12
          ? 'de la dernière année'
          : m % 12 === 0
            ? `des ${m / 12} dernières années`
            : `des ${m} derniers mois`
      }.`,
    table: (m) => `Pépites oubliées, sans écoute depuis ${gemWindow(m)}`,
  },

  classics: {
    playsLast: (n, date) => `${plays(n)} · dernière écoute le ${date}`,
    caption: (perYear, minYears, span) =>
      `${perYear}+ écoutes par an, ${minYears}+ années sur ${span}`,
    yearsPlayed: 'Années écoutées',
    yearsOf: (active, span) => `${active} sur ${span}`,
    unitYears: 'ans',
    perYear: 'Par an',
    mostYears: 'Le plus d’années',
    mostPlays: 'Le plus d’écoutes',
    empty: (min, span) =>
      `Aucun titre n’atteint encore ${min} ans. Votre historique couvre ${years(span)}.`,
    tableYears: 'Classiques, le plus d’années',
    tablePlays: 'Classiques, le plus d’écoutes',
  },

  year: {
    all: 'Tout',
    playsLifetimeLast: (n, date) =>
      `${plays(n)} au total · dernière écoute le ${date}`,
    inSelection: 'Écoutes de la sélection',
    allTime: 'Depuis toujours',
    inYear: (year) => `En ${year}`,
    perMonth: 'Par mois',
    noPlays: (label) => `Aucune écoute en ${label}.`,
    table: (label) => `Par année, ${label}`,
  },

  finish: {
    finished: 'Terminés',
    skipped: 'Passés',
    captionFinished: 'Les titres que vous écoutez jusqu’au bout',
    captionSkipped: 'Ceux que vous abandonnez en route',
    note: (pct, finished, outcomes) =>
      `${pct}\u00a0% terminé · ${int(finished)} sur ${count('issue nette', 'issues nettes')(outcomes)}`,
    legendHigh: '65\u00a0%+ vert',
    legendLow: 'moins de 35\u00a0% rouge',
    pctFinished: '% terminé',
    ofCount: (finished, outcomes) => `${int(finished)} sur ${int(outcomes)}`,
    unclear: 'Incertains',
    clearPlus: (n) => `${n}+ issues nettes`,
    empty: (n) => `Aucun titre n’a encore ${n} issues nettes.`,
    tableFinished: 'Taux d’écoute complète, terminés',
    tableSkipped: 'Taux d’écoute complète, passés',
  },

  rarely: {
    never: 'Jamais',
    playCounts: 'Nombre d’écoutes',
    playlist: 'Choix de la playlist',
    playlists: 'Playlists',
    allPlaylists: 'Toutes les playlists',
    countedTo: (date) => `écoutes comptées jusqu’au ${date}`,
    emptyPlaylist: 'Rien à écouter dans cette playlist.',
    emptyNever: 'Rien de jamais écouté dans vos playlists.',
    emptyPlays: (list) => `Rien d’écouté ${list} fois dans vos playlists.`,
    tryAll: 'Essayer de 0 à 3 écoutes',
    tableNever: 'Titres de playlist jamais écoutés',
    tablePlays: (list) => `Titres de playlist écoutés ${list} fois`,
  },
};
