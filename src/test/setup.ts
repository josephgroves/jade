/**
 * Bun test preload — runs once before all test files.
 *
 * Silences console output so test runs stay readable.
 * Tests that need to assert on console output can override console.log
 * locally within the test (the existing pattern in this codebase), and
 * restoring to the no-op is harmless.
 */
const noop = () => {};
console.log = noop;
console.error = noop;
console.warn = noop;
