# Contract: the app (spec 029)

No Spotify call, no new network call, no `DB_VERSION` change.

## Types (`src/db/schema.ts`, `TracklistRow`)

```ts
/** Spec 029: how much evidence stands behind a heard row; the worker's word, kept as it came. */
evidence?: string;
/** Spec 029: the speed the track plays at in the mix, in percent of its original speed (−7.7 is 7.7 % slower). */
mixSpeed?: number;
/** Spec 029: how many entries Shazam's answer listed for the row's first hit. */
candidates?: number;
```

## `src/features/mix/evidence.ts` (new, pure)

```ts
export type EvidenceLevel = 'solid' | 'once' | 'out_of_step' | 'candidates' | 'inside';
export const LEVELS: readonly EvidenceLevel[];            // best first, the order above
export function evidenceLevel(row: TracklistRow): EvidenceLevel | null;  // null for an absent or unknown word
export function evidenceRank(row: TracklistRow): number;  // solid 5 … inside 1; 0 without a level
export function isFlagged(row: TracklistRow): boolean;    // out_of_step, candidates, inside
export function bestEvidence(rows: readonly TracklistRow[]): TracklistRow | null;  // the first row with the best rank, null when none has a level
export function evidenceExtras(track: Record<string, unknown>): Pick<TracklistRow, 'evidence' | 'mixSpeed' | 'candidates'>;
```

`evidenceExtras` reads a worker row: `evidence` (a non-empty string of at most 32 characters), `mix_speed_percent` (a finite
number from −50 to 50, stored as `mixSpeed`), `candidates` (a whole number from 1 to 1000). A value outside is left out.

## Where they are read and kept

- `trackExtras` (`src/features/mix/worker.ts`): spreads `evidenceExtras(t)` for a first-pass row and a replay row only.
- `validateMix` (`src/server/validate.ts`): the same three bounds; a value outside fails the mix with `mixes.row.evidence`,
  `mixes.row.mixSpeed` or `mixes.row.candidates`.
- `oneRowPerSong`: the merged line takes `evidence` and `mixSpeed` from `bestEvidence(ranked copies)`; when no copy has a level
  nothing changes.
- The hand import of a worker file is unchanged (it drops the worker's extra fields, as today).

## Texts (`src/ui/mix/rowText.ts`)

```ts
export function speedShort(pct: number): string;  // "−5.8 %", "+3.4 %", "0 %"
export function speedText(pct: number): string;   // "played 5.8 % slower", "played 3.4 % faster", "played at original speed"
```

- The minus sign is `−` (U+2212), as in today's "second listen · −4 %". `0 %` and "original speed" when the value is under 0.05.
- `confidenceShort(row)` and `confidenceText(row)`, for a row with a known level whose `source` is still `tracklistify`:

| Level | Short | Long |
|---|---|---|
| solid | `Solid ×11` | `Solid: heard 11×, the position in the track advances in step` |
| once | `Heard once` | `Heard once` |
| out_of_step | `Out of step ×3` | `Out of step: heard 3×, the position in the track jumps` |
| candidates | `Many candidates` | `Many candidates: Shazam listed 12 for this answer` |
| inside | `Inside another` | `Inside another track: heard once while a Solid track plays` |

  With `mixSpeed`, the short text ends with ` · ` + `speedShort` and the long text with ` · ` + `speedText`. The count (`×11`,
  `heard 11×`) is the row's `hits`; without `hits` the short text is the level alone and the long text drops the "heard N×, "
  part. Without `candidates`, the candidates text is `Many candidates`.
- A row without a known level: both functions return what they return today.
- `originText`: a replay row with `mixSpeed` reads `second listen`; without it, as today.

## Table (`src/ui/mix/TracklistTable.tsx`, `tracklistSort.ts`)

- The column's header and the sort choice read `Evidence`; the column id and the sort id stay `confidence`; width `184px`.
- Sort value of a non-gap row whose `source` is `tracklistify`: with a known level,
  `evidenceRank × 1_000_000 + (hits ?? 0) × 1000 + (confidence ?? 0)`; without, today's value; first click best first, as today.
- The choice is offered when some row has a value, as today.

## Chips (`src/features/mix/review.ts`)

- `ReviewFilter` gains `'solid'` and `'flagged'`. `inFilter`: `solid` is `evidenceLevel(row) === 'solid'`, `flagged` is
  `isFlagged(row)`; a gap row shows under All only, as today.
- `reviewChips` offers `Solid (n)` and `Flagged (n)` after `Heard once`, only when some row has a known level.

## Demo (`src/dev/demo.ts`)

The Sunrise and Dock mixes carry `evidence`, `mixSpeed` and `candidates` on their heard rows, with at least one row of each
level in Sunrise, and one replay row whose `mixSpeed` differs from its `speedPercent`.
