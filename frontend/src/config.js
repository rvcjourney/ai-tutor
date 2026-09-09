// `??` (not `||`) deliberately — the Docker build sets this to an explicit empty
// string when the frontend is served from the same origin as the API (no separate
// domains/ports), so requests should resolve as plain relative paths ('' + '/chat/
// start' = '/chat/start'). `||` would treat that empty string as "unset" and fall
// back to the localhost default even when it was intentionally left blank.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
