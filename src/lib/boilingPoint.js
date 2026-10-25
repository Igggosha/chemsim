const JOBACK_BASE_BOILING_POINT_K = 198.2;

const JOBACK_CONTRIBUTIONS = Object.freeze({
  methyl: 23.58,
  methylene: 22.88,
  methine: 21.74,
  quaternaryCarbon: 18.25,
  vinylMethylene: 18.18,
  vinylMethine: 24.96,
  vinylCarbon: 24.14,
  aromaticMethine: 26.73,
  aromaticCarbon: 31.01,
  hydroxyl: 92.88,
  phenol: 76.34,
  ether: 22.42,
  aldehyde: 72.24,
  ketone: 76.34,
  carboxylicAcid: 169.09,
  ester: 81.10,
  primaryAmine: 73.23,
  secondaryAmine: 50.17,
  tertiaryAmine: 11.74,
  nitrile: 125.66,
  fluorine: 8.13,
  chlorine: 38.13,
  bromine: 66.86,
  iodine: 84.77,
  thiol: 63.56,
  sulfide: 68.78,
});

const PAILHES_DATA = new Map([
  ["O", { temperatureKelvin: 298.15, criticalPressureAtm: 218.3, oneMinusBeta: 0.423573, logPressureRatio: 1.505 }],
  ["C1CCCC1", { temperatureKelvin: 298.15, criticalPressureAtm: 44.18, oneMinusBeta: 0.372225, logPressureRatio: 0.378 }],
  ["C1CCCCC1", { temperatureKelvin: 298.15, criticalPressureAtm: 40.363, oneMinusBeta: 0.361084, logPressureRatio: 0.89 }],
  ["C(C)CCCC", { temperatureKelvin: 298.15, criticalPressureAtm: 29.75, oneMinusBeta: 0.3274, logPressureRatio: 0.701 }],
  ["c1ccccc1", { temperatureKelvin: 298.15, criticalPressureAtm: 48.89, oneMinusBeta: 0.371356, logPressureRatio: 0.902 }],
  ["Cc1ccccc1", { temperatureKelvin: 298.15, criticalPressureAtm: 41.45, oneMinusBeta: 0.3396, logPressureRatio: 1.426 }],
  ["CO", { temperatureKelvin: 298.15, criticalPressureAtm: 81.5, oneMinusBeta: 0.341404, logPressureRatio: 0.784 }],
  ["C(C)O", { temperatureKelvin: 298.15, criticalPressureAtm: 63.17, oneMinusBeta: 0.325884, logPressureRatio: 1.104 }],
  ["C(C)(C)=O", { temperatureKelvin: 293.15, criticalPressureAtm: 49.43, oneMinusBeta: 0.3594, logPressureRatio: 0.609 }],
  ["C(C)(O)=O", { temperatureKelvin: 298.15, criticalPressureAtm: 64.22, oneMinusBeta: 0.339025, logPressureRatio: 1.692 }],
  ["C(C)(=O)OC(C)=O", { temperatureKelvin: 298.15, criticalPressureAtm: 43.38, oneMinusBeta: 0.322129, logPressureRatio: 2.173 }],
]);

const normalBoilingPointCache = new Map();

function getAdjacency(molecule) {
  const adjacency = molecule.atoms.map(() => []);
  molecule.bonds.forEach((bond) => {
    adjacency[bond.from].push({ atomIndex: bond.to, bond });
    adjacency[bond.to].push({ atomIndex: bond.from, bond });
  });
  return adjacency;
}

