import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { startFixtureServer } from './fixture-server.js';
import promptDocument from './fixtures/prompts.json';
import packDocument from './fixtures/packs.json';
import personaDocument from './fixtures/personas.json';
import tagDocument from './fixtures/tags.json';

describe('MCP tools and resource', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
  let server: ReturnType<typeof createServer>;
  let client: Client;
  const first = promptDocument.prompts[0]!;
  const firstPack = packDocument.packs[0]!;

  beforeEach(async () => {
    fixture = await startFixtureServer();
    vi.stubEnv('NERDYCHEFS_API_BASE', fixture.base);
    server = createServer();
    client = new Client({ name: 'fixture-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await client.close();
    await server.close();
    await fixture.close();
  });

  async function call(name: string, args: Record<string, unknown> = {}, error = false) {
    const response = await client.callTool({ name, arguments: args });
    expect(Boolean(response.isError)).toBe(error);
    const content = response.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0]!.type).toBe('text');
    const document = JSON.parse(content[0]!.text);
    expect(content[0]!.text).toBe(JSON.stringify(document, null, 2));
    expect(response.structuredContent).toEqual(document);
    return document;
  }

  it('connects in process and calls exactly all eight tools once', async () => {
    expect(fixture.hits.size).toBe(0);
    const tools = await client.listTools();
    expect(tools.tools.map(t => t.name).sort()).toEqual([
      'get_pack', 'get_prompt', 'list_categories', 'list_packs', 'list_personas',
      'list_tags', 'random_prompt', 'search_prompts',
    ]);
    const search = await call('search_prompts', { query: 'the' });
    expect(search.returned).toBe(10);
    expect(search.total_matches).toBe(10);
    expect(search.results[0]).not.toHaveProperty('prompt');
    const prompt = await call('get_prompt', { id: first.id });
    expect(prompt.prompt).toBe(first.prompt);
    expect(Object.keys(prompt)).toEqual([
      'id', 'title', 'use_case', 'category', 'subcategory', 'pack_title', 'pack_slug',
      'tags', 'personas', 'url', 'pack_url', 'attribution', 'prompt',
    ]);
    expect(prompt.attribution).toBe('Prompts from NerdyChefs.ai');
    expect(prompt.pack_slug).toBe(firstPack.id);
    const random = await call('random_prompt');
    expect(random.pool_size).toBe(12);
    expect(random.prompt).toBeTypeOf('string');
    const packs = await call('list_packs');
    expect(packs.total).toBe(4);
    expect(packs.packs.map((p: { title: string }) => p.title)).toEqual(packDocument.packs.map(p => p.title).sort());
    const pack = await call('get_pack', { id: firstPack.id });
    expect(pack.sections).toEqual(firstPack.sections);
    expect(pack.prompts.map((p: { id: number }) => p.id)).toEqual([18, 19, 20]);
    expect(pack.prompts[0]).not.toHaveProperty('prompt');
    expect((await call('list_categories')).categories[0]).not.toHaveProperty('icon');
    expect((await call('list_personas')).total).toBe(personaDocument.personas.length);
    expect((await call('list_tags')).total).toBe(tagDocument.tags.length);
    expect([...fixture.hits.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it('exposes one pack resource matching get_pack defaults', async () => {
    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates).toHaveLength(1);
    expect(templates.resourceTemplates[0]!.uriTemplate).toBe('nerdychefs://pack/{slug}');
    const pack = await call('get_pack', { id: firstPack.id });
    const uri = `nerdychefs://pack/${firstPack.id}`;
    const resource = await client.readResource({ uri });
    expect(resource.contents).toEqual([{ uri, mimeType: 'application/json', text: JSON.stringify(pack, null, 2) }]);
    await expect(client.readResource({ uri: 'nerdychefs://pack/missing' })).rejects.toThrow('Unknown pack: missing');
  });

  it('supports pack titles and prompt inclusion options without unnecessary fetches', async () => {
    const summary = await call('get_pack', { id: firstPack.title, include_prompts: false });
    expect(summary).not.toHaveProperty('prompts');
    expect(fixture.hits.has('prompts')).toBe(false);
    const full = await call('get_pack', { id: firstPack.title, include_prompt_text: true });
    expect(full.prompts[0].prompt).toBe(first.prompt);
  });

  it('filters search and pack lists, preserves totals, and includes text only on request', async () => {
    const result = await call('search_prompts', {
      query: first.title, category: first.category.toUpperCase(),
      persona: first.personas[0]!.toUpperCase(), tag: first.tags[0]!.toUpperCase(),
      limit: 1, include_prompt_text: true,
    });
    expect(result.returned).toBe(1);
    expect(result.results[0].id).toBe(first.id);
    expect(result.results[0].prompt).toBe(first.prompt);
    expect((await call('search_prompts', { query: 'zzzz-no-match' })).results).toEqual([]);
    const packs = await call('list_packs', { category: firstPack.category.toUpperCase(), limit: 1 });
    expect(packs.total).toBe(4);
    expect(packs.returned).toBe(1);
    expect((await call('list_packs', { query: firstPack.description.toUpperCase() })).packs[0].id).toBe(firstPack.id);
    expect((await call('list_packs', { category: 'missing' })).total).toBe(0);
  });

  it('uses equal-sized random intervals across the filtered pool', async () => {
    const rng = vi.spyOn(Math, 'random');
    const args = { persona: first.personas[0]!.toUpperCase(), tag: first.tags[0]!.toUpperCase() };
    const pool = promptDocument.prompts.filter(p => p.personas.includes(first.personas[0]!) && p.tags.includes(first.tags[0]!));
    for (let index = 0; index < pool.length; index++) {
      rng.mockReturnValue((index + 0.5) / pool.length);
      const result = await call('random_prompt', args);
      expect(result.id).toBe(pool[index]!.id);
      expect(result.pool_size).toBe(pool.length);
    }
    rng.mockReturnValue(0);
    expect((await call('random_prompt')).id).toBe(first.id);
    rng.mockReturnValue(0.999999);
    expect((await call('random_prompt')).id).toBe(promptDocument.prompts.at(-1)!.id);
  });

  it('sorts counts descending with name ties and supports substring filtering and top limits', async () => {
    for (const [name, values] of [['personas', personaDocument.personas], ['tags', tagDocument.tags]] as const) {
      const expected = [...values].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const all = await call(`list_${name}`);
      expect(all[name]).toEqual(expected);
      const query = values[0]!.name.slice(0, 2).toUpperCase();
      const filtered = expected.filter(v => v.name.toUpperCase().includes(query));
      const result = await call(`list_${name}`, { query, top: 1 });
      expect(result.total).toBe(filtered.length);
      expect(result[name]).toEqual(filtered.slice(0, 1));
    }
  });

  it('returns JSON tool errors for missing data, empty filters, and unavailable files', async () => {
    expect((await call('get_prompt', { id: -123 }, true)).error).toContain('-123');
    expect((await call('get_pack', { id: 'missing' }, true)).error).toContain('missing');
    const empty = await call('random_prompt', { category: 'Missing', persona: 'No one', tag: 'Absent' }, true);
    for (const value of ['Missing', 'No one', 'Absent']) expect(empty.error).toContain(value);
    fixture.failures.set('categories', 2);
    const unavailable = await call('list_categories', {}, true);
    expect(unavailable.error).toContain('categories.json');
    expect(unavailable.error).toContain('site may be unreachable');
  });

  it('returns native SDK validation errors before loading data', async () => {
    const invalid = [
      ['search_prompts', {}], ['search_prompts', { query: 'x' }],
      ['search_prompts', { query: 'x'.repeat(201) }], ['search_prompts', { query: 'ok', limit: 26 }],
      ['search_prompts', { query: 'ok', limit: 0 }], ['get_prompt', { id: 1.5 }],
      ['list_packs', { limit: 121 }], ['list_packs', { limit: 1.5 }],
      ['list_personas', { top: 874 }], ['list_tags', { top: 501 }],
      ['get_pack', { id: 3 }], ['random_prompt', { tag: 3 }],
    ] as const;
    for (const [name, args] of invalid) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(result.content).toEqual([{
        type: 'text',
        text: expect.stringContaining(`Input validation error: Invalid arguments for tool ${name}:`),
      }]);
    }
    expect(fixture.hits.size).toBe(0);
  });

  it('returns the native SDK error for an unknown tool without loading data', async () => {
    const result = await client.callTool({ name: 'unknown_tool', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([{
      type: 'text', text: 'MCP error -32602: Tool unknown_tool not found',
    }]);
    expect(fixture.hits.size).toBe(0);
  });
});
