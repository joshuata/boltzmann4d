// The .set files shipped with Boltzmann 3D, copied into simsettingsfiles/. They are verbatim
// except default, 2Dpresnum and 3Dpresnum: Java saved those as fixed positions all at one
// speed, which we write as the equivalent RandomlyPlaced blocks so each run starts fresh.
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

/** The scenario the Java app opens with. */
export async function loadDefaultSetFileText(): Promise<string> {
  return (await import('./simsettingsfiles/default.set?raw')).default;
}

export interface PresetInfo {
  /** File name without `.set`, as accepted by loadPresetText. */
  name: string;
  label: string;
  dimensions: 1 | 2 | 3;
}

/** The presets the Java app offers, with its labels (resources/SimulationPresets.java). */
export const presetCatalog: readonly PresetInfo[] = [
  { name: 'default', label: 'Original default', dimensions: 2 },
  { name: '2Dbrownian', label: 'Brownian motion', dimensions: 2 },
  { name: '2Ddiffuse', label: 'Diffusion', dimensions: 2 },
  { name: '2Deffuse', label: 'Effusion', dimensions: 2 },
  { name: '2Dentropy', label: 'Entropy', dimensions: 2 },
  { name: '2Dequal', label: 'Equal masses', dimensions: 2 },
  { name: '2Dequil', label: 'Equilibration', dimensions: 2 },
  { name: '2Dhotcold', label: 'Hot and cold', dimensions: 2 },
  { name: '2Dhyd100', label: 'Hydrogen, 100 K', dimensions: 2 },
  { name: '2Dhyd1000', label: 'Hydrogen, 1000 K', dimensions: 2 },
  { name: '2Dliquid', label: 'Liquid', dimensions: 2 },
  { name: '2Dmixture', label: 'Hydrogen / oxygen mixture', dimensions: 2 },
  { name: '2Doxy100', label: 'Oxygen, 100 K', dimensions: 2 },
  { name: '2Doxy1000', label: 'Oxygen, 1000 K', dimensions: 2 },
  { name: '2Dpresnum', label: 'Pressure and particle number', dimensions: 2 },
  { name: '3Dbrownian', label: 'Brownian motion', dimensions: 3 },
  { name: '3Ddiffuse', label: 'Diffusion', dimensions: 3 },
  { name: '3Deffuse', label: 'Effusion', dimensions: 3 },
  { name: '3Dentropy', label: 'Entropy', dimensions: 3 },
  { name: '3Dequil', label: 'Equilibration', dimensions: 3 },
  { name: '3Dhotcold', label: 'Hot and cold', dimensions: 3 },
  { name: '3Dhyd100', label: 'Hydrogen, 100 K', dimensions: 3 },
  { name: '3Dhyd1000', label: 'Hydrogen, 1000 K', dimensions: 3 },
  { name: '3Dmixture', label: 'Hydrogen / oxygen mixture', dimensions: 3 },
  { name: '3Doxy100', label: 'Oxygen, 100 K', dimensions: 3 },
  { name: '3Doxy1000', label: 'Oxygen, 1000 K', dimensions: 3 },
  { name: '3Dpresnum', label: 'Pressure and particle number', dimensions: 3 },
];