function findCarbonylGroups(molecule, adjacency) {
  const consumedAtoms = new Set();
  const contributions = [];

  molecule.atoms.forEach((atom, carbonIndex) => {
    if (atom.element.symbol !== "C") return;
    const doubleBondOxygen = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!doubleBondOxygen) return;

    const singleBondOxygens = adjacency[carbonIndex].filter(
      ({ atomIndex, bond }) =>
        bond.order === 1 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    const acidOxygen = singleBondOxygens.find(
      ({ atomIndex }) => molecule.atoms[atomIndex].implicitHydrogens > 0,
    );
    const esterOxygen = singleBondOxygens.find(
      ({ atomIndex }) =>
        adjacency[atomIndex].some(
          ({ atomIndex: neighborIndex }) =>
            neighborIndex !== carbonIndex && molecule.atoms[neighborIndex].element.symbol === "C",
        ),
    );

    consumedAtoms.add(carbonIndex);
    consumedAtoms.add(doubleBondOxygen.atomIndex);
    if (acidOxygen) {
      consumedAtoms.add(acidOxygen.atomIndex);
      contributions.push(JOBACK_CONTRIBUTIONS.carboxylicAcid);
      return;
    }
    if (esterOxygen) {
      consumedAtoms.add(esterOxygen.atomIndex);
      contributions.push(JOBACK_CONTRIBUTIONS.ester);
      return;
    }

    const hasHydrogen = atom.implicitHydrogens > 0;
    contributions.push(
      hasHydrogen
        ? JOBACK_CONTRIBUTIONS.aldehyde
        : JOBACK_CONTRIBUTIONS.ketone,
    );
  });

  return { consumedAtoms, contributions };
}

function getJobackBoilingPoint(molecule) {
  if (molecule.atoms.some((atom) => atom.formalCharge !== 0)) return null;
  if (!molecule.atoms.some((atom) => atom.element.symbol === "C")) return null;
  const adjacency = getAdjacency(molecule);
  const { consumedAtoms, contributions } = findCarbonylGroups(molecule, adjacency);

  molecule.atoms.forEach((atom, atomIndex) => {
    if (consumedAtoms.has(atomIndex)) return;
    const symbol = atom.element.symbol;
    const neighbors = adjacency[atomIndex];
    const hydrogenCount = atom.implicitHydrogens;

    if (symbol === "C") {
      const nitrileNitrogen = neighbors.find(
        ({ atomIndex: neighborIndex, bond }) =>
          bond.order === 3 && molecule.atoms[neighborIndex].element.symbol === "N",
      );
      if (nitrileNitrogen) {
        consumedAtoms.add(nitrileNitrogen.atomIndex);
        consumedAtoms.add(atomIndex);
        contributions.push(JOBACK_CONTRIBUTIONS.nitrile);
        return;
      }

      const tripleBond = neighbors.some(({ bond }) => bond.order === 3);
      const multipleBond = neighbors.some(({ bond }) => bond.order === 2 || bond.aromatic);
      if (atom.aromatic) {
        contributions.push(
          hydrogenCount > 0
            ? JOBACK_CONTRIBUTIONS.aromaticMethine
            : JOBACK_CONTRIBUTIONS.aromaticCarbon,
        );
      } else if (tripleBond) {
        contributions.push(hydrogenCount > 0 ? 9.2 : 27.38);
      } else if (multipleBond || atom.aromatic) {
        contributions.push(
          hydrogenCount > 0
            ? hydrogenCount > 1
              ? JOBACK_CONTRIBUTIONS.vinylMethylene
              : JOBACK_CONTRIBUTIONS.vinylMethine
            : JOBACK_CONTRIBUTIONS.vinylCarbon,
        );
      } else {
        contributions.push(
          hydrogenCount >= 3
            ? JOBACK_CONTRIBUTIONS.methyl
            : hydrogenCount === 2
              ? JOBACK_CONTRIBUTIONS.methylene
              : hydrogenCount === 1
                ? JOBACK_CONTRIBUTIONS.methine
                : JOBACK_CONTRIBUTIONS.quaternaryCarbon,
        );
      }
      return;
    }

    if (symbol === "O") {
      const carbonNeighbors = neighbors.filter(
        ({ atomIndex: neighborIndex }) => molecule.atoms[neighborIndex].element.symbol === "C",
      );
      if (hydrogenCount > 0 && carbonNeighbors.length === 1) {
        const isPhenol = molecule.atoms[carbonNeighbors[0].atomIndex].aromatic;
        contributions.push(
          isPhenol ? JOBACK_CONTRIBUTIONS.phenol : JOBACK_CONTRIBUTIONS.hydroxyl,
        );
      } else if (carbonNeighbors.length === 2) {
        contributions.push(JOBACK_CONTRIBUTIONS.ether);
      } else if (hydrogenCount === 0) {
        return;
      } else {
        consumedAtoms.add(atomIndex);
      }
      return;
    }

    if (symbol === "N") {
      contributions.push(
        hydrogenCount >= 2
          ? JOBACK_CONTRIBUTIONS.primaryAmine
          : hydrogenCount === 1
            ? JOBACK_CONTRIBUTIONS.secondaryAmine
            : JOBACK_CONTRIBUTIONS.tertiaryAmine,
      );
      return;
    }

    const halogenContribution = {
      F: JOBACK_CONTRIBUTIONS.fluorine,
      Cl: JOBACK_CONTRIBUTIONS.chlorine,
      Br: JOBACK_CONTRIBUTIONS.bromine,
      I: JOBACK_CONTRIBUTIONS.iodine,
    }[symbol];
    if (halogenContribution !== undefined) {
      contributions.push(halogenContribution);
      return;
    }

    if (symbol === "S") {
      contributions.push(
        hydrogenCount > 0
          ? JOBACK_CONTRIBUTIONS.thiol
          : JOBACK_CONTRIBUTIONS.sulfide,
      );
      return;
    }

    if (symbol !== "H") consumedAtoms.add(atomIndex);
  });

  if (molecule.atoms.some((atom) => !["C", "H", "O", "N", "F", "Cl", "Br", "I", "S"].includes(atom.element.symbol))) {
    return null;
  }

  const temperatureKelvin = JOBACK_BASE_BOILING_POINT_K +
    contributions.reduce((sum, contribution) => sum + contribution, 0);
  return Number.isFinite(temperatureKelvin) && temperatureKelvin > 0
    ? temperatureKelvin
    : null;
}

