# Contract: screens touched

**Sign-in screen** (shown when the server is configured and nobody is signed in; nothing of any user behind it)
- Email field, **Send me a link**; after sending: "If this email has an account, a link was sent" (unchanged wording, S5).
- Errors from the link exchange appear here, inline (the existing LINK_BROWSER_MESSAGE etc.).
- Offline or paused server: says so, and the field stays usable.

**Settings, server card**
- Signed in as `<email>`; "N people use this device" when N > 1; **Sign out** (signs out and returns to the sign-in screen; no data removed, no question).
- **Remove server data** and **Disconnect**: wording says "your" data; each acts only on the signed-in user (unchanged confirms).

**Switch**: completing a link as another user reloads the app into that user's data; no confirm question appears.

**Without server settings**: no sign-in screen, no card change, nothing new.
