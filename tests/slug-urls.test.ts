import { describe, expect, it } from 'vitest';
import packs from './fixtures/packs.json';
import { promptTitleToSlug, titleToSlug } from '../src/slug.js';
import { packSlugFor, packUrl, promptUrl } from '../src/urls.js';

describe('website slugs', () => {
  it('matches every real fixture pack ID', () => {
    expect(packs.packs).toHaveLength(4);
    for (const pack of packs.packs) expect(titleToSlug(pack.title)).toBe(pack.id);
  });
  it('strips numbered pack prefixes and normalizes punctuation and spacing', () => {
    expect(titleToSlug('SALES-OPS-001:  Better & Faster -- Work! ')).toBe('better-faster-work');
    expect(titleToSlug('DEV-001: Debug')).toBe('debug');
    expect(titleToSlug('Caf\u00e9 / TEST')).toBe('caf-test');
  });
  it('keeps prompt prefixes and truncates after normalization', () => {
    expect(promptTitleToSlug('DEV-001: Debug & Test')).toBe('dev-001-debug-test');
    expect(promptTitleToSlug('A'.repeat(59) + ' B')).toBe('a'.repeat(59) + '-');
    expect(titleToSlug('A'.repeat(80))).toHaveLength(80);
  });
  it('joins by exact pack title and falls back only when unmatched', () => {
    const known = [{ id: 'published-slug', title: 'DEV-001: A Title' }];
    expect(packSlugFor('DEV-001: A Title', known)).toBe('published-slug');
    expect(packSlugFor('dev-001: a title', known)).toBe('a-title');
    expect(packSlugFor('DEV-002: Missing Pack', known)).toBe('missing-pack');
  });
  it('builds website paths with exactly the required tracking parameters', () => {
    const pack = new URL(packUrl('test-pack'));
    const prompt = new URL(promptUrl('test-pack', 'Try This!'));
    expect(pack.pathname).toBe('/pack/test-pack');
    expect(prompt.pathname).toBe('/pack/test-pack/try-this');
    for (const url of [pack, prompt]) {
      expect(url.origin).toBe('https://www.nerdychefs.ai');
      expect([...url.searchParams.entries()]).toEqual([
        ['utm_source', 'mcp'], ['utm_medium', 'tool'], ['utm_campaign', 'nerdychefs_mcp'],
      ]);
    }
  });
});
