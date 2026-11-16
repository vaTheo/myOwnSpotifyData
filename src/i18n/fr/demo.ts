import type { Messages } from '../index';

export const demo: Messages['demo'] = {
  charts: {
    title: 'Graphiques',
    wholeSpan: 'Écoutes par mois, toute la période',
    perMonthIn: (year) => `Écoutes par mois, ${year}`,
    perYearHeading: 'Écoutes par an (Classiques)',
    perYear: 'Écoutes par an',
    compact: 'Dans une ligne de tableau (compacte)',
    finishRate: 'Taux d’écoute complète',
    byYear: 'Par année',
    selected: (setting) => `Sélection\u00a0: ${setting}`,
    busiest: 'Titre le plus écouté',
    perMonthSeries: 'écoutes par mois',
    busiestLabel: (series) => `Titre le plus écouté, ${series}`,
  },
};
