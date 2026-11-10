// The site's documentation: Markdown files in src/docs, compiled by mdsvex. Adding a file
// there adds a page at /docs/<file name>; its frontmatter gives the title, a one-line
// description and its place in the list.
import type { Component } from 'svelte';

export interface DocInfo {
  /** The file name without `.md`, used in the URL. */
  slug: string;
  title: string;
  description: string;
  order: number;
}

const metadata = import.meta.glob<Record<string, unknown>>('../docs/*.md', {
  eager: true,
  import: 'metadata',
});
const components = import.meta.glob<Component>('../docs/*.md', { import: 'default' });

const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.md'.length);

/** Every doc page, in menu order. */
export const docs: DocInfo[] = Object.entries(metadata)
  .map(([path, data]) => ({
    slug: slugOf(path),
    title: String(data.title ?? slugOf(path)),
    description: String(data.description ?? ''),
    order: Number(data.order ?? Infinity),
  }))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

/** Loads a doc page's content, or returns null if there is no such page. */
export async function loadDoc(slug: string): Promise<Component | null> {
  const load = components[`../docs/${slug}.md`];
  return load ? load() : null;
}
