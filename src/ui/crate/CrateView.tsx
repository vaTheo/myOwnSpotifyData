import { routeHref, type CrateView as View } from '../../router';

const TITLES: Record<View, string> = {
  rotation: 'Heavy rotation',
  gems: 'Forgotten gems',
  classics: 'All-time classics',
  year: 'By year',
  finish: 'Finish rate',
};

export function CrateView(p: { view: View; period?: string }) {
  return (
    <section>
      <a class="back" href={routeHref({ name: 'crate' })}>
        ‹ Crate
      </a>
      <h1>{TITLES[p.view]}</h1>
      <p class="caption">
        {p.period ? `Coming soon · ${p.period}` : 'Coming soon'}
      </p>
    </section>
  );
}
