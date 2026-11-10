import {
  deviceUserCount,
  jobsBusy,
  removeServerData,
  serverLastSyncAt,
  serverPending,
  serverPendingError,
  serverSession,
  serverState,
  startServerSignOut,
  startServerSync,
  SERVER_FREE_BYTES,
} from '../../model/state';
import { Button } from '../components/Button';
import { NoData } from '../components/NoData';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { formatDateTime, plural } from '../format';
import { ServerLinkForm } from '../signin/ServerLinkForm';
import { deviceUsersLine, pendingLine, signedInLine, usedShare } from './lines';

export const SERVER_DESCRIPTION =
  'Optional: your own server keeps your data in step across your devices.';

/** The sign-in form of the server section: an email, a magic link (research D3). */
function ServerSignIn() {
  return (
    <>
      <StatusLine>
        Sign in to your server with a link sent to your email. Open the link in
        this browser, within 10 minutes.
      </StatusLine>
      <ServerLinkForm />
    </>
  );
}

/** Sync now with server, the item's main button, once signed in. */
export function ServerMain(p: { act: boolean }) {
  const state = serverState.value;
  if (state.status === 'unset' || serverSession.value === null) return null;
  return (
    <Button
      variant={p.act ? 'filled' : 'tonal'}
      disabled={
        jobsBusy() || state.status === 'pushing' || state.status === 'pulling'
      }
      onClick={() => void startServerSync()}
    >
      Sync now with server
    </Button>
  );
}

/**
 * The owner's server (ADR-08), optional: unset, it says so and offers
 * nothing. `offline` and `paused` are states shown here, never banners.
 * The changes waiting to send are read by the Sync status block.
 */
export function ServerSection() {
  const state = serverState.value;
  const session = serverSession.value;
  const lastSync = serverLastSyncAt.value;
  const working =
    jobsBusy() || state.status === 'pushing' || state.status === 'pulling';
  const pending = serverPending.value;
  const pendingError = serverPendingError.value;
  const people = deviceUsersLine(deviceUserCount());
  if (state.status === 'unset') {
    return (
      <StatusLine>
        No server set up. This browser keeps its own data. To share it across
        your devices, set the two server values described in the README.
      </StatusLine>
    );
  }
  return (
    <>
      {state.status === 'error' && (
        <StatusLine kind="error" quiet>
          {state.message}
        </StatusLine>
      )}
      {state.status === 'offline' && (
        <StatusLine kind="warning">
          Server offline: {state.message} Last sync{' '}
          {lastSync ? formatDateTime(lastSync) : 'never'}. Local data is in use.
        </StatusLine>
      )}
      {state.status === 'paused' && (
        <StatusLine kind="warning">
          Server paused. Resume it from the{' '}
          <a href={state.dashboardUrl} target="_blank" rel="noopener">
            Supabase dashboard
          </a>
          , then open the app again. Local data is in use.
        </StatusLine>
      )}
      {session === null ? (
        <ServerSignIn />
      ) : (
        <>
          <StatusLine kind="success">{signedInLine(session.email)}</StatusLine>
          {people && <StatusLine>{people}.</StatusLine>}
          {pending && <StatusLine>{pendingLine(pending)}</StatusLine>}
          {pendingError && (
            <StatusLine kind="error" quiet>
              {pendingError}
            </StatusLine>
          )}
          {state.status === 'connected' && (
            <>
              <StatusLine>
                Last sync with the server:{' '}
                {state.lastSyncAt ? formatDateTime(state.lastSyncAt) : 'never'}
              </StatusLine>
              <div class="stamps-wrap">
                <table class="stamps">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Here</th>
                      <th>Server</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.stamps.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>
                          {row.localAt ? (
                            formatDateTime(row.localAt)
                          ) : (
                            <NoData />
                          )}
                        </td>
                        <td>
                          {row.serverAt ? (
                            formatDateTime(row.serverAt)
                          ) : (
                            <NoData />
                          )}
                        </td>
                        <td>{row.rows ?? <NoData />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.rejected > 0 && (
                <StatusLine kind="warning">
                  {plural(state.rejected, 'row')} rejected by the safety check
                  and left out.
                </StatusLine>
              )}
              {state.usedBytes !== null && (
                <StatusLine>
                  {usedShare(state.usedBytes, SERVER_FREE_BYTES)}
                </StatusLine>
              )}
            </>
          )}
          {(state.status === 'pushing' || state.status === 'pulling') && (
            <ProgressBar
              label={`${state.status === 'pushing' ? 'Sending' : 'Fetching'} ${state.dataset}`}
              done={state.done}
              total={state.total}
              unit="rows"
            />
          )}
          <div class="actions">
            <Button
              variant="tonal"
              disabled={working}
              onClick={() => void startServerSignOut()}
            >
              Sign out
            </Button>
            <Button
              variant="danger"
              disabled={working}
              onClick={() => void removeServerData()}
            >
              Remove server data
            </Button>
          </div>
          <p class="muted">
            Sign out keeps your data here and on the server. Remove server data
            deletes all your data on the server and keeps this browser's copy.
          </p>
        </>
      )}
    </>
  );
}
