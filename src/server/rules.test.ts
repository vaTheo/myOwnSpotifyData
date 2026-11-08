import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SHARED_BPM_MAX,
  SHARED_BPM_MIN,
  SHARED_ID_PATTERN,
  SHARED_MAX_IDS,
} from './sharedFacts';
import { SHARED_KEY_MAX, SHARED_REACH_MAX } from './validate';

/**
 * The server rules audit (round 011, T013, FR-002): the database is the
 * only wall between two users who share the public key, so every table the
 * migrations create must keep each row to its owner, and `anon` must get
 * nothing. `audit` reads SQL and returns what breaks that, one finding per
 * line; the real migrations must give none, and each fixture below proves a
 * break turns it red. A statement in a form it does not recognise is itself
 * a finding, so a new way of writing SQL fails loudly instead of slipping by.
 */

const CMDS = ['select', 'insert', 'update', 'delete'] as const;
const OWNER = 'owner_id = auth\\.uid\\(\\)';
/** The rule each policy command must carry. */
const RULE: Record<(typeof CMDS)[number], string> = {
  select: `using \\(${OWNER}\\)`,
  insert: `with check \\(${OWNER}\\)`,
  update: `using \\(${OWNER}\\) with check \\(${OWNER}\\)`,
  delete: `using \\(${OWNER}\\)`,
};
/** Definer functions allowed: storage_used reads no table, the get_* read and the add_* write only their own shared table. */
const DEFINERS = [
  'storage_used',
  'get_track_facts',
  'get_artist_reach',
  'add_track_facts',
  'add_artist_reach',
  // Round 015 (ADR-16): the shared worker's five functions and their helper.
  'require_shared_worker',
  'is_shared_worker',
  'claim_any_job',
  'worker_set_progress',
  'worker_finish_job',
  'worker_release_job',
];
/**
 * The shared worker list (round 015, ADR-16): a table with no policy and no
 * privilege for anyone but the owner role and the definer functions below.
 * `args` is the signature in the revoke and grant statements.
 */
const WORKER_TABLE = 'shared_workers';
const WORKER_FUNCS: Record<
  string,
  { args: string; requires: boolean; granted: boolean }
> = {
  require_shared_worker: { args: '()', requires: false, granted: false },
  is_shared_worker: { args: '()', requires: false, granted: true },
  claim_any_job: { args: '(text, integer)', requires: true, granted: true },
  worker_set_progress: {
    args: '(uuid, text, jsonb)',
    requires: true,
    granted: true,
  },
  worker_finish_job: {
    args: '(uuid, text, jsonb)',
    requires: true,
    granted: true,
  },
  worker_release_job: { args: '(uuid, text)', requires: true, granted: true },
};
/**
 * The two shared tables (round 014, ADR-15): public facts with no owner,
 * no policy and no privilege for `authenticated` (0005: the plain insert is
 * refused by Postgres), written only through an add_* definer function and
 * read only through a get_* one. The one exception to the owner rule; a name added here is a decision.
 */
const SHARED_TABLES = ['shared_track_facts', 'shared_artist_reach'];
/** Each shared read function and the one table it may read. */
const SHARED_READERS: Record<string, string> = {
  get_track_facts: 'shared_track_facts',
  get_artist_reach: 'shared_artist_reach',
};
/** Each shared write function, the one table it may write, and its conflict key. */
const SHARED_WRITERS: Record<string, { table: string; key: string }> = {
  add_track_facts: { table: 'shared_track_facts', key: 'track_id' },
  add_artist_reach: {
    table: 'shared_artist_reach',
    key: 'artist_id, source, measured_on',
  },
};
/** What each shared table must carry (checks), matched on the normalised body. */
const SHARED_CHECKS: Record<string, [string, RegExp][]> = {
  shared_track_facts: [
    [
      'track_id shape',
      /track_id text primary key check \(track_id ~ '\^\[0-9a-za-z\]\{22\}\$'\)/,
    ],
    ['bpm range', /bpm real check \(bpm between 30 and 300\)/],
    ['key range', /key smallint check \(key between 0 and 11\)/],
    ['major only with key', /check \(major is null or key is not null\)/],
    [
      'source',
      /source text not null default 'reccobeats' check \(source in \('reccobeats'\)\)/,
    ],
    ['bpm or key', /check \(bpm is not null or key is not null\)/],
  ],
  shared_artist_reach: [
    [
      'artist_id shape',
      /artist_id text not null check \(artist_id ~ '\^\[0-9a-za-z\]\{22\}\$'\)/,
    ],
    [
      'source',
      /source text not null check \(source in \('listenbrainz', 'deezer'\)\)/,
    ],
    [
      'measured_on window',
      /measured_on date not null check \(measured_on between current_date - 7 and current_date \+ 1\)/,
    ],
    [
      'value range',
      /value bigint not null check \(value between 0 and 10000000000\)/,
    ],
    ['primary key', /primary key \(artist_id, source, measured_on\)/],
  ],
};
/** A name, optionally in `public.` and optionally quoted. */
const NAME = '(?:public\\.)?"?(\\w+)"?';

