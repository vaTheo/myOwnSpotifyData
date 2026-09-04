import { routeHref } from '../../router';

type EmptyKind = 'empty' | 'reimport';

const HEADING: Record<EmptyKind, string> = {
  empty: 'Your crate is empty',
  reimport: 'Your history needs importing again',
};

const BODY: Record<EmptyKind, string> = {
  empty:
    'These five views are built from your Spotify Extended streaming history, the zip you request from Spotify. The Web API has no play counts, so nothing here can be filled in by syncing.',
  reimport:
    "The year, month and skip views need data the old import didn't keep. Your play counts still work everywhere else.",
};

export function CrateEmpty(p: { status: EmptyKind }) {
  return (
    <>
      <div class="card">
        <h2>{HEADING[p.status]}</h2>
        <p>{BODY[p.status]}</p>
        <button
          type="button"
          class="primary"
          onClick={() => {
            location.hash = routeHref({ name: 'import' });
          }}
        >
          Import history
        </button>
      </div>
      <p class="empty">
        <a href={routeHref({ name: 'top' })}>Spotify's own top lists ›</a>
      </p>
    </>
  );
}
