<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# twinop — Agent Guide

`twinop` lets a library ship a parallel **sync + async** API pair (`read` / `readSync`, `locate` / `locateSync`, `run` / `runSync`) without writing the logic twice. The author writes one generator — a **body** — that performs each effect through `op(asyncThunk, syncThunk)`; the two drivers `runTwinAsync` / `runTwinSync` execute the side the public function stands for. Effect errors are re-entered into the body via `Generator.throw`, so `try` / `catch` / `finally` inside a body behaves identically under both drivers. Bodies compose with `yield*`.

The package is **three source files and five exports**. There is no runtime state, no configuration, no I/O and no dependency. Its whole value is that the contract is subtle — result threading, error re-entry, `finally` semantics, single-use generators — and lives in exactly one tested place instead of being hand-copied per repo.

It was extracted from three hand-copied, already-drifted implementations in [`tada5hi/locter`](https://github.com/tada5hi/locter), [`tada5hi/ilingo`](https://github.com/tada5hi/ilingo) (`packages/fs`) and [`tada5hi/validup`](https://github.com/tada5hi/validup). Those repos are the reference consumers — consult them for real-world bodies.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build          # tsdown → dist/index.mjs + dist/index.d.mts
npm run test           # vitest
npm run test:coverage  # vitest + v8 coverage (thresholds at 80)
npm run lint
npm run lint:fix
npx tsc --noEmit       # typecheck only (the build does not typecheck)
```

- **Node.js**: `>=22.0.0`
- **Package manager**: `npm` (single package, no workspaces)
- **Build**: `tsdown` → ESM-only, with `.d.mts` declarations and sourcemaps
- **Test runner**: Vitest 4 (no `globals` — import `describe`/`it`/`expect` explicitly)
- **Lint**: ESLint v10 flat config, `@tada5hi/eslint-config`
- **Release**: release-please (`release-type: node`, single root package)

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — The three source modules, the public surface, and what is deliberately absent
- **[Architecture](.agents/architecture.md)** — The twin protocol: driver loop, error re-entry, composition, and the design decisions behind the `TwinOp` shape
- **[Testing](.agents/testing.md)** — Vitest setup and the contract corners every change must keep pinned
- **[Conventions](.agents/conventions.md)** — Code style, the copyright header, commit format, and release tooling

## Stability

The public surface is **frozen at five names**: `op`, `runTwinAsync`, `runTwinSync`, `TwinOp`, `TwinBody`. This is a library for library authors — a new export here propagates into every consumer's internals. Adding one needs a reason that cannot be served by a body in the consumer.

## Commits, Issues & Pull Requests

- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