/** Comments dropped, dollar-quoted bodies set aside, lower case, one space. */
function normalise(raw: string): { sql: string; bodies: string[] } {
  const bodies: string[] = [];
  const sql = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, '')
    // Any `$tag$ … $tag$`: the body is kept apart, so a `;` inside it never
    // ends a statement; `$body0$` marks where it was.
    .replace(/(\$\w*\$)([\s\S]*?)\1/g, (_m, _tag, body: string) => {
      bodies.push(body.toLowerCase().replace(/\s+/g, ' '));
      return ` $body${bodies.length - 1}$ `;
    })
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return { sql, bodies };
}

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function audit(raw: string): string[] {
  const { sql, bodies } = normalise(raw);
  const stmts = statements(sql);
  const findings: string[] = [];
  const bodyOf = (s: string) =>
    /\$body(\d+)\$/.exec(s) ? bodies[Number(/\$body(\d+)\$/.exec(s)![1])]! : '';

  // Tables: every `create … table` statement must be in the one known form.
  const tables: string[] = [];
  for (const s of stmts.filter((s) => /\bcreate\b.*?\btable\b/.test(s))) {
    if (/^alter /.test(s)) continue;
    // `returns table (...)` belongs to a function statement, audited below.
    if (/^create (?:or replace )?function /.test(s)) continue;
    const m = new RegExp(
      `^create table (?:if not exists )?${NAME} \\((.*)\\)$`
    ).exec(s);
    if (!m) {
      findings.push(`unrecognised table statement: ${s.slice(0, 60)}`);
      continue;
    }
    tables.push(m[1]!);
    if (m[1] === WORKER_TABLE) {
      if (
        !/user_id uuid primary key references auth\.users \(id\) on delete cascade/.test(
          m[2]!
        )
      ) {
        findings.push(`${WORKER_TABLE}: no user_id key`);
      }
      continue;
    }
    if (SHARED_TABLES.includes(m[1]!)) {
      const cols = m[2]!;
      if (
        /(?:^|, |\()(?:owner_id|user|user_id)\b/.test(cols) ||
        /auth\.(?:uid|users)/.test(cols)
      ) {
        findings.push(`${m[1]}: has a user column`);
      }
      for (const [what, re] of SHARED_CHECKS[m[1]!]!) {
        if (!re.test(cols)) findings.push(`${m[1]}: missing check: ${what}`);
      }
      continue;
    }
    if (
      !/owner_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/.test(
        m[2]!
      )
    ) {
      findings.push(`${m[1]}: no owner_id filled by auth.uid()`);
    }
  }

  // RLS and policies: a `foreach t in array array[…]` loop (in a `do` body)
  // or plain statements per table.
  const rls = new Set<string>();
  const policies = new Map<string, Set<string>>();
  const grant = (t: string, cmd: string) => {
    if (!policies.has(t)) policies.set(t, new Set());
    policies.get(t)!.add(cmd);
  };
  for (const body of bodies) {
    const loop = /foreach t in array array\[([^\]]*)\] loop(.*?)end loop;/.exec(
      body
    );
    if (!loop) {
      if (/create policy|row level security/.test(body)) {
        findings.push('policy or RLS change in an unrecognised body');
      }
      continue;
    }
    const names = [...loop[1]!.matchAll(/'(\w+)'/g)].map((x) => x[1]!);
    for (const t of names) {
      if (SHARED_TABLES.includes(t)) {
        findings.push(`${t}: shared table in the owner policy loop`);
      }
    }
    const inner = loop[2]!;
    const enables = inner.includes(
      "'alter table public.%i enable row level security', t"
    );
    const cmds = CMDS.filter((cmd) =>
      new RegExp(
        `'create policy %i on public\\.%i for ${cmd} to authenticated ${RULE[cmd]}', t \\|\\| '_${cmd}', t`
      ).test(inner)
    );
    const allPolicies = (inner.match(/create policy/g) ?? []).length;
    if (allPolicies !== cmds.length) {
      findings.push('a policy in the RLS loop is not an owner policy');
    }
    for (const t of names) {
      if (enables) rls.add(t);
      for (const cmd of cmds) grant(t, cmd);
    }
  }
  // Shared tables end with no policy and no privilege for authenticated: what
  // is created or granted is tracked in statement order, a drop or revoke removes it.
  const sharedPolicies = new Map<string, Set<string>>();
  const sharedGrants = new Set<string>();
  for (const s of stmts) {
    if (/row level security/.test(s)) {
      const m = new RegExp(
        `^alter table ${NAME} enable row level security$`
      ).exec(s);
      if (m) rls.add(m[1]!);
      else findings.push(`unrecognised RLS statement: ${s.slice(0, 60)}`);
    }
    if (/^create policy/.test(s)) {
      const m = new RegExp(
        `^create policy "?(\\w+)"? on ${NAME} for (select|insert|update|delete) to authenticated (.*)$`
      ).exec(s);
      if (m && m[2] === WORKER_TABLE) {
        if (!sharedPolicies.has(m[2]!)) sharedPolicies.set(m[2]!, new Set());
        sharedPolicies.get(m[2]!)!.add(m[1]!);
        continue;
      }
      const cmd = m?.[3] as (typeof CMDS)[number] | undefined;
      const ok = (t: string, c: (typeof CMDS)[number], rule: string) =>
        SHARED_TABLES.includes(t)
          ? c === 'insert' && rule === 'with check (true)'
          : new RegExp(`^${RULE[c]}$`).test(rule);
      if (m && cmd && ok(m[2]!, cmd, m[4]!)) {
        if (SHARED_TABLES.includes(m[2]!)) {
          if (!sharedPolicies.has(m[2]!)) sharedPolicies.set(m[2]!, new Set());
          sharedPolicies.get(m[2]!)!.add(m[1]!);
        }
        grant(m[2]!, cmd);
      } else findings.push(`not an owner policy: ${s.slice(0, 60)}`);
    }
    if (/^drop policy/.test(s)) {
      const m = new RegExp(
        `^drop policy (?:if exists )?"?(\\w+)"? on ${NAME}$`
      ).exec(s);
      if (m) sharedPolicies.get(m[2]!)?.delete(m[1]!);
      else findings.push(`unrecognised drop policy: ${s.slice(0, 60)}`);
    }
    // Privileges on a shared table, in order: an insert grant stands until a
    // revoke all from authenticated clears it.
    const ig = /^grant insert on (?:table )?(.*) to authenticated$/.exec(s);
    if (ig) {
      for (const t of SHARED_TABLES) {
        if (new RegExp(`\\b${t}\\b`).test(ig[1]!)) sharedGrants.add(t);
      }
    }
    const wg =
      /^grant (?!execute\b)(.*?) on (?:table )?(.*) to authenticated$/.exec(s);
    if (
      wg &&
      (/\ball tables\b/.test(wg[2]!) ||
        new RegExp(`\\b${WORKER_TABLE}\\b`).test(wg[2]!))
    ) {
      sharedGrants.add(WORKER_TABLE);
    }
    if (
      /^revoke all on (?!function|all)/.test(s) &&
      /from .*\bauthenticated\b/.test(s)
    ) {
      if (new RegExp(`\\b${WORKER_TABLE}\\b`).test(s)) {
        sharedGrants.delete(WORKER_TABLE);
      }
      for (const t of SHARED_TABLES) {
        if (new RegExp(`\\b${t}\\b`).test(s)) sharedGrants.delete(t);
      }
    }
  }
  for (const t of tables) {
    if (!rls.has(t)) findings.push(`${t}: row level security not enabled`);
    if (SHARED_TABLES.includes(t) || t === WORKER_TABLE) {
      if ((sharedPolicies.get(t)?.size ?? 0) !== 0)
        findings.push(`${t}: a policy remains after the last migration`);
      if (sharedGrants.has(t))
        findings.push(`${t}: a privilege for authenticated remains`);
      // Default privileges give authenticated everything on a new table.
      const revoked = stmts.some(
        (x) =>
          /^revoke all on /.test(x) &&
          new RegExp(`\\b${t}\\b`).test(x) &&
          /from (?=.*\bauthenticated\b)(?=.*\banon\b)(?=.*\bpublic\b)/.test(x)
      );
      if (!revoked)
        findings.push(
          `${t}: default privileges not revoked from authenticated`
        );
      continue;
    }
    for (const cmd of CMDS) {
      if (!policies.get(t)?.has(cmd))
        findings.push(`${t}: no ${cmd} owner policy`);
    }
  }

  // Grants: anon's defaults revoked, and every grant to authenticated only.
  for (const want of [
    'revoke all on all tables in schema public from anon',
    'revoke all on all functions in schema public from anon, public',
    'alter default privileges in schema public revoke all on tables from anon',
    'alter default privileges in schema public revoke all on functions from anon, public',
  ]) {
    if (!stmts.includes(want)) findings.push(`missing: ${want}`);
  }
  for (const s of stmts.filter((s) => /\bgrant\b/.test(s))) {
    if (/^revoke /.test(s) || /revoke all on/.test(s)) continue;
    if (!/^grant .* to authenticated$/.test(s)) {
      findings.push(
        `grant to someone other than authenticated: ${s.slice(0, 60)}`
      );
      continue;
    }
    // A shared table is granted `insert` and nothing else, never in a bulk grant.
    const g = /^grant (.*?) on (?:table )?(.*) to authenticated$/.exec(s);
    if (g && !/^execute\b/.test(g[1]!)) {
      const hitsShared =
        /\ball tables\b/.test(g[2]!) ||
        SHARED_TABLES.some((t) => new RegExp(`\\b${t}\\b`).test(g[2]!));
      if (hitsShared && g[1] !== 'insert') {
        findings.push(
          `shared table granted more than insert: ${s.slice(0, 60)}`
        );
      }
    }
  }

  // Functions: every `create … function` in the known form; claim_job runs
  // as the caller; a definer only from the allow list, reading no table.
  for (const s of stmts.filter((s) => /\bcreate\b.*?\bfunction\b/.test(s))) {
    const m = new RegExp(`^create (?:or replace )?function ${NAME}\\(`).exec(s);
    if (!m || !/\$body\d+\$/.test(s)) {
      findings.push(`unrecognised function statement: ${s.slice(0, 60)}`);
      continue;
    }
    const name = m[1]!;
    const body = bodyOf(s);
    const definer = /\bsecurity definer\b/.test(s);
    if (name === 'claim_job') {
      if (!/\bsecurity invoker\b/.test(s) || definer) {
        findings.push('claim_job: not security invoker');
      }
      if (!new RegExp(OWNER).test(body)) {
        findings.push('claim_job: no owner filter');
      }
    }
    if (definer && !DEFINERS.includes(name)) {
      findings.push(`${name}: security definer`);
    }
    const wf = WORKER_FUNCS[name];
    const own = SHARED_READERS[name];
    const writer = SHARED_WRITERS[name];
    if (definer && !/\bset search_path = ''/.test(s)) {
      findings.push(`${name}: definer without search_path = ''`);
    }
    if (definer && own) {
      for (const t of new Set(
        [...body.matchAll(/\bpublic\.(\w+)/g)].map((x) => x[1]!)
      )) {
        if (t !== own) findings.push(`${name}: definer reads ${t}`);
      }
      if (!new RegExp(`\\bfrom public\\.${own}\\b`).test(body)) {
        findings.push(`${name}: does not read ${own} fully qualified`);
      }
      if (
        !/cardinality\(ids\) > 200\b/.test(body) ||
        !body.includes("'too many ids'")
      ) {
        findings.push(`${name}: no 200 id cap`);
      }
      if (
        !stmts.includes(
          `grant execute on function public.${name}(ids text[]) to authenticated`
        )
      ) {
        findings.push(`${name}: not granted to authenticated`);
      }
    } else if (definer && writer) {
      for (const t of new Set(
        [...body.matchAll(/\bpublic\.(\w+)/g)].map((x) => x[1]!)
      )) {
        if (t !== writer.table) findings.push(`${name}: definer touches ${t}`);
      }
      if (
        !new RegExp(`\\binsert into public\\.${writer.table}\\b`).test(body)
      ) {
        findings.push(`${name}: does not insert into ${writer.table}`);
      }
      if (
        !body.includes(`on conflict (${writer.key}) do nothing`) ||
        /\bdo update\b/.test(body)
      ) {
        findings.push(`${name}: not on conflict do nothing`);
      }
      if (
        !/jsonb_array_length\(rows\) > 200\b/.test(body) ||
        !body.includes("'too many rows'")
      ) {
        findings.push(`${name}: no 200 row cap`);
      }
      if (
        !stmts.includes(
          `grant execute on function public.${name}(rows jsonb) to authenticated`
        )
      ) {
        findings.push(`${name}: not granted to authenticated`);
      }
    } else if (wf && definer) {
      for (const t of new Set(
        [...body.matchAll(/\bpublic\.(\w+)/g)].map((x) => x[1]!)
      )) {
        if (!['jobs', 'shared_workers', 'require_shared_worker'].includes(t)) {
          findings.push(`${name}: definer touches ${t}`);
        }
      }
    } else if (definer && /\bpublic\./.test(body)) {
      findings.push(`${name}: definer reads a table`);
    }
    if (wf) {
      if (!definer) findings.push(`${name}: not security definer`);
      if (wf.requires) {
        const call = body.indexOf('public.require_shared_worker()');
        const jobs = body.indexOf('public.jobs');
        if (call < 0) {
          findings.push(`${name}: does not call require_shared_worker()`);
        }
        if (jobs >= 0 && (call < 0 || jobs < call)) {
          findings.push(`${name}: touches jobs before require_shared_worker()`);
        }
      }
      const head = `public.${name}${wf.args}`;
      const revoke = `revoke all on function ${head} from public, anon${wf.granted ? '' : ', authenticated'}`;
      const grantStmt = `grant execute on function ${head} to authenticated`;
      const at = (x: string) => stmts.lastIndexOf(x);
      if (at(revoke) < 0) {
        findings.push(
          `${name}: execute not revoked from ${wf.granted ? 'public, anon' : 'public, anon, authenticated'}`
        );
      }
      const anyGrant = stmts.some(
        (x) =>
          /^grant execute on function /.test(x) &&
          x.includes(`public.${name}(`) &&
          /\bto authenticated$/.test(x)
      );
      if (wf.granted) {
        if (at(grantStmt) < 0) {
          findings.push(`${name}: not granted to authenticated`);
        } else if (at(grantStmt) < at(revoke)) {
          findings.push(`${name}: grant before the revoke`);
        }
      } else if (anyGrant) {
        findings.push(`${name}: granted to authenticated`);
      }
    }
    if (name === 'claim_any_job') {
      if (!/\bfor update skip locked\b/.test(body)) {
        findings.push('claim_any_job: no for update skip locked');
      }
      const order = /order by (.*?) limit 1/.exec(body)?.[1] ?? '';
      if (
        !/^\(select max\(\w+\.claimed_at\) from public\.jobs .*?\) asc nulls first, \w+\.priority desc/.test(
          order
        )
      ) {
        findings.push(
          "claim_any_job: order by does not start with the owner's latest claim"
        );
      }
      if (!/returns table \(id uuid, payload jsonb\) /.test(s)) {
        findings.push('claim_any_job: returns more than id and payload');
      }
      if (!/returning \w+\.id, \w+\.payload;/.test(body)) {
        findings.push('claim_any_job: returning more than id and payload');
      }
    }
  }
  for (const s of stmts.filter((s) => /^alter function/.test(s))) {
    if (/security definer/.test(s))
      findings.push(`alter to definer: ${s.slice(0, 60)}`);
  }
  if (/disable row level security/.test(sql)) {
    findings.push('row level security disabled');
  }
  return findings;
}

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const migrations = files
  .map((f) => readFileSync(new URL(f, DIR), 'utf8'))
  .join('\n');

