<!-- Share: a panel with a link that runs the scenario (to send to students) and an iframe
     snippet that embeds it in another page, each with a copy button. The scenario travels in
     the link (encodeScenarioLink); the page decides what the link's URL is through shareUrl. -->
<script lang="ts">
  import type { Scenario } from '@boltzmann4d/engine/scenario';
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import * as Popover from '@boltzmann4d/ui/popover';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Share2Icon from '@lucide/svelte/icons/share-2';
  import { encodeScenarioLink } from './scenario-link';

  interface Props {
    /** The scenario to share, or null while it has problems that stop it running. */
    scenario: Scenario | null;
    name: string;
    /** The full URL of the page that runs a link code; `embed` for one shown in an iframe. */
    shareUrl: (code: string, embed: boolean) => string;
  }

  let { scenario, name, shareUrl }: Props = $props();

  let open = $state(false);
  let code = $state<string | null>(null);
  let problem = $state<string | null>(null);
  /** Which field was just copied, to show a tick for a moment. */
  let copied = $state<'link' | 'embed' | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  // Make the link each time the panel opens, from the scenario as it is then.
  $effect(() => {
    if (!open || !scenario) return;
    let current = true;
    code = null;
    problem = null;
    encodeScenarioLink(scenario, name).then(
      (made) => current && (code = made),
      (error: unknown) =>
        current && (problem = error instanceof Error ? error.message : String(error)),
    );
    return () => (current = false);
  });

  const link = $derived(code ? shareUrl(code, false) : '');
  const escapeAttribute = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const snippet = $derived(
    code
      ? `<iframe src="${escapeAttribute(shareUrl(code, true))}" title="${escapeAttribute(name.trim() || 'Boltzmann 4D scenario')}" width="100%" height="640" style="border: 0" allow="fullscreen"></iframe>`
      : '',
  );

  async function copy(which: 'link' | 'embed', text: string, field: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      copied = which;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), 2000);
    } catch {
      // Clipboard blocked (e.g. an insecure page): select the text to copy by hand.
      (field as HTMLInputElement | HTMLTextAreaElement | null)?.select();
    }
  }

  let linkField = $state<HTMLInputElement | null>(null);
  let snippetField = $state<HTMLTextAreaElement | null>(null);
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        disabled={!scenario}
        title={scenario
          ? 'Share a link or embed this scenario'
          : 'Fix the problems listed to share it'}
      >
        <Share2Icon aria-hidden="true" />
        Share
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-[min(28rem,calc(100vw-2rem))]">
    <Popover.Header>
      <Popover.Title>Share this scenario</Popover.Title>
      <Popover.Description>
        The whole scenario is in the link, so nothing is uploaded. Later edits need a new link.
      </Popover.Description>
    </Popover.Header>
    {#if problem}
      <p class="text-destructive text-sm" role="alert">Couldn't make a link: {problem}</p>
    {:else}
      <div class="space-y-1.5">
        <label for="share-link" class="text-xs font-medium">Link, e.g. to send to students</label>
        <div class="flex gap-2">
          <Input
            id="share-link"
            bind:ref={linkField}
            readonly
            value={code ? link : 'Making the link…'}
            class="min-w-0 flex-1 font-mono text-xs"
            onfocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="icon"
            disabled={!code}
            aria-label={copied === 'link' ? 'Copied' : 'Copy the link'}
            title="Copy the link"
            onclick={() => void copy('link', link, linkField)}
          >
            {#if copied === 'link'}<CheckIcon aria-hidden="true" />{:else}<CopyIcon
                aria-hidden="true"
              />{/if}
          </Button>
        </div>
      </div>
      <div class="space-y-1.5">
        <label for="share-embed" class="text-xs font-medium">Embed in a web page</label>
        <div class="flex items-start gap-2">
          <textarea
            id="share-embed"
            bind:this={snippetField}
            readonly
            rows="4"
            class="border-input bg-background min-w-0 flex-1 resize-none rounded-md border px-3 py-2 font-mono text-xs break-all"
            value={code ? snippet : 'Making the snippet…'}
            onfocus={(e) => e.currentTarget.select()}></textarea>
          <Button
            variant="outline"
            size="icon"
            disabled={!code}
            aria-label={copied === 'embed' ? 'Copied' : 'Copy the embed code'}
            title="Copy the embed code"
            onclick={() => void copy('embed', snippet, snippetField)}
          >
            {#if copied === 'embed'}<CheckIcon aria-hidden="true" />{:else}<CopyIcon
                aria-hidden="true"
              />{/if}
          </Button>
        </div>
      </div>
      <p class="sr-only" role="status">{copied ? 'Copied to the clipboard' : ''}</p>
    {/if}
  </Popover.Content>
</Popover.Root>
