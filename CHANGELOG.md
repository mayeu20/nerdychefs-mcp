# Changelog

## 0.1.3 (2026-09-23)

- Describe every input field of every tool. All 20 arguments across the eight tools now carry a schema description, so a client shows the caller what a field means, what form it takes, and how it fails.
- The descriptions name two traps that used to fail silently: the category, persona and tag filters take the exact display NAME and not the slug `list_categories` also returns, and `get_prompt` ids are positions in the published prompt file rather than website ids, so a stored id can resolve to a different prompt.
- Report version 0.1.3 on connect. The server had advertised 0.1.1 since that release while npm shipped 0.1.2, and the handshake value is the only version a user can read.
- Add `tests/metadata.test.ts`: every input field must carry a description, the count of fields inspected is asserted so an empty enumeration cannot pass, and package.json, server.json and the advertised version must agree.
- No change to any tool's behaviour, arguments, defaults or output.

## 0.1.2 (2026-09-14)

- 0.1.2: devDependency vitest 3.2.x to 4.1.11, clears GHSA-5xrq-8626-4rwp and GHSA-82fw-gwwq-j7x9 reported against the declared dependencies; no runtime change.
- Vitest was never shipped to consumers: it is a devDependency, and `files` includes only `dist`, `README.md`, and `LICENSE`.

## 0.1.1

- Add MCP Registry metadata: `mcpName` in package.json and a `server.json`. No functional change.

## 0.1.0

- Add eight MCP tools for prompt search, lookup, random picks, and browsing.
- Add a pack resource, live fetching, and a 60-minute memory cache.
- Add client setup instructions and local and live tests.
