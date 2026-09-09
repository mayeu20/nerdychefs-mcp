import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { titleToSlug } from '../src/slug.js';

it.skipIf(process.env.NERDYCHEFS_LIVE !== '1')('serves all eight tools from the live site', async () => {
  const server = createServer({ apiBase: 'https://www.nerdychefs.ai/api' });
  const client = new Client({ name: 'live-smoke', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      const content = result.content as { text: string }[];
      const document = JSON.parse(content[0]!.text);
      expect(document).toEqual(result.structuredContent);
      return document;
    };
    const packs = await call('list_packs', { limit: 120 });
    expect(packs.total).toBeGreaterThan(0);
    for (const pack of packs.packs) expect(titleToSlug(pack.title)).toBe(pack.id);
    const pack = await call('get_pack', { id: packs.packs[0].id });
    expect(pack.prompts.length).toBeGreaterThan(0);
    const prompt = await call('get_prompt', { id: pack.prompts[0].id });
    expect(prompt.prompt.length).toBeGreaterThan(0);
    expect(prompt.attribution).toBe('Prompts from NerdyChefs.ai');
    const search = await call('search_prompts', { query: prompt.title.slice(0, 200) });
    expect(search.total_matches).toBeGreaterThan(0);
    expect((await call('random_prompt')).pool_size).toBeGreaterThan(0);
    expect((await call('list_categories')).total).toBeGreaterThan(0);
    expect((await call('list_personas')).total).toBeGreaterThan(0);
    expect((await call('list_tags')).total).toBeGreaterThan(0);
    const resource = await client.readResource({ uri: `nerdychefs://pack/${pack.id}` });
    expect(JSON.parse(String(resource.contents[0]!.text))).toEqual(pack);
    const url = new URL(prompt.url);
    expect(url.hostname).toBe('www.nerdychefs.ai');
    expect(url.searchParams.get('utm_campaign')).toBe('nerdychefs_mcp');
  } finally {
    await client.close();
    await server.close();
  }
}, 90_000);
