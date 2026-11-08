# Rules for the IndexedDB layer

Complements the root `CLAUDE.md` for changes under `src/db/`. `schema.ts` holds the row types and `DB_VERSION`; `repo.ts` holds `openDb`,
the `upgrade` callback and every read and write. The owner's data here took hours of syncing and long jobs to build: never lose it.

## Required inputs

| Type | File | Why |
|---|---|---|
| Decision | `../../docs/architecture/700-adr/ADR-05-additive-indexeddb.md` | upgrades only add; optional fields need no bump; connection hand-over |
| Reference | `../../docs/architecture/000-how-it-works.md` §6 | every store, its keyPath, what reads it |
| Decision | `../../docs/architecture/700-adr/ADR-07-play-counts-from-export.md` | new data gates on a versioned meta summary, never on rows |
| Tests | `repo.test.ts` | upgrade from every older version keeps its rows (`fake-indexeddb/auto`) |

## Expected outputs

- A new store: bump `DB_VERSION`, create it behind `if (!db.objectStoreNames.contains(...))` in `upgrade`, never delete or recreate an
  existing store; a test that opens a database of the previous version and keeps its rows.
- A new optional field on an existing row: no version bump; every reader handles `undefined`.
- A store the `Model` does not need stays out of `AllRows`/`getAllRows`/`buildModel` and gets its own repo functions (as `mixes` does).
- Keep `blocking`/`blocked` reporting through `setDbEvents`; a version bump must not hang an old tab.
- Update the store table in How the app works §6 and the feature's `CHANGELOG.md` entry ("the database upgrades itself").
- The database name is per server user (ADR-14): `dbName()` asks `scopedDbName` (`../server/scopeBrowser.ts`) after the demo rule;
  `spotify-dj` stays the device claimer's. Never rename or copy a user's database.
