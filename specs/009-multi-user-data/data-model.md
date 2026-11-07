# Data model: Multi-user data

No server table and no IndexedDB store changes. New device-level keys in `localStorage`:

| Key | Value | Written by | Read by |
|---|---|---|---|
| `deviceOwner` | `{ userId }` | first sign-in on the device (claim), never changed | `userScope.ts` |
| `activeUser` | `{ userId, email }` or absent | sign-in completes; sign-out removes | `db/repo.ts`, `auth/browser.ts` at load |
| `deviceUsers` | `[{ userId, email }]` | each sign-in | the Settings card (count) |
| `session`, `pkce` | the claimer's Spotify keys (unchanged names) | `auth/session.ts` | same |
| `session:<userId>`, `pkce:<userId>` | another user's Spotify keys | `auth/session.ts` | same |
| `server-session` | gains `userId` | `server/session.ts` | everything that asks who is signed in |

Names resolved by `userScope.ts` (pure):

- `dbNameFor(activeUser, deviceOwner)`: `spotify-dj` when the user is the claimer or there is no server; `spotify-dj-u-<userId>` otherwise.
- `keyFor(base, activeUser, deviceOwner)`: `base` for the claimer or no server, `base:<userId>` otherwise.
- `userIdFromToken(jwt)`: the `sub` claim, or `null` for anything malformed.

Validation: a `userId` is accepted only as a lowercase UUID (`/^[0-9a-f-]{36}$/`) before it is put into a database name or key.
