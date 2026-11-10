import { disconnect, jobsBusy, serverState } from '../../model/state';
import { Button } from '../components/Button';
import { dangerDescription } from './lines';

/** The Danger zone's description: "your" data once a server is set up. */
export function dangerText(): string {
  return dangerDescription(serverState.value.status !== 'unset');
}

/**
 * Disconnect on its own (FR-038), inside the opened item only (spec 026).
 * Its `confirm()` lives on this button and is listed in how-it-works §14;
 * one predicate for all five jobs keeps the wipe from overlapping any of
 * them (spec §5.5).
 */
export function DangerZone() {
  return (
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
  );
}