describe('server rules (supabase/migrations)', () => {
  const createdTables = () =>
    [...normalise(migrations).sql.matchAll(/create table (?:public\.)?(\w+)/g)]
      .map((m) => m[1]!)
      .sort();

  it('reads the migrations, with the four known tables', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(
      createdTables().filter(
        (t) => !SHARED_TABLES.includes(t) && t !== WORKER_TABLE
      )
    ).toEqual(['dataset_rows', 'datasets', 'jobs', 'mixes']);
  });

  it('reads the migrations, with the two shared tables besides (six in all)', () => {
    expect(createdTables().filter((t) => t !== WORKER_TABLE)).toEqual([
      'dataset_rows',
      'datasets',
      'jobs',
      'mixes',
      'shared_artist_reach',
      'shared_track_facts',
    ]);
  });

  it('reads the migrations, with the shared worker list as the seventh table (0006)', () => {
    expect(createdTables()).toContain(WORKER_TABLE);
    expect(createdTables()).toHaveLength(7);
  });

  it('every table keeps each row to its owner, anon gets nothing', () => {
    expect(audit(migrations)).toEqual([]);
  });
});

/** A small sound schema: one table, the loop, the revokes, two functions. */
const BASE = `
create table public.notes (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text
);
do $$
declare t text;
begin
  foreach t in array array['notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())', t || '_delete', t);
  end loop;
end
$$;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
grant select, insert, update, delete on public.notes to authenticated;
create function public.claim_job(p text)
returns setof public.notes
language sql
security invoker
as $$ select * from public.notes where owner_id = auth.uid(); $$;
create function public.storage_used() returns bigint language sql security definer set search_path = ''
as $$ select pg_catalog.pg_database_size(pg_catalog.current_database()); $$;
`;

