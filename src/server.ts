import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DataStore } from './data.js';
import type { DataOptions, Pack, Prompt } from './data.js';
import { compareNames, filterPrompts, searchPrompts } from './search.js';
import { packSlugFor, packUrl, promptUrl } from './urls.js';

type JsonObject = Record<string, unknown>;

// All three filters are exact, case-insensitive equality, never substring, and an unknown
// value returns an empty result rather than an error. The category trap is worth the words:
// list_categories returns both `id` (`engineering-devops`) and `name` (`Engineering & DevOps`)
// and only the name matches here, so a caller that pipes the id through gets a silent zero.
const filters = {
  category: z.string().optional().describe(
    'Keep only prompts in this category. Exact category NAME, case-insensitive, for example '
    + '"Engineering & DevOps". Call list_categories and pass its `name`, not its `id`: the '
    + 'slug form ("engineering-devops") matches nothing and returns an empty result.'),
  persona: z.string().optional().describe(
    'Keep only prompts written for this persona. Exact persona name, case-insensitive, for '
    + 'example "DevOps Engineer". Partial names match nothing; call list_personas for the '
    + 'exact spelling.'),
  tag: z.string().optional().describe(
    'Keep only prompts carrying this tag. Exact tag name, case-insensitive. Partial names '
    + 'match nothing; call list_tags for the exact spelling.'),
};

function promptResult(prompt: Prompt, packs: Pack[], includeText = false): JsonObject {
  const slug = packSlugFor(prompt.pack_title, packs);
  return {
    id: prompt.id, title: prompt.title, use_case: prompt.use_case,
    category: prompt.category, subcategory: prompt.subcategory,
    pack_title: prompt.pack_title, pack_slug: slug, tags: prompt.tags, personas: prompt.personas,
    url: promptUrl(slug, prompt.title), pack_url: packUrl(slug),
    attribution: 'Prompts from NerdyChefs.ai',
    ...(includeText ? { prompt: prompt.prompt } : {}),
  };
}

function content(document: JsonObject) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(document, null, 2) }],
    structuredContent: document,
  };
}

async function tool(action: () => Promise<JsonObject>) {
  try { return content(await action()); }
  catch (error) {
    return { ...content({ error: error instanceof Error ? error.message : 'Tool failed.' }), isError: true };
  }
}

