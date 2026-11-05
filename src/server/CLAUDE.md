# Rules for the server layer

Complements the root `CLAUDE.md` for changes under `src/server/`: the browser side of the owner's server (ADR-08), a Supabase
project reached with plain `fetch`. The server stores and never computes; it never sees a Spotify token; the app works without it.

## Required inputs

| Type     | File                                                               | Why                                                                          |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Decision | `../../docs/architecture/700-adr/ADR-08-owner-server-free-tier.md` | what the server is and is not                                                |
| Contract | `../../specs/001-backend-data-sync/contracts/client-api.md`        | every interface in this folder, the state and Settings additions             |
| Contract | `../../specs/001-backend-data-sync/contracts/server-schema.md`     | tables, policies, the requests, the error mapping                            |
| Review   | `../../specs/001-backend-data-sync/security.md`                    | the eleven findings every change here must keep closed                       |
| Shape    | `../spotify/client.ts`                                             | the client this folder copies: injected `fetchFn`, results instead of throws |
| Rules    | `../db/CLAUDE.md`                                                  | `replaceDataset` and the meta names live beside the other repo functions     |
| Tests    | `*.test.ts` next to each file                                      | a fake `fetchFn` for the client, `fake-indexeddb/auto` for the repo          |

## Expected outputs

- Nothing in this folder throws: every call returns a `ServerResult<T>` (`client.ts`) and the runners map it to `serverState`.
- Every request carries `apikey` and `Authorization: Bearer`; bodies stay under about 1 MB (`batches` of 500 rows).
- No call to any Spotify host from this folder, ever; the Spotify account id comes from the `accountId` meta.
- A pull validates every row and summary with `validate.ts` before anything is written or rendered; a failing row is dropped and
  counted, never fixed up.
- Newer wins per dataset by `fetched_at`; mixes per row by `savedAt` with tombstones; nothing is merged within a dataset.
- The previous generation of a dataset is kept on the server until the next push (one bad push stays recoverable).
- Sign-in is the magic link in the PKCE flow: the verifier stays in `localStorage` (`server-pkce`), tokens never appear in a URL,
  `?link=server` is the one marker `main.tsx` branches on.
- A refresh re-reads storage first and retries once on "already used"; a 401 on refresh signs out.
- `offline` and `paused` are states, not errors: no banner, pending flags kept, no retry loop.
- A new table or column: `supabase/migrations/` gains a file, `contracts/server-schema.md` the row, the grants block stays last.
