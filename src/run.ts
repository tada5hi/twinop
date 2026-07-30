/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TwinBody, TwinOp } from './types';

/**
 * Drive a twin body's **async** side: each yielded op's `async` thunk is
 * awaited, and its result is threaded back into the body.
 *
 * A rejection is re-entered at the `yield` site via `Generator.throw`, so
 * `try` / `catch` / `finally` written inside the body runs exactly as it reads —
 * identically to how the same body behaves under {@link runTwinSync}.
 *
 * An error the body does not catch propagates out of this call, as does anything
 * the body throws on its own.
 */
export async function runTwinAsync<R>(body: TwinBody<R>) : Promise<R> {
    // `IteratorResult`'s `done` discriminant only narrows `value` under
    // `strictNullChecks`; the casts keep this correct for consumers compiling
    // without it.
    let step = body.next();
    while (!step.done) {
        let result : unknown;
        try {
            result = await (step.value as TwinOp).async();
        } catch (e) {
            step = body.throw(e);
            continue;
        }

        step = body.next(result);
    }

    return step.value as R;
}

/**
 * Drive a twin body's **sync** side. Mirror of {@link runTwinAsync} with the
 * `sync` thunk called directly — no promise is created and no microtask is
 * introduced anywhere, which is the whole point of having a synchronous
 * surface.
 */
export function runTwinSync<R>(body: TwinBody<R>) : R {
    let step = body.next();
    while (!step.done) {
        let result : unknown;
        try {
            result = (step.value as TwinOp).sync();
        } catch (e) {
            step = body.throw(e);
            continue;
        }

        step = body.next(result);
    }

    return step.value as R;
}
