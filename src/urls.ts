import { promptTitleToSlug, titleToSlug } from './slug.js';

const website = 'https://www.nerdychefs.ai';

function trackedUrl(segments: string[]): string {
  const url = new URL(website);
  url.pathname = ['pack', ...segments].map(encodeURIComponent).join('/');
  url.search = new URLSearchParams({
    utm_source: 'mcp',
    utm_medium: 'tool',
    utm_campaign: 'nerdychefs_mcp',
  }).toString();
  return url.toString();
}

export function packSlugFor(
  packTitle: string,
  packs: readonly { id: string; title: string }[],
): string {
  return packs.find(pack => pack.title === packTitle)?.id ?? titleToSlug(packTitle);
}

export function packUrl(packSlug: string): string {
  return trackedUrl([packSlug]);
}

export function promptUrl(packSlug: string, promptTitle: string): string {
  return trackedUrl([packSlug, promptTitleToSlug(promptTitle)]);
}