describe('audit catches each break', () => {
  it('passes the sound fixture', () => {
    expect(audit(BASE)).toEqual([]);
  });

  it('a table outside the RLS loop', () => {
    expect(
      audit(
        `${BASE}\ncreate table public.extra (owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade);`
      )
    ).toEqual(
      expect.arrayContaining([
        'extra: row level security not enabled',
        'extra: no select owner policy',
      ])
    );
  });

  it('the `if not exists`, unqualified and quoted forms', () => {
    for (const head of [
      'create table if not exists public.extra',
      'create table extra',
      'create table "extra"',
      'CREATE TABLE IF NOT EXISTS "extra"',
    ]) {
      expect(audit(`${BASE}\n${head} (id int);`), head).toEqual(
        expect.arrayContaining([
          'extra: no owner_id filled by auth.uid()',
          'extra: row level security not enabled',
        ])
      );
    }
  });

  it('a table statement in an unknown form fails loudly', () => {
    expect(audit(`${BASE}\ncreate unlogged table public.x (id int);`)).toEqual([
      'unrecognised table statement: create unlogged table public.x (id int)',
    ]);
  });

  it('a missing policy', () => {
    const sql = BASE.replace(/.*for delete to authenticated.*\n/, '');
    expect(audit(sql)).toEqual(['notes: no delete owner policy']);
  });

  it('a permissive policy beside the owner ones', () => {
    expect(
      audit(
        `${BASE}\ncreate policy open on public.notes for select to authenticated using (true);`
      )
    ).toEqual([
      'not an owner policy: create policy open on public.notes for select to authenticat',
    ]);
  });

  it('a grant to anon', () => {
    expect(audit(`${BASE}\ngrant select on public.notes to anon;`)).toEqual([
      'grant to someone other than authenticated: grant select on public.notes to anon',
    ]);
  });

  it('claim_job as security definer, quoted with $f$', () => {
    const sql = `${BASE}\ncreate or replace function public.claim_job(p text) returns setof public.notes language sql security definer as $f$ select * from public.notes where owner_id = auth.uid(); $f$;`;
    expect(audit(sql)).toEqual(
      expect.arrayContaining([
        'claim_job: not security invoker',
        'claim_job: security definer',
        'claim_job: definer reads a table',
      ])
    );
  });

  it('a function statement in an unknown form fails loudly', () => {
    expect(
      audit(
        `${BASE}\ncreate function public.f() returns int language sql return 1;`
      )
    ).toEqual([
      'unrecognised function statement: create function public.f() returns int language sql return 1',
    ]);
  });

  it('RLS switched off later', () => {
    expect(
      audit(`${BASE}\nalter table public.notes disable row level security;`)
    ).toEqual(expect.arrayContaining(['row level security disabled']));
  });
});

