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
  deleteMixForever,
  mixError,
  mixJobs,
  mixQueueNote,
  mixState,
  removeMix,
  savedMixes,
  serverState,
  startCancelRequest,
  startIdentifyRequest,
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
import { msg } from '../../i18n';
import { formatDate } from '../format';
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

/** The link field: the link Identify on my computer sends (Enter asks too). */
export function LinkForm() {
  const state = mixState.value;
  const url = linkText.value;
  // A hand-imported scan has a synthetic `tracklistify:` key and no page:
  // it never fills the field. Opening a mix with a real link does, so
  // Identify on my computer asks for the mix on screen.
  const viewUrl =
    state.status === 'ready' && state.view.url.startsWith('https://')
      ? state.view.url
      : null;
  useEffect(() => {
    if (viewUrl !== null) linkText.value = viewUrl;
  }, [viewUrl]);
  return (
    <div class="mix-link">
      <form
        class="mix-link-form"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter in the field is the one action left: ask the computer.
          if (url.trim() !== '') void startIdentifyRequest(url);
        }}
      >
        <TextField
          type="text"
          inputMode="url"
          placeholder={msg().mix.pane.linkPlaceholder}
          value={url}
          onValue={(v) => {
            linkText.value = v;
          }}
        />
      </form>
    </div>
  );
}

/**
 * "Identify on my computer" for the link in the field: the button, the
 * latest request's state and the earlier ones, collapsed. Wording from
 * `requestStatusText`, the one place that knows the server and job states.
 */
