import { msg } from '../../i18n';
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
import { formatDateTime } from '../format';
import { ServerLinkForm } from '../signin/ServerLinkForm';
import {
  datasetName,
  deviceUsersLine,
  pendingLine,
  signedInLine,
  usedShare,
} from './lines';

/** The item's description, read when drawn (spec 031). */
export function serverDescription(): string {
  return msg().settings.server.description;
}

/** The sign-in form of the server section: an email, a magic link (research D3). */
function ServerSignIn() {
  return (
    <>
      <StatusLine>{msg().settings.server.signInHelp}</StatusLine>
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
      {msg().settings.server.syncNow}
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
  const text = msg().settings.server;
  if (state.status === 'unset') {
    return <StatusLine>{text.unset}</StatusLine>;
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
          {lastSync
            ? text.offline(state.message, formatDateTime(lastSync))
            : text.offlineNever(state.message)}
        </StatusLine>
      )}
      {state.status === 'paused' && (
        <StatusLine kind="warning">
          {text.pausedBefore}
          <a href={state.dashboardUrl} target="_blank" rel="noopener">
            {text.pausedLink}
          </a>
          {text.pausedAfter}
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
                {state.lastSyncAt
                  ? text.lastSync(formatDateTime(state.lastSyncAt))
                  : text.lastSyncNever}
              </StatusLine>
              <div class="stamps-wrap">
                <table class="stamps">
                  <thead>
                    <tr>
                      <th>{text.data}</th>
                      <th>{text.here}</th>
                      <th>{text.server}</th>
                      <th>{text.rows}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.stamps.map((row) => (
                      <tr key={row.name}>
                        <td>{datasetName(row.name)}</td>
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
                  {text.rejected(state.rejected)}
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
              label={
                state.status === 'pushing'
                  ? msg().settings.closed.sending(datasetName(state.dataset))
                  : msg().settings.closed.fetching(datasetName(state.dataset))
              }
              done={state.done}
              total={state.total}
              unit={text.rowsUnit}
            />
          )}
          <div class="actions">
            <Button
              variant="tonal"
              disabled={working}
              onClick={() => void startServerSignOut()}
            >
              {text.signOut}
            </Button>
            <Button
              variant="danger"
              disabled={working}
              onClick={() => void removeServerData()}
            >
              {text.remove}
            </Button>
          </div>
          <p class="muted">{text.note}</p>
        </>
      )}
    </>
  );
}
