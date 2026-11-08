import { disconnect, jobsBusy, serverState } from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { dangerDescription } from './lines';
import { sectionDomId } from './sections';

/**
 * Disconnect on its own (FR-038). Its `confirm()` lives on this button and
 * is listed in how-it-works §14; one predicate for all five jobs keeps the
 * wipe from overlapping any of them (spec §5.5).
 */
export function DangerZone() {
  return (
    <Card
      id={sectionDomId('danger')}
      class="settings-section settings-danger"
      title="Danger zone"
      description={dangerDescription(serverState.value.status !== 'unset')}
    >
      <div class="actions">
        <Button
          variant="danger"
          icon="logout"
          disabled={jobsBusy()}
          onClick={() => {
            if (
              confirm(
                'Disconnect and delete all local data? Server data is kept.'
              )
            ) {
              void disconnect();
            }
          }}
        >
          Disconnect
        </Button>
      </div>
    </Card>
  );
}
