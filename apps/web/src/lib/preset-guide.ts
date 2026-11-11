// The home page's guide to the bundled presets: what each one shows, grouped by topic.
// Most presets come in a 2D and a 3D version (`2Dbrownian`, `3Dbrownian`), so the guide
// lists each idea once with a link per dimension.
import { presetCatalog, type PresetInfo } from '@boltzmann4d/engine/io/presets';

export interface GuideEntry {
  title: string;
  description: string;
  /** The preset in each dimension it exists in, 2D first. */
  presets: PresetInfo[];
}

export interface GuideTopic {
  title: string;
  entries: GuideEntry[];
}

/** A preset's name without its dimension prefix: `2Dbrownian` → `brownian`. */
const ideaOf = (name: string) => name.replace(/^[123]D/, '');

const TOPICS: { title: string; ideas: Record<string, string> }[] = [
  {
    title: 'Speeds and temperature',
    ideas: {
      default:
        'A simple gas of identical particles. Watch their speeds settle into the Maxwell–Boltzmann distribution.',
      hyd100: 'Hydrogen (2 amu) at 100 K. Compare it with oxygen at the same temperature.',
      hyd1000: 'Hydrogen at 1000 K: the speed distribution spreads out as the gas heats up.',
      oxy100: 'Oxygen (32 amu) at 100 K moves about four times slower than hydrogen.',
      oxy1000: 'Oxygen at 1000 K, for comparing temperatures and masses.',
      mixture:
        'Hydrogen and oxygen together: different speeds, but the same average kinetic energy.',
    },
  },
  {
    title: 'Pressure',
    ideas: {
      presnum: 'A divided box with more particles on one side: pressure grows with their number.',
      hotcold: 'A divided box with a hot gas and a cooler one: the hot side pushes harder.',
    },
  },
  {
    title: 'Moving and mixing',
    ideas: {
      brownian: 'One big, heavy particle among many small ones staggers about as they hit it.',
      diffuse: 'Follow one tagged particle as it wanders through a crowd of identical ones.',
      effuse:
        'Light and heavy particles escape through a hole, the light ones faster (Graham’s law). Starts paused.',
    },
  },
  {
    title: 'Energy, chaos and equilibrium',
    ideas: {
      entropy:
        'One very hot particle hits a cold cluster: its energy spreads out and never gathers back. Starts paused.',
      equil:
        'Particles turn Type A ⇌ Type B until the mix settles at equilibrium (reactions run in 2D).',
      equal: 'Two halves start identical; chaos makes them drift apart after about 100 ps.',
      liquid: 'Large particles packed closely in a periodic box behave like a liquid.',
    },
  },
];

function entriesFor(ideas: Record<string, string>): GuideEntry[] {
  return Object.entries(ideas)
    .map(([idea, description]) => {
      const presets = presetCatalog.filter((p) => ideaOf(p.name) === idea);
      return { title: presets[0]?.label ?? idea, description, presets };
    })
    .filter((entry) => entry.presets.length > 0);
}

const described = new Set(TOPICS.flatMap((t) => Object.keys(t.ideas)));
const undescribed = [...new Set(presetCatalog.map((p) => ideaOf(p.name)))].filter(
  (idea) => !described.has(idea),
);

/** Topics in reading order. Presets the guide doesn't describe yet still appear, under "More". */
export const presetGuide: GuideTopic[] = [
  ...TOPICS.map(({ title, ideas }) => ({ title, entries: entriesFor(ideas) })),
  ...(undescribed.length > 0
    ? [{ title: 'More', entries: entriesFor(Object.fromEntries(undescribed.map((i) => [i, '']))) }]
    : []),
];
