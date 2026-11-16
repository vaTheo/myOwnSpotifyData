/** The texts of the demo's own on-screen texts (`src/dev`). */
export const demo = {
  /** `ChartsDemo.tsx`: the `#/dev/charts` page of the visual loop. */
  charts: {
    title: 'Charts',
    wholeSpan: 'Plays per month, whole span',
    perMonthIn: (year: number) => `Plays per month, ${year}`,
    perYearHeading: 'Plays per year (Classics)',
    perYear: 'Plays per year',
    compact: 'In a table row (compact)',
    finishRate: 'Finish rate',
    byYear: 'By year',
    selected: (setting: string) => `Selected: ${setting}`,
    busiest: 'Busiest track',
    /** Fed to `seriesLabel`, which writes `<title>: <points>`. */
    perMonthSeries: 'plays per month',
    busiestLabel: (series: string) => `Busiest track, ${series}`,
  },
};
