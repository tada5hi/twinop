/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TwinOp } from './types';

/**
 * Perform one effect inside a twin body.
 *
 * ```ts
 * const content = yield* op(
 *     () => readFile(path, 'utf-8'),
 *     () => readFileSync(path, 'utf-8'),
 * );
 * ```
 *
 * Always delegate with `yield*`, never a bare `yield` — the delegation is what
 * carries the effect's result type back to the call site. A bare `yield` types
 * as `any` and silently loses that.
 *
 * @param asyncFn - Performs the effect asynchronously. May return a bare value.
 * @param syncFn  - Performs the same effect synchronously.
 */
export function* op<T>(
    asyncFn: () => T | Promise<T>,
    syncFn: () => T,
) : Generator<TwinOp<T>, T, T> {
    return yield { async: asyncFn, sync: syncFn };
}