/** The shared store (round 014, ADR-15): a sound fixture, then each break. */
const SHARED = `
create table public.shared_track_facts (
  track_id text primary key check (track_id ~ '^[0-9A-Za-z]{22}$'),
  bpm real check (bpm between 30 and 300),
  key smallint check (key between 0 and 11),
  major boolean,
  source text not null default 'reccobeats' check (source in ('reccobeats')),
  added_at timestamptz not null default now(),
  check (major is null or key is not null),
  check (bpm is not null or key is not null)
);
create table public.shared_artist_reach (
  artist_id text not null check (artist_id ~ '^[0-9A-Za-z]{22}$'),
  source text not null check (source in ('listenbrainz', 'deezer')),
  measured_on date not null check (measured_on between current_date - 7 and current_date + 1),
  value bigint not null check (value between 0 and 10000000000),
  added_at timestamptz not null default now(),
  primary key (artist_id, source, measured_on)
);
alter table public.shared_track_facts enable row level security;
alter table public.shared_artist_reach enable row level security;
create policy shared_track_facts_insert on public.shared_track_facts for insert to authenticated with check (true);
create policy shared_artist_reach_insert on public.shared_artist_reach for insert to authenticated with check (true);
create function public.get_track_facts(ids text[])
returns table (track_id text, bpm real, key smallint, major boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if ids is null or cardinality(ids) = 0 then return; end if;
  if cardinality(ids) > 200 then raise exception 'too many ids' using errcode = '54000'; end if;
  return query select f.track_id, f.bpm, f.key, f.major from public.shared_track_facts f where f.track_id = any(ids);
end
$$;
create function public.get_artist_reach(ids text[])
returns table (artist_id text, source text, measured_on date, value bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if ids is null or cardinality(ids) = 0 then return; end if;
  if cardinality(ids) > 200 then raise exception 'too many ids' using errcode = '54000'; end if;
  return query select distinct on (r.artist_id, r.source) r.artist_id, r.source, r.measured_on, r.value from public.shared_artist_reach r where r.artist_id = any(ids) order by r.artist_id, r.source, r.measured_on desc;
end
$$;
revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public;
revoke all on function public.get_track_facts(text[]) from public, anon;
revoke all on function public.get_artist_reach(text[]) from public, anon;
grant insert on public.shared_track_facts, public.shared_artist_reach to authenticated;
grant execute on function public.get_track_facts(ids text[]) to authenticated;
grant execute on function public.get_artist_reach(ids text[]) to authenticated;
`;
/** 0005, as the migration gives it: the insert grant and policies go, two add functions come. */
const ADDED = `
revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public;
drop policy if exists shared_track_facts_insert on public.shared_track_facts;
drop policy if exists shared_artist_reach_insert on public.shared_artist_reach;
create function public.add_track_facts(rows jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then raise exception 'rows must be a json array' using errcode = '22023'; end if;
  if jsonb_array_length(rows) = 0 then return 0; end if;
  if jsonb_array_length(rows) > 200 then raise exception 'too many rows' using errcode = '54000'; end if;
  insert into public.shared_track_facts (track_id, bpm, key, major) select r.track_id, r.bpm, r.key, r.major from jsonb_to_recordset(rows) as r(track_id text, bpm real, key smallint, major boolean) on conflict (track_id) do nothing;
  return jsonb_array_length(rows);
end
$$;
create function public.add_artist_reach(rows jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then raise exception 'rows must be a json array' using errcode = '22023'; end if;
  if jsonb_array_length(rows) = 0 then return 0; end if;
  if jsonb_array_length(rows) > 200 then raise exception 'too many rows' using errcode = '54000'; end if;
  insert into public.shared_artist_reach (artist_id, source, measured_on, value) select r.artist_id, r.source, r.measured_on, r.value from jsonb_to_recordset(rows) as r(artist_id text, source text, measured_on date, value bigint) on conflict (artist_id, source, measured_on) do nothing;
  return jsonb_array_length(rows);
end
$$;
revoke all on function public.add_track_facts(jsonb) from public, anon;
revoke all on function public.add_artist_reach(jsonb) from public, anon;
grant execute on function public.add_track_facts(rows jsonb) to authenticated;
grant execute on function public.add_artist_reach(rows jsonb) to authenticated;
`;
const WITH_SHARED = `${BASE}\n${SHARED}\n${ADDED}`;

