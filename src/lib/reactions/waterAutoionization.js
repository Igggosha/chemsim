import { GenericReaction } from "../genericReaction.js";
import { HYDROXIDE, HYDRONIUM, WATER } from "./reactantGroups.js";
import {
  makeHydronium,
  makeHydroxide,
  makeWaterFromHydroxide,
} from "./moleculeTransforms.js";

export const DEFAULT_WATER_AUTOIONIZATION_KC = 3.25e-18;

function isWaterMolecule(molecule) {
  return (
    molecule.atoms.length === 1 &&
    molecule.bonds.length === 0 &&
    molecule.atoms[0].element.symbol === "O" &&
    molecule.atoms[0].formalCharge === 0 &&
    molecule.atoms[0].implicitHydrogens === 2
  );
}

export class WaterAutoionization extends GenericReaction {
  constructor({ equilibriumConstant = DEFAULT_WATER_AUTOIONIZATION_KC } = {}) {
    super({
      name: "Water autoionization",
      functionalGroups: [WATER],
      ratePowers: [2],
      reactantStoichiometricCoefficients: [2],
      equilibrium: {
        constant: equilibriumConstant,
        productCount: 2,
        reverseRatePowers: [1, 1],
        productFunctionalGroups: [HYDRONIUM, HYDROXIDE],
      },
    });
  }

  canReact(water) {
    return super.canReact(water) && isWaterMolecule(water);
  }

  RunReaction(water) {
    if (!isWaterMolecule(water)) {
      throw new TypeError("Water autoionization requires a standalone water molecule.");
    }
    return [
      { molecule: makeHydronium(water), moles: 1 },
      { molecule: makeHydroxide(water), moles: 1 },
    ];
  }

  RunReverseReaction(hydronium, hydroxide) {
    return [{ molecule: makeWaterFromHydroxide(hydronium, hydroxide), moles: 2 }];
  }
}

export default WaterAutoionization;
