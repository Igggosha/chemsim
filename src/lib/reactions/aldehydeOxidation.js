import { GenericReaction } from "../genericReaction.js";
import {
  DICHROMATE,
  HYDRONIUM,
  PERMANGANATE,
  CARBONYL,
} from "./reactantGroups.js";
import {
  findAldehydeSite,
  makeOxidationMetalProduct,
  makeWaterMolecule,
  oxidizeAldehydeToCarboxylicAcid,
} from "./moleculeTransforms.js";

const OXIDANTS = Object.freeze({
  dichromate: Object.freeze({
    group: DICHROMATE,
    reactantCoefficients: [3, 1, 8],
    organicProductMoles: 3,
    waterProductMoles: 12,
    metalProductMoles: 2,
  }),
  permanganate: Object.freeze({
    group: PERMANGANATE,
    reactantCoefficients: [5, 2, 6],
    organicProductMoles: 5,
    waterProductMoles: 9,
    metalProductMoles: 2,
  }),
});

export class AldehydeOxidation extends GenericReaction {
  constructor({ oxidant = "dichromate" } = {}) {
    const specification = OXIDANTS[oxidant];
    if (!specification) throw new TypeError(`Unsupported aldehyde oxidant: ${oxidant}`);
    super({
      name: `Aldehyde oxidation by ${oxidant}`,
      functionalGroups: [CARBONYL, specification.group, HYDRONIUM],
      ratePowers: [1, 1, 0],
      reactantStoichiometricCoefficients: specification.reactantCoefficients,
    });
    this.oxidant = oxidant;
    this.specification = specification;
  }

  canReact(aldehyde) {
    return findAldehydeSite(aldehyde) !== null;
  }

  RunReaction(aldehyde) {
    const site = findAldehydeSite(aldehyde);
    if (!site) throw new TypeError("Aldehyde oxidation requires an aldehyde group.");
    return [
      {
        molecule: oxidizeAldehydeToCarboxylicAcid(aldehyde, site),
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

export default AldehydeOxidation;
