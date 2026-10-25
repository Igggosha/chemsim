import { GenericReaction } from "../genericReaction.js";
import { ALKYL_HALIDE, NUCLEOPHILE } from "./reactantGroups.js";
import {
  findAlkylHalideSite,
  findNucleophilicAtom,
  getNucleophileStrength,
  makeSubstitutionProducts,
} from "./moleculeTransforms.js";

const SN2_SUBSTRATE_FACTORS = [20, 10, 1, 0];

export class Sn2 extends GenericReaction {
  constructor() {
    super({
      name: "SN2 substitution",
      functionalGroups: [ALKYL_HALIDE, NUCLEOPHILE],
      ratePowers: [1, 1],
    });
  }

  getKineticModifier(substrate, nucleophile) {
    if (!substrate) return 1;
    const site = findAlkylHalideSite(substrate);
    if (!site) return 0;
    const strength = nucleophile ? getNucleophileStrength(nucleophile) : 1;
    return SN2_SUBSTRATE_FACTORS[site.carbonDegree] * strength;
  }

  canReact(substrate, nucleophile) {
    return (
      super.canReact(substrate, nucleophile) &&
      findAlkylHalideSite(substrate) !== null &&
      findNucleophilicAtom(nucleophile) !== null
    );
  }

  RunReaction(substrate, nucleophile) {
    const site = findAlkylHalideSite(substrate);
    const nucleophileSite = findNucleophilicAtom(nucleophile);
    if (!site) throw new TypeError("SN2 requires an alkyl chloride, bromide, or iodide.");
    if (!nucleophileSite) throw new TypeError("SN2 requires a neutral or anionic N, O, or S nucleophile.");
    return makeSubstitutionProducts(substrate, nucleophile, site, nucleophileSite, "SN2");
  }
}

export default Sn2;
