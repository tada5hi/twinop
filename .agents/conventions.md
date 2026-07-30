# Conventions

## Tooling

| Tool                        | Purpose                                                        |
|-----------------------------|----------------------------------------------------------------|
| `tsdown`                    | Build — `src/index.ts` → `dist/index.mjs` + `.d.mts` + sourcemap |
| `tsc --noEmit`              | Typecheck (the build does **not** typecheck — run this separately) |
| `vitest`                    | Test runner                                                    |
| `eslint` (v10 flat config)  | Lint, via `@tada5hi/eslint-config`                             |
| `commitlint`                | Commit message validation, via `@tada5hi/commitlint-config`     |
| `husky`                     | Git hook installer (`prepare` script)                          |
| `release-please`            | Version bump + changelog + tag on push to `master`             |

## Workflow

After any change: `npx tsc --noEmit`, `npm run test`, `npm run lint`. All three are fast (well under a second each) — there is no excuse for skipping one.

When changing anything in `src/`, also check:

1. **Both drivers.** `runTwinAsync` and `runTwinSync` are structurally identical by design. A change to one almost always belongs in the other; asymmetry is the bug class this package exists to prevent.
2. **The README.** It *is* the user-facing documentation — there is no docs site. Public behaviour changes must land in the same commit.
3. **`.agents/architecture.md`.** It records *why* the protocol has its shape. A new design decision goes in the "Core Design Decisions" list; do not leave the rationale in a commit message.
4. **The three reference consumers** — `tada5hi/locter`, `tada5hi/ilingo` (`packages/fs`), `tada5hi/validup`. Anything not purely additive breaks them. Check before, not after.

## Code Style

- **Module format**: ESM only (`"type": "module"`). No CJS output.
- **Indentation**: 4 spaces, LF, UTF-8, final newline (`.editorconfig`).
- **Quotes / commas / semicolons**: single quotes, trailing commas, semicolons (inherited from `@tada5hi/eslint-config`).
- **Space before the return-type colon**: `function op<T>(…) : Generator<…>` — matches the sibling repos.
- **Copyright header** on every `.ts` / `.js` / `.mjs` file, including `test/` and config files:

  ```ts
  /*
   * Copyright (c) <year>.
   * Author Peter Placzek (tada5hi)
   * For the full copyright and license information,
   * view the LICENSE file that was distributed with this source code.
   */
  ```

- **`eslint-disable` needs a reason.** Every suppression in this repo has a comment above it explaining what the rule is wrong about (see the deliberate non-`Error` throws and the no-effect body in `run.spec.ts`). A bare disable is not acceptable in a package this small.

## Naming Conventions

| Pattern            | Rule                                                                     |
|--------------------|--------------------------------------------------------------------------|
| Types              | `Twin`-prefixed and PascalCase: `TwinOp`, `TwinBody`. No `I` prefix — nothing implements them, they are structural type aliases. |
| Drivers            | `runTwin<Side>` — `runTwinAsync`, `runTwinSync`                            |
| Body factories     | Consumers name them `<verb>Body` (`locateBody`, `readJsonBody`, `runBody`); the README and all three reference consumers follow this. Keep examples consistent with it. |
| Files              | kebab-case, named after the concept they own (`op.ts`, `run.ts`, `types.ts`) |

## File Organization

- Exported **types** live in `src/types.ts`.
- `src/index.ts` is a barrel that re-exports each module wholesale. **Everything it re-exports is public API** — see the stability note in [AGENTS.md](../AGENTS.md#stability). There are no internal modules; if one is ever added, it must be excluded from the barrel deliberately and noted here.
- One concept per file. `op.ts` and `run.ts` stay separate even though they total ~90 lines: they are the two halves of the protocol (body-side and driver-side) and consumers import them for different reasons.

## TypeScript

- `tsconfig.json` extends `@tada5hi/tsconfig`, overriding: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`, `allowImportingTsExtensions: true`.
- `include` is `src/**/*` only — `test/` is typechecked by Vitest at run time.
- **Do not assume `strictNullChecks`.** Consumers compile with it off (ilingo's `packages/fs`), which is why `run.ts` casts `step.value` and `step.value as R` explicitly instead of relying on `IteratorResult`'s `done` discriminant to narrow. Removing those casts would silently break those consumers.
- Never commit `dist/`.

## Pre-commit Hooks

`prepare: husky` runs on `npm install` and installs the `.husky/_/` stubs. No project-level hooks (e.g. `.husky/pre-commit`) are committed. If you add one, place it at `.husky/<hook-name>`, not under `_/`.

## Commit Convention

**Conventional Commits**, enforced by commitlint:

```
<type>[optional scope]: <description>
```

Types used: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, plus `chore(deps)` / `fix(deps)` for dependency bumps. Do not edit `CHANGELOG.md` by hand — release-please owns it.

## Build Output

`npm run build` emits to `dist/`: `index.mjs`, `index.mjs.map`, `index.d.mts`. Only `dist` is published (`files: ["dist"]`). Around 2 kB unminified — if a change makes that materially larger, question the change.

## Release Process

release-please (`release-type: node`, `include-v-in-tag: true`, `bump-minor-pre-major: true`, single root package). It opens a release PR on push to `master`; merging it tags and triggers the publish job in `.github/workflows/release.yml`.

Pre-1.0, `bump-minor-pre-major` means a breaking change bumps the minor. Given three in-house consumers depend on this, land breaking changes only with a plan for all three.

## Dependencies

**`dependencies` must stay empty.** This package is imported into other libraries' internals; a transitive dependency here propagates everywhere. Anything that feels like it needs a dependency belongs in the consumer's body, not in the protocol.

## Best Practices

- Study the three reference consumers before changing the protocol — they are the only evidence of what it actually needs to support.
- Prefer adding a *test* that pins a guarantee over adding an *export* that enforces it. This package's leverage comes from being small.
- Before adding new code, read the surrounding patterns and match them.
