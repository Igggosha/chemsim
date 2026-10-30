import { GenericReaction } from "../genericReaction.js";
import { CARBOXYLIC_ACID, WATER, BOROHYDRIDE, ALUMINIUM_HYDRIDE } from "./reactantGroups.js";
import {
  findCarboxylicAcidSite,
  makeHydrogenMolecule,
  makeReducedHydrideAgentProduct,
  reduceCarboxylicAcidToAldehyde,
} from "./moleculeTransforms.js";

const REDUCING_AGENTS = Object.freeze({
  borohydride: BOROHYDRIDE,
  "aluminium-hydride": ALUMINIUM_HYDRIDE,
});

export class CarboxylicAcidReduction extends GenericReaction {
  constructor({ reducingAgent = "borohydride" } = {}) {
    const group = REDUCING_AGENTS[reducingAgent];
    if (!group) throw new TypeError(`Unsupported carboxylic-acid reducing agent: ${reducingAgent}`);
    super({
      name: `Carboxylic acid reduction by ${reducingAgent}`,
      functionalGroups: [CARBOXYLIC_ACID, group, WATER],
      ratePowers: [1, 1, 0],
      reactantStoichiometricCoefficients: [2, 1, 2],
    });
    this.reducingAgent = reducingAgent;
  }

  canReact(acid) {
    return findCarboxylicAcidSite(acid) !== null;
  }

  RunReaction(acid) {
    const site = findCarboxylicAcidSite(acid);
    if (!site) throw new TypeError("Carboxylic acid reduction requires a carboxylic acid group.");
    return [
      { molecule: reduceCarboxylicAcidToAldehyde(acid, site), moles: 2 },
      { molecule: makeReducedHydrideAgentProduct(this.reducingAgent), moles: 1 },
      { molecule: makeHydrogenMolecule(), moles: 2, state: "gas" },
    ];
  }
}

export default CarboxylicAcidReduction;
