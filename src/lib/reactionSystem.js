import { MixtureContainer } from "./chemistry.js";
import {
  AlcoholDeprotonation,
  AlcoholOxidation,
  AldehydeOxidation,
  CarboxylicAcidDissociation,
  CarboxylicAcidReduction,
  CarbonylReduction,
  E1,
  E2,
  HydrogenHalideDissociation,
  NucleophilicAddition,
  NucleophilicAdditionElimination,
  SN1,
  SN2,
  WaterAutoionization,
} from "./reactions/index.js";

export const REACTION_INTERVAL_MS = 200;
export const REACTION_DT_SECONDS = 0.2;
export const MIN_REACTION_AMOUNT_MOLES = 0.001;
export const ARRHENIUS_PRE_EXPONENTIAL = 0.102;
export const ACTIVATION_ENERGY_J_PER_MOL = 50;
export const GAS_CONSTANT_J_PER_MOL_K = 8.31;

export function calculateArrheniusRateConstant(
  temperatureKelvin,
  {
    preExponential = ARRHENIUS_PRE_EXPONENTIAL,
    activationEnergy = ACTIVATION_ENERGY_J_PER_MOL,
    gasConstant = GAS_CONSTANT_J_PER_MOL_K,
  } = {},
) {
  if (
    !Number.isFinite(temperatureKelvin) ||
    temperatureKelvin < 0 ||
    !Number.isFinite(preExponential) ||
    preExponential < 0 ||
    !Number.isFinite(activationEnergy) ||
    activationEnergy < 0 ||
    !Number.isFinite(gasConstant) ||
    gasConstant <= 0
  ) {
    throw new TypeError("Arrhenius parameters and temperature must be valid values.");
  }
  if (temperatureKelvin === 0) return 0;
  return preExponential * Math.exp(-activationEnergy / (gasConstant * temperatureKelvin));
}

function getReactionLiquidVolumeLiters(container) {
  return container.contents.reduce(
    (volume, entry) =>
      entry.moles >= MIN_REACTION_AMOUNT_MOLES && entry.state === "liquid"
        ? volume + (entry.moles * entry.molecule.molecularMass) / entry.molecule.getDensity() / 1000
        : volume,
    0,
  );
}

function getConcentration(container, molecule) {
  const volumeLiters = getReactionLiquidVolumeLiters(container);
  if (volumeLiters <= 0) return 0;
  const moles = container.contents
    .filter(
      (entry) =>
        entry.moles >= MIN_REACTION_AMOUNT_MOLES &&
        entry.molecule.canonicalSmiles === molecule.canonicalSmiles,
    )
    .reduce((sum, entry) => sum + entry.moles, 0);
  return moles / volumeLiters;
}

function getContent(container, molecule, state = null) {
  return container.contents.find(
    (entry) =>
      entry.moles >= MIN_REACTION_AMOUNT_MOLES &&
      entry.molecule.canonicalSmiles === molecule.canonicalSmiles &&
      (state === null || entry.state === state),
  );
}

function findReactantCombinations(container, functionalGroups) {
  const candidates = functionalGroups.map((group) =>
    container.contents.filter(
      (entry) =>
        entry.moles >= MIN_REACTION_AMOUNT_MOLES &&
        group.matches(entry.molecule),
    ),
  );
  if (candidates.some((entries) => entries.length === 0)) return [];

  const combinations = [];
  function visit(slot, selected, usedEntries) {
    if (slot === candidates.length) {
      combinations.push([...selected]);
      return;
    }
    candidates[slot].forEach((entry) => {
      if (usedEntries.has(entry)) return;
      selected.push(entry);
      usedEntries.add(entry);
      visit(slot + 1, selected, usedEntries);
      selected.pop();
      usedEntries.delete(entry);
    });
  }
  visit(0, [], new Set());
  return combinations;
}

