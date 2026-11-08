# Quickstart: validating shared track facts

Prerequisites: the three gates green; a real Supabase project with `0004_shared_facts.sql` applied; two users (the owner and a second email) with libraries that share tracks; never the demo for steps 3 to 8.

1. **Automated**: `yarn typecheck && yarn lint && yarn test`, judged by exit code (not grep). `sharedFacts.test.ts` (accepted and refused rows, two users, server down, rekordbox never sent), `lookup.test.ts`, `reachRun.test.ts` (pacing test unchanged) and `rules.test.ts` cover the code side.
2. **Apply the migration**: SQL editor, paste `0004_shared_facts.sql`. Expect no error; the file is idempotent only through `create ... if not exists` guards the task adds.
3. **Policies by hand** (SQL editor, "run as authenticated" or curl with user A's token): a select on both tables returns nothing or is refused; an update or delete is refused; `get_track_facts` with 201 ids is refused; with ids of two known tracks returns exactly those two.
4. **Refused rows** (curl with user A's token): bpm 0, bpm 999, key 12, key -1, major without key, a 21-character id, an extra column, a `measured_on` a year ahead: each answers 400 and stores nothing. A valid row answers 201; the same id again, with a different bpm, answers success and the stored row is unchanged (this is the `ON CONFLICT DO NOTHING` under an insert-only grant check, research D6).
5. **First user**: user A runs **Look up BPM and key**. Afterwards the dashboard table editor shows rows for the tracks found, with no user column.
6. **Second user**: user B (overlapping library) runs it. The card says "From the shared store: N tracks"; the network tab shows RPC calls of at most 200 ids and ReccoBeats calls only for the rest; the by-id and by-ISRC passes of the shared tracks end in under a minute.
7. **Rekordbox**: import a rekordbox file with a BPM different from ReccoBeats' for one track, then run: the Crate shows the rekordbox value, the table holds no rekordbox value (compare the row).
8. **Reach**: A runs **Look up artists**, then B: B's ListenBrainz and Deezer phases are shorter, the card names the artists taken from the store; numbers older than 90 days (set a row's `measured_on` back in the dashboard) are measured again and a newer row appears.
9. **Server down**: switch the network off, or break the key, in the middle of a run: the run ends `done`, the card gives the reason, the results equal a run without the server.
10. **Remove server data** as B: the shared rows B contributed are still there; A's data is untouched.
11. **No server settings**: a build without them shows no notice, no store line, and behaves as before.
