import { Atom, Elements, Molecule } from "../chemistry.js";

export function getAdjacency(molecule) {
  const adjacency = molecule.atoms.map(() => []);
  molecule.bonds.forEach((bond, bondIndex) => {
    adjacency[bond.from].push({ atomIndex: bond.to, bond, bondIndex });
    adjacency[bond.to].push({ atomIndex: bond.from, bond, bondIndex });
  });
  return adjacency;
}

function cloneAtoms(molecule, idPrefix = "") {
  return molecule.atoms.map((atom, index) => {
    const clone = new Atom(atom.element, {
      id: idPrefix ? `${idPrefix}-${atom.id ?? index}` : atom.id,
      formalCharge: atom.formalCharge,
      aromatic: atom.aromatic,
      implicitHydrogens: atom.implicitHydrogens,
      chirality: atom.chirality,
      isWildcard: atom.isWildcard,
    });
    clone.stereoNeighbors = [...atom.stereoNeighbors];
    return clone;
  });
}

function cloneBonds(bonds) {
  return bonds.map((bond) => ({
    ...bond,
    ...(bond.stereoRefs ? { stereoRefs: [...bond.stereoRefs] } : {}),
  }));
}

function omitAtom(atoms, bonds, removedIndex) {
  const oldToNew = new Map();
  let nextIndex = 0;
  atoms.forEach((_, oldIndex) => {
    if (oldIndex !== removedIndex) oldToNew.set(oldIndex, nextIndex++);
  });
  const keptAtoms = atoms.filter((_, index) => index !== removedIndex);
  keptAtoms.forEach((atom) => {
    atom.stereoNeighbors = atom.stereoNeighbors.map((neighbor) =>
      typeof neighbor === "number" ? oldToNew.get(neighbor) ?? null : neighbor,
    );
  });
  const keptBonds = bonds
    .filter((bond) => bond.from !== removedIndex && bond.to !== removedIndex)
    .map((bond) => ({
      ...bond,
      from: oldToNew.get(bond.from),
      to: oldToNew.get(bond.to),
      ...(bond.stereoRefs
        ? { stereoRefs: bond.stereoRefs.map((reference) => oldToNew.get(reference)) }
        : {}),
    }));
  return { atoms: keptAtoms, bonds: keptBonds, oldToNew };
}

export function createMoleculeFromGraph(atoms, bonds) {
  return new Molecule(null, atoms, bonds);
}

export function createHalideProduct(substrate, leavingAtomIndex, receivesHydrogen) {
  const leavingAtom = substrate.atoms[leavingAtomIndex];
  const atom = new Atom(leavingAtom.element, {
    id: leavingAtom.id,
    formalCharge: receivesHydrogen ? 0 : -1,
    implicitHydrogens: receivesHydrogen ? 1 : 0,
  });
  return createMoleculeFromGraph([atom], []);
}

export function findAlkylHalideSite(molecule) {
  const adjacency = getAdjacency(molecule);
  const candidates = [];
  adjacency.forEach((neighbors, carbonIndex) => {
    const carbon = molecule.atoms[carbonIndex];
    if (
      carbon.element.symbol !== "C" ||
      carbon.aromatic ||
      carbon.formalCharge !== 0 ||
      neighbors.some(({ bond }) => bond.order !== 1) ||
      neighbors.reduce((sum, { bond }) => sum + bond.order, 0) + carbon.implicitHydrogens !== 4
    ) {
      return;
    }
    neighbors.forEach(({ atomIndex: leavingAtomIndex, bond }) => {
      const leavingAtom = molecule.atoms[leavingAtomIndex];
      if (
        bond.order !== 1 ||
        !["Cl", "Br", "I"].includes(leavingAtom.element.symbol) ||
        leavingAtom.formalCharge !== 0
      ) {
        return;
      }
      const carbonDegree = neighbors.filter(
        ({ atomIndex, bond: neighborBond }) =>
          atomIndex !== leavingAtomIndex &&
          neighborBond.order === 1 &&
          molecule.atoms[atomIndex].element.symbol === "C",
      ).length;
      const betaCarbons = neighbors
        .filter(
          ({ atomIndex, bond: neighborBond }) =>
            atomIndex !== leavingAtomIndex &&
            neighborBond.order === 1 &&
            molecule.atoms[atomIndex].element.symbol === "C" &&
            !molecule.atoms[atomIndex].aromatic &&
            molecule.atoms[atomIndex].implicitHydrogens > 0,
        )
        .map(({ atomIndex }) => atomIndex);
      candidates.push({ carbonIndex, leavingAtomIndex, carbonDegree, betaCarbons });
    });
  });
  return candidates.sort((first, second) => second.carbonDegree - first.carbonDegree)[0] ?? null;
}

