import type { Clue } from '../../db/schema';
import { clueLine, setWideSummary } from './rowText';
import { Disclosure } from './Disclosure';

/**
 * A folded list of clues (round 003): comments, chapters and description
 * lines the worker read. Third-party text, so always plain text: a URL in it
 * is not a link.
 */
export function Clues(p: { clues: readonly Clue[]; summary: string }) {
  return (
    <Disclosure class="mix-clues" summary={p.summary}>
      <ul>
        {p.clues.map((c, i) => (
          <li key={i}>{clueLine(c)}</li>
        ))}
      </ul>
    </Disclosure>
  );
}

/**
 * The set-wide clues under the open mix's header: "Tracklist from the
 * description (N lines, no times)" or "… from the comments". Nothing for a
 * mix without them (every mix from before round 003).
 */
export function SetWideClues(p: { clues: readonly Clue[] | undefined }) {
  if (!p.clues || p.clues.length === 0) return null;
  return <Clues clues={p.clues} summary={setWideSummary(p.clues)} />;
}
