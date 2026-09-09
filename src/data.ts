import { z } from 'zod';

const strings = z.array(z.string());
const promptSchema = z.object({
  id: z.number().int(), title: z.string(), prompt: z.string(),
  use_case: z.string(), category: z.string(), subcategory: z.string(),
  pack_title: z.string(), tags: strings, personas: strings,
});
const packSchema = z.object({
  id: z.string(), title: z.string(), category: z.string(), description: z.string(),
  tags: strings, personas: strings, total_prompts: z.number().int(),
  sections: z.array(z.object({
    title: z.string(), description: z.string(), prompt_count: z.number().int(),
  })),
});
const categorySchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), icon: z.string(),
  subcategories: strings, prompt_count: z.number().int(),
});
const countSchema = z.object({ name: z.string(), count: z.number().int() });
const meta = z.object({}).passthrough();
const documents = {
  prompts: z.object({ _meta: meta, prompts: z.array(promptSchema) }),
  packs: z.object({ _meta: meta, packs: z.array(packSchema) }),
  categories: z.object({ _meta: meta, categories: z.array(categorySchema) }),
  personas: z.object({ _meta: meta, personas: z.array(countSchema) }),
  tags: z.object({ _meta: meta, tags: z.array(countSchema) }),
};

export type Prompt = z.infer<typeof promptSchema>;
export type Pack = z.infer<typeof packSchema>;
type File = keyof typeof documents;
type Document<K extends File> = z.infer<(typeof documents)[K]>;
export interface DataOptions { apiBase?: string }

export const CACHE_TTL_MS = 60 * 60 * 1000;

export class DataStore {
  private readonly base: URL;
  private readonly cache = new Map<File, { value: unknown; expiresAt: number }>();
  private readonly pending = new Map<File, Promise<unknown>>();

  constructor(options: DataOptions = {}) {
    this.base = new URL(options.apiBase ?? process.env.NERDYCHEFS_API_BASE
      ?? 'https://www.nerdychefs.ai/api');
    const production = this.base.hostname === 'www.nerdychefs.ai'
      && this.base.protocol === 'https:' && !this.base.port;
    const fixture = ['127.0.0.1', '[::1]', 'localhost'].includes(this.base.hostname)
      && this.base.protocol === 'http:';
    if ((!production && !fixture) || this.base.username || this.base.password
      || this.base.search || this.base.hash) {
      throw new Error('NERDYCHEFS_API_BASE must use https://www.nerdychefs.ai or a local HTTP fixture server.');
    }
    this.base.pathname = this.base.pathname.replace(/\/?$/, '/');
  }

  async load<K extends File>(file: K): Promise<Document<K>> {
    const cached = this.cache.get(file);
    if (cached && cached.expiresAt > Date.now()) return cached.value as Document<K>;
    const pending = this.pending.get(file);
    if (pending) return pending as Promise<Document<K>>;
    const request = this.fetchDocument(file).then(value => {
      this.cache.set(file, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }).finally(() => this.pending.delete(file));
    this.pending.set(file, request);
    return request;
  }

  private async fetchDocument<K extends File>(file: K): Promise<Document<K>> {
    const filename = `${file}.json`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(new URL(filename, this.base), {
          redirect: 'error', signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return documents[file].parse(await response.json()) as Document<K>;
      } catch {
        if (attempt === 1) {
          throw new Error(`Could not load ${filename}; the site may be unreachable or returned invalid data.`);
        }
      }
    }
    throw new Error(`Could not load ${filename}; the site may be unreachable.`);
  }
}