export function findNucleophilicAtom(molecule, { excludeAcetalCenters = false } = {}) {
  const adjacency = getAdjacency(molecule);
  return molecule.atoms
    .map((atom, atomIndex) => ({
      atom,
      atomIndex,
      degree: adjacency[atomIndex].length,
      bondOrderSum: adjacency[atomIndex].reduce((sum, neighbor) => sum + neighbor.bond.order, 0),
    }))
    .filter(
      ({ atom, atomIndex, degree, bondOrderSum }) => {
        const symbol = atom.element.symbol;
        const hasAvailableValence =
          atom.formalCharge < 0 ||
          (symbol === "N" && bondOrderSum + atom.implicitHydrogens < 4) ||
          (symbol === "O" &&
            (atom.implicitHydrogens > 0 || bondOrderSum < 2 || (degree === 2 && bondOrderSum === 2))) ||
          (symbol === "S" &&
            (atom.implicitHydrogens > 0 || bondOrderSum < 2 || (degree === 2 && bondOrderSum === 2)));
        const isCarbonylBoundOxygen =
          symbol === "O" &&
          atom.formalCharge === 0 &&
          adjacency[atomIndex].some(
            ({ atomIndex: neighborIndex, bond }) =>
              molecule.atoms[neighborIndex].element.symbol === "C" &&
              bond.order === 1 &&
              adjacency[neighborIndex].some(
                ({ atomIndex: oxygenIndex, bond: carbonylBond }) =>
                  oxygenIndex !== atomIndex &&
                  molecule.atoms[oxygenIndex].element.symbol === "O" &&
                  carbonylBond.order === 2,
              ),
          );
        const isAcetalCenterNucleophile =
          excludeAcetalCenters &&
          adjacency[atomIndex].some(({ atomIndex: carbonIndex, bond }) => {
            if (bond.order !== 1 || molecule.atoms[carbonIndex].element.symbol !== "C") {
              return false;
            }
            const heteroatomSubstituents = adjacency[carbonIndex].filter(
              ({ atomIndex: substituentIndex, bond: substituentBond }) =>
                substituentBond.order === 1 &&
                ["N", "O", "S"].includes(molecule.atoms[substituentIndex].element.symbol),
            );
            return heteroatomSubstituents.length >= 2;
          });
        return (
          ["N", "O", "S"].includes(symbol) &&
          atom.formalCharge <= 0 &&
          !atom.aromatic &&
          !isCarbonylBoundOxygen &&
          !isAcetalCenterNucleophile &&
          hasAvailableValence
        );
      },
    )
    .sort(
      (first, second) =>
        first.atom.formalCharge - second.atom.formalCharge ||
        second.atom.implicitHydrogens - first.atom.implicitHydrogens ||
        first.degree - second.degree,
    )[0] ?? null;
}

export function getNucleophileStrength(molecule) {
  const site = findNucleophilicAtom(molecule);
  if (!site) return 0;

  const { atom, degree } = site;
  if (atom.formalCharge < 0) return 1;
  if (atom.element.symbol === "O") {
    if (atom.implicitHydrogens >= 2 && degree === 0) return 0.0001;
    if (atom.implicitHydrogens === 1) return 0.01;
    return 0.025;
  }
  if (atom.element.symbol === "N") {
    return atom.implicitHydrogens > 0 ? 0.3 : 0.15;
  }
  if (atom.element.symbol === "S") {
    return atom.implicitHydrogens > 0 ? 0.35 : 0.2;
  }
  return 0;
}

export function getBaseStrength(molecule) {
  const site = findNucleophilicAtom(molecule);
  if (!site) return 0;

  const { atom, degree } = site;
  if (atom.formalCharge < 0) return 1;
  if (atom.element.symbol === "O") {
    if (atom.implicitHydrogens >= 2 && degree === 0) return 0.00001;
    return 0.0001;
  }
  if (atom.element.symbol === "N") return atom.implicitHydrogens > 0 ? 0.1 : 0.05;
  if (atom.element.symbol === "S") return atom.implicitHydrogens > 0 ? 0.05 : 0.025;
  return 0;
}

export function makeSubstitutionProducts(
  substrate,
  nucleophile,
  site,
  nucleophileSite,
  mechanism,
) {
  const substrateGraph = omitAtom(
    cloneAtoms(substrate, "substrate"),
    cloneBonds(substrate.bonds),
    site.leavingAtomIndex,
  );
  const substrateAtoms = substrateGraph.atoms;
  const nucleophileComponents = getMoleculeComponents(nucleophile);
  const attackingComponent = nucleophileComponents.find((indices) =>
    indices.includes(nucleophileSite.atomIndex),
  );
  if (!attackingComponent) {
    throw new TypeError("Could not find the nucleophilic atom in its molecule.");
  }
  const nucleophileGraph = cloneMoleculeFragment(
    nucleophile,
    attackingComponent,
    "nucleophile",
  );
  const nucleophileAtoms = nucleophileGraph.atoms;
  const nucleophileBonds = nucleophileGraph.bonds;
  const nucleophileIndexInProduct =
    nucleophileGraph.oldToNew.get(nucleophileSite.atomIndex);
  nucleophileAtoms.forEach((atom) => {
    atom.stereoNeighbors = atom.stereoNeighbors.map((neighbor) =>
      typeof neighbor === "number" ? neighbor + substrateAtoms.length : neighbor,
    );
  });
  const nucleophileIndex = substrateAtoms.length + nucleophileIndexInProduct;
  const carbonIndex = substrateGraph.oldToNew.get(site.carbonIndex);
  const nucleophilicAtom = nucleophileAtoms[nucleophileIndexInProduct];
  const transfersProton = nucleophilicAtom.formalCharge === 0 && nucleophilicAtom.implicitHydrogens > 0;

  if (transfersProton) nucleophilicAtom.implicitHydrogens -= 1;
  else if (nucleophilicAtom.formalCharge < 0) nucleophilicAtom.formalCharge += 1;
  else nucleophilicAtom.formalCharge += 1;

  const carbon = substrateAtoms[carbonIndex];
  if (carbon.chirality) {
    if (mechanism === "SN1") {
      carbon.chirality = null;
      carbon.stereoNeighbors = [];
    } else {
      carbon.chirality = carbon.chirality === "@" ? "@@" : "@";
      carbon.stereoNeighbors = carbon.stereoNeighbors.map((neighbor) =>
        neighbor === null ? nucleophileIndex : neighbor,
      );
    }
  }
  const bonds = [
    ...substrateGraph.bonds,
    ...nucleophileBonds.map((bond) => ({
      ...bond,
      from: bond.from + substrateAtoms.length,
      to: bond.to + substrateAtoms.length,
      ...(bond.stereoRefs
        ? { stereoRefs: bond.stereoRefs.map((reference) => reference + substrateAtoms.length) }
        : {}),
    })),
    { from: carbonIndex, to: nucleophileIndex, order: 1, aromatic: false },
  ];
  const product = createMoleculeFromGraph([...substrateAtoms, ...nucleophileAtoms], bonds);
  const leavingGroup = createHalideProduct(
    substrate,
    site.leavingAtomIndex,
    transfersProton,
  );
  const spectatorProducts = nucleophileComponents
    .filter((indices) => indices !== attackingComponent)
    .map((indices) => {
      const component = cloneMoleculeFragment(nucleophile, indices, "nucleophile-spectator");
      return createMoleculeFromGraph(component.atoms, component.bonds);
    });
  return [
    { molecule: product, moles: 1 },
    { molecule: leavingGroup, moles: 1 },
    ...spectatorProducts.map((molecule) => ({ molecule, moles: 1 })),
  ];
}

