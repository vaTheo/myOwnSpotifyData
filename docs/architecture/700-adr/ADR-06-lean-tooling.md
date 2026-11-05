# ADR-06 — Lean tooling: the three checks and nothing else

> **Status**: Accepted
> **Date**: 2026-09-04, reaffirmed 2026-11-05 (no docs checker)

## Context

A one-owner app. The owner explicitly declined commit hooks, Dependabot, branch protection and PR templates, and wants the minimum that
solves each request. On 2026-11-05 the owner also declined the Armtek docs checker (`check-docs.ts`) and a generated `INDEX.md`.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Armtek-style enforcement | hooks, templates, a docs checker in CI | rules enforced by machines | tooling to maintain for one owner |
| Three checks *(chosen)* | `yarn typecheck`, `yarn lint`, `yarn test` locally and in CI | little to maintain | docs rules are kept by hand |

## Decision

CI runs `yarn install --frozen-lockfile`, `typecheck`, `lint` and `test`, then deploys `main`. No other gate. Dependencies are pinned where
an upgrade breaks the chain: `typescript` `~6.0.3` (typescript-eslint 8.x supports TS `<6.1`; TS 7 crashes `yarn lint`), and `vite` is
an explicit devDependency (Vitest declares it as a peer and yarn classic does not install peers). Tests run in Vitest's Node environment;
IndexedDB tests use `fake-indexeddb/auto`; there are no DOM or component tests. Prettier is available (`yarn format`) but not enforced.

## Consequences

**Positive:** nothing to maintain beyond the code.

**Negative / watch for:** docs links and budgets are checked by hand ([Contributing](../../dev-guide/000-contributing.md), "Documentation");
never bump the pinned packages blindly; a new dependency is a decision for the owner.

## Links

- [Contributing](../../dev-guide/000-contributing.md)
- [How the app works](../000-how-it-works.md) §15
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
