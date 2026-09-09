import { describe, expect, it } from 'vitest';
import type { Prompt } from '../src/data.js';
import { filterPrompts, scorePrompt, searchPrompts } from '../src/search.js';

const makePrompt = (fields: Partial<Prompt> = {}): Prompt => ({
  id: 1, title: '', prompt: '', use_case: '', category: 'Engineering', subcategory: '',
  pack_title: 'DEV-001: Tools', tags: [], personas: [], ...fields,
});

describe('search', () => {
  it('adds weights per token, counting each grouped field only once', () => {
    const prompt = makePrompt({
      title: 'Debug debug', tags: ['debug', 'debugging'], subcategory: 'Debugging',
      use_case: 'Debug code', personas: ['Debugger'], prompt: 'Debug this code',
    });
    expect(scorePrompt(prompt, ['debug'])).toBe(7);
    expect(scorePrompt(prompt, ['debug', 'code'])).toBe(9);
  });
  it('scores each field group independently', () => {
    expect(scorePrompt(makePrompt({ title: 'alpha' }), ['alpha'])).toBe(3);
    expect(scorePrompt(makePrompt({ tags: ['alpha'] }), ['alpha'])).toBe(2);
    expect(scorePrompt(makePrompt({ subcategory: 'alpha' }), ['alpha'])).toBe(2);
    expect(scorePrompt(makePrompt({ use_case: 'alpha' }), ['alpha'])).toBe(1);
    expect(scorePrompt(makePrompt({ personas: ['alpha'] }), ['alpha'])).toBe(1);
    expect(scorePrompt(makePrompt({ prompt: 'alpha' }), ['alpha'])).toBe(1);
  });
  it('only searches prompt text for tokens of at least four characters', () => {
    const prompts = [makePrompt({ prompt: 'AI api code' })];
    expect(searchPrompts(prompts, 'ai api')).toEqual([]);
    expect(searchPrompts(prompts, 'code')).toHaveLength(1);
  });
  it('tokenizes whitespace, ignores case, ranks scores, and breaks ties by ID', () => {
    const prompts = [
      makePrompt({ id: 7, title: 'Alpha' }), makePrompt({ id: 2, title: 'ALPHA' }),
      makePrompt({ id: 9, title: 'Alpha Beta' }), makePrompt({ id: 1, title: 'Nothing' }),
    ];
    expect(searchPrompts(prompts, ' ALPHA\t beta\n').map(p => p.id)).toEqual([9, 2, 7]);
    expect(searchPrompts(prompts, '  ')).toEqual([]);
    expect(prompts.map(p => p.id)).toEqual([7, 2, 9, 1]);
  });
  it('combines exact case-insensitive filters', () => {
    const prompt = makePrompt({ personas: ['Software Engineer'], tags: ['Code Review'] });
    expect(filterPrompts([prompt], {
      category: 'ENGINEERING', persona: 'software engineer', tag: 'code review',
    })).toEqual([prompt]);
    for (const filters of [{ category: 'Engineer' }, { persona: 'Engineer' }, { tag: 'Code' }]) {
      expect(filterPrompts([prompt], filters)).toEqual([]);
    }
    expect(searchPrompts([makePrompt({ title: 'alpha' })], 'alpha', { category: 'Other' })).toEqual([]);
  });
});