export function findCarboxylicAcidSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let carbonIndex = 0; carbonIndex < molecule.atoms.length; carbonIndex += 1) {
    if (molecule.atoms[carbonIndex].element.symbol !== "C") continue;
    const oxygenBonds = adjacency[carbonIndex].filter(
      ({ atomIndex }) => molecule.atoms[atomIndex].element.symbol === "O",
    );
    const carbonyl = oxygenBonds.find(({ bond }) => bond.order === 2);
    const hydroxyl = oxygenBonds.find(
      ({ atomIndex, bond }) =>
        bond.order === 1 &&
        molecule.atoms[atomIndex].implicitHydrogens > 0 &&
        molecule.atoms[atomIndex].formalCharge === 0,
    );
    if (carbonyl && hydroxyl) {
      return {
        carbonIndex,
        carbonylOxygenIndex: carbonyl.atomIndex,
        hydroxylOxygenIndex: hydroxyl.atomIndex,
      };
    }
  }
  return null;
}

export function findAlcoholSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let oxygenIndex = 0; oxygenIndex < molecule.atoms.length; oxygenIndex += 1) {
    const oxygen = molecule.atoms[oxygenIndex];
    if (
      oxygen.element.symbol !== "O" ||
      oxygen.formalCharge !== 0 ||
      oxygen.implicitHydrogens !== 1
    ) {
      continue;
    }
    const carbonNeighbor = adjacency[oxygenIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 1 &&
        molecule.atoms[atomIndex].element.symbol === "C" &&
        !molecule.atoms[atomIndex].aromatic &&
        !adjacency[atomIndex].some(
          ({ atomIndex: neighborIndex, bond: neighborBond }) =>
            neighborBond.order === 2 &&
            molecule.atoms[neighborIndex].element.symbol === "O",
        ),
    );
    if (carbonNeighbor) return { oxygenIndex };
  }
  return null;
}

export function findOxidizableAlcoholSite(molecule) {
  const alcoholSite = findAlcoholSite(molecule);
  if (!alcoholSite) return null;
  const carbonNeighbor = getAdjacency(molecule)[alcoholSite.oxygenIndex].find(
    ({ atomIndex, bond }) =>
      bond.order === 1 &&
      molecule.atoms[atomIndex].element.symbol === "C" &&
      molecule.atoms[atomIndex].implicitHydrogens > 0,
  );
  return carbonNeighbor
    ? { ...alcoholSite, carbonIndex: carbonNeighbor.atomIndex }
    : null;
}

export function oxidizeAlcoholToCarbonyl(alcohol, site) {
  const atoms = cloneAtoms(alcohol);
  const bonds = cloneBonds(alcohol.bonds);
  const carbon = atoms[site.carbonIndex];
  const oxygen = atoms[site.oxygenIndex];
  const carbonOxygenBond = bonds.find(
    (bond) =>
      bond.order === 1 &&
      ((bond.from === site.carbonIndex && bond.to === site.oxygenIndex) ||
        (bond.to === site.carbonIndex && bond.from === site.oxygenIndex)),
  );
  if (!carbon || !oxygen || !carbonOxygenBond || carbon.implicitHydrogens < 1) {
    throw new TypeError("Alcohol oxidation requires a carbon-bound hydroxyl group with an alpha hydrogen.");
  }
  carbonOxygenBond.order = 2;
  carbon.implicitHydrogens -= 1;
  carbon.chirality = null;
  carbon.stereoNeighbors = [];
  oxygen.implicitHydrogens = 0;
  return createMoleculeFromGraph(atoms, bonds);
}

export function findAldehydeSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let carbonIndex = 0; carbonIndex < molecule.atoms.length; carbonIndex += 1) {
    const carbon = molecule.atoms[carbonIndex];
    if (carbon.element.symbol !== "C" || carbon.implicitHydrogens < 1) continue;
    const carbonyl = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!carbonyl) continue;
    const hasSingleBondedOxygen = adjacency[carbonIndex].some(
      ({ atomIndex, bond }) =>
        bond.order === 1 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!hasSingleBondedOxygen) return { carbonIndex, carbonylOxygenIndex: carbonyl.atomIndex };
  }
  return null;
}

