# Quickstart: validate round 004

0. Apply `supabase/migrations/0003_job_control.sql` in the dashboard (SQL editor). Restart the worker.
1. Ask a 1-hour set: the card shows step, % and minutes left within 2 minutes (SC-002).
2. A finished set: each heard row reads "heard N× · best X %"; sort by clips; filter "heard once"; Create playlist unchanged.
3. Queue three sets; Move to top on the last; the worker takes it next; Cancel one; Stop the running one: done "stopped
   early (by you)" within a minute.
4. Ask again on the stopped one: the log says "resuming at …"; it ends in about half the time (SC-004).
5. On a VPN: the warning shows on the card after the second refusal (SC-005).
6. Ask again on BRUM: its 31 description rows appear.
