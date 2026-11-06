import { useEffect, useRef, useState } from 'preact/hooks';
import { windowClass } from '../layout/windowClass';
import { AccountSection } from './AccountSection';
import { AudioSection } from './AudioSection';
import { DangerZone } from './DangerZone';
import { HistorySection } from './HistorySection';
import { ReachSection } from './ReachSection';
import {
  SETTINGS_SECTIONS,
  sectionDomId,
  sectionInView,
  type SectionId,
} from './sections';
import { ServerSection } from './ServerSection';
import { SyncSection } from './SyncSection';

const ORDER: SectionId[] = SETTINGS_SECTIONS.map((s) => s.id);

/**
 * The index beside the sections on large windows (T078): a click scrolls
 * its section into view and the address stays as it is; an
 * `IntersectionObserver` marks the section in the top part of the window.
 * After a click the mark stays on the clicked section until the owner
 * scrolls by hand, so a short last section never steals it.
 */
function SectionIndex() {
  const [active, setActive] = useState<SectionId>(ORDER[0]);
  const visible = useRef(new Set<SectionId>());
  const clicked = useRef(false);
  useEffect(() => {
    const update = () => {
      if (clicked.current) return;
      const doc = document.documentElement;
      const atEnd = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      setActive((current) =>
        sectionInView(ORDER, visible.current, current, atEnd)
      );
    };
    const top = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-top-bar')
      .trim();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace('settings-', '') as SectionId;
          if (entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
        update();
      },
      { rootMargin: `-${top || '64px'} 0px -60% 0px` }
    );
    for (const id of ORDER) {
      const el = document.getElementById(sectionDomId(id));
      if (el) observer.observe(el);
    }
    const byHand = () => {
      clicked.current = false;
    };
    const opts = { passive: true } as const;
    window.addEventListener('wheel', byHand, opts);
    window.addEventListener('touchstart', byHand, opts);
    window.addEventListener('keydown', byHand);
    window.addEventListener('scroll', update, opts);
    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', byHand);
      window.removeEventListener('touchstart', byHand);
      window.removeEventListener('keydown', byHand);
      window.removeEventListener('scroll', update);
    };
  }, []);
  return (
    <nav class="settings-index" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((s) => (
        <button
          type="button"
          key={s.id}
          class={s.id === active ? 'active' : ''}
          aria-current={s.id === active ? 'true' : undefined}
          onClick={() => {
            clicked.current = true;
            setActive(s.id);
            document
              .getElementById(sectionDomId(s.id))
              ?.scrollIntoView({ block: 'start' });
          }}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Settings as "Data and sync" (spec 003, US5, FR-038): one card per data
 * source, then the danger zone and the app version. Every long job starts
 * only from here (ADR-02, ADR-04); nothing starts on load.
 */
export function SettingsPage() {
  const large = windowClass.value === 'large';
  return (
    <div class={large ? 'settings with-index' : 'settings'}>
      {large && <SectionIndex />}
      <div class="settings-sections">
        <AccountSection />
        <SyncSection />
        <HistorySection />
        <AudioSection />
        <ReachSection />
        <ServerSection />
        <DangerZone />
        <p class="muted settings-version">DJ Data v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