export function oxidizeAldehydeToCarboxylicAcid(aldehyde, site) {
  const atoms = cloneAtoms(aldehyde);
  const carbon = atoms[site.carbonIndex];
  if (!carbon || carbon.element.symbol !== "C" || carbon.implicitHydrogens < 1) {
    throw new TypeError("Aldehyde oxidation requires a carbonyl carbon bearing hydrogen.");
  }
  carbon.implicitHydrogens -= 1;
  atoms.push(new Atom(Elements.O, { implicitHydrogens: 1 }));
  return createMoleculeFromGraph(
    atoms,
    [
      ...cloneBonds(aldehyde.bonds),
      {
        from: site.carbonIndex,
        to: atoms.length - 1,
        order: 1,
        aromatic: false,
      },
    ],
  );
}

export function reduceCarboxylicAcidToAldehyde(acid, site) {
  const atoms = cloneAtoms(acid);
  const graph = omitAtom(atoms, cloneBonds(acid.bonds), site.hydroxylOxygenIndex);
  const carbonIndex = graph.oldToNew.get(site.carbonIndex);
  const carbon = graph.atoms[carbonIndex];
  if (!carbon) throw new TypeError("Could not locate the carboxylic acid carbon.");
  carbon.implicitHydrogens += 1;
  return createMoleculeFromGraph(graph.atoms, graph.bonds);
}

export function findReducibleCarbonylSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let carbonIndex = 0; carbonIndex < molecule.atoms.length; carbonIndex += 1) {
    const carbon = molecule.atoms[carbonIndex];
    if (carbon.element.symbol !== "C") continue;
    const carbonyl = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!carbonyl) continue;
    const isCarboxylicAcidOrDerivative = adjacency[carbonIndex].some(
      ({ atomIndex, bond }) =>
        bond.order === 1 &&
        molecule.atoms[atomIndex].element.symbol !== "C" &&
        molecule.atoms[atomIndex].element.symbol !== "H",
    );
    if (!isCarboxylicAcidOrDerivative) {
      return { carbonIndex, carbonylOxygenIndex: carbonyl.atomIndex };
    }
  }
  return null;
}

export function reduceCarbonylToAlcohol(carbonylCompound, site) {
  const atoms = cloneAtoms(carbonylCompound);
  const bonds = cloneBonds(carbonylCompound.bonds);
  const carbon = atoms[site.carbonIndex];
  const oxygen = atoms[site.carbonylOxygenIndex];
  const carbonylBond = bonds.find(
    (bond) =>
      bond.order === 2 &&
      ((bond.from === site.carbonIndex && bond.to === site.carbonylOxygenIndex) ||
        (bond.to === site.carbonIndex && bond.from === site.carbonylOxygenIndex)),
  );
  if (!carbon || !oxygen || !carbonylBond) {
    throw new TypeError("Carbonyl reduction requires a carbon-oxygen double bond.");
  }
  carbonylBond.order = 1;
  carbon.implicitHydrogens += 1;
  oxygen.implicitHydrogens += 1;
  return createMoleculeFromGraph(atoms, bonds);
}

export function makeOxidationMetalProduct(oxidantType) {
  if (oxidantType === "dichromate") {
    return createMoleculeFromGraph(
      [new Atom(Elements.Cr, { formalCharge: 3 })],
      [],
    );
  }
  if (oxidantType === "permanganate") {
    return createMoleculeFromGraph(
      [new Atom(Elements.Mn, { formalCharge: 2 })],
      [],
    );
  }
  throw new TypeError(`Unsupported oxidation agent: ${oxidantType}`);
}

export function makeReducedHydrideAgentProduct(agentType) {
  const centralElement = agentType === "borohydride"
    ? Elements.B
    : agentType === "aluminium-hydride"
      ? Elements.Al
      : null;
  if (!centralElement) throw new TypeError(`Unsupported reducing agent: ${agentType}`);
  const atoms = [
    new Atom(centralElement, { formalCharge: -1 }),
    ...Array.from({ length: 4 }, () => new Atom(Elements.O, { implicitHydrogens: 1 })),
  ];
  return createMoleculeFromGraph(
    atoms,
    atoms.slice(1).map((_, index) => ({
      from: 0,
      to: index + 1,
      order: 1,
      aromatic: false,
    })),
  );
}

export function makeHydrogenMolecule() {
  return createMoleculeFromGraph(
    [new Atom(Elements.H), new Atom(Elements.H)],
    [{ from: 0, to: 1, order: 1, aromatic: false }],
  );
}

export function makeWaterMolecule() {
  return createMoleculeFromGraph(
    [new Atom(Elements.O, { implicitHydrogens: 2 })],
    [],
  );
}

export function makeAlkoxide(alcohol, site) {
  const atoms = cloneAtoms(alcohol);
  const oxygen = atoms[site.oxygenIndex];
  if (!oxygen || oxygen.element.symbol !== "O" || oxygen.implicitHydrogens < 1) {
    throw new TypeError("The alcohol reactant does not contain a deprotonatable oxygen.");
  }
  oxygen.implicitHydrogens -= 1;
  oxygen.formalCharge -= 1;
  return createMoleculeFromGraph(atoms, cloneBonds(alcohol.bonds));
}