describe('the shared store (0004_shared_facts.sql)', () => {
  it('the sound fixture passes', () => {
    expect(audit(WITH_SHARED)).toEqual([]);
  });

  it('a table outside the list still needs owner_id', () => {
    expect(
      audit(`${BASE}\ncreate table public.facts2 (track_id text primary key);`)
    ).toEqual(
      expect.arrayContaining(['facts2: no owner_id filled by auth.uid()'])
    );
  });

  it('a select, update or delete policy on a shared table', () => {
    for (const cmd of ['select', 'update', 'delete']) {
      const rule =
        cmd === 'update' ? 'using (true) with check (true)' : 'using (true)';
      const f = audit(
        `${WITH_SHARED}\ncreate policy p on public.shared_track_facts for ${cmd} to authenticated ${rule};`
      );
      expect(f, cmd).toHaveLength(1);
      expect(f[0], cmd).toMatch(/^not an owner policy/);
    }
  });

  it('a non-open insert policy on a shared table', () => {
    const from =
      'for insert to authenticated with check (true);\ncreate policy shared_artist';
    expect(WITH_SHARED).toContain(from);
    const sql = WITH_SHARED.replace(
      from,
      'for insert to authenticated with check (auth.uid() is not null);\ncreate policy shared_artist'
    );
    expect(audit(sql)).toHaveLength(1); // the bad policy (0005 drops it by name)
  });

  it('a select or broader grant on a shared table', () => {
    for (const g of [
      'grant select on public.shared_track_facts to authenticated',
      'grant update on public.shared_artist_reach to authenticated',
      'grant delete on public.shared_track_facts to authenticated',
      'grant all on public.shared_track_facts to authenticated',
      'grant select, insert on public.shared_track_facts, public.shared_artist_reach to authenticated',
      'grant select on all tables in schema public to authenticated',
    ]) {
      const f = audit(`${WITH_SHARED}\n${g};`);
      expect(f, g).toHaveLength(1);
      expect(f[0], g).toMatch(/^shared table granted more than insert/);
    }
    expect(
      audit(
        `${WITH_SHARED}\ngrant insert on public.shared_track_facts to anon;`
      )
    ).toEqual([
      'grant to someone other than authenticated: grant insert on public.shared_track_facts to anon',
    ]);
  });

  it('a missing revoke from authenticated, or a duplicate insert policy', () => {
    const revoke =
      'revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public;';
    expect(WITH_SHARED).toContain(revoke);
    // The revoke is in 0004 and again in 0005: without both, it is missing,
    // and the insert grant of 0004 is left standing.
    expect(audit(WITH_SHARED.replaceAll(revoke, ''))).toEqual([
      'shared_track_facts: a privilege for authenticated remains',
      'shared_track_facts: default privileges not revoked from authenticated',
      'shared_artist_reach: a privilege for authenticated remains',
      'shared_artist_reach: default privileges not revoked from authenticated',
    ]);
    // Without the 0005 revoke alone, the insert grant stays.
    expect(audit(`${BASE}\n${SHARED}`)).toEqual([
      'shared_track_facts: a policy remains after the last migration',
      'shared_track_facts: a privilege for authenticated remains',
      'shared_artist_reach: a policy remains after the last migration',
      'shared_artist_reach: a privilege for authenticated remains',
    ]);
    const half = revoke.replace(
      'from authenticated, anon, public',
      'from anon'
    );
    expect(audit(WITH_SHARED.replaceAll(revoke, half))).toHaveLength(4);
    const dup =
      'create policy shared_track_facts_insert on public.shared_track_facts for insert to authenticated with check (true);';
    expect(WITH_SHARED).toContain(dup);
    expect(
      audit(
        WITH_SHARED.replace(
          dup,
          `${dup}\n${dup.replace('_insert', '_insert2')}`
        )
      )
    ).toEqual([
      'shared_track_facts: a policy remains after the last migration',
    ]);
  });

  it('a user or owner column on a shared table', () => {
    for (const col of [
      'owner_id uuid',
      'user_id uuid',
      'user text',
      'owner_id uuid not null default auth.uid() references auth.users (id)',
    ]) {
      const anchor =
        'added_at timestamptz not null default now(),\n  check (major';
      expect(WITH_SHARED).toContain(anchor);
      const sql = WITH_SHARED.replace(
        anchor,
        `${col},\n  added_at timestamptz not null default now(),\n  check (major`
      );
      expect(audit(sql), col).toEqual([
        'shared_track_facts: has a user column',
      ]);
    }
  });

  it('a missing check', () => {
    for (const [from, to, label] of [
      ['check (bpm between 30 and 300)', '', 'bpm range'],
      ['check (key between 0 and 11)', '', 'key range'],
      [
        '  check (major is null or key is not null),\n',
        '',
        'major only with key',
      ],
      [
        '  check (bpm is not null or key is not null)\n',
        '  check (true)\n',
        'bpm or key',
      ],
      ["check (source in ('reccobeats'))", '', 'source'],
      ["check (track_id ~ '^[0-9A-Za-z]{22}$')", '', 'track_id shape'],
      ['check (value between 0 and 10000000000)', '', 'value range'],
      [
        'check (measured_on between current_date - 7 and current_date + 1)',
        '',
        'measured_on window',
      ],
      ["check (source in ('listenbrainz', 'deezer'))", '', 'source'],
      [
        'primary key (artist_id, source, measured_on)',
        'primary key (artist_id)',
        'primary key',
      ],
    ] as const) {
      expect(WITH_SHARED).toContain(from);
      const f = audit(WITH_SHARED.replace(from, to));
      expect(f.join('\n'), from).toContain(`missing check: ${label}`);
    }
  });

  it('a definer outside the list, or one that reads another table', () => {
    expect(
      audit(
        `${BASE}\ncreate function public.peek() returns bigint language sql security definer set search_path = '' as $$ select 1; $$;`
      )
    ).toEqual(['peek: security definer']);
    expect(WITH_SHARED).toContain('from public.shared_track_facts f');
    const other = WITH_SHARED.replace(
      'from public.shared_track_facts f',
      'from public.shared_track_facts f, public.notes n'
    );
    expect(audit(other)).toEqual(['get_track_facts: definer reads notes']);
    expect(WITH_SHARED).toContain('from public.shared_artist_reach r');
    const swapped = WITH_SHARED.replace(
      'from public.shared_artist_reach r',
      'from public.shared_track_facts r'
    );
    expect(audit(swapped)).toEqual(
      expect.arrayContaining([
        'get_artist_reach: definer reads shared_track_facts',
        'get_artist_reach: does not read shared_artist_reach fully qualified',
      ])
    );
  });

  it('a definer without search_path, without the cap, or not granted', () => {
    expect(SHARED).toContain("security definer set search_path = ''");
    expect(SHARED).toContain('> 200');
    expect(
      audit(
        `${BASE}\n${`${SHARED}\n${ADDED}`.replaceAll(
          "security definer set search_path = ''",
          'security definer'
        )}`
      )
    ).toEqual([
      "get_track_facts: definer without search_path = ''",
      "get_artist_reach: definer without search_path = ''",
      "add_track_facts: definer without search_path = ''",
      "add_artist_reach: definer without search_path = ''",
    ]);
    expect(audit(WITH_SHARED.replaceAll('> 200', '> 2000'))).toEqual([
      'get_track_facts: no 200 id cap',
      'get_artist_reach: no 200 id cap',
      'add_track_facts: no 200 row cap',
      'add_artist_reach: no 200 row cap',
    ]);
    const exec =
      'grant execute on function public.get_artist_reach(ids text[]) to authenticated;';
    expect(WITH_SHARED).toContain(exec);
    expect(audit(WITH_SHARED.replace(exec, ''))).toEqual([
      'get_artist_reach: not granted to authenticated',
    ]);
  });

  it('a read function granted to anon or public', () => {
    for (const who of ['anon', 'public']) {
      const f = audit(
        `${WITH_SHARED}\ngrant execute on function public.get_track_facts(ids text[]) to ${who};`
      );
      expect(f, who).toEqual([
        `grant to someone other than authenticated: grant execute on function public.get_track_facts(ids text[]) to ${who}`.slice(
          0,
          'grant to someone other than authenticated: '.length + 60
        ),
      ]);
    }
  });

  it('a select policy that lists the table, on each shared table', () => {
    for (const t of ['shared_track_facts', 'shared_artist_reach']) {
      const f = audit(
        `${WITH_SHARED}\ncreate policy list_all on public.${t} for select to authenticated using (true);`
      );
      expect(f, t).toHaveLength(1);
      expect(f[0], t).toMatch(/^not an owner policy: create policy list_all/);
    }
  });

  it('a definer function without the cap, each alone', () => {
    const body =
      "if cardinality(ids) > 200 then raise exception 'too many ids' using errcode = '54000'; end if;";
    expect(WITH_SHARED).toContain(body);
    const once = WITH_SHARED.replace(body, '');
    expect(audit(once)).toEqual(['get_track_facts: no 200 id cap']);
  });

  it('a shared table put in the owner loop', () => {
    expect(
      audit(
        WITH_SHARED.replace(
          "array['notes']",
          "array['notes', 'shared_track_facts']"
        )
      )
    ).toEqual(
      expect.arrayContaining([
        'shared_track_facts: shared table in the owner policy loop',
      ])
    );
  });

  it('the numbers in the SQL are the client numbers', () => {
    const { sql, bodies } = normalise(
      readFileSync(new URL('0004_shared_facts.sql', DIR), 'utf8')
    );
    expect(sql).toContain(
      `bpm between ${SHARED_BPM_MIN} and ${SHARED_BPM_MAX}`
    );
    expect(bodies).toHaveLength(2);
    for (const b of bodies) {
      expect(b).toContain(`cardinality(ids) > ${SHARED_MAX_IDS} then`);
    }
    expect(sql).toContain(`key between 0 and ${SHARED_KEY_MAX}`);
    expect(sql).toContain(`value between 0 and ${SHARED_REACH_MAX}`);
    // The id shape: the client pattern's source is the SQL's, lower-cased by
    // the normaliser, once per shared table.
    const shape = SHARED_ID_PATTERN.source.toLowerCase();
    expect(sql.split(shape).length - 1).toBe(2);
  });

  it('get_artist_reach returns the newest measurement per artist and source', () => {
    const { bodies } = normalise(
      readFileSync(new URL('0004_shared_facts.sql', DIR), 'utf8')
    );
    const body = bodies.find((b) => b.includes('shared_artist_reach'));
    expect(body).toBeDefined();
    expect(body).toContain('select distinct on (r.artist_id, r.source)');
    // distinct on keeps the first row of each group, so the order decides.
    expect(body).toContain(
      'order by r.artist_id, r.source, r.measured_on desc'
    );
  });
});

