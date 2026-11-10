// Partial port of utils/data/SimulationInfo.java: its enums and constants. The SimulationInfo
// class itself (built from a SimulationInfoSupplier) comes with the physics port.
import { convert } from '../utils/units';

export const ArenaType = {
  PERIODIC_BOUNDARIES: 'PERIODIC_BOUNDARIES',
  REFLECTING_BOUNDARIES: 'REFLECTING_BOUNDARIES',
  DIVIDED_ARENA: 'DIVIDED_ARENA',
  DIVIDED_ARENA_WITH_HOLE: 'DIVIDED_ARENA_WITH_HOLE',
  MOVABLE_PISTON: 'MOVABLE_PISTON',
} as const;
export type ArenaType = (typeof ArenaType)[keyof typeof ArenaType];

export const DividerThermalMode = {
  INSULATING: 'INSULATING',
  CONDUCTING: 'CONDUCTING',
} as const;
export type DividerThermalMode = (typeof DividerThermalMode)[keyof typeof DividerThermalMode];

export const WallEnum = {
  FRONT: 'FRONT',
  BACK: 'BACK',
  TOP: 'TOP',
  BOTTOM: 'BOTTOM',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type WallEnum = (typeof WallEnum)[keyof typeof WallEnum];

export const ARENA_DIVIDER_RADIUS = convert('nm', 'm', 1.0);
export const PISTON_SHAFT_RADIUS = convert('nm', 'm', 1.0);
export const PISTON_VALVE_RADIUS = convert('nm', 'm', 2.0);
export const MAXIMUM_ARENA_SIDE_LENGTH = convert('nm', 'm', 500.0);
/** Highest initial temperature, in kelvin, that a settings file may request. */
export const MAXIMUM_INITIAL_TEMPERATURE = 1500.0;
