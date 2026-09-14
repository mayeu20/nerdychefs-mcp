# Changelog

## 0.1.2 (2026-09-14)

- 0.1.2: devDependency vitest 3.2.x to 4.1.11, clears GHSA-5xrq-8626-4rwp and GHSA-82fw-gwwq-j7x9 reported against the declared dependencies; no runtime change.
- Vitest was never shipped to consumers: it is a devDependency, and `files` includes only `dist`, `README.md`, and `LICENSE`.

## 0.1.1

- Add MCP Registry metadata: `mcpName` in package.json and a `server.json`. No functional change.

## 0.1.0

- Add eight MCP tools for prompt search, lookup, random picks, and browsing.
- Add a pack resource, live fetching, and a 60-minute memory cache.
- Add client setup instructions and local and live tests.