export function estimatePailhesBoilingPoint({
  temperatureKelvin,
  pressureAtm,
  criticalPressureAtm,
  oneMinusBeta,
}) {
  if (
    !Number.isFinite(temperatureKelvin) || temperatureKelvin <= 0 ||
    !Number.isFinite(pressureAtm) || pressureAtm <= 0 ||
    !Number.isFinite(criticalPressureAtm) || criticalPressureAtm <= 1 ||
    !Number.isFinite(oneMinusBeta) || oneMinusBeta <= 0 || oneMinusBeta >= 1
  ) {
    throw new TypeError("Pailhes boiling-point inputs must be valid positive values.");
  }

  const logCriticalPressure = Math.log10(criticalPressureAtm);
  const logPressureRatio = Math.log10(1 / pressureAtm);
  return (
    temperatureKelvin *
      (logCriticalPressure + oneMinusBeta * logPressureRatio) /
      logCriticalPressure -
    3 * logPressureRatio -
    1.49 * logPressureRatio ** 2
  );
}

export function getNormalBoilingPoint(molecule) {
  if (!molecule?.canonicalSmiles || !Array.isArray(molecule.atoms) || !Array.isArray(molecule.bonds)) {
    throw new TypeError("A molecule with a canonical SMILES, atoms, and bonds is required.");
  }

  const key = molecule.canonicalSmiles;
  if (normalBoilingPointCache.has(key)) return normalBoilingPointCache.get(key);

  const pailhesData = PAILHES_DATA.get(key);
  const boilingPoint = pailhesData
    ? {
        temperatureKelvin: estimatePailhesBoilingPoint({
          ...pailhesData,
          pressureAtm: 10 ** -pailhesData.logPressureRatio,
        }),
        method: "Pailhes",
      }
    : (() => {
        const temperatureKelvin = getJobackBoilingPoint(molecule);
        return temperatureKelvin === null
          ? null
          : { temperatureKelvin, method: "Joback" };
      })();

  normalBoilingPointCache.set(key, boilingPoint);
  return boilingPoint;
}

export function clearNormalBoilingPointCache() {
  normalBoilingPointCache.clear();
}
