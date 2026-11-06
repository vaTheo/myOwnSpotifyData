import type { ComponentChildren } from 'preact';
import { formatKey, type KeyNotation } from '../../model/keys';
import { historySummary, keyNotation, model } from '../../model/state';
import { routeHref } from '../../router';
import { Button } from '../components/Button';
import { BpmText, KeyPill } from '../components/KeyPill';
import { NoData } from '../components/NoData';
import { SpotifyLink } from '../components/SpotifyLink';
import { NoPlaylistNote, OpenMonthLink, Strip } from '../crate/shared';
import { formatDate, formatListening, plural } from '../format';
import { Icon } from '../icons';
import { SideSheet } from '../layout/SideSheet';
import { formatDuration } from '../table/columnValues';
import { closeDetail } from './navigate';
import {
  historyCells,
  trackFacts,
  type TrackFacts,
  type TrackRef,
} from './trackFacts';

const NOTATIONS: KeyNotation[] = ['camelot', 'open', 'classic'];

const SOURCE_LABEL = { rekordbox: 'Rekordbox', reccobeats: 'ReccoBeats' };

/** One section of the details: a heading and its lines. */
export function DetailsSection(p: {
  title: string;
  children: ComponentChildren;
}) {
  return (
    <section class="details-section">
      <h3 class="details-heading">{p.title}</h3>
      {p.children}
    </section>
  );
}

/** A label and its value on one line; `null` prints the no-data dash. */
function Fact(p: { label: string; children: ComponentChildren | null }) {
  return (
    <div class="details-fact">
      <dt>{p.label}</dt>
      <dd>{p.children ?? <NoData />}</dd>
    </div>
  );
}

function Identity({ facts }: { facts: TrackFacts }) {
  return (
    <section class="details-section">
      <p class="details-artists">
        {facts.artists.map((a, i) => (
          <span key={`${i} ${a.name}`}>
            {i > 0 && ', '}
            {a.artistKey ? (
              <a href={routeHref({ name: 'artist', key: a.artistKey })}>
                {a.name}
              </a>
            ) : (
              a.name
            )}
          </span>
        ))}
      </p>
      <dl class="details-facts">
        <Fact label="Album">{facts.album}</Fact>
        <Fact label="Length">
          {facts.durationMs === null ? null : formatDuration(facts.durationMs)}
        </Fact>
      </dl>
      {facts.isLocal ? (
        <p class="details-note">Local file</p>
      ) : (
        <SpotifyLink href={facts.spotifyUrl} label />
      )}
    </section>
  );
}

function Audio(p: { facts: TrackFacts; onMatch?: () => void }) {
  const audio = p.facts.audio;
  const notation = keyNotation.value;
  const keyed = audio && audio.key !== null && audio.major !== null;
  return (
    <DetailsSection title="Audio">
      {audio ? (
        <dl class="details-facts">
          <Fact label="BPM">
            {audio.bpm === null ? null : <BpmText bpm={audio.bpm} />}
          </Fact>
          <Fact label="Key">
            {keyed ? (
              <span class="details-key">
                <KeyPill musicalKey={audio.key!} major={audio.major!} />
                <span class="details-small">
                  {NOTATIONS.filter((n) => n !== notation)
                    .map((n) => formatKey(audio.key!, audio.major!, n))
                    .join(' · ')}
                </span>
              </span>
            ) : null}
          </Fact>
          {audio.energy !== null && (
            <Fact label="Energy">{Math.round(audio.energy * 100)}%</Fact>
          )}
          <Fact label="Source">
            {SOURCE_LABEL[audio.source]}, {formatDate(audio.fetchedAt)}
          </Fact>
        </dl>
      ) : (
        <p class="details-note">
          No BPM or key yet —{' '}
          <a href={routeHref({ name: 'settings' })}>look them up in Settings</a>
        </p>
      )}
      {p.onMatch && (
        <Button variant="tonal" icon="tune" onClick={p.onMatch}>
          Match from this track
        </Button>
      )}
    </DetailsSection>
  );
}

