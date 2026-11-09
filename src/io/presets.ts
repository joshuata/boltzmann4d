// The settings files shipped with Boltzmann 3D, copied verbatim into simsettingsfiles/.
// Loaded lazily so they stay out of the main bundle until someone opens one.

const presetLoaders = import.meta.glob<string>('./simsettingsfiles/presets/*.set', {
  query: '?raw',
  import: 'default',
});

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.set$/, '');

const loadersByName = new Map(
  Object.entries(presetLoaders).map(([path, load]) => [nameOf(path), load]),
);

/** Preset names without the `.set` extension, e.g. `2Dmixture`, sorted. */
export const presetNames: readonly string[] = [...loadersByName.keys()].sort();

export async function loadPresetText(name: string): Promise<string> {
  const load = loadersByName.get(name);
  if (!load) throw new Error(`Unknown preset: ${name}`);
  return load();
}

/** The settings the Java app opens with. */
export async function loadDefaultSettingsText(): Promise<string> {
  return (await import('./simsettingsfiles/default.set?raw')).default;
}
