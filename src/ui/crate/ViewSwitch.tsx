import type { CrateView } from '../../router';
import { windowClass } from '../layout/windowClass';
import { viewSwitchItems } from './labels';

/**
 * The view switch of the Crate view screen (spec 030, FR-001, FR-002): the
 * six views, the open one marked. It is navigation, built as links to the
 * views' own addresses, so a view stays bookmarkable and Back returns to the
 * previous one. On compact and medium windows it is one native picker showing
 * the open view's name (Q1 B): the least height above the list, and six names
 * do not fit in a medium window's row (found by the visual loop). The row of
 * links is drawn from expanded up.
 */
export function ViewSwitch(p: { current: CrateView }) {
  const items = viewSwitchItems(p.current);
  const wc = windowClass.value;
  if (wc === 'compact' || wc === 'medium') {
    return (
      <label class="crate-switch">
        <span class="visually-hidden">Crate view</span>
        <select
          value={p.current}
          onChange={(e) => {
            const picked = items.find((i) => i.view === e.currentTarget.value);
            if (picked) location.hash = picked.href;
          }}
        >
          {items.map((i) => (
            <option key={i.view} value={i.view}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <nav class="crate-switch" aria-label="Crate views">
      {items.map((i) => (
        <a
          key={i.view}
          aria-current={i.current ? 'page' : undefined}
          class={i.current ? 'crate-switch-link active' : 'crate-switch-link'}
          href={i.href}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
