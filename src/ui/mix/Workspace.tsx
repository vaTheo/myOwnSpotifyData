import { useEffect, useRef, useState } from 'preact/hooks';
import {
  closeMix,
  loadSavedMixes,
  mixError,
  mixState,
  openMix,
  savedMixes,
} from '../../model/state';
import { routeHref } from '../../router';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { StatusLine } from '../components/StatusLine';
import { Icon } from '../icons';
import { ESCAPE_RANK, pushEscapeLayer } from '../layout/escape';
import { focusWhenReady } from '../layout/focus';
import { ListDetail } from '../layout/ListDetail';
import { windowClass } from '../layout/windowClass';
import { addressAfter, routeAction } from './address';
import { MixDetail } from './MixDetail';
import {
  IdentifyRequest,
  JsonImport,
  LinkForm,
  LookupLines,
  MixesList,
  MixListPane,
  WorkerHelp,
} from './MixListPane';

/** From this width the Mixes pane stays beside an open mix (styles.css). */
const PANE_ALWAYS = '(min-width: 1600px)';

/** Whether a media query matches now, following its changes. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const on = () => setMatches(list.matches);
    on();
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return matches;
}

function currentOpenUrl(): string | null {
  const s = mixState.peek();
  return s.status === 'ready' ? s.view.url : null;
}

/**
 * After a close, the keyboard lands in the Mixes list (FR-043): the closed
 * mix's row when it is saved, else the first saved mix, else the link field.
 */
function focusAfterClose(url: string | null): void {
  const saved = savedMixes.peek();
  const selector =
    url !== null && saved.some((m) => m.url === url)
      ? `.mix-list [data-row-id="${CSS.escape(url)}"]`
      : saved.length > 0
        ? '.mix-list a.main'
        : '.mix-link-form input';
  focusWhenReady(selector, false);
}

/**
 * The Mix workspace (spec 003 §12, T084). From expanded windows a
 * list–detail: the 360 px left pane beside the open mix, or an empty state
 * when none is open. Below 1,600 px the pane folds while a mix is open, so
 * the tracklist keeps its columns (S08 fix 1); the header's **Mixes**
 * button brings it back. On compact and medium windows one column, in the
 * contract's phone order: link field, open mix, Identify, JSON import, the
 * lists, the worker help.
 *
 * The address: `#/mix/<key>` opens that saved mix once the saved mixes are
 * read, or says it is not in this browser; opening a saved mix sets it;
 * closing returns to `#/mix` (replaced, so Back does not reopen it); an
 * unsaved lookup stays at `#/mix`; a mix no longer on screen (a failed Look
 * up) leaves its address. No network call on open (ADR-02).
 */
