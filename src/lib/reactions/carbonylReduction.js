import { GenericReaction } from "../genericReaction.js";
import { ALUMINIUM_HYDRIDE, BOROHYDRIDE, CARBONYL, WATER } from "./reactantGroups.js";
import {
  findReducibleCarbonylSite,
  makeReducedHydrideAgentProduct,
  reduceCarbonylToAlcohol,
} from "./moleculeTransforms.js";

const REDUCING_AGENTS = Object.freeze({
  borohydride: BOROHYDRIDE,
  "aluminium-hydride": ALUMINIUM_HYDRIDE,
});

export class CarbonylReduction extends GenericReaction {
  constructor({ reducingAgent = "borohydride" } = {}) {
    const group = REDUCING_AGENTS[reducingAgent];
    if (!group) throw new TypeError(`Unsupported carbonyl reducing agent: ${reducingAgent}`);
    super({
      name: `Carbonyl reduction by ${reducingAgent}`,
      functionalGroups: [CARBONYL, group, WATER],
      ratePowers: [1, 1, 0],
      reactantStoichiometricCoefficients: [4, 1, 4],
    });
    this.reducingAgent = reducingAgent;
  }

  canReact(carbonylCompound) {
    return findReducibleCarbonylSite(carbonylCompound) !== null;
  }

  RunReaction(carbonylCompound) {
    const site = findReducibleCarbonylSite(carbonylCompound);
    if (!site) throw new TypeError("Carbonyl reduction requires an aldehyde or ketone.");
    return [
      { molecule: reduceCarbonylToAlcohol(carbonylCompound, site), moles: 4 },
      { molecule: makeReducedHydrideAgentProduct(this.reducingAgent), moles: 1 },
    ];
  }
}

export default CarbonylReduction;
