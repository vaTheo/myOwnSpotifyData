import type { ComponentChildren } from 'preact';
import { IconButton } from '../components/IconButton';
import { Icon } from '../icons';
import { windowClass } from './windowClass';

/**
 * Material 3 small top app bar (spec 003, FR-004): the "up" arrow on a
 * detail, the screen's title as the page's one h1, then the trailing area:
 * the search (a field from medium windows, an icon on a phone, FR-051), the
 * activity button, the screen's own actions.
 */
export function TopBar(p: {
  title: string;
  up: string | null;
  onSearch: () => void;
  children?: ComponentChildren;
}) {
  return (
    <header class="top-bar">
      {p.up && <IconButton icon="arrow_back" label="Back" href={p.up} />}
      <h1 class="top-bar-title">{p.title}</h1>
      {windowClass.value === 'compact' ? (
        <IconButton icon="search" label="Search" onClick={p.onSearch} />
      ) : (
        <button
          type="button"
          class="top-bar-search"
          aria-label="Search"
          aria-keyshortcuts="/ Control+K Meta+K"
          onClick={p.onSearch}
        >
          <Icon name="search" size={20} />
          <span class="top-bar-search-text">Search</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
      )}
      <div class="top-bar-actions">{p.children}</div>
    </header>
  );
}
