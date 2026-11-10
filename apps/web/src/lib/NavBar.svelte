<!-- Top bar: the app name (home link), then a menu of simulations per dimension. -->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';
  import { Button } from '@boltzmann4d/ui/button';
  import * as DropdownMenu from '@boltzmann4d/ui/dropdown-menu';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

  const menus = [
    { title: '2D', presets: presetCatalog.filter((p) => p.dimensions === 2) },
    { title: '3D', presets: presetCatalog.filter((p) => p.dimensions === 3) },
  ];

  const current = $derived(page.params.preset);
</script>

<header class="bg-background flex h-12 shrink-0 items-center gap-1 border-b px-3">
  <a href={resolve('/')} class="mr-3 font-semibold">Boltzmann 4D</a>
  <nav class="flex items-center gap-1" aria-label="Simulations">
    {#each menus as menu (menu.title)}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant={menu.presets.some((p) => p.name === current) ? 'secondary' : 'ghost'}
            >
              {menu.title}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-64">
          <DropdownMenu.Label>{menu.title} simulations</DropdownMenu.Label>
          {#each menu.presets as preset (preset.name)}
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/simulate/[preset]', { preset: preset.name })}
                  aria-current={preset.name === current ? 'page' : undefined}
                  class={[props.class as string, preset.name === current && 'font-semibold']}
                >
                  {preset.label}
                </a>
              {/snippet}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/each}
  </nav>
</header>
