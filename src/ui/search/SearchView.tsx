import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadSavedMixes, mixError, model, savedMixes } from '../../model/state';
import { parseRoute } from '../../router';
import { StatusLine } from '../components/StatusLine';
import { Icon, type IconName } from '../icons';
import { IconButton } from '../components/IconButton';
import { ESCAPE_RANK, isEditable, pushEscapeLayer } from '../layout/escape';
import { windowClass } from '../layout/windowClass';
import { rememberRecent, resultHref } from './choose';
import {
  buildSearchIndex,
  highlight,
  markedLine,
  searchAll,
  type SearchEntry,
  type SearchKind,
} from './searchIndex';

/** Whether the search view is open; the frame and the top bar share it. */
export const searchOpen = signal(false);
const query = signal('');
/** The last five items opened from search this session, newest first. */
const recent = signal<SearchEntry[]>([]);
/** Saved mixes are read once, when the view first opens (research D11). */
let mixesRead = false;

const GROUP: Record<SearchKind, { title: string; icon: IconName }> = {
  track: { title: 'Tracks', icon: 'music_note' },
  artist: { title: 'Artists', icon: 'person' },
  playlist: { title: 'Playlists', icon: 'queue_music' },
  mix: { title: 'Mixes', icon: 'headphones' },
};

/** Results in a group before "Show all N". */
const PER_GROUP = 5;
/** What "Show all" lists at most. */
const ALL = 500;

export function openSearch(): void {
  searchOpen.value = true;
}

function closeSearch(): void {
  searchOpen.value = false;
}

/**
 * `/` (outside a text field), Ctrl+K or ⌘K open the search from any screen
 * (FR-051, FR-043). Installed once by the frame.
 */
export function installSearchKeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || searchOpen.value) return;
    if (isEditable(e.target as HTMLElement | null)) return;
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const k = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey);
    if (!slash && !k) return;
    e.preventDefault();
    openSearch();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

/** The name with its matched part in bold. */
function Marked(p: { text: string; query: string }) {
  const at = highlight(p.text, p.query);
  if (!at) return <>{p.text}</>;
  return (
    <>
      {p.text.slice(0, at[0])}
      <strong>{p.text.slice(at[0], at[1])}</strong>
      {p.text.slice(at[1])}
    </>
  );
}

type Item =
  | { type: 'entry'; entry: SearchEntry }
  | { type: 'more'; kind: SearchKind; total: number };

/**
 * The global search (contracts/screens.md §15, research D11): a docked
 * 720 px panel under the top bar, full screen on a phone. Results grouped
 * Tracks, Artists, Playlists, Mixes, five a group with "Show all N"; the
 * arrows move, Enter opens, Escape closes. An empty query lists the last
 * five things opened this session. Only what this browser holds is searched.
 */