export function makeAlcohol(alkoxide) {
  const adjacency = getAdjacency(alkoxide);
  const atoms = cloneAtoms(alkoxide);
  const oxygenIndex = atoms.findIndex(
    (atom, index) =>
      atom.element.symbol === "O" &&
      atom.formalCharge === -1 &&
      atom.implicitHydrogens === 0 &&
      adjacency[index].some(
        ({ atomIndex, bond }) =>
          bond.order === 1 && atoms[atomIndex].element.symbol === "C",
      ),
  );
  if (oxygenIndex < 0) throw new TypeError("The reactant does not contain an alkoxide.");
  atoms[oxygenIndex].formalCharge = 0;
  atoms[oxygenIndex].implicitHydrogens += 1;
  return createMoleculeFromGraph(atoms, cloneBonds(alkoxide.bonds));
}

export function makeAlcoholDeprotonationProducts(alcohol, base, site, baseType) {
  const alkoxide = makeAlkoxide(alcohol, site);
  if (baseType === "hydroxide") {
    return [alkoxide, makeConjugateAcid(base, "hydroxide")];
  }
  if (baseType === "amide") {
    return [alkoxide, makeConjugateAcid(base, "amide")];
  }
  if (baseType === "hydride") {
    return [alkoxide, makeHydrogenGas(base)];
  }
  throw new TypeError(`Unsupported alcohol deprotonation base: ${baseType}`);
}

export function makeAlcoholDeprotonationReactants(alkoxide, conjugateAcid, baseType) {
  return [
    { molecule: makeAlcohol(alkoxide), moles: 1 },
    { molecule: makeConjugateBase(conjugateAcid, baseType), moles: 1 },
  ];
}

function makeConjugateAcid(base, baseType) {
  const atoms = cloneAtoms(base);
  const expectedElement = baseType === "amide" ? "N" : "O";
  const expectedHydrogens = baseType === "amide" ? 2 : 1;
  const atom = atoms.find(
    (candidate) =>
      candidate.element.symbol === expectedElement &&
      candidate.formalCharge === -1 &&
      candidate.implicitHydrogens === expectedHydrogens,
  );
  if (!atom) throw new TypeError(`The ${baseType} reactant has an invalid structure.`);
  atom.formalCharge = 0;
  atom.implicitHydrogens += 1;
  return createMoleculeFromGraph(atoms, cloneBonds(base.bonds));
}

function makeConjugateBase(conjugateAcid, baseType) {
  if (baseType === "hydride") return makeHydride(conjugateAcid);
  const atoms = cloneAtoms(conjugateAcid);
  const expectedElement = baseType === "amide" ? "N" : "O";
  const expectedHydrogens = baseType === "amide" ? 3 : 2;
  const atom = atoms.find(
    (candidate) =>
      candidate.element.symbol === expectedElement &&
      candidate.formalCharge === 0 &&
      candidate.implicitHydrogens === expectedHydrogens,
  );
  if (!atom) throw new TypeError(`The ${baseType} conjugate acid has an invalid structure.`);
  atom.formalCharge = -1;
  atom.implicitHydrogens -= 1;
  return createMoleculeFromGraph(atoms, cloneBonds(conjugateAcid.bonds));
}

function makeHydrogenGas(hydride) {
  const hydrogen = hydride.atoms.find(
    (atom) => atom.element.symbol === "H" && atom.formalCharge === -1,
  );
  if (!hydrogen) throw new TypeError("The hydride reactant must contain H-.");
  return createMoleculeFromGraph(
    [new Atom(Elements.H), new Atom(Elements.H)],
    [{ from: 0, to: 1, order: 1, aromatic: false }],
  );
}

function makeHydride(hydrogenGas) {
  const hydrogenAtoms = hydrogenGas.atoms.filter((atom) => atom.element.symbol === "H");
  const hydrogenBond = hydrogenGas.bonds.find(
    (bond) =>
      bond.order === 1 &&
      hydrogenGas.atoms[bond.from].element.symbol === "H" &&
      hydrogenGas.atoms[bond.to].element.symbol === "H",
  );
  if (hydrogenAtoms.length !== 2 || !hydrogenBond) {
    throw new TypeError("The conjugate acid of hydride must be H2.");
  }
  const atom = new Atom(hydrogenAtoms[0].element, {
    id: hydrogenAtoms[0].id,
    formalCharge: -1,
  });
  return createMoleculeFromGraph([atom], []);
}

export function makeHydroxide(water) {
  const atoms = cloneAtoms(water);
  const oxygen = atoms.find(
    (atom) =>
      atom.element.symbol === "O" &&
      atom.formalCharge === 0 &&
      atom.implicitHydrogens === 2,
  );
  if (!oxygen) throw new TypeError("The reactant must be water.");
  oxygen.implicitHydrogens -= 1;
  oxygen.formalCharge -= 1;
  return createMoleculeFromGraph(atoms, cloneBonds(water.bonds));
}

export function makeProton(water) {
  if (!water.atoms.some((atom) => atom.element.symbol === "O")) {
    throw new TypeError("The reactant must be water.");
  }
  return createMoleculeFromGraph(
    [new Atom(Elements.H, { formalCharge: 1 })],
    [],
  );
}