export function IdentifyRequest() {
  const url = linkText.value;
  const key = requestKey(url);
  const history = key !== null ? (mixJobs.value[key] ?? []) : [];
  const status = requestStatusText(history[0], serverState.value);
  return (
    <div class="mix-identify">
      <Button
        icon="computer"
        disabled={!status.canAsk || url.trim() === ''}
        onClick={() => void startIdentifyRequest(url)}
      >
        {status.button}
      </Button>
      {status.line !== null && <p class="mix-caption">{status.line}</p>}
      {history.length > 1 && (
        <Disclosure summary={msg().mix.pane.earlier(history.length - 1)}>
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
      label={msg().mix.pane.importLabel}
      hint={msg().mix.pane.importHint}
      accept=".json,application/json"
      onFiles={(files) => void startTracklistifyImport(files[0])}
    />
  );
}

/** Removes a saved mix; the open one closes and the address goes to `#/mix`. */
function remove(url: string): void {
  if (!confirm(msg().mix.pane.confirmRemove)) return;
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

/** Delete forever: the open mix closes first, as with Remove. */
async function removeForever(url: string): Promise<void> {
  const wasOpen = openUrl() === url;
  await deleteMixForever(url);
  if (wasOpen && !savedMixes.value.some((m) => m.url === url)) {
    closeMix();
    location.replace(routeHref({ name: 'mix' }));
  }
}

export const CHIP_FLAG: Record<MixChipKind, FlagKind | undefined> = {
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
  const c = msg().mix.common;
  const buttons = [
    item.canMoveToTop && (
      <Button key="top" variant="text" onClick={() => void startMoveToTop(id)}>
        {msg().mix.pane.moveToTop}
      </Button>
    ),
    item.canCancel && (
      <Button
        key="cancel"
        variant="text"
        onClick={() => void startCancelRequest(id)}
      >
        {c.cancel}
      </Button>
    ),
    item.request?.status === 'claimed' && (
      <Button
        key="stop"
        variant="text"
        disabled={!item.canStop}
        onClick={() => void startStopRequest(id)}
      >
        {c.stop}
      </Button>
    ),
    item.canAskAgain && (
      <Button
        key="again"
        variant="text"
        onClick={() => void startIdentifyRequest(item.key)}
      >
        {c.askAgain}
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
        <span class="sub">
          {msg().mix.pane.saved(formatDate(item.savedAt))}
        </span>
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
  const busy = running || item.chip.kind === 'queued';
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
        {(item.saved || !busy) && (
          <RowMenu
            label={msg().mix.common.moreFor(item.title)}
            items={[
              ...(item.saved
                ? [
                    {
                      label: msg().mix.pane.remove,
                      onSelect: () => remove(item.key),
                    },
                  ]
                : []),
              ...(busy
                ? []
                : [
                    {
                      label: msg().mix.pane.deleteForever,
                      onSelect: () => void removeForever(item.key),
                    },
                  ]),
            ]}
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
          summary={msg().mix.pane.earlier(item.earlier.length)}
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
        {msg().mix.common.mixes}
      </h2>
      {requests.length > 0 && (
        <div class="mix-requests-head">
          <p class="mix-caption">
            {active > 0
              ? msg().mix.pane.waiting(active)
              : msg().mix.pane.nothingWaiting}
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
            {syncing ? msg().mix.pane.checking : msg().mix.pane.checkNow}
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
        <p class="mix-caption">{msg().mix.pane.noSaved}</p>
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

/** File names and commands in the worker help: typed as they are, never translated. */
const CODE = {
  windows: 'mix-worker-windows-x64.exe',
  macArm: 'mix-worker-macos-arm64',
  macIntel: 'mix-worker-macos-x86_64',
  macChmod: 'chmod +x mix-worker-macos-arm64',
  macRun: './mix-worker-macos-arm64',
  linux: 'mix-worker-linux-x86_64',
  linuxChmod: 'chmod +x mix-worker-linux-x86_64',
  linuxRun: './mix-worker-linux-x86_64',
  cd: 'cd worker',
  example: '.env.example',
  dotenv: '.env',
  sync: 'uv sync',
  login: 'uv run mix-worker login',
  watch: 'uv run mix-worker run --watch',
  windowsName: 'Windows 10/11',
  macName: 'macOS',
  linuxName: 'Linux',
} as const;

/**
 * How to start the worker on each system, collapsed: the packaged
 * executable per OS from a `worker-v…` release, or the code with uv; the
 * VPN note from `worker/README.md`. The full manual is that file.
 */
export function WorkerHelp() {
  const h = msg().mix.help;
  return (
    <Disclosure class="mix-howto" summary={h.summary}>
      <p>
        {h.introBefore}{' '}
        <a href={RELEASES} target="_blank" rel="noopener">
          {h.release}
        </a>{' '}
        {h.introAfterRelease}
      </p>
      <Disclosure summary={CODE.windowsName}>
        <p>
          {h.file} <code>{CODE.windows}</code>
          {h.windows}
        </p>
      </Disclosure>
      <Disclosure summary={CODE.macName}>
        <p>
          {h.file} <code>{CODE.macArm}</code> {h.macArm}{' '}
          <code>{CODE.macIntel}</code> {h.macIntel} <code>{CODE.macChmod}</code>
          {h.macThen} <code>{CODE.macRun}</code>.
        </p>
      </Disclosure>
      <Disclosure summary={CODE.linuxName}>
        <p>
          {h.file} <code>{CODE.linux}</code>
          {h.linuxFolder} <code>{CODE.linuxChmod}</code> {h.then}{' '}
          <code>{CODE.linuxRun}</code>.
        </p>
      </Disclosure>
      <Disclosure summary={h.codeSummary}>
        <p>
          <code>{CODE.cd}</code>
          {h.codeCopy} <code>{CODE.example}</code> {h.codeTo}{' '}
          <code>{CODE.dotenv}</code> {h.codeFill} <code>{CODE.sync}</code>,{' '}
          <code>{CODE.login}</code> {h.and} <code>{CODE.watch}</code>.
        </p>
      </Disclosure>
      <p>{h.vpn}</p>
      <p class="mix-caption">
        {h.youtube}{' '}
        <a href={WORKER_MANUAL} target="_blank" rel="noopener">
          {h.manual}
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
      <JsonImport />
      <MixesList />
      <WorkerHelp />
    </div>
  );
}
