# Notes

- The server uses the documented prompt, pack, category, persona, and tag fields. It computes links, pack slugs, attribution, and result counts.
- Prompts join to packs by exact title. A missing pack uses the supplied title slug function.
- Search applies each grouped weight once per token. A match in both tags and subcategory earns 2 points. A match in both use_case and personas earns 1 point. Token matches are substrings.
- Persona and tag responses use `{ total, returned, personas }` and `{ total, returned, tags }`. The contract did not specify their response envelopes. Total counts are measured after filtering and before truncation.
- Tool dispatch and argument validation use registerTool and the SDK's native handlers. Custom JSON tool errors are reserved for runtime failures such as missing prompts, missing packs, empty random pools, and unavailable data files.
- SDK 1.30.0 returns invalid-argument and unknown-tool errors as plain-text isError results without structuredContent. Client.callTool resolves with these results rather than rejecting. Tests assert this native behavior and verify that no fixture files are fetched. A rejection assertion would conflict with the required SDK version and native dispatch.
- Data files load only when needed. The index and search-index files are unnecessary because search needs use_case and prompt text.
- Each file has a 60-minute cache and shared in-flight requests. Fetches time out after 15 seconds and retry once. Failed refreshes report errors instead of serving expired data.
- The API base permits HTTPS on www.nerdychefs.ai and local HTTP fixture servers. This reconciles the host restriction with the required local tests. Other remote hosts and redirects are refused.
- Fixtures contain 12 prompts and 4 packs fetched on 9 September 2026. Records retain their source values. Document metadata totals reflect the subset. Pack totals, section counts, category counts, and tag and persona counts retain their live values.
- Fixtures select source records without em dashes to satisfy the file style rule. Live content is returned unchanged.
- The package allowlist excludes fixtures and source data. The prepack script builds dist before packaging. No publishing is performed.
- There is no repository .npmrc or local package store, cache, or state directory. The repository installs with stock pnpm settings. Sandbox installs use temporary paths under /tmp through environment variables. Test discovery is limited to tests/.
- A local package archive was inspected. It contained only six compiled JavaScript files, package.json, README.md, and LICENSE. The archive was removed after inspection.
- Verification used Node 25.9.0 and pnpm 10.27.0. Node 20 and interactive client setup were not tested directly.
- No additional dependencies were needed. No API fields were invented. Exceptions are the local fixture host required by the test contract and the SDK-native validation behavior documented above.