export function Workspace(p: { mixKey?: string }) {
  const key = p.mixKey;
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [paneShown, setPaneShown] = useState(false);
  /**
   * An unknown key met while a mix was open (Back after a removal, a stale
   * link): the address goes back to the open mix, which stays (it may be an
   * unsaved lookup), and a line above it says what happened (S14 review
   * M9). Dropped on the next address that is not the open mix's.
   */
  const [stray, setStray] = useState<{ key: string; open: string } | null>(
    null
  );
  const state = mixState.value;
  const open = state.status === 'ready' ? state.view.url : null;
  const saved = open !== null && savedMixes.value.some((m) => m.url === open);

  // Load the saved mixes once, on mount (never on app load). A read
  // failure is in `mixError`; then no key can be judged missing.
  useEffect(() => {
    void loadSavedMixes().then(() => {
      setReadFailed(mixError.peek() !== null);
      setLoaded(true);
    });
  }, []);

  // The address changed, or the saved mixes arrived: open, close or say
  // missing. Then the address follows the mix on screen.
  const seen = useRef<{ key: string | undefined; loaded: boolean }>({
    key: undefined,
    loaded: false,
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { key, loaded };
    let holding = missing !== null && missing === key;
    if (before.key !== key || before.loaded !== loaded) {
      const action = routeAction({
        prevKey: before.key,
        key,
        loaded,
        openUrl: currentOpenUrl(),
        saved: savedMixes.peek().map((m) => m.url),
      });
      const nowMissing = action === 'missing' && !readFailed;
      setMissing(nowMissing ? (key ?? null) : null);
      const openNow = currentOpenUrl();
      setStray((s) =>
        nowMissing && key !== undefined && openNow !== null
          ? { key, open: openNow }
          : s !== null && key === s.open
            ? s
            : null
      );
      holding = nowMissing || (action === 'missing' && readFailed);
      if (action === 'open' && key !== undefined) openMix(key);
      if (action === 'close') {
        // Back or Forward closed it: the same reset and focus as Close.
        const was = currentOpenUrl();
        closeMix();
        setPaneShown(false);
        focusAfterClose(was);
      }
    }
    if (!loaded) return;
    const now = currentOpenUrl();
    const href = addressAfter({
      key,
      openUrl: now,
      saved: now !== null && savedMixes.peek().some((m) => m.url === now),
      hold: holding || readFailed,
    });
    if (href !== null) location.replace(href);
  }, [key, loaded, open, saved, state.status]);

  const close = (): void => {
    // Escape with nothing open must not clear an inline error.
    if (open === null && key === undefined) return;
    const was = open ?? key ?? null;
    closeMix();
    setPaneShown(false);
    if (key !== undefined) location.replace(routeHref({ name: 'mix' }));
    focusAfterClose(was);
  };

  const size = windowClass.value;
  const stacked = size === 'compact' || size === 'medium';

  // The pane brought back over an open mix folds on the first Escape; the
  // second closes the mix (ListDetail's own layer, ranked below).
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!paneShown || open === null || stacked) return;
    return pushEscapeLayer(() => {
      if (matchMedia(PANE_ALWAYS).matches) {
        closeRef.current(); // From 1,600 px the pane never folds.
        return;
      }
      setPaneShown(false);
      focusWhenReady('.mix-pane-toggle', false);
    }, ESCAPE_RANK.fold);
  }, [paneShown, open, stacked]);
  // `mixError` has one place on screen (review F1, round 2): the open mix's
  // header while the pane is folded over it (840–1,599 px, with an error
  // mark on the Mixes button) and in the one-column layout (the top of the
  // screen); else the Mixes list header.
  const paneAlways = useMedia(PANE_ALWAYS);
  const folded = !stacked && open !== null && !paneShown && !paneAlways;
  const errorInDetail = open !== null && (stacked || folded);
  const error = mixError.value;
  const paneButton = stacked ? undefined : (
    <Button
      variant="text"
      icon="queue_music"
      class="mix-pane-toggle"
      aria-expanded={paneShown}
      aria-controls="mix-pane"
      onClick={() => setPaneShown(!paneShown)}
    >
      Mixes
      {error !== null && (
        <>
          <span class="mix-pane-alert" aria-hidden="true">
            <Icon name="error" size={18} />
          </span>
          <span class="visually-hidden"> (has an error)</span>
        </>
      )}
    </Button>
  );
  const unknownKey = missing !== null && missing === key && !readFailed;
  const detail =
    state.status === 'ready' ? (
      <>
        {/* An unknown key over an open mix (Back after a removal, a stale
            link): said above it; the mix stays, it may be an unsaved
            lookup (S14 review M9). */}
        {stray !== null && stray.open === state.view.url && (
          <StatusLine kind="warning">
            This saved mix is not in this browser.
          </StatusLine>
        )}
        <MixDetail
          // One mix's edit, filter and sort never carry to another (S13 B1).
          key={state.view.url}
          view={state.view}
          onClose={close}
          stacked={stacked}
          paneButton={paneButton}
          error={
            errorInDetail && error !== null ? (
              <StatusLine kind="error">{error}</StatusLine>
            ) : undefined
          }
        />
      </>
    ) : unknownKey ? (
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

  if (stacked) {
    return (
      <section class="mix mix-stack">
        <LinkForm />
        {detail}
        <IdentifyRequest />
        <LookupLines />
        <JsonImport />
        <MixesList showError={!errorInDetail} />
        <WorkerHelp />
      </section>
    );
  }

  return (
    <section class={paneShown ? 'mix mix-pane-on' : 'mix'}>
      <ListDetail
        list={() => <MixListPane />}
        detail={
          detail ?? (
            <EmptyState icon="queue_music">
              <p>Paste a link, import a JSON, or pick a saved mix</p>
            </EmptyState>
          )
        }
        // The workspace places the focus itself after a close.
        selectedId={null}
        onClose={close}
      />
    </section>
  );
}
