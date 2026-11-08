import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
/** Definer functions allowed, each reading no table. */
const DEFINERS = ['storage_used'];
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
    const m = new RegExp(
      `^create table (?:if not exists )?${NAME} \\((.*)\\)$`
    ).exec(s);
    if (!m) {
      findings.push(`unrecognised table statement: ${s.slice(0, 60)}`);
      continue;
    }
    tables.push(m[1]!);
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
      if (m && cmd && new RegExp(`^${RULE[cmd]}$`).test(m[3]!))
        grant(m[1]!, cmd);
      else findings.push(`not an owner policy: ${s.slice(0, 60)}`);
    }
  }
  for (const t of tables) {
    if (!rls.has(t)) findings.push(`${t}: row level security not enabled`);
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
    if (definer && /\bpublic\./.test(body)) {
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
  it('reads the migrations, with the four known tables', () => {
    expect(files.length).toBeGreaterThan(0);
    const created = [
      ...normalise(migrations).sql.matchAll(/create table (?:public\.)?(\w+)/g),
    ].map((m) => m[1]);
    expect(created.sort()).toEqual([
      'dataset_rows',
      'datasets',
      'jobs',
      'mixes',
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
create function public.storage_used() returns bigint language sql security definer
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