describe('the add functions (0005_shared_add_functions.sql)', () => {
  const read = () =>
    normalise(
      readFileSync(new URL('0005_shared_add_functions.sql', DIR), 'utf8')
    );

  it('the real migration, alone after 0004, leaves no policy and no privilege', () => {
    const f = audit(
      [
        readFileSync(new URL('0001_init.sql', DIR), 'utf8'),
        readFileSync(new URL('0004_shared_facts.sql', DIR), 'utf8'),
        readFileSync(new URL('0005_shared_add_functions.sql', DIR), 'utf8'),
      ].join('\n')
    );
    expect(f.filter((x) => /shared|add_/.test(x))).toEqual([]);
  });

  it('revokes every privilege on both tables and drops both insert policies', () => {
    const { stmts } = { stmts: statements(read().sql) };
    expect(stmts).toContain(
      'revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public'
    );
    expect(stmts).toContain(
      'drop policy if exists shared_track_facts_insert on public.shared_track_facts'
    );
    expect(stmts).toContain(
      'drop policy if exists shared_artist_reach_insert on public.shared_artist_reach'
    );
    expect(
      stmts.filter((s) => /^create policy|^grant .* on public\.shared_/.test(s))
    ).toEqual([]);
  });

  it('pins both bodies: definer, empty search_path, the cap, do nothing on conflict', () => {
    const { sql, bodies } = read();
    expect(bodies).toHaveLength(2);
    const defs = statements(sql).filter((s) => /^create function/.test(s));
    expect(defs).toHaveLength(2);
    for (const d of defs) {
      expect(d).toContain('security definer');
      expect(d).toContain("set search_path = ''");
      expect(d).toContain('returns integer');
    }
    for (const b of bodies) {
      expect(b).toContain(`jsonb_array_length(rows) > ${SHARED_MAX_IDS} then`);
      expect(b).toContain("errcode = '22023'");
      expect(b).toContain("errcode = '54000'");
      expect(b).not.toContain('do update');
    }
    expect(bodies[0]).toContain('on conflict (track_id) do nothing');
    expect(bodies[1]).toContain(
      'on conflict (artist_id, source, measured_on) do nothing'
    );
    expect(bodies[0]).toContain(
      'insert into public.shared_track_facts (track_id, bpm, key, major)'
    );
    expect(bodies[1]).toContain(
      'insert into public.shared_artist_reach (artist_id, source, measured_on, value)'
    );
  });

  it('execute goes to authenticated only', () => {
    const stmts = statements(read().sql);
    for (const fn of [
      'add_track_facts(jsonb) from public, anon',
      'add_artist_reach(jsonb) from public, anon',
    ]) {
      expect(stmts).toContain(`revoke all on function public.${fn}`);
    }
    const grants = stmts.filter((s) => /^grant /.test(s));
    expect(grants).toEqual([
      'grant execute on function public.add_track_facts(rows jsonb) to authenticated',
      'grant execute on function public.add_artist_reach(rows jsonb) to authenticated',
    ]);
  });

  it('a write function that updates on conflict, writes another table, or is not capped', () => {
    const swap = (a: string, b: string) => {
      expect(WITH_SHARED).toContain(a);
      return audit(WITH_SHARED.replace(a, b));
    };
    expect(
      swap(
        'on conflict (track_id) do nothing',
        'on conflict (track_id) do update set bpm = excluded.bpm'
      )
    ).toEqual(['add_track_facts: not on conflict do nothing']);
    expect(
      swap(
        'insert into public.shared_artist_reach (artist_id',
        'insert into public.shared_track_facts (artist_id'
      )
    ).toEqual(
      expect.arrayContaining([
        'add_artist_reach: definer touches shared_track_facts',
        'add_artist_reach: does not insert into shared_artist_reach',
      ])
    );
    const exec =
      'grant execute on function public.add_track_facts(rows jsonb) to authenticated;';
    expect(audit(WITH_SHARED.replace(exec, ''))).toEqual([
      'add_track_facts: not granted to authenticated',
    ]);
    expect(
      audit(
        `${WITH_SHARED}\ngrant execute on function public.add_track_facts(rows jsonb) to anon;`
      )
    ).toHaveLength(1);
  });

  it('a policy or an insert grant put back after the revoke is a finding', () => {
    expect(
      audit(
        `${WITH_SHARED}\ncreate policy back on public.shared_track_facts for insert to authenticated with check (true);`
      )
    ).toEqual([
      'shared_track_facts: a policy remains after the last migration',
    ]);
    expect(
      audit(
        `${WITH_SHARED}\ngrant insert on public.shared_artist_reach to authenticated;`
      )
    ).toEqual(['shared_artist_reach: a privilege for authenticated remains']);
  });
});

/** 0006 as the migration gives it: the shared worker (round 015, ADR-16). */
let M6 = '';
try {
  M6 = readFileSync(new URL('0006_shared_worker.sql', DIR), 'utf8');
} catch {
  /* the first test below reports it */
}
const WITH_WORKER = `${WITH_SHARED}\n${M6}`;

/** The statement and the normalised body of one function of 0006. */
function part(name: string) {
  const { sql, bodies } = normalise(M6);
  const stmt = statements(sql).find((x) =>
    x.startsWith(`create function public.${name}(`)
  );
  if (!stmt) throw new Error(`no function ${name} in 0006`);
  return { stmt, body: bodies[Number(/\$body(\d+)\$/.exec(stmt)![1])]! };
}

