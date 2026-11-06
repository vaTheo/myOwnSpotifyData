import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { requestKey } from '../../features/mix/url';
import {
  requestList,
  requestStatusText,
  type RequestListItem,
} from '../../features/mix/worker';
import {
  closeMix,
  mixError,
  mixJobs,
  mixState,
  removeMix,
  savedMixes,
  serverState,
  startCancelRequest,
  startIdentifyRequest,
  startMixLookup,
  startMoveToTop,
  startServerSync,
  startStopRequest,
  startTracklistifyImport,
} from '../../model/state';
import { routeHref } from '../../router';
import { Button } from '../components/Button';
import { FileDrop } from '../components/FileDrop';
import { Flag, type FlagKind } from '../components/Flag';
import { IconButton } from '../components/IconButton';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { TrackRow } from '../components/TrackRow';
import { formatDate, plural } from '../format';
import { Disclosure } from './Disclosure';

/**
 * The link field's text, shared by the form and the Requests rows (a row
 * with no saved mix fills it). Kept across visits to other screens.
 */
export const linkText = signal('');

/** The url of the mix on screen, or null. */
function openUrl(): string | null {
  const s = mixState.value;
  return s.status === 'ready' ? s.view.url : null;
}

/** The link field and Look up (Look up again for an open mix, Looking up… while busy). */
export function LinkForm() {
  const state = mixState.value;
  const url = linkText.value;
  // A hand-imported scan has a synthetic `tracklistify:` key and no page; a
  // worker mix has a real link, so it keeps the box and Look up again.
  const isTracklistifyView =
    state.status === 'ready' && !state.view.url.startsWith('https://');
  const viewUrl =
    state.status === 'ready' && !isTracklistifyView ? state.view.url : null;
  // Opening a saved mix seeds the field from its url, so the button is the
  // "Look up again" re-fetch path. A Tracklistify view never fills it.
  useEffect(() => {
    if (viewUrl !== null) linkText.value = viewUrl;
  }, [viewUrl]);
  return (
    <div class="mix-link">
      <form
        class="mix-link-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() !== '' && state.status !== 'looking') {
            void startMixLookup(url);
          }
        }}
      >
        <TextField
          type="text"
          inputMode="url"
          placeholder="Paste a mix link (SoundCloud, or any set for your computer)"
          value={url}
          onValue={(v) => {
            linkText.value = v;
          }}
        />
        <Button
          type="submit"
          variant="filled"
          disabled={state.status === 'looking' || url.trim() === ''}
        >
          {state.status === 'looking'
            ? 'Looking up…'
            : state.status === 'ready' && !isTracklistifyView
              ? 'Look up again'
              : 'Look up'}
        </Button>
      </form>
    </div>
  );
}

/**
 * The lookup's own lines, under Identify on my computer (so the error's
 * "the button above" stays true): Looking up the mix…, the not-SoundCloud
 * error and `mixError`, inline, never a banner.
 */
export function LookupLines() {
  const state = mixState.value;
  return (
    <>
      {state.status === 'looking' && (
        <StatusLine>Looking up the mix…</StatusLine>
      )}
      {state.status === 'error' && (
        <StatusLine kind="error">
          That is not a SoundCloud track link, so there is nothing to look up
          here. Any set link can still be sent to your computer with the button
          above.
        </StatusLine>
      )}
      {mixError.value !== null && (
        <StatusLine kind="error">{mixError.value}</StatusLine>
      )}
    </>
  );
}

/**
 * "Identify on my computer" for the link in the field: the button, the
 * latest request's state and the earlier ones, collapsed. Wording from
 * `requestStatusText`, the one place that knows the server and job states.
 */