export function makeWaterFromHydroxide(hydronium, hydroxide) {
  if (
    hydronium.atoms.length !== 1 ||
    hydronium.bonds.length !== 0 ||
    hydronium.atoms[0].element.symbol !== "O" ||
    hydronium.atoms[0].formalCharge !== 1 ||
    hydronium.atoms[0].implicitHydrogens !== 3
  ) {
    throw new TypeError("The reactant must be hydronium.");
  }
  const atoms = cloneAtoms(hydroxide);
  const oxygen = atoms.find(
    (atom) =>
      atom.element.symbol === "O" &&
      atom.formalCharge === -1 &&
      atom.implicitHydrogens === 1,
  );
  if (!oxygen) throw new TypeError("The reactant must be hydroxide.");
  oxygen.implicitHydrogens += 1;
  oxygen.formalCharge += 1;
  return createMoleculeFromGraph(atoms, cloneBonds(hydroxide.bonds));
}

export function findKetoneAldehydeCarbonylSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let carbonIndex = 0; carbonIndex < molecule.atoms.length; carbonIndex += 1) {
    if (molecule.atoms[carbonIndex].element.symbol !== "C") continue;
    const carbonyl = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 &&
        molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!carbonyl) continue;

    const carbonSubstituent = adjacency[carbonIndex].some(
      ({ atomIndex, bond }) =>
        bond.order === 1 && molecule.atoms[atomIndex].element.symbol === "C",
    );
    const acylHeteroatom = adjacency[carbonIndex].some(
      ({ atomIndex, bond }) =>
        bond.order === 1 &&
        atomIndex !== carbonyl.atomIndex &&
        molecule.atoms[atomIndex].element.symbol !== "C" &&
        molecule.atoms[atomIndex].element.symbol !== "H",
    );
    if (carbonSubstituent && !acylHeteroatom) {
      return { carbonIndex, carbonylOxygenIndex: carbonyl.atomIndex };
    }
  }
  return null;
}

function getMoleculeComponents(molecule, removedBond = null) {
  const adjacency = molecule.atoms.map(() => []);
  molecule.bonds.forEach((bond) => {
    const removed =
      removedBond &&
      ((bond.from === removedBond.from && bond.to === removedBond.to) ||
        (bond.from === removedBond.to && bond.to === removedBond.from));
    if (removed) return;
    adjacency[bond.from].push(bond.to);
    adjacency[bond.to].push(bond.from);
  });

  const visited = new Set();
  const components = [];
  molecule.atoms.forEach((_, start) => {
    if (visited.has(start)) return;
    const indices = [];
    const pending = [start];
    while (pending.length) {
      const atomIndex = pending.pop();
      if (visited.has(atomIndex)) continue;
      visited.add(atomIndex);
      indices.push(atomIndex);
      pending.push(...adjacency[atomIndex]);
    }
    components.push(indices);
  });
  return components;
}

function cloneMoleculeFragment(molecule, indices, idPrefix) {
  const oldToNew = new Map(indices.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const atoms = indices.map((oldIndex) => {
    const atom = molecule.atoms[oldIndex];
    const clone = new Atom(atom.element, {
      id: `${idPrefix}-${atom.id ?? oldIndex}`,
      formalCharge: atom.formalCharge,
      aromatic: atom.aromatic,
      implicitHydrogens: atom.implicitHydrogens,
      chirality: atom.chirality,
      isWildcard: atom.isWildcard,
    });
    clone.stereoNeighbors = atom.stereoNeighbors.map((neighbor) =>
      typeof neighbor === "number" ? oldToNew.get(neighbor) ?? null : neighbor,
    );
    return clone;
  });
  const indexSet = new Set(indices);
  const bonds = molecule.bonds
    .filter((bond) => indexSet.has(bond.from) && indexSet.has(bond.to))
    .map((bond) => ({
      ...bond,
      from: oldToNew.get(bond.from),
      to: oldToNew.get(bond.to),
      ...(bond.stereoRefs
        ? { stereoRefs: bond.stereoRefs.map((reference) => oldToNew.get(reference)) }
        : {}),
    }));
  return { atoms, bonds, oldToNew };
}

export function findAcylLeavingSite(molecule) {
  const adjacency = getAdjacency(molecule);
  for (let carbonIndex = 0; carbonIndex < molecule.atoms.length; carbonIndex += 1) {
    if (molecule.atoms[carbonIndex].element.symbol !== "C") continue;
    const carbonyl = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 && molecule.atoms[atomIndex].element.symbol === "O",
    );
    if (!carbonyl) continue;

    const leaving = adjacency[carbonIndex].find(({ atomIndex, bond }) => {
      if (bond.order !== 1) return false;
      const atom = molecule.atoms[atomIndex];
      if (atom.element.symbol === "Cl" && atom.formalCharge === 0) return true;
      if (atom.element.symbol !== "O" || atom.formalCharge !== 0) return false;
      return adjacency[atomIndex].some(
        ({ atomIndex: otherCarbon, bond: otherBond }) =>
          otherCarbon !== carbonIndex &&
          otherBond.order === 1 &&
          molecule.atoms[otherCarbon].element.symbol === "C" &&
          adjacency[otherCarbon].some(
            ({ atomIndex: otherOxygen, bond: carbonylBond }) =>
              otherOxygen !== atomIndex &&
              molecule.atoms[otherOxygen].element.symbol === "O" &&
              carbonylBond.order === 2,
          ),
      );
    });
    if (leaving) {
      return {
        carbonIndex,
        carbonylOxygenIndex: carbonyl.atomIndex,
        leavingAtomIndex: leaving.atomIndex,
        leavingType: molecule.atoms[leaving.atomIndex].element.symbol === "Cl" ? "halide" : "anhydride",
      };
    }
  }
  return null;
}