export function SearchView() {
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<SearchKind>>(new Set());
  const q = query.value;
  const m = model.value;
  const phone = windowClass.value === 'compact';

  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    // The docked panel opens where the top bar's field is.
    const field = document.querySelector('.top-bar-search');
    if (field) {
      const width = Math.min(720, innerWidth - 32);
      const at = field.getBoundingClientRect().left;
      setLeft(Math.max(16, Math.min(at, innerWidth - 16 - width)));
    }
    opener.current = document.activeElement as HTMLElement | null;
    input.current?.focus();
    input.current?.select();
    if (!mixesRead) {
      mixesRead = true;
      void loadSavedMixes();
    }
    const pop = pushEscapeLayer(closeSearch, ESCAPE_RANK.search);
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      pop();
      root.style.overflow = before;
      // Back where the search was opened from, unless a result moved on.
      const back = opener.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setActive(0);
    setExpanded(new Set());
  }, [q]);

  const index = m ? buildSearchIndex(m, savedMixes.value) : [];
  const groups = searchAll(index, q, PER_GROUP);
  const all = expanded.size > 0 ? searchAll(index, q, ALL) : [];
  const items: Item[] = [];
  const sections = (
    q.trim() === ''
      ? recent.value.length > 0
        ? [{ title: 'Recent', kind: null, entries: recent.value, total: 0 }]
        : []
      : groups.map((g) => {
          const open = expanded.has(g.kind);
          const entries = open
            ? (all.find((a) => a.kind === g.kind)?.entries ?? g.entries)
            : g.entries;
          return {
            title: GROUP[g.kind].title,
            kind: g.kind,
            entries,
            total: open ? 0 : g.total,
          };
        })
  ).map((s) => {
    const first = items.length;
    for (const entry of s.entries) items.push({ type: 'entry', entry });
    const more =
      s.kind !== null && s.total > s.entries.length
        ? items.push({ type: 'more', kind: s.kind, total: s.total }) - 1
        : null;
    return { ...s, first, more };
  });
  const current = Math.min(active, Math.max(0, items.length - 1));

  function choose(item: Item): void {
    if (item.type === 'more') {
      setExpanded(new Set([...expanded, item.kind]));
      return;
    }
    const entry = item.entry;
    if (!m) return;
    recent.value = rememberRecent(recent.value, entry);
    // The next search starts empty, on the recent items.
    query.value = '';
    opener.current = null;
    closeSearch();
    location.hash = resultHref(parseRoute(location.hash), m, entry);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // The field's own Escape closes the view (the layer code leaves a
      // text field's keys alone).
      e.preventDefault();
      closeSearch();
      return;
    }
    if (items.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[current]);
    }
  }

  // The active option stays in view as the arrows move.
  useEffect(() => {
    document
      .getElementById(`search-opt-${current}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const option = (item: Item, at: number) => {
    const selected = at === current;
    const common = {
      id: `search-opt-${at}`,
      role: 'option' as const,
      'aria-selected': selected,
      class: selected ? 'search-option active' : 'search-option',
      onMouseDown: (e: MouseEvent) => e.preventDefault(),
      onClick: () => choose(item),
      onMouseMove: () => {
        if (!selected) setActive(at);
      },
    };
    if (item.type === 'more') {
      return (
        <div {...common} key={`more-${item.kind}`} data-more="true">
          <span class="search-more">
            Show all {item.total.toLocaleString()}
          </span>
        </div>
      );
    }
    const { entry } = item;
    const marked = markedLine(entry, q);
    return (
      <div {...common} key={`${entry.kind}:${entry.id}`}>
        <Icon name={GROUP[entry.kind].icon} size={24} />
        <span class="search-text">
          <span class="search-name">
            <Marked text={entry.name} query={marked === 'name' ? q : ''} />
          </span>
          <span class="search-context">
            <Marked
              text={entry.context}
              query={marked === 'context' ? q : ''}
            />
          </span>
        </span>
      </div>
    );
  };

  const empty = q.trim() === '';
  return (
    <>
      {!phone && (
        <div class="search-scrim" aria-hidden="true" onClick={closeSearch} />
      )}
      <div
        class={phone ? 'search-view fullscreen' : 'search-view docked'}
        style={left === null ? undefined : { '--search-left': `${left}px` }}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div class="search-field">
          {phone ? (
            <IconButton
              icon="arrow_back"
              label="Close search"
              onClick={closeSearch}
            />
          ) : (
            <Icon name="search" size={24} />
          )}
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Search tracks, artists, playlists and mixes"
            aria-expanded={items.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              items.length > 0 ? `search-opt-${current}` : undefined
            }
            placeholder="Search tracks, artists, playlists, mixes"
            autoComplete="off"
            spellcheck={false}
            value={q}
            onInput={(e) => {
              query.value = (e.currentTarget as HTMLInputElement).value;
            }}
            onKeyDown={onKeyDown}
          />
          {q !== '' && (
            <IconButton
              icon="close"
              label="Clear search"
              onClick={() => {
                query.value = '';
                input.current?.focus();
              }}
            />
          )}
        </div>
        {/* A long list scrolls from the keyboard too (axe). */}
        <div class="search-body" tabIndex={0}>
          {mixError.value && (
            <StatusLine kind="error">{mixError.value}</StatusLine>
          )}
          {!m ? (
            <p class="search-note">Your library is still loading.</p>
          ) : items.length === 0 ? (
            <p class="search-note">
              {empty
                ? 'Search the tracks, artists, playlists and mixes stored in this browser.'
                : `Nothing matches '${q.trim()}'`}
            </p>
          ) : (
            <div id="search-results" role="listbox" aria-label="Results">
              {sections.map((s) => (
                <div
                  key={s.title}
                  role="group"
                  aria-label={s.title}
                  class="search-group"
                >
                  <div class="search-group-title" aria-hidden="true">
                    {s.title}
                  </div>
                  {s.entries.map((entry, i) =>
                    option({ type: 'entry', entry }, s.first + i)
                  )}
                  {s.more !== null && option(items[s.more], s.more)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