export function createServer(options: DataOptions = {}): McpServer {
  // Kept in step with package.json and server.json by tests/metadata.test.ts. This literal
  // had been stranded at 0.1.1 through two releases: it is what the client sees on connect,
  // so it was the only version number a user could read, and it was the wrong one.
  const server = new McpServer({ name: 'nerdychefs-mcp', version: '0.1.3' });
  const data = new DataStore(options);
  const promptData = async () => {
    const [prompts, packs] = await Promise.all([data.load('prompts'), data.load('packs')]);
    return { prompts: prompts.prompts, packs: packs.packs };
  };
  const getPack = async (id: string, includePrompts = true, includeText = false) => {
    const { packs } = await data.load('packs');
    const pack = packs.find(value => value.id === id || value.title === id);
    if (!pack) throw new Error(`Unknown pack: ${id}`);
    const document: JsonObject = {
      id: pack.id, title: pack.title, category: pack.category, description: pack.description,
      tags: pack.tags, personas: pack.personas, total_prompts: pack.total_prompts,
      url: packUrl(pack.id), sections: pack.sections,
    };
    if (includePrompts) {
      const { prompts } = await data.load('prompts');
      document.prompts = prompts.filter(prompt => prompt.pack_title === pack.title)
        .sort((a, b) => a.id - b.id).map(prompt => promptResult(prompt, packs, includeText));
    }
    return document;
  };

  server.registerTool('search_prompts', {
    description: 'Find prompts for a task, with optional category, persona, and tag filters.',
    inputSchema: {
      query: z.string().min(2).max(200).describe(
        'What the prompt should help with, in plain words, 2 to 200 characters. Split on '
        + 'whitespace; a prompt is returned if it matches at least ONE word, so extra words '
        + 'widen the search rather than narrowing it. Matches are scored highest on the title, '
        + 'then tags and subcategory, then use case and personas; words shorter than four '
        + 'characters are not matched against the prompt body. Narrow with the filters below.'),
      ...filters,
      limit: z.number().int().min(1).max(25).default(10).describe(
        'How many prompts to return, 1 to 25, best scoring first. `total_matches` in the '
        + 'response reports how many matched before this cut.'),
      include_prompt_text: z.boolean().default(false).describe(
        'Return the full text of every prompt alongside the summary. Leave false while '
        + 'browsing and set it true once the query is narrow, or fetch one prompt with '
        + 'get_prompt: at limit 25 this returns a lot of text.'),
    },
  }, args => tool(async () => {
    const { prompts, packs } = await promptData();
    const matches = searchPrompts(prompts, args.query, args);
    const results = matches.slice(0, args.limit).map(prompt => promptResult(prompt, packs, args.include_prompt_text));
    return { query: args.query, total_matches: matches.length, returned: results.length, results };
  }));

  server.registerTool('get_prompt', {
    description: 'Get a prompt by its numeric ID, including the full prompt text.',
    inputSchema: {
      id: z.number().int().describe(
        'The `id` of a prompt as returned by search_prompts, random_prompt or get_pack in '
        + 'THIS session. It is a position in the published prompt file, not the id the '
        + 'nerdychefs.ai database uses, so an id copied off the website, or saved from an '
        + 'earlier session, can name a different prompt. To reach a known prompt, search for '
        + 'its title rather than reusing a stored id.'),
    },
  }, args => tool(async () => {
    const { prompts, packs } = await promptData();
    const prompt = prompts.find(value => value.id === args.id);
    if (!prompt) throw new Error(`Unknown prompt id: ${args.id}`);
    return promptResult(prompt, packs, true);
  }));

  server.registerTool('random_prompt', {
    description: 'Pick a random prompt to try, optionally narrowed by category, persona, or tag.',
    inputSchema: filters,
  }, args => tool(async () => {
    const { prompts, packs } = await promptData();
    const pool = filterPrompts(prompts, args);
    if (!pool.length) throw new Error(`No prompts match filters: ${JSON.stringify(args)}.`);
    const prompt = pool[Math.floor(Math.random() * pool.length)]!;
    return { ...promptResult(prompt, packs, true), pool_size: pool.length };
  }));

  server.registerTool('list_packs', {
    description: 'Browse prompt packs by category or search their titles and descriptions.',
    inputSchema: {
      category: z.string().optional().describe(
        'Keep only packs in this category. Exact category NAME, case-insensitive, for example '
        + '"Prompt Patterns" or "Cloud & FinOps". The display name, never the slug. This is '
        + 'the PACK category, which is a shorter list than the prompt categories in '
        + 'list_categories, so an unknown value returns an empty list rather than an error.'),
      query: z.string().optional().describe(
        'Case-insensitive substring, matched against the pack title and its description. It '
        + 'is one literal substring, not split into words, so "cost cloud" finds nothing that '
        + '"cloud cost" finds. Combine with category to filter on both.'),
      limit: z.number().int().min(1).max(120).default(50).describe(
        'How many packs to return, 1 to 120, sorted by title. The whole library is currently '
        + 'about a hundred packs, so the default of 50 returns roughly half; `total` in the '
        + 'response reports how many matched before this cut.'),
    },
  }, args => tool(async () => {
    const { packs } = await data.load('packs');
    const query = args.query?.toLowerCase();
    const matches = packs.filter(pack =>
      (args.category === undefined || pack.category.toLowerCase() === args.category.toLowerCase())
      && (query === undefined || pack.title.toLowerCase().includes(query) || pack.description.toLowerCase().includes(query)))
      .sort((a, b) => compareNames(a.title, b.title));
    const results = matches.slice(0, args.limit).map(pack => ({
      id: pack.id, title: pack.title, category: pack.category, total_prompts: pack.total_prompts,
      description: pack.description, url: packUrl(pack.id),
    }));
    return { total: matches.length, returned: results.length, packs: results };
  }));

  server.registerTool('get_pack', {
    description: 'Open a pack by slug or exact title and optionally include its prompts.',
    inputSchema: {
      id: z.string().describe(
        'Either the pack slug, which is the `id` list_packs returns ("the-contradiction-hunt"), '
        + 'or the pack title in full and character for character ("PATTERN-010: The '
        + 'CONTRADICTION HUNT"). Nothing else resolves: a partial title, a lowercased title or '
        + 'a guessed slug raises "Unknown pack". Call list_packs first when unsure.'),
      include_prompts: z.boolean().default(true).describe(
        'Include the pack\'s prompts. Set false for a fast look at what the pack covers: the '
        + 'response still carries the description, the section list and total_prompts.'),
      include_prompt_text: z.boolean().default(false).describe(
        'Include the full text of every prompt in the pack, not just the summaries. Ignored '
        + 'unless include_prompts is true. A large pack returns a lot of text this way.'),
    },
  }, args => tool(() => getPack(args.id, args.include_prompts, args.include_prompt_text)));

  server.registerTool('list_categories', {
    description: 'List the available prompt categories and their subcategories.', inputSchema: {},
  }, () => tool(async () => {
    const { categories } = await data.load('categories');
    return { total: categories.length, categories: categories.map(category => ({
      id: category.id, name: category.name, description: category.description,
      prompt_count: category.prompt_count, subcategories: category.subcategories,
    })) };
  }));

  for (const [name, maximum] of [['personas', 873], ['tags', 500]] as const) {
    server.registerTool(`list_${name}`, {
      description: name === 'personas'
        ? 'Find personas to use when filtering prompts, starting with the most common.'
        : 'Find tags to use when filtering prompts, starting with the most common.',
      inputSchema: {
        // There is no offset on this tool, so `top` is the only control over the window and
        // a name outside it is unreachable except through `query`. The cap is also a literal
        // fixed when the tool was written, not the live count, so say what it is rather than
        // implying it covers the library.
        top: z.number().int().min(1).max(maximum).default(50).describe(
          `How many ${name} to return, 1 to ${maximum}, most used first, each with the number `
          + 'of prompts carrying it. There is no offset and no paging, so raising this is the '
          + `only way to see further down the list, and anything past ${maximum} can be `
          + 'reached only with `query`. A value above the cap is rejected, not clamped.'),
        query: z.string().optional().describe(
          `Case-insensitive substring filter on the ${name.slice(0, -1)} name, applied BEFORE `
          + '`top`, so it reaches names too far down the list to be returned otherwise. One '
          + 'literal substring, not split into words.'),
      },
    }, args => tool(async () => {
      const document = await data.load(name);
      const counts = 'personas' in document ? document.personas : document.tags;
      const matches = counts.filter(value => args.query === undefined
        || value.name.toLowerCase().includes(args.query.toLowerCase()))
        .sort((a, b) => b.count - a.count || compareNames(a.name, b.name));
      const results = matches.slice(0, args.top);
      return { total: matches.length, returned: results.length, [name]: results };
    }));
  }

  server.registerResource('pack', new ResourceTemplate('nerdychefs://pack/{slug}', { list: undefined }), {
    description: 'A prompt pack with prompt summaries.', mimeType: 'application/json',
  }, async (uri, variables) => ({
    contents: [{
      uri: uri.href, mimeType: 'application/json',
      text: JSON.stringify(await getPack(String(variables.slug)), null, 2),
    }],
  }));
  return server;
}