export function makeNucleophilicAdditionProduct(carboxyl, nucleophile, site, nucleophileSite) {
  const carboxylAtoms = cloneAtoms(carboxyl, "acyl");
  const nucleophileAtoms = cloneAtoms(nucleophile, "nucleophile");
  const offset = carboxylAtoms.length;
  const carboxylBonds = cloneBonds(carboxyl.bonds);
  const carbonylBond = carboxylBonds.find(
    (bond) =>
      bond.order === 2 &&
      ((bond.from === site.carbonIndex && bond.to === site.carbonylOxygenIndex) ||
        (bond.to === site.carbonIndex && bond.from === site.carbonylOxygenIndex)),
  );
  if (!carbonylBond) throw new TypeError("The carboxyl group has no carbonyl bond.");

  const carbonylOxygen = carboxylAtoms[site.carbonylOxygenIndex];
  const attackingAtom = nucleophileAtoms[nucleophileSite.atomIndex];
  const transfersProton = attackingAtom.formalCharge === 0 && attackingAtom.implicitHydrogens > 0;
  carbonylBond.order = 1;
  if (transfersProton) {
    attackingAtom.implicitHydrogens -= 1;
    carbonylOxygen.implicitHydrogens += 1;
  } else {
    carbonylOxygen.formalCharge -= 1;
    if (attackingAtom.formalCharge < 0) attackingAtom.formalCharge += 1;
    else attackingAtom.formalCharge += 1;
  }

  const bonds = [
    ...carboxylBonds,
    ...cloneBonds(nucleophile.bonds).map((bond) => ({
      ...bond,
      from: bond.from + offset,
      to: bond.to + offset,
      ...(bond.stereoRefs
        ? { stereoRefs: bond.stereoRefs.map((reference) => reference + offset) }
        : {}),
    })),
    { from: site.carbonIndex, to: nucleophileSite.atomIndex + offset, order: 1, aromatic: false },
  ];
  return createMoleculeFromGraph([...carboxylAtoms, ...nucleophileAtoms], bonds);
}

export function makeNucleophilicAcylSubstitutionProducts(
  acylDerivative,
  nucleophile,
  site,
  nucleophileSite,
) {
  const substrateComponents = getMoleculeComponents(acylDerivative, {
    from: site.carbonIndex,
    to: site.leavingAtomIndex,
  });
  const acylIndices = substrateComponents.find((indices) => indices.includes(site.carbonIndex));
  const leavingIndices = substrateComponents.find((indices) => indices.includes(site.leavingAtomIndex));
  if (!acylIndices || !leavingIndices) {
    throw new TypeError("Could not separate the acyl group from its leaving group.");
  }

  const acylGraph = cloneMoleculeFragment(acylDerivative, acylIndices, "acyl");
  const leavingGraph = cloneMoleculeFragment(acylDerivative, leavingIndices, "leaving");
  const nucleophileAtoms = cloneAtoms(nucleophile, "nucleophile");
  nucleophileAtoms.forEach((atom) => {
    atom.stereoNeighbors = atom.stereoNeighbors.map((neighbor) =>
      typeof neighbor === "number" ? neighbor + acylGraph.atoms.length : neighbor,
    );
  });
  const acylCarbon = acylGraph.oldToNew.get(site.carbonIndex);
  const attackingAtom = nucleophileAtoms[nucleophileSite.atomIndex];
  const transfersProton = attackingAtom.formalCharge === 0 && attackingAtom.implicitHydrogens > 0;

  if (transfersProton) attackingAtom.implicitHydrogens -= 1;
  if (attackingAtom.formalCharge < 0) attackingAtom.formalCharge += 1;
  else if (!transfersProton) attackingAtom.formalCharge += 1;

  const leavingAtom = leavingGraph.atoms[leavingGraph.oldToNew.get(site.leavingAtomIndex)];
  if (site.leavingType === "halide") {
    leavingAtom.formalCharge = transfersProton ? 0 : -1;
    leavingAtom.implicitHydrogens = transfersProton ? 1 : 0;
  } else {
    leavingAtom.formalCharge = transfersProton ? 0 : -1;
    if (transfersProton) leavingAtom.implicitHydrogens += 1;
  }

  const nucleophileBonds = cloneBonds(nucleophile.bonds).map((bond) => ({
    ...bond,
    from: bond.from + acylGraph.atoms.length,
    to: bond.to + acylGraph.atoms.length,
    ...(bond.stereoRefs
      ? { stereoRefs: bond.stereoRefs.map((reference) => reference + acylGraph.atoms.length) }
      : {}),
  }));
  const acylProduct = createMoleculeFromGraph(
    [...acylGraph.atoms, ...nucleophileAtoms],
    [
      ...acylGraph.bonds,
      ...nucleophileBonds,
      {
        from: acylCarbon,
        to: acylGraph.atoms.length + nucleophileSite.atomIndex,
        order: 1,
        aromatic: false,
      },
    ],
  );
  const leavingProduct = createMoleculeFromGraph(leavingGraph.atoms, leavingGraph.bonds);
  return [
    { molecule: acylProduct, moles: 1 },
    { molecule: leavingProduct, moles: 1 },
  ];
}

export function makeCarboxylate(molecule, site) {
  const atoms = cloneAtoms(molecule);
  atoms[site.hydroxylOxygenIndex].implicitHydrogens -= 1;
  atoms[site.hydroxylOxygenIndex].formalCharge = -1;
  return createMoleculeFromGraph(atoms, cloneBonds(molecule.bonds));
}

