import { msg } from '../../i18n';
import { routeHref } from '../../router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

type EmptyKind = 'empty' | 'reimport';

/**
 * The Crate's gate (FR-035, ADR-07): no import, or one made before month
 * data, shows this in place of the cards and the views.
 */
export function CrateEmpty(p: { status: EmptyKind }) {
  const text = msg().crate.empty;
  const empty = p.status === 'empty';
  return (
    <Card
      class="crate-empty"
      title={empty ? text.emptyHeading : text.reimportHeading}
    >
      <p>{empty ? text.emptyBody : text.reimportBody}</p>
      <div class="actions">
        <Button
          variant="filled"
          onClick={() => {
            location.hash = routeHref({ name: 'import' });
          }}
        >
          {text.importHistory}
        </Button>
        <a class="btn btn-text" href={routeHref({ name: 'top' })}>
          <span>{text.spotifyTop}</span>
        </a>
      </div>
    </Card>
  );
}
