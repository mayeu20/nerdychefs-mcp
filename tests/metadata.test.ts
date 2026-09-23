import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import packageJson from '../package.json';
import serverJson from '../server.json';

// Every tool input field must carry a description: it is the only documentation a client
// ever shows, and an undescribed field is guessed at. Listing the tools proves nothing on
// its own, so the count of fields inspected is asserted too, and the predicate is run
// against a fixture that IS missing a description to prove it can still report one.
interface ToolSchema { name: string; inputSchema: { properties?: Record<string, unknown> } }

function undescribed(tools: readonly ToolSchema[]): { fields: string[]; inspected: number } {
  const fields: string[] = [];
  let inspected = 0;
  for (const tool of tools) {
    for (const [field, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
      inspected++;
      const description = (schema as { description?: unknown }).description;
      if (typeof description !== 'string' || description.trim().length < 20) {
        fields.push(`${tool.name}.${field}`);
      }
    }
  }
  return { fields, inspected };
}

describe('published metadata', () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;

  beforeEach(async () => {
    server = createServer();
    client = new Client({ name: 'metadata-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('describes every input field of every tool', async () => {
    const tools = (await client.listTools()).tools as unknown as ToolSchema[];
    const { fields, inspected } = undescribed(tools);
    expect(fields).toEqual([]);
    // Guard the guard: an empty tool list, or schemas that stopped exposing properties,
    // would also return no failures. Eight tools, and list_categories takes no input.
    expect(tools).toHaveLength(8);
    expect(inspected).toBe(20);
  });

  it('reports a field that has no description, and one whose description is a placeholder', () => {
    const { fields, inspected } = undescribed([
      { name: 'good', inputSchema: { properties: { a: { description: 'A field described at ordinary length.' } } } },
      { name: 'bare', inputSchema: { properties: { b: {} } } },
      { name: 'stub', inputSchema: { properties: { c: { description: 'the id' } } } },
    ]);
    expect(fields).toEqual(['bare.b', 'stub.c']);
    expect(inspected).toBe(3);
  });

  it('advertises one version, in all three places a reader can find it', () => {
    // Read from the CLIENT, because the handshake value is the one a user actually sees.
    const advertised = client.getServerVersion();
    expect(advertised?.name).toBe('nerdychefs-mcp');
    expect(advertised?.version).toBe(packageJson.version);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages[0]!.version).toBe(packageJson.version);
    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.packages[0]!.identifier).toBe(packageJson.name);
  });
});
