// Markdown compiled by mdsvex (see vite.config.ts): a component plus its frontmatter.
declare module '*.md' {
  import type { Component } from 'svelte';
  export const metadata: Record<string, unknown>;
  const component: Component;
  export default component;
}
