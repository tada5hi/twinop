# Architecture

## Overview

The whole package is one idea: **a sync/async API pair should be two schedulers over one algorithm, not two algorithms.**

The problem it solves is not the I/O call — swapping `readFile` for `readFileSync` is trivial. It's everything *around* the I/O: cache bookkeeping, error mapping, option precedence, ordering, output merging. Hand-written twins duplicate all of it, and the duplication drifts silently, because nothing forces the two copies to agree. When they drift, a library's `foo()` and `fooSync()` quietly disagree about what the library does.

`twinop` inverts the shape. The algorithm becomes a **body** — a generator that expresses its impure edges as *pairs* of thunks. Two drivers walk the body and execute the side they stand for. There is nothing left to keep in sync, because there is only one copy.

```
                       ┌─────────────────────────┐
   foo()  ────────────►│  runTwinAsync(body())   │──┐
                       └─────────────────────────┘  │   ┌────────────────┐
                                                    ├──►│  the body      │
                       ┌─────────────────────────┐  │   │  (one copy of  │
   fooSync()  ────────►│  runTwinSync(body())    │──┘   │  the algorithm)│
                       └─────────────────────────┘      └────────────────┘
```

## Core Design Decisions

### 1. Generators, not an effects-record parameter

The obvious alternative is passing the effects in: `locate(pattern, { glob: fg })` vs `locate(pattern, { glob: fg.sync })`. It is simpler, and it fails on the return type — the body would have to be generic over "is this `T` or `Promise<T>`", and every intermediate value would carry that taint. `await`-ing a maybe-promise inside the body forces the whole body async, which defeats the point.

A generator moves the decision out of the type system and into the driver. The body reads as straight-line synchronous code; the driver decides what "perform this effect" means. `yield*` delegation preserves per-effect types exactly.

### 2. Effects are yielded in **pairs**, not as descriptors

An alternative protocol yields a *description* of the effect (`{ kind: 'readFile', path }`) and lets the driver interpret it. That needs a registry, makes the effect set closed, and turns every new effect into a protocol change.

Yielding two closures keeps the effect set open and the protocol fixed at one type. It also means the two sides only have to *mean* the same thing, not be shaped alike — which is what makes asymmetric effects (below) work.

### 3. Errors re-enter the body via `Generator.throw`

This is the decision that makes the abstraction honest rather than leaky. The driver does not catch-and-return; it throws the failure back in **at the `yield` site**:

```typescript
try {
    result = await (step.value as TwinOp).async();
} catch (e) {
    step = body.throw(e);     // ← re-entry, not a return value
    continue;
}

step = body.next(result);
```

Consequences the consumer relies on:

- `try` / `catch` around a `yield*` in the body catches effect failures.
- `finally` runs.
- A body can catch, recover, and yield *more* effects.
- A body can translate the error and rethrow; the wrapper surfaces from the driver.
- An uncaught error propagates out — as a rejected promise from `runTwinAsync`, as a throw from `runTwinSync`.

Without re-entry, every body would need `if (result.ok)` after every effect, and the sync/async pair would once again diverge in its error handling.

### 4. `TwinOp.async` returns `T | Promise<T>`

The async slot accepts a bare value as well as a promise, so:

- an inherently synchronous effect can pass the same function to both slots;
- a **user-supplied callback that might be either** (validup's `Validator`) needs no `Promise.resolve()` wrap.

`runTwinAsync` awaits either shape, so this is free. This was the one deviation validup made from the original hand-copied version, and it is the union the extracted package adopts.

### 5. Explicit `as` casts in the drivers

`IteratorResult`'s `done` discriminant only narrows `value` under `strictNullChecks`. The casts in `run.ts` keep the drivers correct for consumers compiling without it (ilingo's `packages/fs` is one). This is precisely the class of divergence the extraction removes: consumers write bodies, never drivers, so they never inherit the drivers' compiler-strictness assumptions.

## The Pattern

### Body

A body is a generator returning `TwinBody<R>`. Effects go through `op`:

```typescript
import { op, type TwinBody } from 'twinop';

function* readJsonBody(path: string) : TwinBody<unknown> {
    const content = yield* op(
        () => readFile(path, 'utf-8'),      // async side
        () => readFileSync(path, 'utf-8'),  // sync side
    );

    try {
        return JSON.parse(content);
    } catch (e) {
        throw new Error(`${path} is not valid JSON`, { cause: e });
    }
}
```

**Always `yield*`, never a bare `yield`.** The delegation is what carries the effect's result type to the call site; a bare `yield` types as `any`.

### Drivers

Two thin wrappers, and they are the *only* place the sync/async distinction exists:

```typescript
export function readJson(path: string) : Promise<unknown> {
    return runTwinAsync(readJsonBody(path));
}

export function readJsonSync(path: string) : unknown {
    return runTwinSync(readJsonBody(path));
}
```

### Composition

Bodies delegate to bodies. Neither knows which side it will be driven on:

```typescript
function* readConfigBody(dir: string) : TwinBody<Config> {
    const raw = yield* readJsonBody(`${dir}/config.json`);
    return normalize(raw);
}
```

### Asymmetric effects

Anything only one side must enforce belongs in that side's thunk. This is a feature, not a workaround — the check lives where it applies and the other path cannot trip over it:

```typescript
const value = yield* op(
    () => child.run(input),
    () => {
        if (typeof child.runSync !== 'function') {
            throw new RunSyncViolationError('nested unit does not implement runSync');
        }
        return child.runSync(input);
    },
);
```

(Real example: validup's `Container.runBody` puts both of its `runSync`-only structural probes — missing `runSync`, thenable return — in sync thunks. The async driver cannot produce either.)

## Data Flow

```
Input:
  └── a TwinBody<R> instance (a started-but-unadvanced generator)

Driver loop:
  1. step = body.next()
  2. while !step.done:
       a. call step.value.async()  (awaited)  |  step.value.sync()
       b. on success → step = body.next(result)
       c. on throw   → step = body.throw(error)
  3. return step.value as R

Output:
  └── Promise<R> (async driver) or R (sync driver)
```

Both drivers are ~15 lines and structurally identical. If a change touches one, it almost certainly has to touch the other — that symmetry is the invariant to protect.

## Error Handling

- The drivers **never swallow** anything. Every failure either re-enters the body or propagates out.
- No error type is defined or wrapped by this package. Consumers throw and catch their own.
- Non-`Error` throws pass through verbatim (pinned by a test).
- A body is a generator, so it is **single-use**. Driving a spent instance returns `undefined` immediately rather than throwing — call the body function again for a second run.

## File Structure

```text
src/types.ts   → TwinOp, TwinBody                  (the protocol)
src/op.ts      → op()                              (the body-side API)
src/run.ts     → runTwinAsync(), runTwinSync()     (the driver-side API)
src/index.ts   → barrel                            (the public surface)
```