export function makeHydronium(water) {
  const atoms = cloneAtoms(water);
  const oxygen = atoms.find((atom) => atom.element.symbol === "O");
  if (!oxygen) throw new TypeError("The water reactant must contain oxygen.");
  oxygen.implicitHydrogens += 1;
  oxygen.formalCharge += 1;
  return createMoleculeFromGraph(atoms, cloneBonds(water.bonds));
}

export function makeCarboxylicAcid(molecule) {
  const adjacency = getAdjacency(molecule);
  const atoms = cloneAtoms(molecule);
  for (let carbonIndex = 0; carbonIndex < atoms.length; carbonIndex += 1) {
    if (atoms[carbonIndex].element.symbol !== "C") continue;
    const carbonyl = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 2 && atoms[atomIndex].element.symbol === "O",
    );
    const carboxylateOxygen = adjacency[carbonIndex].find(
      ({ atomIndex, bond }) =>
        bond.order === 1 &&
        atoms[atomIndex].element.symbol === "O" &&
        atoms[atomIndex].formalCharge === -1,
    );
    if (carbonyl && carboxylateOxygen) {
      atoms[carboxylateOxygen.atomIndex].formalCharge = 0;
      atoms[carboxylateOxygen.atomIndex].implicitHydrogens += 1;
      return createMoleculeFromGraph(atoms, cloneBonds(molecule.bonds));
    }
  }
  throw new TypeError("The reactant does not contain a carboxylate group.");
}

export function makeWater(hydronium) {
  const atoms = cloneAtoms(hydronium);
  const oxygen = atoms.find((atom) => atom.element.symbol === "O");
  if (!oxygen || oxygen.formalCharge !== 1 || oxygen.implicitHydrogens < 1) {
    throw new TypeError("The reactant must be hydronium.");
  }
  oxygen.implicitHydrogens -= 1;
  oxygen.formalCharge -= 1;
  return createMoleculeFromGraph(atoms, cloneBonds(hydronium.bonds));
}

export function makeHalideIon(hydrogenHalide) {
  const halogen = hydrogenHalide.atoms.find((atom) =>
    ["F", "Cl", "Br", "I"].includes(atom.element.symbol),
  );
  if (!halogen || halogen.formalCharge !== 0 || halogen.implicitHydrogens !== 1) {
    throw new TypeError("The reactant must be a hydrogen halide.");
  }
  const atom = new Atom(halogen.element, {
    id: halogen.id,
    formalCharge: -1,
    implicitHydrogens: 0,
  });
  return createMoleculeFromGraph([atom], []);
}

export function makeHydrogenHalide(halideIon) {
  const halide = halideIon.atoms.find((atom) => ["F", "Cl", "Br", "I"].includes(atom.element.symbol));
  if (!halide || halide.formalCharge !== -1) {
    throw new TypeError("The reactant must be a halide ion.");
  }
  const atom = new Atom(halide.element, {
    id: halide.id,
    formalCharge: 0,
    implicitHydrogens: 1,
  });
  return createMoleculeFromGraph([atom], []);
}

export function makeEliminationProducts(substrate, base, site, baseSite) {
  const originalAtoms = cloneAtoms(substrate);
  const originalBonds = cloneBonds(substrate.bonds);
  const betaIndex = site.betaCarbons
    .map((atomIndex) => ({
      atomIndex,
      carbonDegree: getAdjacency(substrate)[atomIndex].filter(
        ({ atomIndex: neighbor, bond }) =>
          bond.order === 1 && substrate.atoms[neighbor].element.symbol === "C",
      ).length,
    }))
    .sort((first, second) => second.carbonDegree - first.carbonDegree)[0]?.atomIndex;
  if (betaIndex === undefined) throw new TypeError("The alkyl halide has no beta hydrogen for elimination.");

  const substrateGraph = omitAtom(originalAtoms, originalBonds, site.leavingAtomIndex);
  const carbonIndex = substrateGraph.oldToNew.get(site.carbonIndex);
  const mappedBetaIndex = substrateGraph.oldToNew.get(betaIndex);
  const substrateAtoms = substrateGraph.atoms;
  const baseAtoms = cloneAtoms(base);
  const baseAtom = baseAtoms[baseSite.atomIndex];
  baseAtom.implicitHydrogens += 1;
  baseAtom.formalCharge += 1;
  substrateAtoms[mappedBetaIndex].implicitHydrogens -= 1;
  [substrateAtoms[carbonIndex], substrateAtoms[mappedBetaIndex]].forEach((atom) => {
    atom.chirality = null;
    atom.stereoNeighbors = [];
  });

  const bonds = substrateGraph.bonds;
  const alphaBetaBond = bonds.find(
    (bond) =>
      (bond.from === carbonIndex && bond.to === mappedBetaIndex) ||
      (bond.to === carbonIndex && bond.from === mappedBetaIndex),
  );
  if (!alphaBetaBond || alphaBetaBond.order !== 1) {
    throw new TypeError("The selected beta carbon cannot form an alkene with the leaving-group carbon.");
  }
  alphaBetaBond.order = 2;
  const substrateProduct = createMoleculeFromGraph(substrateAtoms, bonds);
  const baseProduct = createMoleculeFromGraph(baseAtoms, cloneBonds(base.bonds));
  const leavingProduct = createHalideProduct(substrate, site.leavingAtomIndex, false);
  return [
    { molecule: substrateProduct, moles: 1 },
    { molecule: baseProduct, moles: 1 },
    { molecule: leavingProduct, moles: 1 },
  ];
}
