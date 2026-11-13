// Scenarios packed into a link, so a teacher can send a scenario to students as a URL. The
// scenario's JSON is deflated and base64url-encoded; the page puts the code after `#`, so it
// never reaches a server and isn't limited by server URL lengths.
import { parseScenarioJson, type Scenario } from '@boltzmann4d/engine/scenario';

/** Starts every code, so the format can change later without breaking old links. */
const PREFIX = 'v1.';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Packs a scenario, with the name to show for it, into a URL-safe code. */
export async function encodeScenarioLink(scenario: Scenario, name: string): Promise<string> {
  const named = { ...scenario, name: name.trim().slice(0, 80) || undefined };
  const json = new TextEncoder().encode(JSON.stringify(named));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/**
 * Unpacks a code from encodeScenarioLink, validating the scenario. Throws a ScenarioError
 * listing its problems, or an Error when the code itself is damaged.
 */
export async function decodeScenarioLink(code: string): Promise<Scenario> {
  if (!code.startsWith(PREFIX)) {
    throw new Error('This link is not a Boltzmann 4D scenario link, or is from a newer version.');
  }
  let json: string;
  try {
    const bytes = await pipe(
      fromBase64Url(code.slice(PREFIX.length)),
      new DecompressionStream('deflate-raw'),
    );
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error(
      'This link is damaged: part of it may be missing. Ask for it to be sent again.',
    );
  }
  return parseScenarioJson(json);
}
