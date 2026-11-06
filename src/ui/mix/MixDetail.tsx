import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { TracklistRow } from '../../db/schema';
import {
  applyDescriptionTracklist,
  applyPastedTracklist,
  mixRows,
  savedMixes,
  startMixLookup,
  type MixView,
} from '../../model/state';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { StatusLine } from '../components/StatusLine';
import { formatDate, plural } from '../format';
import { SetWideClues } from './Clues';
import { CreatePlaylistCard } from './CreatePlaylistCard';
import { TracklistTable } from './TracklistTable';

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
  // The short-link note already says to paste or read the player.
  const nothingFound =
    !foundSomething &&
    !view.shortLink &&
    view.trackidError === null &&
    view.oembedError === null;
  const identifiedAt = savedMixes.value.find(
    (m) => m.url === view.url
  )?.identifiedAt;
  return (
    <div class="mix-provenance">
      {view.shortLink && (
        <p class="mix-caption">
          This is a mobile share link, so the TrackId.net lookup could not be
          confirmed for it. The player and any tracklist in the description are
          shown below — or paste a tracklist. On a computer, open the mix and
          copy its full soundcloud.com/… link for a TrackId lookup.
        </p>
      )}
      {tid && tid.count > 0 && (
        <p class="mix-caption">
          From TrackId.net · {plural(tid.count, 'track')}
          {tid.timeHitRate !== null &&
            ` · ${Math.round(tid.timeHitRate * 100)}% of the mix identified`}{' '}
          ·{' '}
          <OutLink href={`https://trackid.net/audiostream/${tid.slug}`}>
            Open on TrackId.net ›
          </OutLink>
        </p>
      )}
      {tid && tid.empty && (
        <p class="mix-caption">
          TrackId.net has this mix but identified no tracks yet ·{' '}
          <OutLink href={`https://trackid.net/audiostream/${tid.slug}`}>
            Open on TrackId.net ›
          </OutLink>
        </p>
      )}
      {view.sources.tracklistify === true && (
        <p class="mix-caption">
          From Tracklistify ·{' '}
          {plural(rows.filter((r) => !r.gap).length, 'track')}
        </p>
      )}
      {view.sources.worker === true && (
        <p class="mix-caption">
          From your computer ·{' '}
          {plural(
            rows.filter((r) => r.source === 'tracklistify').length,
            'track'
          )}
          {identifiedAt ? ` · ${formatDate(identifiedAt)}` : ''}
        </p>
      )}
      {view.sources.description && (
        <p class="mix-caption">From the mix description</p>
      )}
      {view.sources.linkOut !== null && (
        <p class="mix-caption">
          The description links a full tracklist ·{' '}
          <OutLink
            href={view.sources.linkOut}
          >{`${view.sources.linkOut} ›`}</OutLink>
        </p>
      )}
      {nothingFound && (
        <p class="mix-caption">
          Nothing found automatically — paste a tracklist below, or read the
          player's comments.
        </p>
      )}
      {view.trackidError !== null && (
        <StatusLine kind="error">
          TrackId.net could not be reached: {view.trackidError}
        </StatusLine>
      )}
      {view.oembedError !== null && (
        <StatusLine kind="error">
          The mix page could not be read: {view.oembedError}
        </StatusLine>
      )}
    </div>
  );
}

/** Cheap content compare, so Replace hides once the description rows show. */
function sameRows(a: TracklistRow[], b: TracklistRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const o = b[i];
    return (
      o !== undefined &&
      r.source === o.source &&
      r.artist === o.artist &&
      r.title === o.title &&
      r.startSec === o.startSec &&
      r.gap === o.gap
    );
  });
}

/** SoundCloud's player: its compact 166 px, or 400 px on request. */
function Player(p: { src: string }) {
  const [large, setLarge] = useState(false);
  return (
    <div class="mix-player-box">
      <iframe
        class="mix-player"
        title="SoundCloud player"
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
        Larger player
      </Button>
    </div>
  );
}

/** Paste a tracklist, collapsed (the four `confirm()`s live in the state). */
function PasteBox() {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const onAdd = (): void => {
    const result = applyPastedTracklist(text);
    if (result === 'added') {
      setText('');
      setNote(null);
    } else if (result === 'linkOnly') {
      setNote(
        'That looks like a link to a tracklist, not a tracklist. Open it, copy the tracks, and paste them here.'
      );
    } else {
      setNote('No tracks found in that text.');
    }
  };
  return (
    <details class="mix-section card">
      <summary>Paste a tracklist</summary>
      <textarea
        class="text-field mix-paste"
        rows={4}
        aria-label="Paste a tracklist"
        placeholder="e.g. from MixesDB or a player comment"
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <Button onClick={onAdd} disabled={text.trim() === ''}>
        Add these tracks
      </Button>
      {note !== null && <StatusLine kind="warning">{note}</StatusLine>}
    </details>
  );
}

/**
 * The open mix (spec 003 §12, T083): header with provenance, Look up again
 * and Replace with the description tracklist; the player; the set-wide
 * clues; the tracklist table; Create playlist; Paste a tracklist.
 * `aside` is the slot later steps fill under the header (S08b/c: the
 * running request's line and Stop, the run line, Check on Spotify).
 */
export function MixDetail(p: {
  view: MixView;
  onClose: () => void;
  aside?: ComponentChildren;
}) {
  const { view } = p;
  const real = view.url.startsWith('https://');
  const showReplace =
    view.descriptionRows.length > 0 &&
    !sameRows(mixRows.value, view.descriptionRows);
  const clues = savedMixes.value.find((m) => m.url === view.url)?.clues;
  return (
    <article class="mix-detail" aria-label={view.title ?? view.url}>
      <header class="mix-head">
        <div class="mix-head-text">
          <h2 class="mix-title">{view.title ?? view.url}</h2>
          {view.author && <p class="mix-caption">{view.author}</p>}
        </div>
        <IconButton icon="close" label="Close this mix" onClick={p.onClose} />
      </header>
      <Provenance view={view} />
      {(real || showReplace) && (
        <div class="mix-head-actions">
          {real && (
            <Button icon="sync" onClick={() => void startMixLookup(view.url)}>
              Look up again
            </Button>
          )}
          {showReplace && (
            <Button onClick={() => applyDescriptionTracklist()}>
              Replace with the description tracklist
            </Button>
          )}
        </div>
      )}
      {p.aside}
      <SetWideClues clues={clues} />
      {view.playerSrc !== null && <Player src={view.playerSrc} />}
      <TracklistTable />
      <CreatePlaylistCard view={view} />
      <PasteBox />
    </article>
  );
}
