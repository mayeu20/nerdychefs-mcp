# nerdychefs-mcp

An MCP server that gives your assistant access to the free prompt library at NerdyChefs.ai. Search for a task, open a pack, or pick a random prompt to try.

It runs over stdio and fetches prompts when you first need them. Data stays in memory for 60 minutes. Requires Node 20 or newer.

## Tools

| Name | Arguments | What you get |
| --- | --- | --- |
| `search_prompts` | `query` (2 to 200 characters); optional `category`, `persona`, `tag`, `limit` (1 to 25, default 10), `include_prompt_text` (default false) | Ranked prompt summaries, total matches, and links. |
| `get_prompt` | `id` (integer) | One prompt with its full text and links. |
| `random_prompt` | Optional `category`, `persona`, `tag` | A random prompt with full text and the pool size. |
| `list_packs` | Optional `category`, `query`, `limit` (1 to 120, default 50) | Packs ordered by title, with descriptions and links. |
| `get_pack` | `id` (slug or exact title); optional `include_prompts` (default true), `include_prompt_text` (default false) | Pack details, sections, and optional prompts ordered by ID. |
| `list_categories` | None | Categories, subcategories, and prompt counts. |
| `list_personas` | Optional `top` (1 to 873, default 50), `query` | Personas ordered by count, then name. |
| `list_tags` | Optional `top` (1 to 500, default 50), `query` | Tags ordered by count, then name. |

Category, persona, and tag filters use case-insensitive exact matches. Pack queries search titles and descriptions. Persona and tag queries match part of a name. Search results omit prompt text unless requested.

The resource `nerdychefs://pack/{slug}` returns the same JSON as `get_pack` with prompt summaries and no prompt text.

## Installation for Claude Desktop

Add this entry to your MCP configuration, then restart the client:

```json
{
  "mcpServers": {
    "nerdychefs": {
      "command": "npx",
      "args": ["-y", "nerdychefs-mcp"]
    }
  }
}
```

## Installation for Claude Code

```sh
claude mcp add nerdychefs -- npx -y nerdychefs-mcp
```

## Installation for Cursor

Add this to your MCP configuration:

```json
{
  "mcpServers": {
    "nerdychefs": {
      "command": "npx",
      "args": ["-y", "nerdychefs-mcp"]
    }
  }
}
```

## Installation for Codex CLI

```sh
codex mcp add nerdychefs -- npx -y nerdychefs-mcp
```

## Configuration

`NERDYCHEFS_API_BASE` defaults to `https://www.nerdychefs.ai/api`. Set it in the server's environment to change the API path. Remote URLs must use HTTPS on `www.nerdychefs.ai`. Local HTTP addresses are accepted for fixture tests. Redirects are refused.

Files load on demand and are cached separately for 60 minutes. Failed requests get one retry. A failed tool call names the file that could not load.

## Privacy

The only remote host the server talks to is `www.nerdychefs.ai`. It downloads public JSON files. Searches and filters run locally. No user queries, prompt inputs, or client conversations are sent to the site.

Nothing is logged or sent anywhere else. There is no telemetry, analytics, or runtime disk cache. Local fixture tests use a loopback HTTP server. Returned website links include the fixed `utm_source=mcp`, `utm_medium=tool`, and `utm_campaign=nerdychefs_mcp` parameters.

## Attribution

Prompts from NerdyChefs.ai. Prompts are served live from nerdychefs.ai and remain that site's content. Each prompt result includes attribution and links to its prompt and pack pages. The package does not include the prompt corpus.

## Development

```sh
pnpm install
pnpm build
pnpm test
NERDYCHEFS_LIVE=1 pnpm test
```

The regular tests use small local fixtures. The live smoke test runs only when `NERDYCHEFS_LIVE=1`. Start the compiled server with `node dist/index.js`, or use `pnpm dev` while editing. Standard output is reserved for MCP messages.

## Licence

The server code is MIT licensed. Copyright 2026 Mathieu Kessler. See [LICENSE](LICENSE). This licence covers the server code. Prompts remain NerdyChefs.ai content.
