# ADR-12 — Automatic updates: the library jobs run by themselves, one at a time, with a 12-hour Spotify gate

> **Status**: Accepted
> **Date**: 2026-11-07

## Context

The owner asked that every job run by itself, with Settings showing where each update is and whether it finished (round 006). Until
then only the server sync was automatic: the Spotify sync waited for a tap ([ADR-02](ADR-02-no-spotify-reads-on-load.md)) and the BPM
and key run and Artist reach started only from Settings ([ADR-04](ADR-04-keyless-sources-by-id.md)). ADR-02's reason still holds:
Spotify's unpublished daily quota on playlist reads locks the account out for hours, and the phone reopens the app often. The history
and rekordbox imports need a file the owner picks, so they cannot start by themselves.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Spotify on every open | sync each time the app opens | freshest | spends the quota on every reopen; lock-outs on a normal day |
| Spotify when the library is older than 12 hours, then BPM and reach for what is missing *(chosen)* | one chain after the server sync | at most two Spotify syncs a day across devices; nothing to tap | data up to 12 hours old; a first full sync starts by itself |
| Keep Spotify on its button, automate only BPM and reach | no Spotify read without a tap | no quota risk | the playlists stay as old as the last tap |
| BPM and reach only after a sync that brought something new | lighter | fewer runs | a run cut short waits for new Spotify data to continue |

## Decision

After the server sync of an open, of a return to the app (60 s or more away) and of the network coming back, `src/model/autoChain.ts`
runs, one at a time and never while another library job runs (`jobsBusy()`): the Spotify sync when `lastSyncAt` is absent or older
than `AUTO_SYNC_AGE_MS` (12 hours), or a stored playlist lacks its album years (`withYears`, round 006 fix: so the order Spotify, BPM
and key, reach holds on a start after that fix), and Spotify's lock-out has lapsed, at most once per page session; then the BPM and key run; then
Artist reach. The pull restores the other device's sync time into `lastSyncAt`, so the gate counts both devices. A step that failed is
not run again by the chain in the same page session. An automatic run takes no screen wake lock and raises no banner except the
Spotify lock-out and an expired login; its failure shows on the Settings Updates card and its own card. A tap on a job's button runs it
next, before the rest of the chain. An **Automatic updates** switch, per device (`localStorage` `autoUpdates`), turns the chain off
and restores the buttons-only behaviour. Nothing automatic writes to Spotify ([ADR-03](ADR-03-library-writes-on-tap.md) unchanged) or
starts an import.

## Consequences

**Positive:** the library, BPM and key and reach stay current without a tap; Settings shows every job's state in one card.

**Negative / watch for:** an automatic Spotify read is still a read: a new job that reads Spotify joins the chain behind the same
gate, never on its own trigger. Two devices running the reach run at once each push their dataset and the newer wins (the chain starts
after the pull, so the second usually starts from the first's results). A long first run stalls when the phone sleeps (no wake lock)
and continues on return. Spotify's lock-out (`retryAt`) is stored per device and not sent to the server, so another device's chain may
make one sync attempt inside a lock before it is locked too. An automatic sync never asks the account-switch question: it is held
while the account-mismatch notice is up and answers "no" otherwise.

## Links

- Spec: [`specs/006-automatic-updates/spec.md`](../../../specs/006-automatic-updates/spec.md)
- Amends [ADR-02](ADR-02-no-spotify-reads-on-load.md) and [ADR-04](ADR-04-keyless-sources-by-id.md)
- [How the app works](../000-how-it-works.md) §7, §14, §16
- [ADR index](README.md)
