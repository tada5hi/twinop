<p align="center">
    <img src="./assets/logo.svg" alt="twinop" width="128" height="128" />
</p>

<h1 align="center">twinop</h1>

<p align="center">
    <b>Derive parallel sync + async APIs from one shared generator body.</b><br>
    Write the algorithm once as a generator that yields effect pairs; two tiny drivers<br>
    execute the side each public function stands for, so <code>read()</code> and <code>readSync()</code> cannot drift.
</p>

<p align="center">
    <a href="https://npmjs.com/package/twinop"><img src="https://badge.fury.io/js/twinop.svg" alt="npm version" /></a>
    <a href="https://github.com/Tada5hi/twinop"><img src="https://github.com/Tada5hi/twinop/workflows/CI/badge.svg" alt="Master Workflow" /></a>
    <a href="https://codecov.io/gh/Tada5hi/twinop"><img src="https://codecov.io/gh/Tada5hi/twinop/branch/master/graph/badge.svg" alt="codecov" /></a>
    <a href="https://snyk.io/test/github/Tada5hi/twinop?targetFile=package.json"><img src="https://snyk.io/test/github/Tada5hi/twinop/badge.svg?targetFile=package.json" alt="Known Vulnerabilities" /></a>
    <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits" /></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#how-it-works">How it works</a>
    ·
    <a href="#api">API</a>
    ·
    <a href="#notes">Notes</a>
</p>

---

## Why twinop?

Some libraries have to ship both `read()` and `readSync()`, `locate()` and `locateSync()`, `run()` and `runSync()`, because consumers like config loaders, CLIs and plugin systems frequently can't `await`. Writing that pair by hand means maintaining two copies of everything *around* the I/O: cache bookkeeping, error mapping, option precedence, ordering. The copies drift, and when they do the two variants quietly disagree about what your library does.

`twinop` removes the second copy. You write the logic **once** as a generator that yields *effect pairs*, and two tiny drivers execute the side each public function stands for. One body cannot drift from itself.

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [API](#api)
- [Notes](#notes)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install twinop --save
```

## Usage

Write the logic once as a **body**, a generator that performs each effect through `op(asyncThunk, syncThunk)`:

```typescript
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { op, runTwinAsync, runTwinSync, type TwinBody } from 'twinop';

function* readJsonBody(path: string) : TwinBody<unknown> {
    const content = yield* op(
        () => readFile(path, 'utf-8'),
        () => readFileSync(path, 'utf-8'),
    );

    try {
        return JSON.parse(content);
    } catch (e) {
        // Runs identically in both variants, written once.
        throw new Error(`${path} is not valid JSON`, { cause: e });
    }
}
```

Then expose the pair as two thin wrappers:

```typescript
export function readJson(path: string) : Promise<unknown> {
    return runTwinAsync(readJsonBody(path));
}

export function readJsonSync(path: string) : unknown {
    return runTwinSync(readJsonBody(path));
}
```

That is the whole pattern. Everything that is not I/O (the parse, the error message, any caching or option resolution you add later) exists exactly once.

### Composition

Bodies compose with `yield*`, so a higher-level body can call a lower-level one without either knowing which side it will be driven on:

```typescript
function* readConfigBody(dir: string) : TwinBody<Config> {
    const raw = yield* readJsonBody(`${dir}/config.json`);
    return normalize(raw);
}
```

### Errors behave the same on both sides

An effect failure is thrown back into the body at the `yield` site, so `try` / `catch` / `finally` inside a body reads and runs the same regardless of driver:

```typescript
function* body(path: string) : TwinBody<string> {
    try {
        return yield* op(
            () => readFile(path, 'utf-8'),
            () => readFileSync(path, 'utf-8'),
        );
    } catch {
        return '';   // the fallback is written once, and applies to both variants
    }
}
```

An error the body doesn't catch propagates out of the driver: as a rejected promise from `runTwinAsync`, as a throw from `runTwinSync`.

### Asymmetric effects

The two thunks only have to *mean* the same thing, not be shaped alike. Anything the sync side genuinely cannot do belongs in the sync thunk:

```typescript
const value = yield* op(
    () => child.run(input),
    () => {
        if (typeof child.runSync !== 'function') {
            throw new TypeError('nested unit does not support synchronous execution');
        }
        return child.runSync(input);
    },
);
```

The check lives where it applies, and the async path can't accidentally trip over it.

## How it works

A body is a generator whose yielded values are `TwinOp`s, `{ async, sync }` thunk pairs. Each driver loops the generator, calls the thunk for its own side, and threads the result back in via `next(result)`. On failure it re-enters the body with `throw(error)`, which is what makes in-body `try`/`catch`/`finally` behave identically in both variants.

Always delegate with `yield*` rather than a bare `yield`: the delegation is what carries the effect's result type back to the call site.

## API

| Export | Kind | Purpose |
|---|---|---|
| `op(asyncFn, syncFn)` | generator fn | Perform one effect: `const x = yield* op(a, s)` |
| `runTwinAsync(body)` | `Promise<R>` | Drive the async side |
| `runTwinSync(body)` | `R` | Drive the sync side |
| `TwinOp<T>` | type | `{ async: () => T \| Promise<T>, sync: () => T }` |
| `TwinBody<R>` | type | `Generator<TwinOp<any>, R, any>`, a body's return type |

## Notes

- **The async thunk may return a bare value.** `TwinOp.async` is `() => T | Promise<T>`, so an effect that is inherently synchronous (or a user-supplied callback that *might* be) can be handed to both slots unwrapped. `runTwinAsync` awaits either shape.
- **`runTwinSync` creates no promise and queues no microtask.** If a sync thunk returns a thenable, the driver hands it to the body as-is; enforce your own policy there if a synchronous surface must reject it.
- **Drive each body instance once.** A generator is single-use; call the body function again for a second run.
- **Zero dependencies, ESM-only.**

## Contributing

Before starting to work on a pull request, it is important to review the guidelines for
[contributing](./CONTRIBUTING.md) and the [code of conduct](./CODE_OF_CONDUCT.md).
These guidelines will help to ensure that contributions are made effectively and are accepted.

## License

Made with 💚

Published under [MIT License](./LICENSE).
