// The simulator's sidebar panels, which a scenario can hide (EDIT-24): an instructor shows
// students only the controls and readouts a lesson needs. The Run panel (play, pause, restart)
// always shows, so it isn't listed.

/** Every sidebar panel a scenario can hide, in the order the sidebar shows them; ids match the simulator's. */
export const SIDEBAR_PANELS = [
  { id: 'view', label: 'View' },
  { id: 'particles', label: 'Particles' },
  { id: 'arena', label: 'Arena' },
  { id: 'interactions', label: 'Wells and reactions' },
  { id: 'piston', label: 'Piston', when: 'with a piston' },
  { id: 'reactions', label: 'Reactions', when: 'while particles react' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'performance', label: 'Performance' },
] as const satisfies readonly { id: string; label: string; when?: string }[];

export type SidebarPanelId = (typeof SIDEBAR_PANELS)[number]['id'];

export const SIDEBAR_PANEL_IDS = SIDEBAR_PANELS.map((p) => p.id) as [
  SidebarPanelId,
  ...SidebarPanelId[],
];
