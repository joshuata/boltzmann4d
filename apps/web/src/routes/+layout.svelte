<script lang="ts">
  import '../app.css';
  import NavBar from '../lib/NavBar.svelte';

  let { children } = $props();
</script>

<!-- The page never scrolls as a whole: each page fills the space under the navbar. -->
<div class="flex h-dvh flex-col overflow-hidden">
  <NavBar />
  <main class="min-h-0 flex-1 overflow-y-auto">
    {@render children()}
  </main>
</div>
