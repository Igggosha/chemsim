import { GenericReaction } from "../genericReaction.js";
import {
  ALCOHOL,
  DICHROMATE,
  HYDRONIUM,
  PERMANGANATE,
} from "./reactantGroups.js";
import {
  findOxidizableAlcoholSite,
  makeOxidationMetalProduct,
  makeWaterMolecule,
  oxidizeAlcoholToCarbonyl,
} from "./moleculeTransforms.js";

const OXIDANTS = Object.freeze({
  dichromate: Object.freeze({
    group: DICHROMATE,
    reactantCoefficients: [3, 1, 8],
    organicProductMoles: 3,
    waterProductMoles: 15,
    metalProductMoles: 2,
  }),
  permanganate: Object.freeze({
    group: PERMANGANATE,
    reactantCoefficients: [5, 2, 6],
    organicProductMoles: 5,
    waterProductMoles: 14,
    metalProductMoles: 2,
  }),
});

export class AlcoholOxidation extends GenericReaction {
  constructor({ oxidant = "dichromate" } = {}) {
    const specification = OXIDANTS[oxidant];
    if (!specification) throw new TypeError(`Unsupported alcohol oxidant: ${oxidant}`);
    super({
      name: `Alcohol oxidation by ${oxidant}`,
      functionalGroups: [ALCOHOL, specification.group, HYDRONIUM],
      ratePowers: [1, 1, 0],
      reactantStoichiometricCoefficients: specification.reactantCoefficients,
    });
    this.oxidant = oxidant;
    this.specification = specification;
  }

  canReact(alcohol) {
    return findOxidizableAlcoholSite(alcohol) !== null;
  }

  RunReaction(alcohol, oxidant) {
    const site = findOxidizableAlcoholSite(alcohol);
    if (!site) {
      throw new TypeError("Alcohol oxidation requires a primary or secondary alcohol.");
    }
    return [
      {
        molecule: oxidizeAlcoholToCarbonyl(alcohol, site),
        moles: this.specification.organicProductMoles,
      },
      {
        molecule: makeOxidationMetalProduct(this.oxidant),
        moles: this.specification.metalProductMoles,
      },
      { molecule: makeWaterMolecule(), moles: this.specification.waterProductMoles },
    ];
  }
}

export default AlcoholOxidation;
