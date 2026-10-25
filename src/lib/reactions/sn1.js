import { GenericReaction } from "../genericReaction.js";
import { ALKYL_HALIDE, NUCLEOPHILE } from "./reactantGroups.js";
import {
  findAlkylHalideSite,
  findNucleophilicAtom,
  getNucleophileStrength,
  makeSubstitutionProducts,
} from "./moleculeTransforms.js";

const SN1_SUBSTRATE_FACTORS = [0.001, 0.05, 1, 20];

export class Sn1 extends GenericReaction {
  constructor() {
    super({
      name: "SN1 substitution",
      functionalGroups: [ALKYL_HALIDE, NUCLEOPHILE],
      ratePowers: [1, 0],
    });
  }

  getKineticModifier(substrate, nucleophile) {
    if (!substrate) return 1;
    const site = findAlkylHalideSite(substrate);
    if (!site) return 0;
    const strength = nucleophile ? getNucleophileStrength(nucleophile) : 1;
    return SN1_SUBSTRATE_FACTORS[site.carbonDegree] * strength;
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
    if (!site) throw new TypeError("SN1 requires an alkyl chloride, bromide, or iodide.");
    if (!nucleophileSite) throw new TypeError("SN1 requires a neutral or anionic N, O, or S nucleophile.");
    return makeSubstitutionProducts(substrate, nucleophile, site, nucleophileSite, "SN1");
  }
}

export default Sn1;
