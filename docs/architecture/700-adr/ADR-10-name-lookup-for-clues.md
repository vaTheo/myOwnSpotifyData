# ADR-10 — The worker may look a track up by name, only for a clue that carries no identifier

> **Status**: Accepted
> **Date**: 2026-11-06

## Context

ADR-04 forbids name search: lookups key on Spotify ids or ISRCs, because a name matches homonyms and writes silent wrong data.
Round 003 reads the set's description, chapters and comments (the clues) to fill the parts of a set the audio scan left empty.
A clue gives only names: "@someone: JALA - Not Surrender", a tracklist in the description. There is no id to look up. The owner
approved on 2026-11-06: "Find a track by its name is ok if it's impossible to do it another way".

## Decision

- **Only in the worker**, on the owner's computer; the app keeps ADR-04 unchanged.
- **Only for a clue without identifier.** A Deezer track link or a Discogs release link is read by its id first; a name is
  searched only when the clue has nothing else.
- **Only keyless catalogues the project already uses**: Deezer search, then MusicBrainz recording search (Discogs by id).
- **Equality, never a guess.** A result is accepted only when its artist shares a leading-run core with the clue's artist and
  its cleaned title equals the clue's (the app's own rules, ported to `worker/mix_worker/match.py`, with cases shared by both
  test suites); a version the clue does not name is a different title. Scores are ignored.
- **Always marked.** A track found this way is a candidate: `origin: "clue"`, the clue's text kept, no confidence, shown on the
  Mix screen as "from a comment · not heard". It goes into Create playlist like an identified row (the owner's pick) unless the
  owner deletes it first. *Amended 2026-11-06, see below.*
- **Bounded**: `WORKER_LOOKUPS` clues a set (100), paced per host (Deezer 0.2 s, MusicBrainz 1.1 s, Discogs 2.5 s).

## Amendment (2026-11-06, the owner's D6, web-first redesign)

The Mix review of the redesign ([ADR-11](ADR-11-web-first-material-3.md), `specs/003-web-first-redesign/` contracts §12) lets the
owner validate tracks, and Create playlist offers **Validated only** or **All tracks**. A candidate (`origin: "clue"`) starts
**To review** with its "not heard" badge. **Validated only** leaves it out until the owner validates it; **All tracks** includes
it, as before. "Goes into Create playlist unless deleted" now holds for All tracks only. The lookup rules above are unchanged.
Code: `tracksToAdd` in `src/features/mix/createPlaylist.ts`; [How the app works](../000-how-it-works.md) §10.

## Consequences

**Positive:** answers already written by DJs and listeners become rows with ISRCs when a catalogue holds them; underground
tracks reach MusicBrainz, which Deezer lacks.

**Negative / watch for:** a commenter can be wrong, so a candidate is only as good as its clue (the mark says so); a homonym
with the exact same artist and title would pass; the catalogues' search may change. Three hosts join the worker's outbound list.

## Links

- Spec: `specs/003-fill-scan-gaps/` (research R4, R5, R8)
- [ADR-04](ADR-04-keyless-sources-by-id.md) (the rule this narrows), [ADR-09](ADR-09-mix-identification-on-the-owners-computer.md)
  (the worker)
- [ADR-11](ADR-11-web-first-material-3.md) (the redesign whose Mix review amends the Create playlist line, owner's D6) and its
  spec, [2026-11-06 — A web-first redesign](../../specs/2026-11-06-web-first-redesign-design.md)
- Constitution: `.specify/memory/constitution.md` Principle IV
- [ADR index](README.md) · [Limits and roadmap](../800-limits-roadmap.md)
