import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  applyPastedTracklist,
  mixRows,
  savedMixes,
  type MixView,
} from '../../model/state';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { StatusLine } from '../components/StatusLine';
import { msg } from '../../i18n';
import { formatDate } from '../format';
import { SetWideClues } from './Clues';
import { CreatePlaylistCard } from './CreatePlaylistCard';
import { ReviewHead } from './ReviewHead';
import { OpenMixRequest, RunLine } from './RunLine';
import { TracklistTable } from './TracklistTable';
import { Disclosure } from './Disclosure';

/** A link that keeps a 48 px target inside a caption line. */
function OutLink(p: { href: string; children: string }) {
  return (
    <a class="mix-out" href={p.href} target="_blank" rel="noopener">
      {p.children}
    </a>
  );
}

/**
 * Where the tracklist came from (spec §5.2, kept word for word): TrackId,
 * Tracklistify, the computer, the description, its link-out; "nothing found"
 * only when every layer answered empty; each layer's failure inline.
 */
function Provenance(p: { view: MixView }) {
  const { view } = p;
  const tid = view.trackid;
  const rows = mixRows.value;
  const foundSomething =
    tid !== null ||
    view.sources.description ||
    view.sources.linkOut !== null ||
    view.sources.pasted ||
    view.sources.tracklistify === true ||
    view.sources.worker === true;
  const nothingFound = !foundSomething;
  const identifiedAt = savedMixes.value.find(
    (m) => m.url === view.url
  )?.identifiedAt;
  const t = msg().mix.detail;
  const computerTracks = rows.filter((r) => r.source === 'tracklistify').length;
  return (
    <div class="mix-provenance">
      {tid && tid.count > 0 && (
        <p class="mix-caption">
          {t.fromTrackid(tid.count)} ·{' '}
          <OutLink href={`https://trackid.net/audiostream/${tid.slug}`}>
            {t.openTrackid}
          </OutLink>
        </p>
      )}
      {tid && tid.empty && (
        <p class="mix-caption">
          {t.trackidEmpty}{' '}
          <OutLink href={`https://trackid.net/audiostream/${tid.slug}`}>
            {t.openTrackid}
          </OutLink>
        </p>
      )}
      {view.sources.tracklistify === true && (
        <p class="mix-caption">
          {t.fromTracklistify(rows.filter((r) => !r.gap).length)}
        </p>
      )}
      {view.sources.worker === true && (
        <p class="mix-caption">
          {identifiedAt
            ? t.fromComputerOn(computerTracks, formatDate(identifiedAt))
            : t.fromComputer(computerTracks)}
        </p>
      )}
      {view.sources.description && (
        <p class="mix-caption">{t.fromDescription}</p>
      )}
      {view.sources.linkOut !== null && (
        <p class="mix-caption">
          {t.linkOut}{' '}
          <OutLink href={view.sources.linkOut}>
            {/* eslint-disable-next-line no-restricted-syntax -- the link itself and an arrow, no words */}
            {`${view.sources.linkOut} ›`}
          </OutLink>
        </p>
      )}
      {nothingFound && <p class="mix-caption">{t.nothingFound}</p>}
    </div>
  );
}

/** SoundCloud's player: its compact 166 px, or 400 px on request. */
function Player(p: { src: string }) {
  const [large, setLarge] = useState(false);
  return (
    <div class="mix-player-box">
      <iframe
        class="mix-player"
        title={msg().mix.detail.player}
        src={`${p.src}&show_comments=true`}
        width="100%"
        height={large ? 400 : 166}
        loading="lazy"
        allow="autoplay; encrypted-media"
      />
      <Button
        variant="text"
        aria-pressed={large}
        onClick={() => setLarge(!large)}
      >
        {msg().mix.detail.largerPlayer}
      </Button>
    </div>
  );
}

/** Paste a tracklist, collapsed (the four `confirm()`s live in the state). */
function PasteBox() {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const t = msg().mix.detail;
  const onAdd = (): void => {
    const result = applyPastedTracklist(text);
    if (result === 'added') {
      setText('');
      setNote(null);
    } else if (result === 'linkOnly') {
      setNote(t.pasteLinkOnly);
    } else {
      setNote(t.pasteNone);
    }
  };
  return (
    <Disclosure class="card" summary={t.paste}>
      <textarea
        class="text-field mix-paste"
        rows={4}
        aria-label={t.paste}
        placeholder={t.pastePlaceholder}
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <Button onClick={onAdd} disabled={text.trim() === ''}>
        {t.addTracks}
      </Button>
      {note !== null && <StatusLine kind="warning">{note}</StatusLine>}
    </Disclosure>
  );
}

/**
 * The open mix (spec 003 §12, T083): header with provenance; the player; the set-wide
 * clues; the tracklist table; Create playlist; Paste a tracklist.
 * `aside` is the slot later steps fill under the header (S08b/c: the
 * running request's line and Stop, the run line, Check on Spotify).
 */
export function MixDetail(p: {
  view: MixView;
  onClose: () => void;
  aside?: ComponentChildren;
  /** Brings back the folded Mixes pane (wide windows under 1,600 px). */
  paneButton?: ComponentChildren;
  /** `mixError` while the Mixes pane is folded (review F1), under the header. */
  error?: ComponentChildren;
}) {
  const { view } = p;
  const saved = savedMixes.value.find((m) => m.url === view.url);
  const clues = saved?.clues;
  return (
    <article class="mix-detail" aria-label={view.title ?? view.url}>
      <header class="mix-head">
        <div class="mix-head-text">
          <h2 class="mix-title">{view.title ?? view.url}</h2>
          {view.author && <p class="mix-caption">{view.author}</p>}
        </div>
        {p.paneButton}
        <IconButton
          icon="close"
          label={msg().mix.detail.close}
          onClick={p.onClose}
        />
      </header>
      {p.error}
      <Provenance view={view} />
      {p.aside}
      <OpenMixRequest url={view.url} />
      <RunLine url={view.url} run={saved?.run} />
      <ReviewHead url={view.url} />
      <SetWideClues clues={clues} />
      {view.playerSrc !== null && <Player src={view.playerSrc} />}
      <TracklistTable />
      <CreatePlaylistCard view={view} />
      <PasteBox />
    </article>
  );
}
