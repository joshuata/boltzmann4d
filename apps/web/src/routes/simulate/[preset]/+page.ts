import { error } from '@sveltejs/kit';
import { presetCatalog } from '@boltzmann4d/engine/io/presets';
import type { EntryGenerator, PageLoad } from './$types';

/** Prerender a page for every bundled preset. */
export const entries: EntryGenerator = () => presetCatalog.map(({ name }) => ({ preset: name }));

export const load: PageLoad = ({ params }) => {
  const info = presetCatalog.find((p) => p.name === params.preset);
  if (!info) error(404, `Unknown preset: ${params.preset}`);
  return { preset: info.name, label: info.label, dimensions: info.dimensions };
};
