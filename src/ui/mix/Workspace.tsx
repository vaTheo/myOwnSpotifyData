import { useEffect, useRef, useState } from 'preact/hooks';
import {
  closeMix,
  loadSavedMixes,
  mixState,
  openMix,
  savedMixes,
} from '../../model/state';
import { routeHref } from '../../router';
import { EmptyState } from '../components/EmptyState';
import { ListDetail } from '../layout/ListDetail';
import { windowClass } from '../layout/windowClass';
import { addressAfter, routeAction } from './address';
import { MixDetail } from './MixDetail';
import {
  IdentifyRequest,
  JsonImport,
  LinkForm,
  LookupLines,
  MixListPane,
  RequestsCard,
  SavedMixes,
  WorkerHelp,
} from './MixListPane';

function currentOpenUrl(): string | null {
  const s = mixState.peek();
  return s.status === 'ready' ? s.view.url : null;
}

/**
 * The Mix workspace (spec 003 §12, T084). From expanded windows a
 * list–detail: the 360 px left pane beside the open mix, or an empty state
 * when none is open. On compact and medium windows one column, in the
 * contract's phone order: link field, open mix, Identify, JSON import, the
 * lists, the worker help.
 *
 * The address: `#/mix/<key>` opens that saved mix once the saved mixes are
 * read, or says it is not in this browser; opening a saved mix sets it;
 * closing returns to `#/mix`; an unsaved lookup stays at `#/mix`. No network
 * call on open (ADR-02): `openMix` reads memory only.
 */
export function Workspace(p: { mixKey?: string }) {
  const key = p.mixKey;
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const state = mixState.value;
  const open = state.status === 'ready' ? state.view.url : null;
  const saved = open !== null && savedMixes.value.some((m) => m.url === open);

  // Load the saved mixes once, on mount (never on app load).
  useEffect(() => {
    void loadSavedMixes().then(() => setLoaded(true));
  }, []);

  // The address changed, or the saved mixes arrived: open, close or say
  // missing. Then the address follows the mix on screen (a lookup, a save).
  const seen = useRef<{ key: string | undefined; loaded: boolean }>({
    key: undefined,
    loaded: false,
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { key, loaded };
    if (before.key !== key || before.loaded !== loaded) {
      const action = routeAction({
        prevKey: before.key,
        key,
        loaded,
        openUrl: currentOpenUrl(),
        saved: savedMixes.peek().map((m) => m.url),
      });
      setMissing(action === 'missing' ? (key ?? null) : null);
      if (action === 'open' && key !== undefined) openMix(key);
      if (action === 'close') closeMix();
    }
    if (!loaded) return;
    const now = currentOpenUrl();
    const href = addressAfter({
      key,
      openUrl: now,
      saved: now !== null && savedMixes.peek().some((m) => m.url === now),
    });
    if (href !== null) location.replace(href);
  }, [key, loaded, open, saved]);

  const close = (): void => {
    // Escape with nothing open must not clear an inline error.
    if (open === null && key === undefined) return;
    closeMix();
    if (key !== undefined) location.hash = routeHref({ name: 'mix' });
  };

  const detail =
    state.status === 'ready' ? (
      <MixDetail view={state.view} onClose={close} />
    ) : missing !== null && missing === key ? (
      <EmptyState
        icon="warning"
        action={{
          label: 'Back to your mixes',
          href: routeHref({ name: 'mix' }),
        }}
      >
        <p>This saved mix is not in this browser.</p>
      </EmptyState>
    ) : null;

  const size = windowClass.value;
  if (size === 'compact' || size === 'medium') {
    return (
      <section class="mix mix-stack">
        <LinkForm />
        {detail}
        <IdentifyRequest />
        <LookupLines />
        <JsonImport />
        <SavedMixes />
        <RequestsCard />
        <WorkerHelp />
      </section>
    );
  }

  return (
    <section class="mix">
      <ListDetail
        list={() => <MixListPane />}
        detail={
          detail ?? (
            <EmptyState icon="queue_music">
              <p>Paste a link, import a JSON, or pick a saved mix</p>
            </EmptyState>
          )
        }
        selectedId={open}
        onClose={close}
      />
    </section>
  );
}
