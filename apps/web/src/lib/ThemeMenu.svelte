<!-- Navbar button that picks the colour theme: light, dark or the system setting. mode-watcher
     (set up in +layout.svelte) stores the choice and toggles the `dark` class on <html>. -->
<script lang="ts">
  import { setMode, userPrefersMode } from 'mode-watcher';
  import { Button } from '@boltzmann4d/ui/button';
  import * as DropdownMenu from '@boltzmann4d/ui/dropdown-menu';
  import SunIcon from '@lucide/svelte/icons/sun';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import MonitorIcon from '@lucide/svelte/icons/monitor';

  type Mode = 'light' | 'dark' | 'system';
  const options: { value: Mode; label: string; icon: typeof SunIcon }[] = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: MonitorIcon },
  ];
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" class="shrink-0" aria-label="Theme">
        <SunIcon class="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <MoonIcon class="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-36">
    <DropdownMenu.RadioGroup
      value={userPrefersMode.current}
      onValueChange={(value) => setMode(value as Mode)}
    >
      {#each options as option (option.value)}
        <DropdownMenu.RadioItem value={option.value}>
          <option.icon aria-hidden="true" />
          {option.label}
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
