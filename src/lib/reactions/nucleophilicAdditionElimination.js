import { GenericReaction } from "../genericReaction.js";
import { ACYL_DERIVATIVE, HYDRONIUM, NUCLEOPHILE } from "./reactantGroups.js";
import {
  findAcylLeavingSite,
  findNucleophilicAtom,
  makeNucleophilicAcylSubstitutionProducts,
} from "./moleculeTransforms.js";

export class NucleophilicAdditionElimination extends GenericReaction {
  constructor() {
    super({
      name: "Acid-catalyzed nucleophilic addition-elimination",
      functionalGroups: [ACYL_DERIVATIVE, NUCLEOPHILE, HYDRONIUM],
      ratePowers: [1, 1, 1],
      catalystIndices: [2],
    });
  }

  canReact(acylDerivative, nucleophile, hydronium) {
    return (
      super.canReact(acylDerivative, nucleophile, hydronium) &&
      findAcylLeavingSite(acylDerivative) !== null &&
      findNucleophilicAtom(nucleophile) !== null
    );
  }

  RunReaction(acylDerivative, nucleophile) {
    const acylSite = findAcylLeavingSite(acylDerivative);
    const nucleophileSite = findNucleophilicAtom(nucleophile);
    if (!acylSite || !nucleophileSite) {
      throw new TypeError(
        "Nucleophilic addition-elimination requires an acyl chloride or anhydride and a valid nucleophile.",
      );
    }
    return makeNucleophilicAcylSubstitutionProducts(
      acylDerivative,
      nucleophile,
      acylSite,
      nucleophileSite,
    );
  }
}

export default NucleophilicAdditionElimination;
