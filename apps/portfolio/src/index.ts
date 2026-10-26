// Standalone dev host, development only. `import.meta.env.DEV` is replaced at
// build time, so production bundles contain neither this import nor the dev
// host; the async boundary lets the federation runtime initialise first.
if (import.meta.env.DEV) void import('./bootstrap');
