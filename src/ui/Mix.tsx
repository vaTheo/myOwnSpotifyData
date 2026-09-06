import { useEffect, useState } from 'preact/hooks';
import type { TracklistRow } from '../db/schema';
import { parseClock } from '../features/mix/parse';
import {
  libraryTitleIndex,
  matchMixRow,
  type MixMatch,
} from '../features/mix/match';
import { normalize } from '../model/normalize';
import {
  addMixRow,
  applyDescriptionTracklist,
  applyPastedTracklist,
  closeMix,
  deleteMixRow,
  editMixRow,
  loadSavedMixes,
  mixError,
  mixRows,
  mixState,
  model,
  openMix,
  removeMix,
  saveMix,
  savedMixes,
  startMixLookup,
  type MixView,
} from '../model/state';
import { FeaturePills } from './components/FeaturePills';
import { TrackRow } from './components/TrackRow';
import { formatClock, formatDate, plural } from './format';

/**
 * A gap row and a `?`/`ID`/`unknown` row get no Spotify search and no match.
 * `normalize` narrows `?` to '', so the empty string is inert too.
 */
const INERT = new Set(['', 'id', 'unknown']);

function isInert(row: TracklistRow): boolean {
  return (
    row.gap ||
    INERT.has(normalize(row.artist)) ||
    INERT.has(normalize(row.title))
  );
}

