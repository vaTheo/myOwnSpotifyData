import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  mixListItems,
  type MixChipKind,
  type MixListItem,
} from '../../features/mix/mixList';
import { requestKey } from '../../features/mix/url';
import { requestStatusText } from '../../features/mix/worker';
import {
  closeMix,
  mixError,
  mixJobs,
  mixQueueNote,
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
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { formatDate, plural } from '../format';
import { Disclosure } from './Disclosure';
import { RowMenu } from './RowMenu';

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
 * "the button above" stays true): Looking up the mix… and the
 * not-SoundCloud error, inline, never a banner. `mixError` shows in the
 * Mixes list (S08b), where the requests and saved mixes are.
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

/** Removes a saved mix; the open one closes and the address goes to `#/mix`. */
function remove(url: string): void {
  if (!confirm('Remove this saved mix?')) return;
  void (async () => {
    const wasOpen = openUrl() === url;
    await removeMix(url);
    if (wasOpen && !savedMixes.value.some((m) => m.url === url)) {
      closeMix();
      // Replace, so Back does not lead to the removed mix.
      location.replace(routeHref({ name: 'mix' }));
    }
  })();
}

const CHIP_FLAG: Record<MixChipKind, FlagKind | undefined> = {
  queued: undefined,
  identifying: 'plays',
  paused: 'pending',
  stopping: 'pending',
  found: 'new',
  failed: 'skip',
  rejected: 'todo',
  saved: 'top',
  playlist: 'top',
};

/** Move to top, Cancel, Stop (disabled while Stopping…) and Ask again. */
function MixActions(p: { item: MixListItem }) {
  const { item } = p;
  const id = item.request?.id;
  if (id === undefined) return null;
  const buttons = [
    item.canMoveToTop && (
      <Button key="top" variant="text" onClick={() => void startMoveToTop(id)}>
        Move to top
      </Button>
    ),
    item.canCancel && (
      <Button
        key="cancel"
        variant="text"
        onClick={() => void startCancelRequest(id)}
      >
        Cancel
      </Button>
    ),
    item.request?.status === 'claimed' && (
      <Button
        key="stop"
        variant="text"
        disabled={!item.canStop}
        onClick={() => void startStopRequest(id)}
      >
        Stop
      </Button>
    ),
    item.canAskAgain && (
      <Button
        key="again"
        variant="text"
        onClick={() => void startIdentifyRequest(item.key)}
      >
        Ask again
      </Button>
    ),
  ].filter(Boolean);
  if (buttons.length === 0) return null;
  return <div class="mix-row-actions">{buttons}</div>;
}

/**
 * One row of the Mixes list: title, chip and "saved 3 Nov" in the row's
 * link (a saved mix) or button (fills the link field); Remove in the row
 * menu of a saved mix; under it the request's line, the progress bar, the
 * actions and the earlier requests, collapsed.
 */
function MixItem(p: { item: MixListItem; open: string | null }) {
  const { item } = p;
  const server = serverState.value;
  const selected = item.key === p.open;
  const main = (
    <>
      <span class="title">{item.title}</span>
      {item.savedAt !== null && (
        <span class="sub">saved {formatDate(item.savedAt)}</span>
      )}
      <div class="badges">
        <Flag kind={CHIP_FLAG[item.chip.kind]}>{item.chip.text}</Flag>
      </div>
    </>
  );
  const running =
    item.chip.kind === 'identifying' ||
    item.chip.kind === 'paused' ||
    item.chip.kind === 'stopping';
  return (
    <li class="mix-item">
      <div class="mix-item-head">
        <div class={selected ? 'row selected' : 'row'}>
          {item.saved ? (
            <a
              class="main"
              href={routeHref({ name: 'mix', key: item.key })}
              data-row-id={item.key}
              aria-current={selected ? 'page' : undefined}
            >
              {main}
            </a>
          ) : (
            <button
              type="button"
              class="main"
              data-row-id={item.key}
              onClick={() => {
                linkText.value = item.key;
              }}
            >
              {main}
            </button>
          )}
        </div>
        {item.saved && (
          <RowMenu
            label={`More for ${item.title}`}
            items={[{ label: 'Remove', onSelect: () => remove(item.key) }]}
          />
        )}
      </div>
      {item.line !== null && <p class="mix-item-line">{item.line}</p>}
      {running && item.percent !== null && item.step !== null && (
        <div class="mix-item-progress">
          <ProgressBar
            label={item.step}
            done={Math.round(item.percent)}
            total={100}
            showCount={false}
          />
        </div>
      )}
      <MixActions item={item} />
      {item.earlier.length > 0 && (
        <Disclosure
          class="mix-earlier"
          summary={<>Earlier requests ({item.earlier.length})</>}
        >
          <ul class="mix-lines">
            {item.earlier.map((v) => (
              <li key={v.id}>{requestStatusText(v, server).line}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </li>
  );
}

/**
 * The Mixes list (spec 003 §12, T116, T123): saved mixes and requests to
 * your computer in one list, one row per link, in `mixListItems`' order
 * (running, then waiting as the worker takes them, then the rest newest
 * first). The header counts what waits or runs, with Check now; the queue
 * note ('gone', ruling D4) and `mixError` show under it, inline (unless
 * the open mix's header shows the error: `showError` false). Statuses
 * come from the last pull: the 60 s auto-pull refreshes them, no new poll.
 */
export function MixesList(p: { showError?: boolean } = {}) {
  const server = serverState.value;
  const jobs = mixJobs.value;
  const items = mixListItems(jobs, savedMixes.value, server, Date.now());
  const open = openUrl();
  const syncing = server.status === 'pushing' || server.status === 'pulling';
  const requests = items.filter((i) => i.request !== null);
  const active = items.filter(
    (i) => i.request?.status === 'queued' || i.request?.status === 'claimed'
  ).length;
  return (
    <section class="mix-list" aria-labelledby="mix-list-title">
      <h2 id="mix-list-title" class="mix-pane-title">
        Mixes
      </h2>
      {requests.length > 0 && (
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
            onClick={() => {
              mixQueueNote.value = null;
              void startServerSync();
            }}
          >
            {syncing ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      )}
      {mixQueueNote.value !== null && (
        <StatusLine>{mixQueueNote.value}</StatusLine>
      )}
      {mixError.value !== null && p.showError !== false && (
        <StatusLine kind="error">{mixError.value}</StatusLine>
      )}
      {items.length === 0 ? (
        <p class="mix-caption">No saved mixes yet.</p>
      ) : (
        <ul class="list">
          {items.map((item) => (
            <MixItem key={item.key} item={item} open={open} />
          ))}
        </ul>
      )}
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
 * The left pane (spec 003 §12, T081, T116), top to bottom: the link field,
 * Identify on my computer, the JSON import, the Mixes list, and the worker
 * help, collapsed.
 */
export function MixListPane() {
  return (
    <div class="mix-pane" id="mix-pane">
      <LinkForm />
      <IdentifyRequest />
      <LookupLines />
      <JsonImport />
      <MixesList />
      <WorkerHelp />
    </div>
  );
}
