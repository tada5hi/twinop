# Project Structure

## Directory Layout

```
twinop/
├── src/
│   ├── index.ts              # Barrel — re-exports all three modules wholesale
│   ├── types.ts              # TwinOp, TwinBody
│   ├── op.ts                 # op() — the effect-pair factory
│   └── run.ts                # runTwinAsync(), runTwinSync() — the two drivers
├── test/
│   ├── vitest.config.ts      # include: test/unit/**, v8 coverage, thresholds 80
│   └── unit/
│       ├── op.spec.ts        # the yielded shape, in isolation
│       └── run.spec.ts       # the driver contract (see testing.md)
├── .github/
│   ├── actions/{install,build}/action.yml
│   └── workflows/{main,release}.yml
├── eslint.config.js
├── commitlint.config.mjs
├── release-please-config.json + .release-please-manifest.json
├── tsconfig.json             # extends @tada5hi/tsconfig, noEmit
└── tsdown.config.ts          # entry src/index.ts, esm, dts, sourcemap
```

## Module Responsibilities

| Module        | Purpose                                                                                                                 |
|---------------|-------------------------------------------------------------------------------------------------------------------------|
| `types.ts`    | `TwinOp<T>` — one effect expressed twice (`{ async, sync }`). `TwinBody<R>` — the return type of a body generator.       |
| `op.ts`       | `op(asyncFn, syncFn)` — a one-effect generator, always consumed as `yield* op(...)`. Invokes neither thunk itself.       |
| `run.ts`      | `runTwinAsync` / `runTwinSync` — the driver loops. Identical control flow; each calls its own side's thunk.               |
| `index.ts`    | Barrel. Everything it re-exports is public API.                                                                          |

`op.ts` and `run.ts` both import from `types.ts`; nothing else imports anything. There is no dependency cycle to reason about and no module ordering constraint.

## Key Dependencies

**None.** `dependencies` is empty and must stay that way — the package is imported into other libraries' hot paths, and its whole premise is being small enough to be uncontroversial.

Dev-only: `tsdown`, `typescript`, `vitest`, `@vitest/coverage-v8`, `eslint` + `@tada5hi/eslint-config`, `husky`, `@tada5hi/{tsconfig,commitlint-config}`.

## Package Exports

```json
{
    "./package.json": "./package.json",
    ".": {
        "types": "./dist/index.d.mts",
        "import": "./dist/index.mjs"
    }
}
```

ESM-only (`"type": "module"`, no CJS output). Only `dist` is published (`files: ["dist"]`).

## Deliberately Absent

Agents are likely to reach for these; each was considered and rejected.

| Not here | Why |
|---|---|
| A `runTwin(body, mode)` combined driver | The two call sites are already the sync/async split; a mode flag just moves the branch into the consumer and forces a union return type. |
| A parallel / batching driver | A generator is sequential by construction. Expressing "launch all, then settle" needs the body to yield *batches*, which is a different protocol — and consumers that need it (e.g. validup's `runParallel`) keep a purpose-built loop and share the pure helpers instead. |
| Thenable rejection in `runTwinSync` | Whether a sync surface tolerates a thenable-returning thunk is a consumer policy, not a protocol rule. Consumers throw their own typed error from inside the sync thunk (validup's `RunSyncViolationError`). |
| A `TwinOp` runtime guard | The type is structural and never crosses a trust boundary — only `op()` constructs one, and only the drivers read one. |
| Cancellation / `AbortSignal` plumbing | Threads through the body as an ordinary closure variable. Nothing in the protocol needs to know about it. |