describe('the shared worker (0006_shared_worker.sql)', () => {
  it('exists, and the audit accepts it beside the earlier files', () => {
    expect(M6).not.toBe('');
    expect(audit(WITH_WORKER)).toEqual([]);
    expect(audit(migrations)).toEqual([]);
  });

  it('shared_workers: a policy or a grant to authenticated, anon or public', () => {
    expect(
      audit(
        `${WITH_WORKER}\ncreate policy list_all on public.shared_workers for select to authenticated using (true);`
      )
    ).toEqual(['shared_workers: a policy remains after the last migration']);
    for (const g of [
      'grant select on public.shared_workers to authenticated',
      'grant all on public.shared_workers to authenticated',
      'grant select on all tables in schema public to authenticated',
    ]) {
      expect(audit(`${WITH_WORKER}\n${g};`), g).toContain(
        'shared_workers: a privilege for authenticated remains'
      );
    }
    for (const who of ['anon', 'public']) {
      const f = audit(
        `${WITH_WORKER}\ngrant select on public.shared_workers to ${who};`
      );
      expect(f, who).toHaveLength(1);
      expect(f[0], who).toMatch(/^grant to someone other than authenticated/);
    }
    const revoke =
      'revoke all on public.shared_workers from authenticated, anon, public;';
    expect(M6).toContain(revoke);
    expect(audit(`${WITH_SHARED}\n${M6.replace(revoke, '')}`)).toEqual([
      'shared_workers: default privileges not revoked from authenticated',
    ]);
    const rls = 'alter table public.shared_workers enable row level security;';
    expect(M6).toContain(rls);
    expect(audit(`${WITH_SHARED}\n${M6.replace(rls, '')}`)).toEqual([
      'shared_workers: row level security not enabled',
    ]);
  });

  it('each shared function: definer, search_path, revoked, granted last, require first', () => {
    const lower = (re: RegExp, to: string) =>
      audit(`${WITH_SHARED}\n${M6.replace(re, to)}`);
    expect(
      lower(/set search_path = ''/g, '').filter((f) => /search_path/.test(f))
        .length
    ).toBe(Object.keys(WORKER_FUNCS).length);
    expect(
      lower(/security definer/g, 'security invoker').filter((f) =>
        /not security definer/.test(f)
      ).length
    ).toBe(Object.keys(WORKER_FUNCS).length);
    for (const [fn, f] of Object.entries(WORKER_FUNCS)) {
      const head = `public.${fn}${f.args}`;
      const revoke = `revoke all on function ${head} from public, anon${f.granted ? '' : ', authenticated'};`;
      expect(M6, fn).toContain(revoke);
      expect(
        lower(new RegExp(revoke.replace(/[()]/g, '\\$&')), ''),
        fn
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(`^${fn}: execute not revoked`),
        ])
      );
      for (const who of ['anon', 'public']) {
        expect(
          audit(`${WITH_WORKER}\ngrant execute on function ${head} to ${who};`),
          `${fn} ${who}`
        ).toHaveLength(1);
      }
      const grant = `grant execute on function ${head} to authenticated;`;
      if (f.granted) {
        expect(M6, fn).toContain(grant);
        expect(
          lower(new RegExp(grant.replace(/[()]/g, '\\$&')), ''),
          fn
        ).toEqual([`${fn}: not granted to authenticated`]);
      } else {
        expect(M6, fn).not.toContain(grant);
        expect(audit(`${WITH_WORKER}\n${grant}`), fn).toEqual([
          `${fn}: granted to authenticated`,
        ]);
      }
    }
    const call = 'perform public.require_shared_worker();';
    expect(part('claim_any_job').body).toContain(call);
    expect(audit(`${WITH_SHARED}\n${M6.replace(call, '')}`)).toEqual(
      expect.arrayContaining([
        'claim_any_job: does not call require_shared_worker()',
        'claim_any_job: touches jobs before require_shared_worker()',
      ])
    );
  });

  it('the definer allow-list is the earlier ones, the five and the helper', () => {
    const expected = [
      'add_artist_reach',
      'add_track_facts',
      'claim_any_job',
      'get_artist_reach',
      'get_track_facts',
      'is_shared_worker',
      'require_shared_worker',
      'storage_used',
      'worker_finish_job',
      'worker_release_job',
      'worker_set_progress',
    ];
    expect([...DEFINERS].sort()).toEqual(expected);
    const found = statements(normalise(migrations).sql)
      .filter((x) => /^create (?:or replace )?function /.test(x))
      .filter((x) => /\bsecurity definer\b/.test(x))
      .map(
        (x) =>
          new RegExp(`^create (?:or replace )?function ${NAME}\\(`).exec(x)![1]!
      )
      .sort();
    expect(found).toEqual(expected);
    expect(
      audit(
        `${WITH_WORKER}\ncreate function public.claim_any_job2() returns bigint language sql security definer set search_path = '' as $$ select 1; $$;`
      )
    ).toEqual(['claim_any_job2: security definer']);
  });

  it('claim_any_job pins the lock, the owner order and the two returned columns', () => {
    const { stmt, body } = part('claim_any_job');
    expect(body).toContain('for update skip locked');
    expect(stmt).toContain('returns table (id uuid, payload jsonb)');
    expect(body).toContain('returning j.id, j.payload;');
    const order = /order by (.*?) limit 1/.exec(body)![1]!;
    expect(order.indexOf('max(')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('claimed_at')).toBeLessThan(
      order.indexOf('priority desc')
    );
    expect(order).toContain('asc nulls first');
    const swap = (a: string, b: string) => {
      expect(M6).toContain(a);
      return audit(`${WITH_SHARED}\n${M6.replace(a, b)}`);
    };
    expect(swap('for update skip locked\n  )', 'for update\n  )')).toEqual([
      'claim_any_job: no for update skip locked',
    ]);
    expect(
      swap(
        'asc nulls first,\n      c.priority desc',
        'asc nulls first,\n      c.created_at, c.priority desc'
      )
    ).toEqual([
      "claim_any_job: order by does not start with the owner's latest claim",
    ]); // the owner's claim, then priority
    expect(
      swap(
        'asc nulls first,\n      c.priority desc',
        'desc,\n      c.priority desc'
      )
    ).toEqual([
      "claim_any_job: order by does not start with the owner's latest claim",
    ]);
    expect(
      swap(
        'returning j.id, j.payload;',
        'returning j.id, j.payload, j.owner_id;'
      )
    ).toEqual(['claim_any_job: returning more than id and payload']);
    expect(
      swap(
        'returns table (id uuid, payload jsonb)',
        'returns table (id uuid, payload jsonb, owner_id uuid)'
      )
    ).toEqual(['claim_any_job: returns more than id and payload']);
  });

  it('what the worker reads and writes is narrow, and a held row is filtered', () => {
    expect(part('worker_set_progress').stmt).toContain(
      'returns table (taken boolean, stop boolean)'
    );
    expect(part('worker_set_progress').body).toContain(
      'return query select false,'
    );
    expect(part('worker_set_progress').body).toContain(
      'return query select true, false;'
    );
    for (const fn of ['worker_finish_job', 'worker_release_job']) {
      expect(part(fn).stmt, fn).toMatch(/\breturns boolean\b/);
    }
    for (const fn of [
      'worker_set_progress',
      'worker_finish_job',
      'worker_release_job',
    ]) {
      const { body } = part(fn);
      expect(body, fn).toMatch(/\bstatus = 'claimed'/);
      expect(body, fn).toMatch(/\bclaimed_by = p_worker\b/);
      expect(body, fn).toMatch(/\bclaimed_by_user = auth\.uid\(\)/);
    }
    const fin = part('worker_finish_job').body;
    expect(fin).toContain("errcode = '22023'");
    expect(fin).toContain(
      "not in ('status', 'finished_at', 'result', 'error')"
    );
    expect(fin).toContain("not in ('done', 'failed')");
    expect(M6).not.toMatch(/\bowner_id\b[^;]*\breturns\b/i);
  });

  it('0006 leaves claim_job and every jobs policy alone', () => {
    const { sql } = normalise(M6);
    expect(sql).not.toMatch(
      /\b(?:create|alter|drop) policy\b.*?\bon (?:public\.)?"?jobs\b/
    );
    expect(sql).not.toMatch(/function (?:public\.)?"?claim_job\b/);
    expect(sql).not.toMatch(/\bpolicy\b.*\bjobs\b/);
    const jobsAlters = statements(sql).filter((x) =>
      /^alter table (?:public\.)?jobs\b/.test(x)
    );
    expect(jobsAlters).toEqual([
      'alter table public.jobs add column claimed_by_user uuid references auth.users (id) on delete set null',
    ]);
    // claim_job lives in 0002 and 0003 only, as before.
    const owners = files.filter((f) =>
      /function (?:public\.)?claim_job\b/.test(
        readFileSync(new URL(f, DIR), 'utf8')
      )
    );
    expect(owners).toEqual(['0002_jobs.sql', '0003_job_control.sql']);
  });
});
