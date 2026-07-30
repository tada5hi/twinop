/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { TwinBody } from '../../src';
import { op, runTwinAsync, runTwinSync } from '../../src';

describe('runTwinAsync / runTwinSync', () => {
    it('should drive the side the driver stands for', async () => {
        const seen: string[] = [];

        function* body() : TwinBody<string> {
            return yield* op(
                () => {
                    seen.push('async');
                    return Promise.resolve('a');
                },
                () => {
                    seen.push('sync');
                    return 's';
                },
            );
        }

        expect(await runTwinAsync(body())).toEqual('a');
        expect(runTwinSync(body())).toEqual('s');
        expect(seen).toEqual(['async', 'sync']);
    });

    it('should return a body that yields nothing', async () => {
        // A body with no effects is legal — hence no `yield` here.
        // eslint-disable-next-line require-yield
        function* body() : TwinBody<number> {
            return 42;
        }

        expect(await runTwinAsync(body())).toEqual(42);
        expect(runTwinSync(body())).toEqual(42);
    });

    it('should await a bare (non-promise) async thunk return', async () => {
        function* body() : TwinBody<number> {
            return yield* op(() => 1, () => 1);
        }

        expect(await runTwinAsync(body())).toEqual(1);
    });

    it('should accept one function for both slots when the effect is sync', async () => {
        const effect = () => 'shared';

        function* body() : TwinBody<string> {
            return yield* op(effect, effect);
        }

        expect(await runTwinAsync(body())).toEqual('shared');
        expect(runTwinSync(body())).toEqual('shared');
    });

    it('should thread each effect result back into the body', async () => {
        function* body() : TwinBody<number> {
            const a = yield* op(() => Promise.resolve(2), () => 2);
            const b = yield* op(() => Promise.resolve(a * 3), () => a * 3);
            return b + 1;
        }

        expect(await runTwinAsync(body())).toEqual(7);
        expect(runTwinSync(body())).toEqual(7);
    });

    it('should run effects in body order', async () => {
        const order: number[] = [];

        function* body() : TwinBody<void> {
            for (const i of [1, 2, 3]) {
                yield* op(
                    () => {
                        order.push(i);
                        return Promise.resolve();
                    },
                    () => {
                        order.push(i);
                    },
                );
            }
        }

        await runTwinAsync(body());
        expect(order).toEqual([1, 2, 3]);

        order.length = 0;
        runTwinSync(body());
        expect(order).toEqual([1, 2, 3]);
    });

    it('should not evaluate the thunk of the side it does not drive', async () => {
        let asyncCalls = 0;
        let syncCalls = 0;

        function* body() : TwinBody<void> {
            yield* op(
                () => {
                    asyncCalls++;
                    return Promise.resolve();
                },
                () => {
                    syncCalls++;
                },
            );
        }

        await runTwinAsync(body());
        expect([asyncCalls, syncCalls]).toEqual([1, 0]);

        runTwinSync(body());
        expect([asyncCalls, syncCalls]).toEqual([1, 1]);
    });

    describe('error re-entry', () => {
        it('should re-enter effect errors so in-body try/catch behaves identically', async () => {
            function* body() : TwinBody<string> {
                try {
                    yield* op(
                        () => Promise.reject(new Error('async boom')),
                        () => {
                            throw new Error('sync boom');
                        },
                    );
                    return 'not reached';
                } catch (e) {
                    return `caught: ${(e as Error).message}`;
                }
            }

            expect(await runTwinAsync(body())).toEqual('caught: async boom');
            expect(runTwinSync(body())).toEqual('caught: sync boom');
        });

        it('should re-enter a synchronous throw from the async thunk', async () => {
            function* body() : TwinBody<string> {
                try {
                    yield* op(
                        () => {
                            throw new Error('threw before returning a promise');
                        },
                        () => 'unused',
                    );
                    return 'not reached';
                } catch (e) {
                    return (e as Error).message;
                }
            }

            expect(await runTwinAsync(body())).toEqual('threw before returning a promise');
        });

        it('should keep running the body after a caught effect error', async () => {
            function* body() : TwinBody<string> {
                let recovered = 'none';
                try {
                    yield* op(
                        () => Promise.reject(new Error('first')),
                        () => {
                            throw new Error('first');
                        },
                    );
                } catch {
                    recovered = yield* op(() => Promise.resolve('second'), () => 'second');
                }
                return recovered;
            }

            expect(await runTwinAsync(body())).toEqual('second');
            expect(runTwinSync(body())).toEqual('second');
        });

        it('should run in-body finally blocks on both sides', async () => {
            const seen: string[] = [];

            function* body() : TwinBody<void> {
                try {
                    yield* op(
                        () => Promise.reject(new Error('boom')),
                        () => {
                            throw new Error('boom');
                        },
                    );
                } catch {
                    seen.push('catch');
                } finally {
                    seen.push('finally');
                }
            }

            await runTwinAsync(body());
            runTwinSync(body());

            expect(seen).toEqual(['catch', 'finally', 'catch', 'finally']);
        });

        it('should propagate an uncaught effect error out of the driver', async () => {
            function* body() : TwinBody<void> {
                yield* op(
                    () => Promise.reject(new Error('escapes')),
                    () => {
                        throw new Error('escapes');
                    },
                );
            }

            await expect(runTwinAsync(body())).rejects.toThrow('escapes');
            expect(() => runTwinSync(body())).toThrow('escapes');
        });

        it('should propagate an error the body raises on its own', async () => {
            function* body() : TwinBody<void> {
                yield* op(() => Promise.resolve(), () => undefined);
                throw new Error('from the body');
            }

            await expect(runTwinAsync(body())).rejects.toThrow('from the body');
            expect(() => runTwinSync(body())).toThrow('from the body');
        });

        it('should propagate a non-Error rejection verbatim', async () => {
            function* body() : TwinBody<void> {
                yield* op(
                    // Deliberately non-Error on both sides — the drivers must
                    // pass the thrown value through untouched.
                    // eslint-disable-next-line prefer-promise-reject-errors
                    () => Promise.reject('a string'),
                    () => {
                        // eslint-disable-next-line no-throw-literal
                        throw 'a string';
                    },
                );
            }

            await expect(runTwinAsync(body())).rejects.toEqual('a string');
            expect(() => runTwinSync(body())).toThrow('a string');
        });

        it('should let a body translate an effect error and rethrow', async () => {
            function* body() : TwinBody<void> {
                try {
                    yield* op(
                        () => Promise.reject(new Error('low level')),
                        () => {
                            throw new Error('low level');
                        },
                    );
                } catch (e) {
                    throw new Error(`wrapped: ${(e as Error).message}`, { cause: e });
                }
            }

            await expect(runTwinAsync(body())).rejects.toThrow('wrapped: low level');
            expect(() => runTwinSync(body())).toThrow('wrapped: low level');
        });
    });

    describe('composition', () => {
        it('should compose bodies via yield* delegation', async () => {
            function* inner(input: number) : TwinBody<number> {
                return yield* op(() => Promise.resolve(input * 2), () => input * 2);
            }

            function* outer() : TwinBody<number> {
                const a = yield* inner(2);
                const b = yield* inner(a);
                return b;
            }

            expect(await runTwinAsync(outer())).toEqual(8);
            expect(runTwinSync(outer())).toEqual(8);
        });

        it('should surface a delegated body error to the outer catch', async () => {
            function* inner() : TwinBody<never> {
                return yield* op(
                    () => Promise.reject(new Error('inner')),
                    () => {
                        throw new Error('inner');
                    },
                );
            }

            function* outer() : TwinBody<string> {
                try {
                    yield* inner();
                    return 'not reached';
                } catch (e) {
                    return `outer caught: ${(e as Error).message}`;
                }
            }

            expect(await runTwinAsync(outer())).toEqual('outer caught: inner');
            expect(runTwinSync(outer())).toEqual('outer caught: inner');
        });
    });

    it('should not introduce a microtask on the sync side', () => {
        let flushed = false;
        void Promise.resolve().then(() => {
            flushed = true;
        });

        function* body() : TwinBody<boolean> {
            return yield* op(() => Promise.resolve(flushed), () => flushed);
        }

        expect(runTwinSync(body())).toEqual(false);
        expect(flushed).toEqual(false);
    });

    it('should drive one body instance only once', async () => {
        function* body() : TwinBody<number> {
            return yield* op(() => Promise.resolve(1), () => 1);
        }

        const instance = body();
        expect(await runTwinAsync(instance)).toEqual(1);
        // A spent generator reports `done` immediately with `value: undefined`.
        expect(await runTwinAsync(instance)).toBeUndefined();
    });
});
