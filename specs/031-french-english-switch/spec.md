# Feature Specification: The web app in French, with a French / English switch

**Feature Branch**: `feat/french-english-switch`

**Created**: 2026-11-16

**Status**: Approved (owner 2026-11-16: "Question 1 : A", "Question 2 A", "ok for the rest")

**Input**: Owner (2026-11-16): "I would like to translate the entire app in french for the web part. There will be an option toswith to french or english"

## Today (as found, 2026-11-16)

- Every word the web app shows is English: screen names, buttons, captions, empty messages, errors, banners, confirm questions, the sign-in and Connect screens, Settings.
- Dates, month names and numbers are written the English way.
- The app has no language setting. The page declares itself English to the browser.
- A second person now has an account on the owner's server (2026-11-15); the app speaks only English to them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the whole app in French (Priority: P1)

A French speaker opens the app with French chosen. Every screen is in French: the navigation, the titles, the buttons, the table headings, the captions, the empty messages, the errors and warnings, the confirm questions, the sign-in screen, the Connect screen, Settings, Import, Search, the Crate, Playlists, Artists, Under the radar, Mix. No English sentence is left among them.

**Why this priority**: this is the request: the entire web app in French.

**Independent Test**: on the demo data, with French chosen, open every screen at phone and computer widths and read it: no English word of the app's own is left, and no text is cut or overflows.

**Acceptance Scenarios**:

1. **Given** French chosen, **When** the user opens any screen of the app, **Then** every word written by the app is French.
2. **Given** French chosen, **When** a failure happens (Spotify refuses, the device is offline, storage is full, a file is the wrong kind, the server refuses), **Then** the message shown is French and says the same thing as the English one.
3. **Given** French chosen, **When** the app asks a confirm question (Disconnect, account switch, narrower import, Remove server data), **Then** the question is French and names the same consequence.
4. **Given** French chosen, **Then** dates, month names, durations and numbers are written the French way (for example "16 nov. 2026", "1 234").
5. **Given** French chosen, **Then** track titles, artist names, album names, playlist names and mix titles are shown exactly as they are stored: the app never translates the user's music.
6. **Given** French chosen, **When** a sentence carries a count, **Then** it agrees in number ("1 titre", "2 titres"), including zero.
7. **Given** French chosen, **Then** every screen still fits at the four widths the visual check covers: nothing is cut, wraps badly or pushes a control off the screen.

### User Story 2 - Switch between French and English (Priority: P1)

The user opens Settings and finds a Language choice with two options: Français and English. They pick one and the app changes language at once, on the screen they are on, without losing anything. The choice is still there the next time they open the app on that device.

**Why this priority**: the owner asked for the option; without it the translation cannot be reached or left.

**Independent Test**: in Settings, switch to French, see the screen change, reload the page and see French; switch back to English and see every screen as it is today.

**Acceptance Scenarios**:

1. **Given** Settings, **Then** a Language choice shows "Français" and "English", each written in its own language, with the current one marked.
2. **Given** English shown, **When** the user picks Français, **Then** the screen changes to French at once, without a reload and without leaving Settings.
3. **Given** a language picked, **When** the user closes and reopens the app on the same device, **Then** the app opens in that language.
4. **Given** a language switch, **Then** nothing else changes: the data, the open filters and sorts, a running sync or job, the Spotify connection and the server sign-in are untouched, and no Spotify read is made.
5. **Given** English chosen, **Then** every screen reads word for word as it does today.
6. **Given** a user who is not signed in or not connected, **Then** the sign-in and Connect screens already follow the language chosen, and the choice can be made from there.

### User Story 3 - The right language on a first visit (Priority: P2)

A person opens the app for the first time on a device and has chosen nothing. The app picks the language for them.

**Why this priority**: it decides what the second user sees before finding the switch; the switch itself already covers everyone.

**Independent Test**: on a device with no saved choice, open the app with the browser set to French, then to another language, and check the language shown.

**Acceptance Scenarios**:

1. **Given** no saved choice and a browser whose preferred language is French (any regional variant), **Then** the app opens in French.
2. **Given** no saved choice and a browser whose preferred language is any other, **Then** the app opens in English.
3. **Given** a saved choice, **Then** it always wins over the first-visit rule.
4. **Given** no saved choice, **Then** the first-visit rule saves nothing: the language follows the browser until the user picks one.

### Edge Cases

