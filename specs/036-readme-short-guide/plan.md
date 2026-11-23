# A short README, the manual in docs/manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** README becomes a ≤ 100-line good-looking guide for app users and mix identifiers; the rest moves verbatim to `docs/manual/`.

**Architecture:** docs only. Task 1 moves text and repoints rules/links (nothing lost); Task 2 writes the new README on top.

**Spec:** `specs/036-readme-short-guide/spec.md`

## Global Constraints

- Moved text is word for word; only headings levels and relative links change.
- README ≤ 100 lines; English; button names from `src/i18n/` English catalogue; no image files added; badges via shields.io.
- Nothing personal (public repo). Subagents never `git add` or commit.
- Checks: `yarn typecheck && yarn lint && yarn test` exit code 0 (not grep output).

## Review Focus

1. A link elsewhere in the repo to a moved README anchor (`README.md#…`, `../../README.md`, `../README.md` from `worker/`) left dangling.
2. Text dropped in the move (compare section by section).
3. A README step that names a button or screen that does not exist in the app.
4. The external-sources rule (contributing line 98) still pointing at "README.md's first paragraph".
5. Badges that render broken (wrong shields.io URL form).

---

### Task 1: The manual moves to docs/manual

**Files:** Create `docs/manual/000-using-the-app.md`, `100-identify-a-mix.md`, `200-owner-setup.md`, `300-developers.md`. Modify
`CLAUDE.md`, `docs/dev-guide/000-contributing.md`, `docs/README.md`, `docs/architecture/000-how-it-works.md`,
`docs/architecture/800-limits-roadmap.md`, any other file linking a moved section, `CHANGELOG.md`. `README.md`: remove the moved
sections only (Task 2 rewrites the rest).

- [ ] Step 1: copy each section per spec FR-002 into its page, with the header/footer style of an existing `docs/` page; fix relative links.
- [ ] Step 2: `grep -rn` every link into the root README across the repo (`README.md#`, `../../README.md`, `../README.md` in `worker/`,
  `src/`); repoint each to the new page/anchor.
- [ ] Step 3: rules per FR-003; `docs/README.md` lists the four pages.
- [ ] Step 4: verify: a script or diff showing each moved section's text present in `docs/manual/` (no line lost); every link in the
  four pages resolves (file exists, anchor exists); yarn three exit 0.

### Task 2: The short README

**Files:** Modify `README.md` (whole file), `CHANGELOG.md` (same entry).

- [ ] Step 1: write per spec FR-001, in that order; links to `docs/manual/…` and `worker/README.md#d-with-docker-on-a-server`.
- [ ] Step 2: check each button/screen name against `src/i18n/` English strings (cite the key per name in the report).
- [ ] Step 3: check the badge URLs return an SVG (`curl -sI` → 200 and `image/svg+xml`).
- [ ] Step 4: `wc -l README.md` ≤ 100; links resolve; yarn three exit 0; public-safe check.