function applyReactionExtent(
  container,
  reactants,
  products,
  extent,
  reactantCoefficients = reactants.map(() => 1),
) {
  const currentReactants = reactants.map((entry) =>
    getContent(container, entry.molecule, entry.state),
  );
  if (currentReactants.some((entry) => !entry)) return false;
  const limitingExtent = Math.min(
    extent,
    ...currentReactants.flatMap((entry, index) =>
      reactantCoefficients[index] === 0 ? [] : [entry.moles / reactantCoefficients[index]],
    ),
  );
  if (!Number.isFinite(limitingExtent) || limitingExtent <= 1e-15) return false;

  currentReactants.forEach((entry, index) => {
    container.remove(
      entry.molecule.canonicalSmiles,
      limitingExtent * reactantCoefficients[index],
      entry.state,
    );
  });
  products.forEach(({ molecule, moles, state }) => {
    container.add(molecule, limitingExtent * moles, state ?? "liquid");
  });
  return true;
}

function capEquilibriumExtent({
  container,
  reaction,
  reactants,
  products,
  reverseProducts,
  direction,
  maximumExtent,
  volumeLiters,
}) {
  const initialReactantConcentrations = reactants.map((molecule) =>
    getConcentration(container, molecule),
  );
  const initialProductConcentrations = products.map(({ molecule }) =>
    getConcentration(container, molecule),
  );
  const rateAtExtent = (extent) => {
    const reactantConcentrations = initialReactantConcentrations.map(
      (concentration, index) =>
        Math.max(
          0,
          concentration +
            (direction < 0
              ? (extent * reverseProducts[index].moles) / volumeLiters
              : -(extent * reaction.reactantStoichiometricCoefficients[index]) / volumeLiters),
        ),
    );
    const productConcentrations = initialProductConcentrations.map(
      (concentration, index) =>
        Math.max(
          0,
          concentration +
            (direction > 0
              ? (extent * products[index].moles) / volumeLiters
              : -((extent * products[index].moles) / volumeLiters)),
        ),
    );
    return reaction.getNetRate(
      reactantConcentrations,
      productConcentrations,
      1,
      ...reactants,
    );
  };

  if (maximumExtent <= 1e-15) return 0;
  const finalRate = rateAtExtent(maximumExtent);
  if (direction * finalRate >= 0) return maximumExtent;

  let lower = 0;
  let upper = maximumExtent;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (direction * rateAtExtent(midpoint) > 0) lower = midpoint;
    else upper = midpoint;
  }
  return Math.min(maximumExtent, (lower + upper) / 2);
}

function runForwardReaction(container, reaction, reactantEntries) {
  if (
    reactantEntries.some(
      (entry) =>
        entry.moles < MIN_REACTION_AMOUNT_MOLES ||
        (getContent(container, entry.molecule, entry.state)?.moles ?? 0) <
          MIN_REACTION_AMOUNT_MOLES,
    )
  ) {
    return false;
  }
  const reactants = reactantEntries.map((entry) => entry.molecule);
  if (!reaction.canReact(...reactants)) return false;

  const volumeLiters = getReactionLiquidVolumeLiters(container);
  if (volumeLiters <= 0) return false;

  const products = reaction.runReaction(...reactants);
  const reactantConcentrations = reactants.map((molecule) => getConcentration(container, molecule));
  const rateConstant = calculateArrheniusRateConstant(container.temperatureKelvin);
  let rate;

  if (reaction.equilibrium) {
    const productConcentrations = products.map(({ molecule }) =>
      getConcentration(container, molecule),
    );
    rate = reaction.getNetRate(
      reactantConcentrations,
      productConcentrations,
      rateConstant,
      ...reactants,
    );
    if (rate < 0) {
      if (!reaction.equilibrium.productFunctionalGroups) {
        throw new TypeError(`${reaction.name} requires reverse functional groups for equilibrium simulation.`);
      }
      const reverseReactants = products.map(({ molecule }) => {
        const existing = getContent(container, molecule);
        return existing ? { ...existing } : { molecule, moles: 0, state: "liquid" };
      });
      if (reverseReactants.some((entry) => entry.moles <= 0)) return false;
      const reverseProducts = reaction.runReverseReaction(
        ...reverseReactants.map((entry) => entry.molecule),
      );
      const maximumExtent = Math.min(
        ...reverseReactants.map((entry, index) => entry.moles / products[index].moles),
      );
      const extent = capEquilibriumExtent({
        container,
        reaction,
        reactants,
        products,
        reverseProducts,
        direction: -1,
        maximumExtent: Math.min(-rate * volumeLiters * REACTION_DT_SECONDS, maximumExtent),
        volumeLiters,
      });
      return applyReactionExtent(
        container,
        reverseReactants,
        reverseProducts,
        extent,
        products.map(({ moles }) => moles),
      );
    }
    const maximumExtent = Math.min(
      ...reactantEntries.map((entry, index) =>
        reaction.reactantStoichiometricCoefficients[index] === 0
          ? Number.POSITIVE_INFINITY
          : entry.moles / reaction.reactantStoichiometricCoefficients[index],
      ),
    );
    const extent = capEquilibriumExtent({
      container,
      reaction,
      reactants,
      products,
      reverseProducts: reactantEntries.map((entry, index) => ({
        molecule: entry.molecule,
        moles: reaction.reactantStoichiometricCoefficients[index],
      })),
      direction: 1,
      maximumExtent: Math.min(rate * volumeLiters * REACTION_DT_SECONDS, maximumExtent),
      volumeLiters,
    });
    return applyReactionExtent(
      container,
      reactantEntries,
      products,
      extent,
      reaction.reactantStoichiometricCoefficients,
    );
  } else {
    rate = rateConstant * reaction.getRateFactor(reactantConcentrations, ...reactants);
  }

  if (rate <= 0) return false;
  return applyReactionExtent(
    container,
    reactantEntries,
    products,
    rate * volumeLiters * REACTION_DT_SECONDS,
    reaction.reactantStoichiometricCoefficients,
  );
}

