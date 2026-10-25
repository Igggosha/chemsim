import { GenericReaction } from "../genericReaction.js";
import { CARBONYL, HYDRONIUM, NUCLEOPHILE } from "./reactantGroups.js";
import {
  findKetoneAldehydeCarbonylSite,
  findNucleophilicAtom,
  makeNucleophilicAdditionProduct,
} from "./moleculeTransforms.js";

export class NucleophilicAddition extends GenericReaction {
  constructor() {
    super({
      name: "Acid-catalyzed nucleophilic addition",
      functionalGroups: [CARBONYL, NUCLEOPHILE, HYDRONIUM],
      ratePowers: [1, 1, 1],
      catalystIndices: [2],
    });
  }

  canReact(carbonylCompound, nucleophile, hydronium) {
    return (
      super.canReact(carbonylCompound, nucleophile, hydronium) &&
      findKetoneAldehydeCarbonylSite(carbonylCompound) !== null &&
      findNucleophilicAtom(nucleophile, { excludeAcetalCenters: true }) !== null
    );
  }

  RunReaction(carbonylCompound, nucleophile) {
    const carbonylSite = findKetoneAldehydeCarbonylSite(carbonylCompound);
    const nucleophileSite = findNucleophilicAtom(nucleophile, {
      excludeAcetalCenters: true,
    });
    if (!carbonylSite || !nucleophileSite) {
      throw new TypeError(
        "Nucleophilic addition requires an aldehyde or ketone and a valid nucleophile.",
      );
    }
    return [
      {
        molecule: makeNucleophilicAdditionProduct(
          carbonylCompound,
          nucleophile,
          carbonylSite,
          nucleophileSite,
        ),
        moles: 1,
      },
    ];
  }
}

export default NucleophilicAddition;
