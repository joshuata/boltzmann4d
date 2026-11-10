// Reaction rules between particle kinds (KIND-13), generalizing Java's red↔blue reaction
// (ReactionRelationship, SIM-25–28). A rule `A + B → C + D` turns a colliding A and B into
// C and D when their relative kinetic energy along the line of centres exceeds the forward
// activation energy, and back when the products collide above the reverse one (unless it's
// suppressed). Reacting particles change only the kind they show (`Particles.color`), not
// their mass or radius, as in Java.
//
// Rules are compiled into a table indexed by the ordered pair of colours of the colliding
// particles, so a collision looks up its reaction with one array read. The Java app's one
// rule (Red + Red → Blue + Blue) takes the same branches with the same arithmetic as the
// original two-colour test, which parity.test.ts relies on.
import { convert } from '../utils/units';
import type { Particles } from './particles';

/** One reaction rule, with kinds given by type index. Activation energies in kJ/mol. */
export interface ReactionRule {
  reactants: readonly [number, number];
  products: readonly [number, number];
  forward: number;
  reverse: number;
  suppressReverse: boolean;
}

/** The Java app's reaction: species 0 + species 0 ⇌ species 1 + species 1. */
export function javaReaction(
  forward: number,
  reverse: number,
  suppressReverse: boolean,
): ReactionRule {
  return { reactants: [0, 0], products: [1, 1], forward, reverse, suppressReverse };
}

/** Rules compiled for lookup by the colours of a colliding pair. */
export class ReactionTable {
  /** Number of kinds (types). */
  readonly kinds: number;
  /** Per ordered pair (ci · kinds + cj): the activation energy to exceed, kJ/mol (Infinity: none). */
  private readonly threshold: Float64Array;
  /** The kinetic energy the pair loses, amu·m²/s². */
  private readonly deltaE: Float64Array;
  /** The kinds particles i and j become. */
  private readonly newI: Uint16Array;
  private readonly newJ: Uint16Array;

  constructor(rules: readonly ReactionRule[], kinds: number) {
    this.kinds = kinds;
    const n = kinds * kinds;
    this.threshold = new Float64Array(n).fill(Infinity);
    this.deltaE = new Float64Array(n);
    this.newI = new Uint16Array(n);
    this.newJ = new Uint16Array(n);
    rules.forEach((rule, r) => {
      for (const k of [...rule.reactants, ...rule.products]) {
        if (!Number.isInteger(k) || k < 0 || k >= kinds) {
          throw new Error(`Reaction rule ${r + 1} uses kind ${k}, but there are ${kinds} kinds`);
        }
      }
      const [a, b] = rule.reactants;
      const [c, d] = rule.products;
      // As Java computes ΔE: Ef − Er forward, Er − Ef reverse.
      const forwardDelta = convert('kJ/mol', 'amu·m^2/s^2', rule.forward - rule.reverse);
      this.set(r, a, b, c, d, rule.forward, forwardDelta);
      if (!rule.suppressReverse) {
        const reverseDelta = convert('kJ/mol', 'amu·m^2/s^2', rule.reverse - rule.forward);
        this.set(r, c, d, a, b, rule.reverse, reverseDelta);
      }
    });
  }

  /** Registers `a + b → c + d` in both orders of the colliding pair. */
  private set(
    rule: number,
    a: number,
    b: number,
    c: number,
    d: number,
    threshold: number,
    deltaE: number,
  ): void {
    const put = (ci: number, cj: number, ni: number, nj: number) => {
      const slot = ci * this.kinds + cj;
      if (this.threshold[slot] !== Infinity) {
        throw new Error(`Reaction rule ${rule + 1}: kinds ${ci} and ${cj} already react`);
      }
      this.threshold[slot] = threshold;
      this.deltaE[slot] = deltaE;
      this.newI[slot] = ni;
      this.newJ[slot] = nj;
    };
    put(a, b, c, d);
    if (a !== b) put(b, a, d, c);
  }

  /**
   * Particles i and j collide hard with relative kinetic energy `eRel` (kJ/mol) along their
   * line of centres. If that's enough for their reaction, recolours them and returns the
   * kinetic energy they lose (amu·m²/s², negative for a gain); otherwise returns 0.
   */
  react(p: Particles, i: number, j: number, eRel: number): number {
    const slot = p.color[i]! * this.kinds + p.color[j]!;
    if (!(eRel > this.threshold[slot]!)) return 0;
    p.color[i] = this.newI[slot]!;
    p.color[j] = this.newJ[slot]!;
    return this.deltaE[slot]!;
  }
}

/**
 * The relative kinetic energy (kJ/mol) of a pair along their line of centres, from their
 * masses and velocity components along it (Java's collideWith).
 */
export function relativeEnergy(mass: number, targetMass: number, V1a: number, V2a: number): number {
  const combinedMass = mass + targetMass;
  const reducedMass = (mass * targetMass) / combinedMass;
  const relativeVelocity = V1a - V2a;
  const relativeEnergy = 0.5 * reducedMass * relativeVelocity * relativeVelocity;
  return convert('amu·m^2/s^2', 'kJ/mol', relativeEnergy);
}