export function createReactionSystem({
  getContainers,
  onContentsChanged = () => {},
  onTick = () => false,
  reactions = [
    new CarboxylicAcidDissociation(),
    new HydrogenHalideDissociation(),
    new WaterAutoionization(),
    new AlcoholDeprotonation({ baseType: "hydroxide" }),
    new AlcoholDeprotonation({ baseType: "amide" }),
    new AlcoholDeprotonation({ baseType: "hydride" }),
    new AlcoholOxidation({ oxidant: "dichromate" }),
    new AlcoholOxidation({ oxidant: "permanganate" }),
    new AldehydeOxidation({ oxidant: "dichromate" }),
    new AldehydeOxidation({ oxidant: "permanganate" }),
    new CarboxylicAcidReduction({ reducingAgent: "borohydride" }),
    new CarboxylicAcidReduction({ reducingAgent: "aluminium-hydride" }),
    new CarbonylReduction({ reducingAgent: "borohydride" }),
    new CarbonylReduction({ reducingAgent: "aluminium-hydride" }),
    new SN1(),
    new SN2(),
    new E1(),
    new E2(),
    new NucleophilicAddition(),
    new NucleophilicAdditionElimination(),
  ],
} = {}) {
  if (typeof getContainers !== "function") {
    throw new TypeError("The reaction system requires a getContainers callback.");
  }
  if (
    typeof onContentsChanged !== "function" ||
    typeof onTick !== "function" ||
    !Array.isArray(reactions)
  ) {
    throw new TypeError("The reaction system callbacks and reaction list are invalid.");
  }

  const knownVersions = new WeakMap();
  getContainers().forEach((container) => {
    if (container instanceof MixtureContainer) {
      knownVersions.set(container, container.contentVersion);
    }
  });

  function tick() {
    const changedContainers = getContainers().filter((container) => {
      if (!(container instanceof MixtureContainer)) return false;
      const previousVersion = knownVersions.get(container);
      const changed =
        previousVersion === undefined
          ? container.contentVersion > 0
          : previousVersion !== container.contentVersion;
      knownVersions.set(container, container.contentVersion);
      return changed;
    });
    let contentsChanged = false;

    changedContainers.forEach((container) => {
      reactions.forEach((reaction) => {
        const combinations = findReactantCombinations(container, reaction.functionalGroups);
        combinations.forEach((combination) => {
          if (runForwardReaction(container, reaction, combination)) contentsChanged = true;
        });
      });
    });

    if (contentsChanged) onContentsChanged(changedContainers);
    return Boolean(onTick()) || contentsChanged;
  }

  function start() {
    const intervalId = setInterval(tick, REACTION_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }

  return Object.freeze({ tick, start });
}

export function startReactionSystem(options) {
  return createReactionSystem(options).start();
}
