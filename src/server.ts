import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DataStore } from './data.js';
import type { DataOptions, Pack, Prompt } from './data.js';
import { compareNames, filterPrompts, searchPrompts } from './search.js';
import { packSlugFor, packUrl, promptUrl } from './urls.js';

type JsonObject = Record<string, unknown>;
const filters = {
  category: z.string().optional(), persona: z.string().optional(), tag: z.string().optional(),
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
  const server = new McpServer({ name: 'nerdychefs-mcp', version: '0.1.1' });
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
      query: z.string().min(2).max(200), ...filters,
      limit: z.number().int().min(1).max(25).default(10),
      include_prompt_text: z.boolean().default(false),
    },
  }, args => tool(async () => {
    const { prompts, packs } = await promptData();
    const matches = searchPrompts(prompts, args.query, args);
    const results = matches.slice(0, args.limit).map(prompt => promptResult(prompt, packs, args.include_prompt_text));
    return { query: args.query, total_matches: matches.length, returned: results.length, results };
  }));

  server.registerTool('get_prompt', {
    description: 'Get a prompt by its numeric ID, including the full prompt text.',
    inputSchema: { id: z.number().int() },
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
      category: z.string().optional(), query: z.string().optional(),
      limit: z.number().int().min(1).max(120).default(50),
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
      id: z.string(), include_prompts: z.boolean().default(true),
      include_prompt_text: z.boolean().default(false),
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
        top: z.number().int().min(1).max(maximum).default(50), query: z.string().optional(),
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
