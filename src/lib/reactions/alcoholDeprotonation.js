import { GenericReaction } from "../genericReaction.js";
import {
  ALCOHOL,
  ALKOXIDE,
  AMIDE_ION,
  AMMONIA,
  HYDROGEN_GAS,
  HYDRIDE_ION,
  HYDROXIDE,
  WATER,
} from "./reactantGroups.js";
import {
  findAlcoholSite,
  makeAlcoholDeprotonationProducts,
  makeAlcoholDeprotonationReactants,
} from "./moleculeTransforms.js";

const DEPROTONATION_BASES = Object.freeze({
  hydroxide: Object.freeze({
    group: HYDROXIDE,
    conjugateAcid: WATER,
    equilibriumConstant: 0.5,
  }),
  amide: Object.freeze({
    group: AMIDE_ION,
    conjugateAcid: AMMONIA,
    equilibriumConstant: 1e19,
  }),
  hydride: Object.freeze({
    group: HYDRIDE_ION,
    conjugateAcid: HYDROGEN_GAS,
    equilibriumConstant: 1e19,
  }),
});

export class AlcoholDeprotonation extends GenericReaction {
  constructor({ baseType = "hydroxide", equilibriumConstant } = {}) {
    const base = DEPROTONATION_BASES[baseType];
    if (!base) throw new TypeError(`Unsupported alcohol deprotonation base: ${baseType}`);

    super({
      name: `Alcohol deprotonation by ${baseType}`,
      functionalGroups: [ALCOHOL, base.group],
      ratePowers: [1, 1],
      equilibrium: {
        constant: equilibriumConstant ?? base.equilibriumConstant,
        productCount: 2,
        reverseRatePowers: [1, 1],
        productFunctionalGroups: [ALKOXIDE, base.conjugateAcid],
      },
    });
    this.baseType = baseType;
  }

  canReact(alcohol, base) {
    return super.canReact(alcohol, base) && findAlcoholSite(alcohol) !== null;
  }

  RunReaction(alcohol, base) {
    const site = findAlcoholSite(alcohol);
    if (!site) throw new TypeError("Alcohol deprotonation requires a neutral alcohol group.");
    return makeAlcoholDeprotonationProducts(alcohol, base, site, this.baseType).map(
      (molecule, index) => ({
        molecule,
        moles: 1,
        ...(this.baseType === "hydride" && index === 1 ? { state: "gas" } : {}),
      }),
    );
  }

  RunReverseReaction(alkoxide, conjugateAcid) {
    return makeAlcoholDeprotonationReactants(
      alkoxide,
      conjugateAcid,
      this.baseType,
    );
  }
}

export default AlcoholDeprotonation;
