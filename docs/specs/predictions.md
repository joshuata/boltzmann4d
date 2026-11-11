# Predictions

The theoretical values the app shows next to measured ones (orange lines, black curves, Predicted fields). Source: manual §IV, §V, §VII–XI. `packages/engine/src/stats/formulas.ts` implements these; the Java `Formulas` and `StatUtils` classes are the exact reference, especially where the PDF's equations didn't survive text extraction (marked _verify_).

Notation: d = dimension, M = molar mass, R = gas constant, T = temperature, N = particle count, r = radius, σ = 2r, A = area (2D), V = volume (3D), L = length (1D).

## Single species

- **PRED-1** Speeds and widths:

| Quantity | 1D | 2D | 3D |
| --- | --- | --- | --- |
| Most probable speed | 0 | `sqrt(RT/M)` | `sqrt(2RT/M)` |
| Average speed | `sqrt(2RT/(πM))` | `sqrt(πRT/(2M))` | `sqrt(8RT/(πM))` |
| RMS speed | `sqrt(RT/M)` | `sqrt(2RT/M)` | `sqrt(3RT/M)` |
| Speed width | `v_rms` | `sqrt((2 − π/2) RT/M)` | `sqrt((3 − 8/π) RT/M)` |
| Velocity component: average, width | 0, `sqrt(RT/M)` | same | same |
| Average relative speed | `sqrt(2) v_avg` | `sqrt(2) v_avg` | `sqrt(2) v_avg` |
| Average kinetic energy (per mole) | `RT/2` | `RT` | `3RT/2` |

- **PRED-2** Distributions drawn as black curves: Gaussian for velocity components; `f(v) = (Mv/RT) exp(−Mv²/2RT)` in 2D and `4π (M/2πRT)^{3/2} v² exp(−Mv²/2RT)` in 3D for speed; the Boltzmann distribution for kinetic energy; exponentials for free path and collision time.
- **PRED-3** Mean free path λ and collision lifetime τ (ideal):

|     | 1D                    | 2D                          | 3D                             |
| --- | --------------------- | --------------------------- | ------------------------------ |
| λ   | `L_net / (sqrt(2) N)` | `A / (4 sqrt(2) r N)`       | `V / (4 sqrt(2) π r² N)`       |
| τ   | `λ / v_avg`           | `A / (4 sqrt(2) r N v_avg)` | `V / (4 sqrt(2) π r² N v_avg)` |

In 1D, `L_net = L − Σ 2rᵢ` (space not taken by particles).

- **PRED-4** Free path and collision time are exponentially distributed, so width = average (σ_λ = λ, σ_τ = τ).
- **PRED-5** Collision rate averages `1/τ` with width `1/sqrt(t τ)` at simulated time t; its curve is a Gaussian centred at `1/τ` (from a Poisson process, via Stirling's approximation).

## Mixtures (red = 1, blue = 2)

- **PRED-6** Velocity and energy predictions don't depend on the other type. For type 1 (swap subscripts for type 2):

| Quantity | 2D | 3D |
| --- | --- | --- |
| λ₁ | `A / (2^{3/2} [2 r₁ N₁ + (r₁ + r₂) N₂])` | `V / (sqrt(2) π [4 r₁² N₁ + (r₁ + r₂)² N₂])` |
| τ₁ | `A / (2 v_avg,1 [2^{3/2} r₁ N₁ + (r₁ + r₂) N₂ sqrt(1 + m₁/m₂)])` | `V / (π v_avg,1 [2^{5/2} r₁² N₁ + (r₁ + r₂)² N₂ sqrt(1 + m₁/m₂)])` |

Widths follow PRED-4 and PRED-5.

- **PRED-7** With Both selected, predictions are number-weighted averages of the two types' predictions.

## Real gas (Real button)

- **PRED-8** Pressure uses the hard-disk / hard-sphere virial expansion in `x = B₂ ρ`, with `B₂ = 2πr²` (2D) or `16πr³/3` (3D), accurate to eight virial coefficients, written as `P V_d / (N k T) = 1 + x Q(x)`-style rational fit with these constants (_verify_ the exact form against `Formulas`). _Web port:_ verified against `Pressure.getPredictionForAverage`: each kind's ideal pressure times `1 + x Q(x)`, with `Q(x) = (1 + e1 x + e2 x² + e3 x³) / (1 + f1 x + f2 x² + f3 x³)` (`realGasPressureFactor` in `formulas.ts`):

|     | 2D          | 3D          |
| --- | ----------- | ----------- |
| e1  | −0.25233539 | 1.30542183  |
| e2  | 0.02704323  | 0.11627913  |
| e3  | 0.00077137  | 0.02452331  |
| f1  | −1.03433982 | 0.68042183  |
| f2  | 0.30366975  | −0.59593402 |
| f3  | −0.01974721 | 0.09148337  |

- **PRED-9** With Real on, `λ_real = λ_ideal / Q(x)`, `τ_real = τ_ideal / Q(x)`, `rate_real = rate_ideal × Q(x)`. These corrections are less accurate for mixtures.
- **PRED-10** 1D with walls has an exact equation of state: pressure from momentum transfer at a wall with `L` replaced by `L_net` (diverges at close packing).

## Finite system corrections (option)

- **PRED-11** The simulation is microcanonical (fixed N, V, E), so distributions differ from Maxwell–Boltzmann by order 1/N (about 1% at 100 particles, up to 5% at 20). With the option on, predictions apply known corrections:
  - With walls, density uses `N − 1` and the accessible volume `(L_x − 2r)(L_y − 2r)[(L_z − 2r)]`.
  - With walls, an effective `B₂` corrected for edges and corners (2D: `B₂ [1 − (2/π)(σ/L_x + σ/L_y) + (6/π) σ²/(L_x L_y)]`; 3D has terms to third order; _verify_).
  - With periodic boundaries, centre-of-mass momentum is conserved, so the velocity distribution is that of `N − 1` particles with the same average energy.
  - RMS velocity with finite corrections must work on periodic arenas (it throws in the Java app; see plan 0004).

## Reaction equilibrium

- **PRED-12** For `2 red ⇌ 2 blue` at fixed energy, the predicted blue count and its width come from the microcanonical partition function: a sum over N₂ (even only, or odd only if the run started with an odd number of blue) of `C(N, N₂) · [E − N₂ ΔE / 2]^{dN/2 − 1}`, skipping terms where the bracket is negative. `<N₂>` and `<N₂²>` give the average and width. These need not be integers.
- **PRED-13** In the large-N limit this matches `K = N₂/N₁ = exp(−ΔE / RT)` with T the final (not initial) temperature, `d N k T / 2 = E₀ − <N₂> ΔE / 2`. Only ΔE affects the equilibrium; the activation energies set the rate.
- **PRED-14** Reference values: the `2Dequil` preset (50 particles, defaults) predicts 13.3 blue in 2D; `3Dequil` predicts 14.1.

## Adiabatic changes

- **PRED-15** For a slow piston, `T₂ / T₁ = (V₁ / V₂)^{2/d}` (exponent R/c_v; 2/3 in 3D). After a compression and a re-expansion, a finite system usually ends slightly hotter than it started; the app must not force it back.
