import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The server rules audit (round 009, T013, FR-002): the database is the
 * only wall between two users who share the public key, so every table the
 * migrations create must keep each row to its owner, and `anon` must get
 * nothing. Reads the SQL as the owner applies it, in file order.
 */
const DIR = new URL('../../supabase/migrations/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
/** Every migration, comments dropped, lower case, one space between words. */
const sql = files
  .map((f) => readFileSync(new URL(f, DIR), 'utf8'))
  .join('\n')
  .replace(/--[^\n]*/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ');

const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map(
  (m) => m[1]!
);

/** The tables the RLS loop of 0001 covers. */
function loopTables(): string[] {
  const m = /foreach t in array array\[([^\]]*)\] loop(.*?)end loop;/.exec(sql);
  if (!m) return [];
  return [...m[1]!.matchAll(/'(\w+)'/g)].map((x) => x[1]!);
}

/** The body of that loop: what it does to each of those tables. */
function loopBody(): string {
  return /foreach t in array array\[[^\]]*\] loop(.*?)end loop;/.exec(sql)![1]!;
}

describe('server rules (supabase/migrations)', () => {
  it('reads the migrations, and they create the four known tables', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(tables.sort()).toEqual(
      ['dataset_rows', 'datasets', 'jobs', 'mixes'].sort()
    );
  });

  it('every table has an owner column filled by auth.uid()', () => {
    for (const t of tables) {
      const body = new RegExp(`create table public\\.${t} \\((.*?)\\);`).exec(
        sql
      )?.[1];
      expect(body, t).toMatch(
        /owner_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/
      );
    }
  });

  it('every table has row level security and the four owner policies', () => {
    expect(loopTables().sort()).toEqual([...tables].sort());
    const body = loopBody();
    expect(body).toContain(
      "'alter table public.%i enable row level security', t"
    );
    const policies: [string, string][] = [
      ['select', 'using \\(owner_id = auth\\.uid\\(\\)\\)'],
      ['insert', 'with check \\(owner_id = auth\\.uid\\(\\)\\)'],
      [
        'update',
        'using \\(owner_id = auth\\.uid\\(\\)\\) with check \\(owner_id = auth\\.uid\\(\\)\\)',
      ],
      ['delete', 'using \\(owner_id = auth\\.uid\\(\\)\\)'],
    ];
    for (const [cmd, rule] of policies) {
      expect(body, cmd).toMatch(
        new RegExp(
          `'create policy %i on public\\.%i for ${cmd} to authenticated ${rule}', t \\|\\| '_${cmd}', t`
        )
      );
    }
    // No other policy anywhere: a permissive one would widen these.
    expect(sql.match(/create policy/g)).toHaveLength(4);
    expect(sql).not.toMatch(/disable row level security/);
  });

  it('anon gets nothing: every default is revoked and nothing is granted', () => {
    expect(sql).toContain(
      'revoke all on all tables in schema public from anon;'
    );
    expect(sql).toContain(
      'revoke all on all functions in schema public from anon, public;'
    );
    expect(sql).toContain(
      'alter default privileges in schema public revoke all on tables from anon;'
    );
    expect(sql).toContain(
      'alter default privileges in schema public revoke all on functions from anon, public;'
    );
    const grants = sql.match(/grant [^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g).toMatch(/ to authenticated;$/);
    }
  });

  it('claim_job runs as the caller, so RLS keeps it to their rows', () => {
    const defs = [
      ...sql.matchAll(
        /create (?:or replace )?function public\.claim_job\(.*?\$\$(.*?)\$\$;/g
      ),
    ];
    expect(defs.length).toBeGreaterThan(0);
    for (const d of defs) {
      expect(d[0]).toContain('security invoker');
      expect(d[1]).toContain('owner_id = auth.uid()');
    }
  });

  it('the one definer function reads no table', () => {
    const definers = [
      ...sql.matchAll(
        /create (?:or replace )?function public\.(\w+)\([^$]*security definer[^$]*\$\$(.*?)\$\$;/g
      ),
    ];
    expect(definers.map((d) => d[1])).toEqual(['storage_used']);
    for (const d of definers) {
      expect(d[2]).not.toMatch(/public\./);
    }
  });
});
