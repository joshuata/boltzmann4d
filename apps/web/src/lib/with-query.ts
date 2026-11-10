import type { ResolvedPathname } from '$app/types';

/**
 * A resolve()d path with a query string added, e.g. `/upload?id=…`. resolve() takes no query,
 * and svelte/no-navigation-without-resolve only accepts ResolvedPathname values, so this keeps
 * the type: the query doesn't change which page the path names.
 */
export function withQuery(path: ResolvedPathname, query: Record<string, string>): ResolvedPathname {
  return `${path}?${new URLSearchParams(query).toString()}` as ResolvedPathname;
}
