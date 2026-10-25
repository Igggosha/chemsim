import { GenericReaction } from "../genericReaction.js";
import { ALKYL_HALIDE, BASE } from "./reactantGroups.js";
import {
  findAlkylHalideSite,
  findNucleophilicAtom,
  getBaseStrength,
  makeEliminationProducts,
} from "./moleculeTransforms.js";

const E1_SUBSTRATE_FACTORS = [0.001, 0.05, 1, 20];

export class E1 extends GenericReaction {
  constructor() {
    super({
      name: "E1 elimination",
      functionalGroups: [ALKYL_HALIDE, BASE],
      ratePowers: [1, 0],
    });
  }

  getKineticModifier(substrate, base) {
    if (!substrate) return 1;
    const site = findAlkylHalideSite(substrate);
    if (!site) return 0;
    const strength = base ? getBaseStrength(base) : 1;
    return E1_SUBSTRATE_FACTORS[site.carbonDegree] * strength;
  }

  canReact(substrate, base) {
    const site = findAlkylHalideSite(substrate);
    return (
      super.canReact(substrate, base) &&
      site !== null &&
      site.betaCarbons.length > 0 &&
      findNucleophilicAtom(base) !== null
    );
  }

  RunReaction(substrate, base) {
    const site = findAlkylHalideSite(substrate);
    const baseSite = findNucleophilicAtom(base);
    if (!site) throw new TypeError("E1 requires an alkyl chloride, bromide, or iodide.");
    if (!site.betaCarbons.length) throw new TypeError("E1 requires a beta carbon bearing hydrogen.");
    if (!baseSite) throw new TypeError("E1 requires a neutral or anionic N, O, or S base.");
    return makeEliminationProducts(substrate, base, site, baseSite);
  }
}

export default E1;
