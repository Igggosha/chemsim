import { GenericReaction } from "../genericReaction.js";
import {
  CARBOXYLATE,
  CARBOXYLIC_ACID,
  HYDRONIUM,
  WATER,
} from "./reactantGroups.js";
import {
  findCarboxylicAcidSite,
  makeCarboxylicAcid,
  makeCarboxylate,
  makeHydronium,
  makeWater,
} from "./moleculeTransforms.js";

export const DEFAULT_CARBOXYLIC_ACID_KA = 1.8e-5;

export class CarboxylicAcidDissociation extends GenericReaction {
  constructor({ equilibriumConstant = DEFAULT_CARBOXYLIC_ACID_KA } = {}) {
    super({
      name: "Carboxylic acid dissociation",
      functionalGroups: [CARBOXYLIC_ACID, WATER],
      ratePowers: [1, 1],
      equilibrium: {
        constant: equilibriumConstant,
        productCount: 2,
        reverseRatePowers: [1, 1],
        productFunctionalGroups: [CARBOXYLATE, HYDRONIUM],
      },
    });
  }

  canReact(acid, water) {
    return (
      super.canReact(acid, water) &&
      findCarboxylicAcidSite(acid) !== null &&
      water.atoms.some((atom) => atom.element.symbol === "O")
    );
  }

  RunReaction(acid, water) {
    const site = findCarboxylicAcidSite(acid);
    if (!site) throw new TypeError("The acid reactant has no carboxylic acid group.");
    return [
      { molecule: makeCarboxylate(acid, site), moles: 1 },
      { molecule: makeHydronium(water), moles: 1 },
    ];
  }

  RunReverseReaction(carboxylate, hydronium) {
    return [
      { molecule: makeCarboxylicAcid(carboxylate), moles: 1 },
      { molecule: makeWater(hydronium), moles: 1 },
    ];
  }
}

export default CarboxylicAcidDissociation;