- A message the app does not write itself (the raw text of a Spotify error, a failed scan's reason sent by the worker): it is shown as received, inside a French sentence.
- A job running when the language changes: its progress line is shown in the new language at once.
- A failure message already on screen when the language changes: it keeps the language it was written in until its job runs again; everything else on the screen changes at once (owner 2026-11-16, plan research R4).
- A French text longer than its English one in a tight place (navigation, table heading, button, pill): it fits or shortens cleanly at every width.
- A text that is the same word in both languages ("Mix", "Top", "BPM", "Spotify", "rekordbox"): it stays as it is.
- The saved choice cannot be read (private window, storage cleared): the first-visit rule applies and the app still works.
- Search: it finds the user's tracks, artists, playlists and mixes, as today; its own labels and context lines follow the language shown.
- Sorting by a name column: unchanged, the order does not depend on the language.
- A text added to the app later with no French version: the gap is caught before it ships, never shown as a blank or a code name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web app MUST offer two languages, French and English.
- **FR-002**: In French, every text the app writes itself MUST be French: navigation, titles, buttons, labels, table headings, captions, hints, empty messages, status lines, progress lines, errors, warnings, banners, confirm questions, and the texts read by screen readers.
- **FR-003**: In English, every text MUST stay word for word what it is today.
- **FR-004**: Settings MUST show a Language choice with "Français" and "English"; the same choice MUST be reachable before sign-in and before Connect.
- **FR-005**: A language change MUST apply at once to the whole app, without a reload.
- **FR-006**: The app MUST remember the choice on the device and apply it on every later opening.
- **FR-007**: With no saved choice, the app MUST follow the browser's preferred language: French when it is French, English otherwise.
- **FR-008**: Dates, month and day names, durations, numbers and percentages MUST follow the language shown, not the browser: the British form in English ("16 Nov 2026"), the French form in French ("16 nov. 2026") (owner 2026-11-16, plan research R5).
- **FR-009**: Sentences with a count MUST agree in number in both languages.
- **FR-010**: The app MUST NOT translate or alter the user's content: track, artist, album, playlist and mix names, imported history, mix tracklists.
- **FR-011**: A language change MUST NOT read Spotify, write to Spotify, touch the stored data, restart a job or sign anyone out.
- **FR-012**: The name "Crate" MUST stay "Crate" in French (owner 2026-11-16). The names of the Crate views and of the app's other sections (Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate, Rarely played, Under the radar, Match) MUST be translated into French like any other text; the owner approves each French name before release, and one name is used everywhere it appears (navigation, title, card, caption, Search, messages).
- **FR-013**: What the app writes to Spotify (the name and description of a playlist created from a mix, the Like action) MUST stay as it is today, whatever the language shown.
- **FR-014**: A text received from outside (a Spotify error body, a reason written by the worker) MUST be shown as received; the sentence around it follows the language shown.
- **FR-015**: Every screen MUST keep its layout in French at the four widths of the visual check: no cut text, no overflow, no hidden control.
- **FR-016**: The page MUST declare the language shown to the browser, so screen readers pronounce it right and the browser does not offer to translate it.
- **FR-017**: A text missing in one language MUST be caught by the project's checks before a release; the user never sees a blank, a key name or a mix of both languages in one sentence.
- **FR-018**: The demo MUST be shown in the language chosen, so the visual check can cover French.

### Key Entities

- **Language choice**: French or English; one per device; set from Settings, sign-in or Connect; absent until the user picks.
- **App text**: every sentence the app writes itself; each exists once in English and once in French, with its count forms.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With French chosen, 100% of the app's own texts on every screen are French, checked screen by screen on the demo.
- **SC-002**: With English chosen, 0 texts differ from today's.
- **SC-003**: A user changes language in at most 2 taps from Settings, and sees the change in under 1 second.
- **SC-004**: The choice is still applied after 10 out of 10 reloads on the same device.
- **SC-005**: The visual check reports 0 findings in French on every screen at its four widths.
- **SC-006**: A language change causes 0 Spotify requests and changes 0 stored rows.
- **SC-007**: 0 texts exist in one language only when the checks pass.

## Assumptions

- "The web part" is the web app in the browser, on a computer and on a phone. The worker on the owner's computer (its terminal output, its log, its own messages) stays English.
- The repo's documents (README, docs, specs, CHANGELOG, commit messages) stay English.
- The choice is kept per device and is not sent to the owner's server: a phone and a computer can differ.
- Two languages only; a third is not prepared beyond what two need.
- French is written with "vous" and short sentences, matching the tone of the English texts.
- The emails sent for sign-in come from the server's own template and are not part of this round.
- The French texts are written in this round and read by the owner, a French speaker, before release.
