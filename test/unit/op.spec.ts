/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { op } from '../../src';

describe('op', () => {
    it('should yield a single effect pair', () => {
        const asyncFn = () => Promise.resolve('a');
        const syncFn = () => 's';

        const generator = op(asyncFn, syncFn);
        const step = generator.next();

        expect(step.done).toEqual(false);
        expect(step.value).toEqual({ async: asyncFn, sync: syncFn });
    });

    it('should not invoke either thunk itself', () => {
        let calls = 0;
        const generator = op(
            () => {
                calls++;
                return Promise.resolve(1);
            },
            () => {
                calls++;
                return 1;
            },
        );

        generator.next();
        expect(calls).toEqual(0);
    });

    it('should return whatever the driver sends back', () => {
        const generator = op(() => Promise.resolve(1), () => 1);

        generator.next();
        const step = generator.next(7);

        expect(step.done).toEqual(true);
        expect(step.value).toEqual(7);
    });

    it('should complete after exactly one effect', () => {
        const generator = op(() => Promise.resolve(1), () => 1);

        generator.next();
        expect(generator.next(1).done).toEqual(true);
    });
});
