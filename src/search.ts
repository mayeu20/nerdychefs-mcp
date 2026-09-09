import type { Prompt } from './data.js';

export interface Filters { category?: string; persona?: string; tag?: string }

export function filterPrompts(prompts: readonly Prompt[], filters: Filters): Prompt[] {
  return prompts.filter(prompt =>
    (filters.category === undefined || prompt.category.toLowerCase() === filters.category.toLowerCase())
    && (filters.persona === undefined || prompt.personas.some(value => value.toLowerCase() === filters.persona!.toLowerCase()))
    && (filters.tag === undefined || prompt.tags.some(value => value.toLowerCase() === filters.tag!.toLowerCase())));
}

export function scorePrompt(prompt: Prompt, tokens: readonly string[]): number {
  const contains = (text: string, token: string) => text.toLowerCase().includes(token);
  return tokens.reduce((score, token) => score
    + (contains(prompt.title, token) ? 3 : 0)
    + (prompt.tags.some(value => contains(value, token)) || contains(prompt.subcategory, token) ? 2 : 0)
    + (contains(prompt.use_case, token) || prompt.personas.some(value => contains(value, token)) ? 1 : 0)
    + (token.length >= 4 && contains(prompt.prompt, token) ? 1 : 0), 0);
}

export function searchPrompts(prompts: readonly Prompt[], query: string, filters: Filters = {}): Prompt[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return filterPrompts(prompts, filters)
    .map(prompt => ({ prompt, score: scorePrompt(prompt, tokens) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.prompt.id - b.prompt.id)
    .map(result => result.prompt);
}

export function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
