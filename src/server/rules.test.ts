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
/** Definer functions allowed: storage_used reads no table, the other two read only their shared table. */
const DEFINERS = ['storage_used', 'get_track_facts', 'get_artist_reach'];
/**
 * The two shared tables (round 014, ADR-15): public facts with no owner,
 * insert-only for `authenticated`, read only through a definer function.
 * The one exception to the owner rule; a name added here is a decision.
 */
const SHARED_TABLES = ['shared_track_facts', 'shared_artist_reach'];
/** Each shared read function and the one table it may read. */
const SHARED_READERS: Record<string, string> = {
  get_track_facts: 'shared_track_facts',
  get_artist_reach: 'shared_artist_reach',
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
  const sharedInserts = new Map<string, number>();
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
        `^create policy "?\\w+"? on ${NAME} for (select|insert|update|delete) to authenticated (.*)$`
      ).exec(s);
      const cmd = m?.[2] as (typeof CMDS)[number] | undefined;
      const ok = (t: string, c: (typeof CMDS)[number], rule: string) =>
        SHARED_TABLES.includes(t)
          ? c === 'insert' && rule === 'with check (true)'
          : new RegExp(`^${RULE[c]}$`).test(rule);
      if (m && cmd && ok(m[1]!, cmd, m[3]!)) {
        if (SHARED_TABLES.includes(m[1]!)) {
          sharedInserts.set(m[1]!, (sharedInserts.get(m[1]!) ?? 0) + 1);
        }
        grant(m[1]!, cmd);
      } else findings.push(`not an owner policy: ${s.slice(0, 60)}`);
    }
  }
  for (const t of tables) {
    if (!rls.has(t)) findings.push(`${t}: row level security not enabled`);
    if (SHARED_TABLES.includes(t)) {
      if ((sharedInserts.get(t) ?? 0) !== 1)
        findings.push(`${t}: not exactly one insert policy`);
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
    const own = SHARED_READERS[name];
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
    } else if (definer && /\bpublic\./.test(body)) {
      findings.push(`${name}: definer reads a table`);
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
  it('reads the migrations, with the six known tables', () => {
    expect(files.length).toBeGreaterThan(0);
    const created = [
      ...normalise(migrations).sql.matchAll(/create table (?:public\.)?(\w+)/g),
    ].map((m) => m[1]);
    expect(created.sort()).toEqual([
      'dataset_rows',
      'datasets',
      'jobs',
      'mixes',
      'shared_artist_reach',
      'shared_track_facts',
    ]);
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
const WITH_SHARED = `${BASE}\n${SHARED}`;

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
    const sql = WITH_SHARED.replace(
      'for insert to authenticated with check (true);\ncreate policy shared_artist',
      'for insert to authenticated with check (auth.uid() is not null);\ncreate policy shared_artist'
    );
    expect(audit(sql)).toHaveLength(2); // the bad policy, and no insert policy left
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
    expect(audit(WITH_SHARED.replace(revoke, ''))).toEqual([
      'shared_track_facts: default privileges not revoked from authenticated',
      'shared_artist_reach: default privileges not revoked from authenticated',
    ]);
    const half = revoke.replace(
      'from authenticated, anon, public',
      'from anon'
    );
    expect(audit(WITH_SHARED.replace(revoke, half))).toHaveLength(2);
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
    ).toEqual(['shared_track_facts: not exactly one insert policy']);
  });

  it('a user or owner column on a shared table', () => {
    for (const col of [
      'owner_id uuid',
      'user_id uuid',
      'user text',
      'owner_id uuid not null default auth.uid() references auth.users (id)',
    ]) {
      const sql = WITH_SHARED.replace(
        'added_at timestamptz not null default now(),\n  check (major',
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
    const other = WITH_SHARED.replace(
      'from public.shared_track_facts f',
      'from public.shared_track_facts f, public.notes n'
    );
    expect(audit(other)).toEqual(['get_track_facts: definer reads notes']);
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
    expect(
      audit(
        `${BASE}\n${SHARED.replaceAll(
          "security definer set search_path = ''",
          'security definer'
        )}`
      )
    ).toEqual([
      "get_track_facts: definer without search_path = ''",
      "get_artist_reach: definer without search_path = ''",
    ]);
    expect(audit(`${BASE}\n${SHARED.replaceAll('> 200', '> 2000')}`)).toEqual([
      'get_track_facts: no 200 id cap',
      'get_artist_reach: no 200 id cap',
    ]);
    expect(
      audit(
        WITH_SHARED.replace(
          'grant execute on function public.get_artist_reach(ids text[]) to authenticated;',
          ''
        )
      )
    ).toEqual(['get_artist_reach: not granted to authenticated']);
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
});
