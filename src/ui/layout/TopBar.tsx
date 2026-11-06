import type { ComponentChildren } from 'preact';
import { IconButton } from '../components/IconButton';

/**
 * Material 3 small top app bar (spec 003, FR-004): the "up" arrow on a
 * detail, the screen's title as the page's one h1, then the trailing area
 * (search, the activity button, the screen's own actions).
 */
export function TopBar(p: {
  title: string;
  up: string | null;
  children?: ComponentChildren;
}) {
  return (
    <header class="top-bar">
      {p.up && <IconButton icon="arrow_back" label="Back" href={p.up} />}
      <h1 class="top-bar-title">{p.title}</h1>
      <div class="top-bar-actions">{p.children}</div>
    </header>
  );
}
