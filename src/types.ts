/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * One effect, expressed twice: an async thunk and a sync thunk that perform the
 * same operation.
 *
 * The async side may return a bare value as well as a promise. Callers whose
 * effect is inherently synchronous — or whose effect is a user-supplied callback
 * that *might* be synchronous — can hand the same function to both slots
 * without a `Promise.resolve()` wrap; {@link runTwinAsync} awaits either shape.
 */
export type TwinOp<T = unknown> = {
    async: () => T | Promise<T>,
    sync: () => T,
};

/**
 * A twin body: a generator that yields {@link TwinOp}s and returns `R`.
 *
 * The third type parameter of `Generator` is the type sent back in via
 * `next(value)` — deliberately `any`, because a single body yields ops of
 * differing `T`. Per-effect typing is recovered at the `yield*` site by
 * {@link op}, so `const x = yield* op(a, s)` types `x` precisely.
 */
export type TwinBody<R> = Generator<TwinOp<any>, R, any>;
