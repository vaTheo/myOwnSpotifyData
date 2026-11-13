import { routeHref } from '../../router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

type EmptyKind = 'empty' | 'reimport';

const HEADING: Record<EmptyKind, string> = {
  empty: 'Your crate is empty',
  reimport: 'Your history needs importing again',
};

const BODY: Record<EmptyKind, string> = {
  empty:
    'These six views are built from your Spotify Extended streaming history, the zip you request from Spotify. The Web API has no play counts, so nothing here can be filled in by syncing.',
  reimport:
    "The Crate's views need data the old import didn't keep. Your play counts still work everywhere else.",
};

/**
 * The Crate's gate (FR-035, ADR-07): no import, or one made before month
 * data, shows this in place of the cards and the views.
 */
export function CrateEmpty(p: { status: EmptyKind }) {
  return (
    <Card class="crate-empty" title={HEADING[p.status]}>
      <p>{BODY[p.status]}</p>
      <div class="actions">
        <Button
          variant="filled"
          onClick={() => {
            location.hash = routeHref({ name: 'import' });
          }}
        >
          Import history
        </Button>
        <a class="btn btn-text" href={routeHref({ name: 'top' })}>
          <span>Spotify's own top lists ›</span>
        </a>
      </div>
    </Card>
  );
}
