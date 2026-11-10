<!-- Top bar. Wide screens: the app name, the 2D and 3D simulation menus, the current
     simulation, Upload and Help. Phones: the app name, the current simulation and a menu
     button that opens a sheet with the simulations, Upload, Documentation and About. -->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';
  import { Button } from '@boltzmann4d/ui/button';
  import * as Collapsible from '@boltzmann4d/ui/collapsible';
  import * as DropdownMenu from '@boltzmann4d/ui/dropdown-menu';
  import * as Sheet from '@boltzmann4d/ui/sheet';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import MenuIcon from '@lucide/svelte/icons/menu';
  import AboutDialog from './AboutDialog.svelte';
  import { docs } from './docs';

  const SOURCE_URL = 'https://github.com/joshuata/boltzmann4d';

  const menus = [
    { title: '2D', presets: presetCatalog.filter((p) => p.dimensions === 2) },
    { title: '3D', presets: presetCatalog.filter((p) => p.dimensions === 3) },
  ];
  const helpDocs = docs.filter((d) => d.slug !== 'about');

  const current = $derived(page.params.preset);
  const currentInfo = $derived(presetCatalog.find((p) => p.name === current));
  // On a simulation page, docs open in a new tab so the simulation keeps running (HELP-1).
  const docsTarget = $derived(current ? '_blank' : undefined);
  let aboutOpen = $state(false);
  let sheetOpen = $state(false);

  const presetHref = (name: string) => resolve('/simulate/[preset]', { preset: name });
  const docHref = (slug: string) => resolve('/docs/[slug]', { slug });
</script>

<header class="bg-background flex h-12 shrink-0 items-center gap-1 border-b px-3">
  <a href={resolve('/')} class="mr-2 shrink-0 font-semibold md:mr-3">Boltzmann 4D</a>

  <!-- Wide screens -->
  <nav class="hidden items-center gap-1 md:flex" aria-label="Simulations">
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
        <DropdownMenu.Content align="start" class="max-h-[70dvh] w-64 overflow-y-auto">
          <DropdownMenu.Label>{menu.title} simulations</DropdownMenu.Label>
          {#each menu.presets as preset (preset.name)}
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a
                  {...props}
                  href={presetHref(preset.name)}
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

  <!-- The running simulation's name, on every screen size. -->
  {#if currentInfo}
    <p class="text-muted-foreground min-w-0 flex-1 truncate text-sm md:ml-2">
      {currentInfo.label}
      <span class="hidden sm:inline">({currentInfo.dimensions}D)</span>
    </p>
  {:else}
    <div class="flex-1"></div>
  {/if}

  <div class="hidden items-center gap-1 md:flex">
    <Button variant="ghost" href={resolve('/upload')}>Upload</Button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost">
            Help
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-56">
        {#each helpDocs as doc (doc.slug)}
          <DropdownMenu.Item>
            {#snippet child({ props })}
              <a
                {...props}
                href={docHref(doc.slug)}
                target={docsTarget}
                rel={docsTarget && 'noopener'}>{doc.title}</a
              >
            {/snippet}
          </DropdownMenu.Item>
        {/each}
        <DropdownMenu.Item>
          {#snippet child({ props })}
            <a {...props} href={resolve('/docs')} target={docsTarget} rel={docsTarget && 'noopener'}
              >All documentation</a
            >
          {/snippet}
        </DropdownMenu.Item>
        <DropdownMenu.Item>
          {#snippet child({ props })}
            <a {...props} href={SOURCE_URL} target="_blank" rel="noopener">Source code</a>
          {/snippet}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => (aboutOpen = true)}>About Boltzmann 4D</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <!-- Phones: the simulation lists collapse (the current one starts open), then a few links. -->
  <Sheet.Root bind:open={sheetOpen}>
    <Sheet.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" size="icon" class="shrink-0 md:hidden" aria-label="Menu">
          <MenuIcon aria-hidden="true" />
        </Button>
      {/snippet}
    </Sheet.Trigger>
    <Sheet.Content side="right" class="w-72 gap-0 overflow-y-auto">
      <Sheet.Header>
        <Sheet.Title>Boltzmann 4D</Sheet.Title>
      </Sheet.Header>
      <nav class="px-2 pb-6" aria-label="Site">
        {#each menus as menu (menu.title)}
          <Collapsible.Root open={currentInfo?.dimensions === Number(menu.title[0])}>
            <Collapsible.Trigger
              class="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-2.5 text-sm font-medium [&[data-state=open]>svg]:rotate-180"
            >
              {menu.title} simulations
              <ChevronDownIcon class="size-4 transition-transform" aria-hidden="true" />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <ul class="mb-2 ml-2 border-l pl-2">
                {#each menu.presets as preset (preset.name)}
                  <li>
                    <a
                      href={presetHref(preset.name)}
                      aria-current={preset.name === current ? 'page' : undefined}
                      class="hover:bg-muted aria-[current=page]:bg-muted block rounded-md px-2 py-2 text-sm aria-[current=page]:font-semibold"
                      onclick={() => (sheetOpen = false)}>{preset.label}</a
                    >
                  </li>
                {/each}
              </ul>
            </Collapsible.Content>
          </Collapsible.Root>
        {/each}
        <ul class="mt-2 border-t pt-2">
          <li>
            <a
              href={resolve('/upload')}
              class="hover:bg-muted block rounded-md px-2 py-2.5 text-sm font-medium"
              onclick={() => (sheetOpen = false)}>Upload settings</a
            >
          </li>
          <li>
            <a
              href={resolve('/docs')}
              target={docsTarget}
              rel={docsTarget && 'noopener'}
              class="hover:bg-muted block rounded-md px-2 py-2.5 text-sm font-medium"
              onclick={() => (sheetOpen = false)}>Documentation</a
            >
          </li>
          <li>
            <button
              type="button"
              class="hover:bg-muted block w-full rounded-md px-2 py-2.5 text-left text-sm font-medium"
              onclick={() => {
                sheetOpen = false;
                aboutOpen = true;
              }}>About</button
            >
          </li>
        </ul>
      </nav>
    </Sheet.Content>
  </Sheet.Root>

  <AboutDialog bind:open={aboutOpen} />
</header>
