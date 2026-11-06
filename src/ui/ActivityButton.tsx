import { useEffect, useRef, useState } from 'preact/hooks';
import {
  createPlaylistState,
  importState,
  likeState,
  lookupState,
  mixState,
  reachState,
  rekordboxState,
  serverState,
  syncState,
} from '../model/state';
import { activeJobs, type ActiveJob } from './jobs';
import { ProgressBar } from './components/ProgressBar';

/** A circle that fills with the first job's progress, or spins without one. */
function Ring(p: { job: ActiveJob }) {
  const known = p.job.total !== null && p.job.total > 0;
  const share = known ? (p.job.done ?? 0) / (p.job.total as number) : 0.25;
  const length = 2 * Math.PI * 9;
  return (
    <svg
      class={known ? 'ring' : 'ring spinning'}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" class="ring-track" />
      <circle
        cx="12"
        cy="12"
        r="9"
        class="ring-value"
        stroke-dasharray={`${length * share} ${length}`}
      />
    </svg>
  );
}

/**
 * The frame's activity button (spec 003, FR-007): visible while any job
 * runs, from every screen. Its panel lists each job with its progress and a
 * link to the place that owns it. It starts, stops and retries nothing.
 */
export function ActivityButton() {
  const jobs = activeJobs({
    sync: syncState.value,
    import: importState.value,
    lookup: lookupState.value,
    rekordbox: rekordboxState.value,
    reach: reachState.value,
    server: serverState.value,
    like: likeState.value,
    createPlaylist: createPlaylistState.value,
    mix: mixState.value,
  });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && box.current?.contains(e.target as Node))
        return;
      setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('click', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('click', close);
    };
  }, [open]);
  if (jobs.length === 0) return null;
  const label =
    jobs.length === 1
      ? `Running: ${jobs[0].label}`
      : `${jobs.length} jobs running`;
  return (
    <div class="activity" ref={box}>
      <button
        type="button"
        class="icon-btn activity-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Ring job={jobs[0]} />
      </button>
      {open && (
        <div class="activity-panel" role="dialog" aria-label="Running jobs">
          {jobs.map((job) => (
            <a key={job.id} class="activity-job" href={job.href}>
              <ProgressBar
                label={job.label}
                done={job.done ?? 0}
                total={job.total ?? 0}
                unit=""
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
