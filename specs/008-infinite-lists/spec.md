# Feature Specification: Infinite lists

**Feature Branch**: `008-infinite-lists` | **Created**: 2026-11-07 | **Status**: Implemented

**Input**: "Could dev something where the lists are an infinite list, loading data as we scroll in."

Owner's picks: append on scroll (no windowing), and the "Show 100 more" button stays as a fallback.

## User Scenarios & Testing

### User Story 1 - Keep scrolling and the list continues (P1)

As the owner, I scroll a long list (Top, Playlists, a playlist, Artists, a Crate view, Under the radar, a mix) and the next rows
appear before I reach the end, without tapping anything.

**Independent Test**: open a list of more than 100 rows, scroll to the end; the count in "Showing the top N of M" grows by 100 each
time until N equals M, then the footer disappears.

**Acceptance Scenarios**:
1. **Given** a list of 450 rows showing 100, **When** I scroll near the end, **Then** 100 more rows are added, and again, until 450.
2. **Given** all rows are shown, **When** I scroll, **Then** nothing more loads and the footer is gone.
3. **Given** the first page does not fill the screen, **When** the list opens, **Then** more rows are added until it does.
4. **Given** I change the sort, the filters or the playlist, **When** the list redraws, **Then** it goes back to 100 rows and the top.

### User Story 2 - Fallback without scrolling (P2)

A keyboard or screen reader user, or a browser without scroll observation, still sees "Show 100 more" and can use it.

**Acceptance Scenarios**:
1. **Given** more rows exist, **When** I activate **Show 100 more**, **Then** 100 more rows appear.

## Requirements

- **FR-001**: Every table that pages (all lists through the shared table) MUST add one page (100 rows) when the end comes within
  600 px of the viewport.
- **FR-002**: It MUST stop at the total and never add past it.
- **FR-003**: The "Showing the top N of M" line and the **Show 100 more** button MUST stay while rows remain.
- **FR-004**: A change of sort, filter or list setting MUST reset to the first page (unchanged behaviour).
- **FR-005**: Nothing is fetched: the rows are already on the device.

## Success Criteria

- **SC-001**: A 20,000-row list can be scrolled to its last row without tapping a button.
- **SC-002**: No list loads more than 100 rows beyond what the owner scrolled near.

## Assumptions

- Rows are only appended (no windowing); a very long scroll keeps all drawn rows in the page. If a phone slows down on the longest
  lists, windowing is the follow-up (Limits and roadmap).
