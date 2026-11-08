# Contract: the client port

`src/features/shared.ts` (types only, no import from `src/server/`):

```text
interface SharedFactsPort {
  readTracks(ids: string[]): Promise<PortResult<SharedTrackFact[]>>   // ids at most 200 per call; the caller chunks
  shareTracks(rows: SharedTrackFact[]): Promise<PortResult<number>>    // rows sent
  readReach(ids: string[]): Promise<PortResult<SharedReachFact[]>>
  shareReach(rows: SharedReachFact[]): Promise<PortResult<number>>
}
type PortResult<T> = { ok: true; value: T } | { ok: false; message: string }
```

Rules of the implementation (`src/server/sharedFacts.ts`, `createSharedFactsPort({ client, getToken, now })`):

- Never throws. Every request has a 10 s timeout. No retry.
- Reads: chunks of 200 ids; validates each returned row (`validate.ts`), drops rows that are not in the asked set or fail the check; the dropped count joins the message only when above zero.
- Shares: drops, before sending, any row outside the SQL ranges (same constants); an empty batch sends nothing; at most 200 rows per request.
- Reads and shares need a token: no token, no call, `{ ok: false, message: 'Not signed in to the server' }` (the caller never builds the port in that case, this is the guard).
- `sharedPort()` in `model/state.ts` returns `undefined` without server settings, without a server session, or in the demo.

Run behaviour (`lookup.ts`, `reachRun.ts`): the first `{ ok: false }` of a run switches the port off for the rest of that run and records `shared.error`; the run continues with the outside source and ends `done`, not `error`. Absent port: no call, no `shared` field.
