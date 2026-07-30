# Testing

## Setup

- **Runner**: Vitest 4, v8 coverage provider
- **Test location**: `test/unit/**/*.{test,spec}.{js,ts}`
- **Config**: `test/vitest.config.ts`
- **Prerequisite**: `npm install` only — no build step, no fixtures, no external services

`globals` is **not** enabled. Import `describe` / `it` / `expect` from `vitest` explicitly in every spec.

## Running Tests

```bash
npm run test                                          # all specs
npm run test -- test/unit/run.spec.ts                 # a single file
npm run test -- -t 'should re-enter effect errors'    # a single case by name
npm run test:coverage                                 # + v8 coverage
```

## Layout

| File                    | Covers                                                                     |
|-------------------------|----------------------------------------------------------------------------|
| `test/unit/op.spec.ts`  | `op()` alone: the yielded `{ async, sync }` shape, that it invokes neither thunk, that it returns what the driver sends back, and that it completes after exactly one effect |
| `test/unit/run.spec.ts` | The driver contract — the bulk of the suite. Grouped into a top level plus `error re-entry` and `composition` describes |

Specs import from the package source, never `dist`:

```typescript
import { op, runTwinAsync, runTwinSync, type TwinBody } from '../../src';
```

## Testing Philosophy

Coverage is 100% and trivially so — the package is 17 statements. **Coverage is not the signal here; the contract corners are.** The protocol's value is that subtle guarantees hold, and each one is a named test. Treat these as a specification, not as regression noise:

| Guarantee | Why it matters |
|---|---|
| Each driver runs only its own side's thunk | The other side must never execute — it may be unavailable in the caller's environment |
| The async thunk may return a bare value | Decision 4 in [architecture.md](architecture.md#4-twinopasync-returns-t--promiset); a consumer's callback may legitimately be sync |
| A synchronous throw from the *async* thunk re-enters | Not just rejections — a thunk can throw before returning a promise |
| In-body `try` / `catch` catches effect failures, symmetrically | The core claim of the protocol |
| In-body `finally` runs on both sides | Cleanup must not depend on the driver |
| The body keeps running after a caught effect error | Recovery paths (fallbacks, retries) are written once |
| A body may translate and rethrow | Consumers layer their own error types on top |
| Non-`Error` throws propagate verbatim | The drivers must not normalise or wrap |
| An error the body raises itself propagates | The driver isn't a catch-all |
| `yield*` delegation composes, and inner errors reach the outer `catch` | Bodies must nest |
| `runTwinSync` queues no microtask | Asserted by checking an already-queued `.then` has *not* run |
| A spent body returns `undefined` rather than throwing | Documented single-use semantics |
| A body that yields nothing still returns its value | Degenerate case; needs an `eslint-disable require-yield` |

**Every new test must assert the async and sync sides.** A guarantee proven on one driver only is exactly the drift this package exists to prevent — if a case genuinely applies to one side, say why in a comment (see the bare-value and sync-throw cases).

Do not use `vi.fn()` / `vi.mock()`. Effects here are plain closures; a counter variable and a pushed array say more and couple to nothing.

## Code Coverage

```bash
npm run test:coverage
```

Thresholds (`test/vitest.config.ts`): branches / functions / lines / statements all **80**. Actual is 100% across the board. Collected from `src/**/*.{ts,tsx,js,jsx}`. A drop below 100 means an untested branch was added — investigate rather than lowering the threshold.

## CI Pipeline

`.github/workflows/main.yml` runs install → build → (lint, test) on pushes and PRs to the tracked branches. CI does not gate on coverage.

## Writing New Tests

1. Put the file in `test/unit/` with a `.spec.ts` extension.
2. Import `describe` / `it` / `expect` from `vitest`, and the subject from `../../src`.
3. Define the body as a local `function*` inside the `it` — bodies are cheap and locality beats sharing here.
4. Drive it with **both** `runTwinAsync` and `runTwinSync`, and assert both.
5. Remember a generator is single-use: call `body()` again per driver.
6. Run `npm run test` and `npm run lint`.