function Plays({ facts }: { facts: TrackFacts }) {
  const plays = facts.plays;
  if (!historySummary.value) {
    return (
      <DetailsSection title="Plays">
        <p class="details-note">
          No play counts yet —{' '}
          <a href={routeHref({ name: 'import' })}>import your history</a>
        </p>
      </DetailsSection>
    );
  }
  if (!plays) {
    return (
      <DetailsSection title="Plays">
        <p class="details-note">Not in your listening history</p>
      </DetailsSection>
    );
  }
  const count = (n: number | null) => (n === null ? null : n.toLocaleString());
  return (
    <DetailsSection title="Plays">
      <dl class="details-facts">
        <Fact label="Plays">
          <span class="details-plays">
            {plays.plays.toLocaleString()}
            {plays.byName && (
              <span class="details-small">
                <Icon name="info" size={14} /> by artist and title
              </span>
            )}
          </span>
        </Fact>
        <Fact label="Listening time">{formatListening(plays.msPlayed)}</Fact>
        <Fact label="First play">{formatDate(plays.firstTs)}</Fact>
        <Fact label="Last play">{formatDate(plays.lastTs)}</Fact>
        <Fact label="Starts">{count(plays.attempts)}</Fact>
        <Fact label="Finished">{count(plays.finished)}</Fact>
        <Fact label="Skipped">{count(plays.skipped)}</Fact>
        <Fact label="Unclear">{count(plays.unclear)}</Fact>
      </dl>
    </DetailsSection>
  );
}

/** The text strip until T075 swaps in the chart; open the peak month. */
function History({ facts }: { facts: TrackFacts }) {
  if (!facts.months) return null;
  const cells = historyCells(facts.months);
  if (cells.length === 0) return null;
  return (
    <DetailsSection title="History">
      <Strip cells={cells} />
      {facts.peakMonth && <OpenMonthLink month={facts.peakMonth} />}
    </DetailsSection>
  );
}

function Playlists({ facts }: { facts: TrackFacts }) {
  return (
    <DetailsSection title="Playlists">
      {facts.playlists.length === 0 ? (
        <div class="details-note">
          <NoPlaylistNote />
        </div>
      ) : (
        <>
          <p class="details-note">
            In {plural(facts.playlists.length, 'playlist')}
          </p>
          <ul class="details-links">
            {facts.playlists.map((pl) => (
              <li key={pl.id}>
                <a href={routeHref({ name: 'playlist', id: pl.id })}>
                  {pl.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </DetailsSection>
  );
}

/**
 * Everything the app knows about one track (spec 003, screens.md §11):
 * identity, audio, plays, history, playlists. `extra` is a section the
 * opening screen adds (a Crate view's own figures), placed after Plays;
 * `onMatch` shows "Match from this track" (a playlist).
 */
export function TrackDetails(p: {
  facts: TrackFacts;
  onMatch?: () => void;
  extra?: ComponentChildren;
}) {
  return (
    <div class="track-details">
      <Identity facts={p.facts} />
      <Audio facts={p.facts} onMatch={p.onMatch} />
      <Plays facts={p.facts} />
      {p.extra}
      <History facts={p.facts} />
      <Playlists facts={p.facts} />
    </div>
  );
}

/**
 * The details sheet of one track over a list: nothing for an unknown or
 * stale reference (contracts/routes.md), so the screen renders without it.
 * `rowId` is the row's `data-row-id`, where focus returns on close.
 */
export function TrackSheet(p: {
  trackRef: TrackRef;
  rowId: string;
  onMatch?: () => void;
  extra?: ComponentChildren;
}) {
  const m = model.value;
  const facts = m ? trackFacts(m, p.trackRef) : null;
  if (!facts) return null;
  return (
    <SideSheet title={facts.title} rowId={p.rowId} onClose={closeDetail}>
      <TrackDetails facts={facts} onMatch={p.onMatch} extra={p.extra} />
    </SideSheet>
  );
}