export function IdentifyRequest() {
  const url = linkText.value;
  const busy = mixState.value.status === 'looking';
  const key = requestKey(url);
  const history = key !== null ? (mixJobs.value[key] ?? []) : [];
  const status = requestStatusText(history[0], serverState.value);
  return (
    <div class="mix-identify">
      <Button
        icon="computer"
        disabled={!status.canAsk || busy || url.trim() === ''}
        onClick={() => void startIdentifyRequest(url)}
      >
        {status.button}
      </Button>
      {status.line !== null && <p class="mix-caption">{status.line}</p>}
      {history.length > 1 && (
        <Disclosure summary={<>Earlier requests ({history.length - 1})</>}>
          <ul class="mix-lines">
            {history.slice(1).map((v) => (
              <li key={v.id}>{requestStatusText(v, serverState.value).line}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

/** A Tracklistify `tracklist.json`, picked or dropped. */
export function JsonImport() {
  return (
    <FileDrop
      label="Or import a Tracklistify tracklist.json"
      hint="or drop it here"
      accept=".json,application/json"
      onFiles={(files) => void startTracklistifyImport(files[0])}
    />
  );
}

/**
 * A row's overflow menu (Remove for now). Closes on Escape, on a tap
 * outside and when the focus leaves it.
 */
function RowMenu(p: {
  label: string;
  items: { label: string; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div
      class="row-menu"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
      onFocusOut={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <IconButton
        icon="more_vert"
        label={p.label}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div class="row-menu-list" role="menu">
          {p.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Removes a saved mix; the open one closes and the address goes to `#/mix`. */
function remove(url: string): void {
  if (!confirm('Remove this saved mix?')) return;
  void (async () => {
    const wasOpen = openUrl() === url;
    await removeMix(url);
    if (wasOpen && !savedMixes.value.some((m) => m.url === url)) {
      closeMix();
      location.hash = routeHref({ name: 'mix' });
    }
  })();
}

/** Saved mixes: title, "N tracks · saved 3 Nov", the open one selected. */
export function SavedMixes() {
  const mixes = savedMixes.value;
  const open = openUrl();
  return (
    <section class="mix-saved" aria-labelledby="mix-saved-title">
      <h2 id="mix-saved-title" class="mix-pane-title">
        Saved mixes
      </h2>
      {mixes.length === 0 ? (
        <p class="mix-caption">No saved mixes yet.</p>
      ) : (
        <ul class="list">
          {mixes.map((mix) => {
            const n = mix.rows.filter((r) => !r.gap).length;
            const title = mix.title ?? mix.url;
            return (
              <TrackRow
                key={mix.url}
                title={title}
                subtitle={`${plural(n, 'track')} · saved ${formatDate(mix.savedAt)}`}
                href={routeHref({ name: 'mix', key: mix.url })}
                rowId={mix.url}
                selected={mix.url === open}
              >
                <RowMenu
                  label={`More for ${title}`}
                  items={[{ label: 'Remove', onSelect: () => remove(mix.url) }]}
                />
              </TrackRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const REQUEST_FLAG: Record<RequestListItem['label'], FlagKind | undefined> = {
  Waiting: undefined,
  Identifying: 'plays',
  Done: 'top',
  Rejected: 'todo',
  Failed: 'skip',
};

function RequestActions(p: { item: RequestListItem }) {
  const { item } = p;
  if (item.canAskAgain) {
    return (
      <div class="mix-row-actions">
        <Button
          variant="text"
          onClick={() => void startIdentifyRequest(item.key)}
        >
          Ask again
        </Button>
      </div>
    );
  }
  if (item.status === 'queued') {
    return (
      <div class="mix-row-actions">
        <Button variant="text" onClick={() => void startMoveToTop(item.id)}>
          Move to top
        </Button>
        <Button variant="text" onClick={() => void startCancelRequest(item.id)}>
          Cancel
        </Button>
      </div>
    );
  }
  if (item.status === 'claimed') {
    return (
      <div class="mix-row-actions">
        <Button variant="text" onClick={() => void startStopRequest(item.id)}>
          Stop
        </Button>
      </div>
    );
  }
  return null;
}

/**
 * "Requests to your computer" (round 004, ported by T120): every link's
 * latest request, running first, then waiting, then finished; a chip per
 * state, the state line, the queue actions, and the link's earlier
 * requests collapsed. Selecting a row opens its saved mix, or fills the
 * link field when none is saved. Statuses come from the last pull; Check
 * now pulls again. S08b merges this list with Saved mixes.
 */
export function RequestsCard() {
  const server = serverState.value;
  const items = requestList(mixJobs.value, savedMixes.value, server);
  if (items.length === 0) return null;
  const syncing = server.status === 'pushing' || server.status === 'pulling';
  const active = items.filter(
    (i) => i.label === 'Waiting' || i.label === 'Identifying'
  ).length;
  return (
    <section class="mix-requests" aria-labelledby="mix-requests-title">
      <h2 id="mix-requests-title" class="mix-pane-title">
        Requests to your computer
      </h2>
      <div class="mix-requests-head">
        <p class="mix-caption">
          {active > 0
            ? `${plural(active, 'request')} waiting or running · checked every minute.`
            : 'Nothing waiting.'}
        </p>
        <Button
          variant="text"
          icon="sync"
          disabled={syncing}
          onClick={() => void startServerSync()}
        >
          {syncing ? 'Checking…' : 'Check now'}
        </Button>
      </div>
      <ul class="list">
        {items.map((item) => {
          const earlier = (mixJobs.value[item.key] ?? []).slice(1);
          return (
            <TrackRow
              key={item.key}
              title={item.title}
              subtitle={
                item.tracks !== null && item.label === 'Done'
                  ? `${item.line} · ${plural(item.tracks, 'track')}`
                  : item.line
              }
              badges={<Flag kind={REQUEST_FLAG[item.label]}>{item.label}</Flag>}
              onClick={() => {
                if (item.saved) {
                  location.hash = routeHref({ name: 'mix', key: item.key });
                } else {
                  linkText.value = item.key;
                }
              }}
              selected={item.key === openUrl()}
            >
              <RequestActions item={item} />
              {earlier.length > 0 && (
                <Disclosure
                  class="mix-earlier"
                  summary={<>Earlier requests ({earlier.length})</>}
                >
                  <ul class="mix-lines">
                    {earlier.map((v) => (
                      <li key={v.id}>{requestStatusText(v, server).line}</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </TrackRow>
          );
        })}
      </ul>
    </section>
  );
}

const RELEASES = 'https://github.com/vaTheo/myOwnSpotifyData/releases/latest';
const WORKER_MANUAL =
  'https://github.com/vaTheo/myOwnSpotifyData/blob/main/worker/README.md';

/**
 * How to start the worker on each system, collapsed: the packaged
 * executable per OS from a `worker-v…` release, or the code with uv; the
 * VPN note from `worker/README.md`. The full manual is that file.
 */
export function WorkerHelp() {
  return (
    <Disclosure class="mix-howto" summary="Run the worker on your computer">
      <p>
        The worker takes the requests above, downloads the set, identifies it
        with Shazam and sends the tracklist back; the audio never leaves your
        computer. Download the file for your system from the latest{' '}
        <a href={RELEASES} target="_blank" rel="noopener">
          release
        </a>{' '}
        and put it in a folder of its own. The first start writes{' '}
        <code>mix-worker.env</code> next to it: fill <code>SUPABASE_URL</code>{' '}
        and <code>SUPABASE_KEY</code> (the same public values as the app's
        server), start again, type your email and click the mail's link on that
        computer. It then checks for requests every minute until you close it.
      </p>
      <Disclosure summary="Windows 10/11">
        <p>
          File <code>mix-worker-windows-x64.exe</code>. Double-click it; on
          "Windows protected your PC", choose More info → Run anyway (the file
          is not signed).
        </p>
      </Disclosure>
      <Disclosure summary="macOS">
        <p>
          File <code>mix-worker-macos-arm64</code> (Apple silicon: M1 and later)
          or <code>mix-worker-macos-x86_64</code> (Intel). In Terminal, in its
          folder: <code>chmod +x mix-worker-macos-arm64</code>, then right-click
          it in Finder → Open the first time (unsigned), or run{' '}
          <code>./mix-worker-macos-arm64</code>.
        </p>
      </Disclosure>
      <Disclosure summary="Linux">
        <p>
          File <code>mix-worker-linux-x86_64</code>. In a terminal, in its
          folder: <code>chmod +x mix-worker-linux-x86_64</code> then{' '}
          <code>./mix-worker-linux-x86_64</code>.
        </p>
      </Disclosure>
      <Disclosure summary="From the code (any system, Python 3.11–3.13 and uv)">
        <p>
          <code>cd worker</code>, copy <code>.env.example</code> to{' '}
          <code>.env</code> and fill the two values, then <code>uv sync</code>,{' '}
          <code>uv run mix-worker login</code> and{' '}
          <code>uv run mix-worker run --watch</code>.
        </p>
      </Disclosure>
      <p>
        Don't run the worker on a VPN: Shazam counts calls per address, and a
        VPN's address is shared with many people, so it refuses often. If the
        phone says "Shazam refuses often: a VPN or a shared network?", turn the
        VPN off.
      </p>
      <p class="mix-caption">
        YouTube links also need Node or Deno installed on the computer;
        SoundCloud, Mixcloud and the others need nothing.{' '}
        <a href={WORKER_MANUAL} target="_blank" rel="noopener">
          Full manual ›
        </a>
      </p>
    </Disclosure>
  );
}

/**
 * The left pane (spec 003 §12, T081), top to bottom: the link field,
 * Identify on my computer, the JSON import, Saved mixes, Requests to your
 * computer, and the worker help, collapsed.
 */
export function MixListPane() {
  return (
    <div class="mix-pane">
      <LinkForm />
      <IdentifyRequest />
      <LookupLines />
      <JsonImport />
      <SavedMixes />
      <RequestsCard />
      <WorkerHelp />
    </div>
  );
}
