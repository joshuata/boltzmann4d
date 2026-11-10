import { error } from '@sveltejs/kit';
import { docs, loadDoc } from '../../../lib/docs';
import type { EntryGenerator, PageLoad } from './$types';

/** Prerender a page for every Markdown file in src/docs. */
export const entries: EntryGenerator = () => docs.map(({ slug }) => ({ slug }));

export const load: PageLoad = async ({ params }) => {
  const info = docs.find((d) => d.slug === params.slug);
  const content = info && (await loadDoc(info.slug));
  if (!info || !content) error(404, `No documentation page called “${params.slug}”`);
  return { info, content };
};
