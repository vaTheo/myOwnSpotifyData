# Plan: A simpler Settings page (spec 026)

**Spec**: [spec.md](spec.md) · **Branch**: `feat/settings-simpler` from origin/main 240fa7e

## Approach

UI only (FR-009): no model, store, sync or Spotify change. The closed lines are derived from the signals the cards already read.

1. **Closed line per item, pure.** A pure function per item (or one `itemLines(inputs)` in `src/ui/settings/`, tested in a `.test.ts` beside it) returns `{ tone, text }` for the closed form: worst condition first (error > warning > running with progress > ok > off), FR-003. Reuse `updateLines` (src/model/updateLines.ts) for Spotify, server, BPM and key, artist reach, history, Rekordbox, so the wording stays one source; Spotify account (signed in / missing permissions) and Danger zone get their own lines.
2. **`SettingsItem` component** in `src/ui/settings/`: a `<details>`/`<summary>` like `src/ui/mix/Disclosure.tsx`, but controlled: summary = name, closed line (`StatusLine` in its tone's kind) and the main button; body = today's card content unchanged (description first). Clicking the main button never toggles the item. Content rendered only while open (as Disclosure). Initial open = item has a failure or a running job (FR-005); after that the owner's toggles win until the page is left; nothing stored.
3. **Sync status block** (US3) replaces `UpdatesSection`: always open, not a `<details>`; the Automatic updates switch, the Spotify line and the server line (with Retry where `updateLines` gives one). Server line "Up to date" only when connected and nothing waiting (FR-007a): when changes wait, the line uses today's `pendingLine` wording.
4. **Page** `SettingsPage.tsx`: Sync status, then group headings (h2) Spotify / Your data / Between devices, items under them (h3 names), then Danger zone, then the version line. Remove `SectionIndex`, `sectionInView` and their tests if nothing else uses them; keep `sectionDomId` ids on the items so links still land (edge case: a link to a section opens it — check `src/ui/components/Empty.tsx` and Overview links; if a link targets a section id, open that item on arrival).
5. **Styles**: tokens only (design guide, ADR-11); summary row ≥ 48 px; phone and computer same order.
6. **Tests and regression**: vitest for the pure lines (each tone, worst-first, "up to date" only with nothing waiting); update regression rows touching Settings (A14, U01, F02, F08, F08b, F10, F10b, F18, Y08, any other `#/settings` test in `tools/shots/regression.spec.ts`) to open the item first; A14 now checks group headings and item order; U01 becomes the Sync status block. Run `yarn typecheck && yarn lint && yarn test`, `yarn regression -g "<ids>"`, `yarn invariants`. No `yarn shots` (owner).
7. **Docs, same commit**: screens.md §13 (new layout), how-it-works §13 (Settings), inventory row F42 + CHANGELOG, README owner's manual Settings part, design guide if it describes Settings cards, regression.md rows.
8. **Design review** (owner 2026-11-10): a separate reviewer checks the new Settings against docs/dev-guide/100-design-guide.md, ADR-11 and specs/003-web-first-redesign/contracts/screens.md (§13 and the shared components part): tokens only (no raw colour, size or radius), type scale, spacing rhythm, card and heading levels, StatusLine kinds and colours, button variants (one filled main action per item), 48 px touch targets, focus and keyboard (summary toggles with Enter/Space, the main button does not toggle), dark and light themes, phone and computer widths, and that it looks like the other pages (Mix Disclosure, Import details). Evidence: `yarn shots` on the settings pages only (owner asked for this review), `yarn shots:summary` 0 findings on those pages, and the screenshots read at the four widths. Findings fixed before merge.

## Constitution / project rules

Every failure still shown (closed line carries it); `confirm()` texts unchanged; no new dependency; relative imports without extension; tests beside source, no DOM tests.
