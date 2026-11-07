# Quickstart: validating multi-user data

Prerequisites: `yarn`, the three gates green, a real Supabase project with two users (yours and a second email you control) and a second
Spotify account allowlisted. Never use the demo for the user checks.

1. **Automated**: `yarn typecheck && yarn lint && yarn test`; `userScope.test.ts` covers claim, names, keys, token parsing and rejects a malformed id.
2. **Owner unchanged**: on a device that holds your library, open the updated app: it loads signed in as you (stored session, no new link),
   every screen shows the same numbers, no sync starts that the 12-hour gate would not start anyway.
3. **Second user empty**: sign out, sign in as the second email; every screen is empty; connect their Spotify, sync; their playlists show.
4. **Isolation**: sign back in as the owner: nothing of the second user appears, and the owner's data is untouched. Open the Settings
   card on both: the counts differ.
5. **Server isolation**: as the second user, **Remove server data**; the owner's server data is still there on another device.
6. **No server settings**: build without them: no sign-in screen; behaviour as before.
7. **Shared device offline**: with the network off, sign-in as an already-used user is refused with a clear message; the previous user's data is not shown.
