import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { StatusLine } from '../components/StatusLine';
import { Icon } from '../icons';
import { ITEM_KIND, opensOnArrival, type ItemLine } from './itemLines';
import { sectionDomId, type SectionId } from './sections';

/**
 * One Settings item (spec 026, US1): closed, its name, its one-line state in
 * that state's colour and its main button; opened, everything its card
 * showed before, description first. A header button toggles it (an
 * accordion: the main button sits beside it, never inside, so the two never
 * nest). It opens on arrival when failing or running (FR-005) or when a link
 * names it; after that the owner's taps win, and nothing is stored. Its
 * content is rendered only while open, as `Disclosure`.
 */
export function SettingsItem(p: {
  id: SectionId;
  name: string;
  line: ItemLine;
  main?: ComponentChildren;
  description?: ComponentChildren;
  /** A `#/settings/<item>` link names this item: open it and scroll to it. */
  linked?: boolean;
  class?: string;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(
    () => opensOnArrival(p.line) || p.linked === true
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!p.linked) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: 'start' });
  }, [p.linked]);
  const domId = sectionDomId(p.id);
  const bodyId = `${domId}-body`;
  return (
    <section
      id={domId}
      ref={ref}
      class={[
        'card',
        'settings-section',
        'settings-item',
        open ? 'open' : '',
        p.class,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        class="settings-item-head"
        onClick={(e) => {
          // A tap on the header opens or closes; the main button does not.
          const target = e.target as Element;
          if (target.closest('.settings-item-main, .settings-item-toggle'))
            return;
          setOpen(!open);
        }}
      >
        <h3 class="settings-item-name">
          <button
            type="button"
            class="settings-item-toggle"
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            onClick={() => setOpen(!open)}
          >
            <Icon name="expand_more" size={20} />
            <span>{p.name}</span>
          </button>
        </h3>
        <StatusLine kind={ITEM_KIND[p.line.tone]} class="settings-item-state">
          {p.line.text}
        </StatusLine>
        {p.main && <div class="settings-item-main">{p.main}</div>}
      </div>
      {open && (
        <div id={bodyId} class="settings-item-body">
          {p.description && <p class="card-description">{p.description}</p>}
          {p.children}
        </div>
      )}
    </section>
  );
}
