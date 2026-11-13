<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { ModeWatcher } from 'mode-watcher';
  import NavBar from '../lib/NavBar.svelte';

  let { children } = $props();
  /** `?embed`: the page is inside another site's iframe, so it drops the site's navbar. */
  const embedded = $derived(page.url.searchParams.has('embed'));
</script>

<!-- Applies the saved theme (light, dark or the system setting) and keeps the browser's
     theme-color in step with it. -->
<ModeWatcher themeColors={{ light: '#ffffff', dark: '#111114' }} />

<!-- The page never scrolls as a whole: each page fills the space under the navbar. -->
<div class="flex h-dvh flex-col overflow-hidden">
  {#if !embedded}<NavBar />{/if}
  <main class="min-h-0 flex-1 overflow-y-auto">
    {@render children()}
  </main>
</div>
