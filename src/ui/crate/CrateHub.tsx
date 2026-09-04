import { routeHref, type CrateView } from '../../router';

const ROWS: { view: CrateView; label: string }[] = [
  { view: 'rotation', label: 'Heavy rotation' },
  { view: 'gems', label: 'Forgotten gems' },
  { view: 'classics', label: 'All-time classics' },
  { view: 'year', label: 'By year' },
  { view: 'finish', label: 'Finish rate' },
];

export function CrateHub() {
  return (
    <section>
      <h1>Crate</h1>
      {ROWS.map((row) => (
        <a
          key={row.view}
          class="hub-row"
          href={routeHref({ name: 'crateView', view: row.view })}
        >
          <span class="main">
            <span class="name">{row.label}</span>
          </span>
          <span class="chev">›</span>
        </a>
      ))}
    </section>
  );
}
