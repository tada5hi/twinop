import config from '@tada5hi/eslint-config';

export default [
    ...await config(),
    { ignores: ['dist/**'] },
    // Promise.try requires Node 24; this package supports Node 22.
    { rules: { 'unicorn/prefer-promise-try': 'off' } },
];
