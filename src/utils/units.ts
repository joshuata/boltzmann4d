// Partial port of utils/Units.java: the Length, Mass and Energy tables, which is what the
// settings loader needs. Time, Temperature, Velocity, Momentum, Pressure and Frequency come
// with the physics and statistics ports. Conversion arithmetic matches Java exactly:
// `value * from.baseUnitEquivalent / to.baseUnitEquivalent`.

export const AVOGADROS_NUM = 6.02214179e23;

type UnitKind = 'length' | 'mass' | 'energy';

export interface Unit {
  readonly symbol: string;
  readonly kind: UnitKind;
  /** Value of one of this unit in the base unit of its kind (m, kg, J). */
  readonly baseUnitEquivalent: number;
}

const unit = (symbol: string, kind: UnitKind, baseUnitEquivalent: number): Unit => ({
  symbol,
  kind,
  baseUnitEquivalent,
});

export const Length = {
  METER: unit('m', 'length', 1.0),
  NANOMETER: unit('nm', 'length', 1.0e-9),
} as const;

export const Mass = {
  KILOGRAM: unit('kg', 'mass', 1.0),
  ATOMIC_MASS_UNIT: unit('amu', 'mass', 1.660538782e-27),
} as const;

export const Energy = {
  JOULE: unit('J', 'energy', 1.0),
  KILOJOULE: unit('kJ', 'energy', 1.0e3),
  AMU_JOULE: unit('amu·m^2/s^2', 'energy', Mass.ATOMIC_MASS_UNIT.baseUnitEquivalent),
  JOULE_PER_MOLE: unit('J/mol', 'energy', 1.0 / AVOGADROS_NUM),
  KILOJOULE_PER_MOLE: unit('kJ/mol', 'energy', 1.0e3 / AVOGADROS_NUM),
} as const;

const allUnits = new Map<string, Unit>(
  [Length, Mass, Energy].flatMap((table) => Object.values(table).map((u) => [u.symbol, u])),
);

export function getUnitWithSymbol(symbol: string): Unit {
  const found = allUnits.get(symbol);
  if (!found) throw new Error(`No unit with symbol: ${symbol}`);
  return found;
}

/** Units.convert; either side may be a Unit or its symbol. */
export function convert(fromUnit: Unit | string, toUnit: Unit | string, value: number): number {
  const from = typeof fromUnit === 'string' ? getUnitWithSymbol(fromUnit) : fromUnit;
  const to = typeof toUnit === 'string' ? getUnitWithSymbol(toUnit) : toUnit;
  if (from === to) return value;
  if (from.kind !== to.kind) {
    throw new Error('Attempted conversion of units of different types.');
  }
  const baseUnitValue = value * from.baseUnitEquivalent;
  return baseUnitValue / to.baseUnitEquivalent;
}
