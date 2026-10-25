import { GenericReaction } from "../genericReaction.js";
import { HALIDE_ION, HYDROGEN_HALIDE, HYDRONIUM, WATER } from "./reactantGroups.js";
import {
  makeHalideIon,
  makeHydrogenHalide,
  makeHydronium,
  makeWater,
} from "./moleculeTransforms.js";

export const DEFAULT_HYDROGEN_HALIDE_KA = 1e7;

export class HydrogenHalideDissociation extends GenericReaction {
  constructor({ equilibriumConstant = DEFAULT_HYDROGEN_HALIDE_KA } = {}) {
    super({
      name: "Hydrogen halide dissociation",
      functionalGroups: [HYDROGEN_HALIDE, WATER],
      ratePowers: [1, 1],
      equilibrium: {
        constant: equilibriumConstant,
        productCount: 2,
        reverseRatePowers: [1, 1],
        productFunctionalGroups: [HYDRONIUM, HALIDE_ION],
      },
    });
  }

  canReact(hydrogenHalide, water) {
    return (
      super.canReact(hydrogenHalide, water) &&
      hydrogenHalide.atoms.some(
        (atom) =>
          ["F", "Cl", "Br", "I"].includes(atom.element.symbol) &&
          atom.formalCharge === 0 &&
          atom.implicitHydrogens === 1,
      ) &&
      water.atoms.some((atom) => atom.element.symbol === "O")
    );
  }

  RunReaction(hydrogenHalide, water) {
    return [
      { molecule: makeHydronium(water), moles: 1 },
      { molecule: makeHalideIon(hydrogenHalide), moles: 1 },
    ];
  }

  RunReverseReaction(hydronium, halideIon) {
    return [
      { molecule: makeHydrogenHalide(halideIon), moles: 1 },
      { molecule: makeWater(hydronium), moles: 1 },
    ];
  }
}

export default HydrogenHalideDissociation;
