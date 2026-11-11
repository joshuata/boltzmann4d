<script lang="ts">
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import NavBar from '../lib/NavBar.svelte';

  let { children } = $props();
</script>

<!-- Applies the saved theme (light, dark or the system setting) and keeps the browser's
     theme-color in step with it. -->
<ModeWatcher themeColors={{ light: '#ffffff', dark: '#111114' }} />

<!-- The page never scrolls as a whole: each page fills the space under the navbar. -->
<div class="flex h-dvh flex-col overflow-hidden">
  <NavBar />
  <main class="min-h-0 flex-1 overflow-y-auto">
    {@render children()}
  </main>
</div>
