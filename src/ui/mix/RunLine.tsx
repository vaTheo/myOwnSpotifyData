import type { MixRun } from '../../db/schema';
import { mixListItems } from '../../features/mix/mixList';
import { requestKey } from '../../features/mix/url';
import { requestStatusText, runLine } from '../../features/mix/worker';
import {
  mixJobs,
  savedMixes,
  serverState,
  startIdentifyRequest,
  startStopRequest,
} from '../../model/state';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { plural } from '../format';
import { Disclosure } from './Disclosure';

/**
 * While the open mix's latest request runs (spec 003 §12, T124), the same
 * progress line as the Mixes list, its bar, and Stop (disabled while
 * Stopping…). From the last pull: no new poll.
 */
export function OpenMixRequest(p: { url: string }) {
  const key = requestKey(p.url) ?? p.url;
  const item = mixListItems(
    mixJobs.value,
    savedMixes.value,
    serverState.value,
    Date.now()
  ).find((i) => i.key === key);
  const request = item?.request;
  if (!item || !request || request.status !== 'claimed') return null;
  return (
    <div class="mix-open-request">
      {item.line !== null && <p class="mix-caption">{item.line}</p>}
      {item.percent !== null && item.step !== null && (
        <div class="mix-item-progress">
          <ProgressBar
            label={item.step}
            done={Math.round(item.percent)}
            total={100}
            showCount={false}
          />
        </div>
      )}
      <Button
        variant="text"
        disabled={!item.canStop}
        onClick={() => void startStopRequest(request.id)}
      >
        Stop
      </Button>
    </div>
  );
}

/**
 * The run line under the open mix's header (owner's D3, T124): the second
 * pass and the resume; a stopped-early note with Ask again when the server
 * can take a request now; the warnings collapsed. Nothing for a mix
 * without a run (before round 003, or not from the worker).
 */
export function RunLine(p: { url: string; run: MixRun | undefined }) {
  const text = runLine(p.run);
  if (text === null) return null;
  const key = requestKey(p.url) ?? p.url;
  const canAsk = requestStatusText(
    mixJobs.value[key]?.[0],
    serverState.value
  ).canAsk;
  return (
    <div class="mix-run">
      {text.line !== null && <p class="mix-caption">{text.line}</p>}
      {text.stoppedEarly !== null && (
        <div class="mix-run-stopped">
          <p class="mix-caption">{text.stoppedEarly}</p>
          {canAsk && (
            <Button
              variant="text"
              onClick={() => void startIdentifyRequest(key)}
            >
              Ask again
            </Button>
          )}
        </div>
      )}
      {text.warnings.length > 0 && (
        <Disclosure
          class="mix-run-warnings"
          summary={plural(text.warnings.length, 'warning')}
        >
          <ul class="mix-lines">
            {text.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
