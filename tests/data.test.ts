import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, DataStore } from '../src/data.js';
import { startFixtureServer } from './fixture-server.js';

describe('data cache', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
  beforeEach(async () => {
    fixture = await startFixtureServer();
    vi.stubEnv('NERDYCHEFS_API_BASE', fixture.base);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fixture.close();
  });
  it('loads lazily, shares in-flight requests, and expires files independently at 60 minutes', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const data = new DataStore();
    expect(fixture.hits.size).toBe(0);
    const [first, second] = await Promise.all([data.load('prompts'), data.load('prompts')]);
    expect(first).toBe(second);
    expect(fixture.hits.get('prompts')).toBe(1);
    clock.mockReturnValue(2_000);
    await data.load('packs');
    clock.mockReturnValue(1_000 + CACHE_TTL_MS - 1);
    expect(await data.load('prompts')).toBe(first);
    clock.mockReturnValue(1_000 + CACHE_TTL_MS);
    expect(await data.load('prompts')).not.toBe(first);
    await data.load('packs');
    expect(fixture.hits.get('prompts')).toBe(2);
    expect(fixture.hits.get('packs')).toBe(1);
  });
  it('recovers on the single allowed retry', async () => {
    fixture.failures.set('tags', 1);
    expect((await new DataStore().load('tags')).tags.length).toBeGreaterThan(0);
    expect(fixture.hits.get('tags')).toBe(2);
  });
  it('names a failed file, stops after one retry, and allows later recovery', async () => {
    fixture.failures.set('prompts', 2);
    const data = new DataStore();
    await expect(data.load('prompts')).rejects.toThrow('prompts.json; the site may be unreachable');
    expect(fixture.hits.get('prompts')).toBe(2);
    expect((await data.load('prompts')).prompts.length).toBeGreaterThan(0);
    expect(fixture.hits.get('prompts')).toBe(3);
  });
  it('rejects malformed documents without caching them', async () => {
    fixture.overrides.set('packs', JSON.stringify({ _meta: {}, packs: [{ id: 'broken' }] }));
    const data = new DataStore();
    await expect(data.load('packs')).rejects.toThrow('packs.json');
    expect(fixture.hits.get('packs')).toBe(2);
    fixture.overrides.delete('packs');
    expect((await data.load('packs')).packs).toHaveLength(4);
  });
  it('reports a connection failure', async () => {
    await fixture.close();
    await expect(new DataStore().load('categories')).rejects.toThrow('categories.json; the site may be unreachable');
    fixture.close = async () => {};
  });
  it('restricts remote hosts and rejects credentials, query strings, and fragments', () => {
    for (const apiBase of [
      'https://invalid.example/api', 'http://www.nerdychefs.ai/api',
      'https://www.nerdychefs.ai:8443/api', 'https://user:pass@www.nerdychefs.ai/api',
      'https://www.nerdychefs.ai/api?token=x', 'https://www.nerdychefs.ai/api#fragment',
    ]) expect(() => new DataStore({ apiBase })).toThrow();
    expect(() => new DataStore({ apiBase: 'https://www.nerdychefs.ai/api/' })).not.toThrow();
  });
  it('refuses redirects without contacting the destination', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('redirect'));
    await expect(new DataStore().load('packs')).rejects.toThrow('packs.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });
});
