/**
 * Vitest setup — keep lightweight so unit tests stay fast and DB-free.
 */

// Ensure NODE_ENV is test for any env-sensitive helpers.
Object.assign(process.env, { NODE_ENV: "test" });