/** Spotify search, never a track page: the app holds no id for the mix track. */
function searchUrl(row: TracklistRow): string {
  const query = `${row.artist} ${row.title}`;
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/** The time-and-label subtitle; a gap row shows only its span. */
function rowSubtitle(row: TracklistRow): string {
  const parts: string[] = [];
  if (row.startSec !== null) {
    parts.push(
      row.endSec !== null
        ? `${formatClock(row.startSec)} – ${formatClock(row.endSec)}`
        : formatClock(row.startSec)
    );
  }
  if (!row.gap && row.label !== null && row.label !== '') parts.push(row.label);
  return parts.join(' · ');
}

/** Which layer produced the row, or how the owner changed it (spec §5.3). */
function sourceLabel(row: TracklistRow): string {
  if (row.source === 'trackid') return 'TrackId';
  if (row.source === 'description') return 'description';
  if (row.source === 'pasted') return 'pasted';
  return row.detected === null ? 'added' : 'edited';
}

/**
 * One `.src` line built from a parts array, so a matched row reads
 * `TrackId · in 3 playlists · 12 other mixes` on a single wrapped line rather
 * than three stacked ones. "in N playlists" is dropped at zero, as the other
 * format.ts lines drop their missing parts; `plural` cannot spell "mixes", so
 * that part is written out.
 */
function provenanceLine(row: TracklistRow, match: MixMatch | null): string {
  const parts = [sourceLabel(row)];
  if (match && match.playlistCount > 0) {
    parts.push(`in ${plural(match.playlistCount, 'playlist')}`);
  }
  if (row.referenceCount !== null) {
    const n = row.referenceCount;
    parts.push(`${n.toLocaleString()} other ${n === 1 ? 'mix' : 'mixes'}`);
  }
  return parts.join(' · ');
}

function DisplayRow(p: {
  row: TracklistRow;
  match: MixMatch | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { row, match } = p;
  return (
    <TrackRow
      title={`${row.artist} – ${row.title}`}
      subtitle={rowSubtitle(row)}
      spotifyUrl={isInert(row) ? null : searchUrl(row)}
      badges={
        <>
          {match && <FeaturePills trackId={match.trackId} />}
          <span class="src">{provenanceLine(row, match)}</span>
        </>
      }
    >
      <div class="actions">
        <button type="button" onClick={p.onEdit}>
          Edit
        </button>
        <button type="button" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </TrackRow>
  );
}

function GapRow(p: { row: TracklistRow; onDelete: () => void }) {
  // Mirrors TrackRow's inner markup on purpose: TrackRow sets no class on its
  // <li>, and spec §6's `.list li.gap .title` rule needs `gap` there. Keep this
  // in sync if TrackRow's row/main/title/sub structure ever changes.
  return (
    <li class="gap">
      <div class="row">
        <div class="main">
          <span class="title">ID · unidentified</span>
          {rowSubtitle(p.row) !== '' && (
            <span class="sub">{rowSubtitle(p.row)}</span>
          )}
        </div>
      </div>
      <div class="actions">
        <button type="button" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

function EditRow(p: {
  row: TracklistRow;
  onSave: (patch: {
    artist: string;
    title: string;
    label: string;
    startSec: number | null;
  }) => void;
  onCancel: () => void;
}) {
  const [artist, setArtist] = useState(p.row.artist);
  const [title, setTitle] = useState(p.row.title);
  const [label, setLabel] = useState(p.row.label ?? '');
  const [time, setTime] = useState(
    p.row.startSec !== null ? formatClock(p.row.startSec) : ''
  );
  return (
    <li>
      <input
        class="filter"
        type="text"
        placeholder="Artist"
        value={artist}
        onInput={(e) => setArtist((e.currentTarget as HTMLInputElement).value)}
      />
      <input
        class="filter"
        type="text"
        placeholder="Title"
        value={title}
        onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)}
      />
      <input
        class="filter"
        type="text"
        placeholder="Label (optional)"
        value={label}
        onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
      />
      <input
        class="filter"
        type="text"
        placeholder="Time (m:ss, optional)"
        value={time}
        onInput={(e) => setTime((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() =>
            p.onSave({
              artist,
              title,
              label,
              startSec: time.trim() === '' ? null : parseClock(time),
            })
          }
        >
          Save
        </button>
        <button type="button" onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </li>
  );
}

function Tracklist() {
  const rows = mixRows.value;
  const m = model.value;
  const index = m ? libraryTitleIndex(m) : null;
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const onSaveMix = (): void => {
    void (async () => {
      const ok = await saveMix();
      if (!ok) return; // mixError shows inline; never flash "Saved ✓" on it.
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    })();
  };
  return (
    <>
      <ul class="list">
        {rows.map((row, i) => {
          if (editing === i) {
            return (
              <EditRow
                key={i}
                row={row}
                onSave={(patch) => {
                  editMixRow(i, patch);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            );
          }
          if (row.gap) {
            return (
              <GapRow
                key={i}
                row={row}
                onDelete={() => {
                  deleteMixRow(i);
                  setEditing(null);
                }}
              />
            );
          }
          const match = m && index ? matchMixRow(m, index, row) : null;
          return (
            <DisplayRow
              key={i}
              row={row}
              match={match}
              onEdit={() => setEditing(i)}
              onDelete={() => {
                deleteMixRow(i);
                setEditing(null);
              }}
            />
          );
        })}
      </ul>
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            addMixRow();
            setEditing(mixRows.value.length - 1);
          }}
        >
          Add track
        </button>
        <button type="button" class="primary" onClick={onSaveMix}>
          {saved ? 'Saved ✓' : 'Save mix'}
        </button>
      </div>
    </>
  );
}

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
    <>
      <p class="muted">Paste a tracklist</p>
      <textarea
        class="filter"
        rows={4}
        aria-label="Paste a tracklist"
        placeholder="e.g. from MixesDB or a player comment"
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <button type="button" onClick={onAdd} disabled={text.trim() === ''}>
        Add these tracks
      </button>
      {note !== null && <p class="muted">{note}</p>}
    </>
  );
}

function Provenance(p: { view: MixView }) {
  const { view } = p;
  const tid = view.trackid;
  // "Nothing found automatically" is reserved for the case where both layers
  // answered and neither had anything (spec §5.2). A layer that errored prints
  // its own line below, so it must not also trip the "nothing found" line; a
  // pasted list also counts as something found.
  const foundSomething =
    tid !== null ||
    view.sources.description ||
    view.sources.linkOut !== null ||
    view.sources.pasted;
  // The short-link note already tells the owner to paste or read the player, so
  // it stands in for the "nothing found" line rather than doubling it.
  const nothingFound =
    !foundSomething &&
    !view.shortLink &&
    view.trackidError === null &&
    view.oembedError === null;
  return (
    <>
      {view.shortLink && (
        <p class="caption">
          This is a mobile share link, so the TrackId.net lookup could not be
          confirmed for it. The player and any tracklist in the description are
          shown below — or paste a tracklist. On a computer, open the mix and
          copy its full soundcloud.com/… link for a TrackId lookup.
        </p>
      )}
      {tid && tid.count > 0 && (
        <p class="caption">
          From TrackId.net · {plural(tid.count, 'track')}
          {tid.timeHitRate !== null &&
            ` · ${Math.round(tid.timeHitRate * 100)}% of the mix identified`}{' '}
          ·{' '}
          <a
            href={`https://trackid.net/audiostream/${tid.slug}`}
            target="_blank"
            rel="noopener"
          >
            Open on TrackId.net ›
          </a>
        </p>
      )}
      {tid && tid.empty && (
        <p class="caption">
          TrackId.net has this mix but identified no tracks yet ·{' '}
          <a
            href={`https://trackid.net/audiostream/${tid.slug}`}
            target="_blank"
            rel="noopener"
          >
            Open on TrackId.net ›
          </a>
        </p>
      )}
      {view.sources.description && (
        <p class="caption">From the mix description</p>
      )}
      {view.sources.linkOut !== null && (
        <p class="caption">
          The description links a full tracklist ·{' '}
          <a href={view.sources.linkOut} target="_blank" rel="noopener">
            {view.sources.linkOut} ›
          </a>
        </p>
      )}
      {nothingFound && (
        <p class="caption">
          Nothing found automatically — paste a tracklist below, or read the
          player's comments.
        </p>
      )}
      {view.trackidError !== null && (
        <p class="error">
          TrackId.net could not be reached: {view.trackidError}
        </p>
      )}
      {view.oembedError !== null && (
        <p class="error">The mix page could not be read: {view.oembedError}</p>
      )}
    </>
  );
}

/** Cheap content compare, so the Replace button hides once the description
 *  rows are the ones on screen and reappears after a TrackId seed or an edit. */
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

function Ready(p: { view: MixView }) {
  const { view } = p;
  const showReplace =
    view.descriptionRows.length > 0 &&
    !sameRows(mixRows.value, view.descriptionRows);
  return (
    <>
      <button type="button" onClick={() => closeMix()}>
        ‹ Mixes
      </button>
      <Provenance view={view} />
      {view.playerSrc !== null && (
        <iframe
          class="mix-player"
          title="SoundCloud player"
          src={`${view.playerSrc}&show_comments=true`}
          width="100%"
          height="400"
          loading="lazy"
          allow="autoplay; encrypted-media"
        />
      )}
      {showReplace && (
        <button type="button" onClick={() => applyDescriptionTracklist()}>
          Replace with the description tracklist
        </button>
      )}
      <Tracklist />
      <PasteBox />
    </>
  );
}

function SavedMixes() {
  const mixes = savedMixes.value;
  if (mixes.length === 0) return <p class="muted">No saved mixes yet.</p>;
  return (
    <ul class="list">
      {mixes.map((mix) => {
        const n = mix.rows.filter((r) => !r.gap).length;
        return (
          <TrackRow
            key={mix.url}
            title={mix.title ?? mix.url}
            subtitle={`${plural(n, 'track')} · saved ${formatDate(mix.savedAt)}`}
            onClick={() => openMix(mix.url)}
          >
            <div class="actions">
              <button
                type="button"
                onClick={() => {
                  if (confirm('Remove this saved mix?'))
                    void removeMix(mix.url);
                }}
              >
                Remove
              </button>
            </div>
          </TrackRow>
        );
      })}
    </ul>
  );
}

function InfoCards() {
  return (
    <>
      <div class="card">
        <h2>Automatic full scan (on your computer)</h2>
        <p>
          This app only shows what public sources already know about a mix — it
          never listens to the audio. To identify every track yourself, run a
          full scan on your computer with an open-source tool:
        </p>
        <p>
          <a
            href="https://github.com/betmoar/tracklistify"
            target="_blank"
            rel="noopener"
          >
            Tracklistify ›
          </a>
        </p>
        <p>
          <a
            href="https://github.com/marin-m/SongRec"
            target="_blank"
            rel="noopener"
          >
            SongRec ›
          </a>
        </p>
        <p class="muted">
          They run off your phone and use Shazam to recognise the audio.
        </p>
      </div>
      <div class="card">
        <h2>Auto Shazam</h2>
        <p>
          In Shazam on your phone, turn on "Sync to Spotify". A "My Shazam
          Tracks" playlist then appears in Spotify — it shows up under Playlists
          here and syncs like any other playlist.
        </p>
      </div>
    </>
  );
}

export function Mix() {
  const [url, setUrl] = useState('');
  const state = mixState.value;
  const viewUrl = state.status === 'ready' ? state.view.url : null;
  // Load the saved mixes once, on mount (never on app load).
  useEffect(() => {
    void loadSavedMixes();
  }, []);
  // Reopening a saved mix seeds the input from its url, so the always-present
  // top button is the "Look up again" re-fetch path (spec §4, no second control).
  useEffect(() => {
    if (viewUrl !== null) setUrl(viewUrl);
  }, [viewUrl]);
  return (
    <section class="mix">
      <h1>Mix tracklist</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() !== '' && state.status !== 'looking') {
            void startMixLookup(url);
          }
        }}
      >
        <input
          class="filter"
          type="text"
          inputMode="url"
          placeholder="Paste a SoundCloud mix link"
          value={url}
          onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="submit"
          class="primary"
          disabled={state.status === 'looking' || url.trim() === ''}
        >
          {state.status === 'looking'
            ? 'Looking up…'
            : state.status === 'ready'
              ? 'Look up again'
              : 'Look up'}
        </button>
      </form>
      {state.status === 'looking' && <p class="muted">Looking up the mix…</p>}
      {state.status === 'error' && (
        <p class="error">
          That is not a SoundCloud track link. Paste the link to the mix's page.
        </p>
      )}
      {mixError.value !== null && <p class="error">{mixError.value}</p>}
      {state.status === 'idle' && <SavedMixes />}
      {state.status === 'ready' && <Ready view={state.view} />}
      <InfoCards />
    </section>
  );
}
