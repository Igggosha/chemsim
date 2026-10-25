import { parseSmiles as parseSmilesGraph } from "./smiles.js";

export class Element {
  constructor(
    symbol,
    atomicNumber,
    electronegativity,
    outerShellElectrons,
    atomicMass,
    displayColour,
    maxOuterShellElectrons = 8,
  ) {
    if (
      !symbol ||
      atomicNumber < 1 ||
      outerShellElectrons < 0 ||
      maxOuterShellElectrons < 1 ||
      atomicMass <= 0 ||
      !displayColour
    ) {
      throw new Error("Invalid element properties.");
    }

    this.symbol = symbol;
    this.atomicNumber = atomicNumber;
    this.electronegativity = electronegativity;
    this.outerShellElectrons = outerShellElectrons;
    this.atomicMass = atomicMass;
    this.displayColour = displayColour;
    this.maxOuterShellElectrons = maxOuterShellElectrons;
    Object.freeze(this);
  }
}

export const Elements = Object.freeze({
  H: new Element("H", 1, 2.2, 1, 1.008, "#f4f5f2", 2),
  Li: new Element("Li", 3, 0.98, 1, 6.94, "#b65cba"),
  Be: new Element("Be", 4, 1.57, 2, 9.012, "#c5a55a"),
  B: new Element("B", 5, 2.04, 3, 10.81, "#e7bd78"),
  C: new Element("C", 6, 2.55, 4, 12.011, "#202522"),
  N: new Element("N", 7, 3.04, 5, 14.007, "#4778ef"),
  O: new Element("O", 8, 3.44, 6, 15.999, "#ef625e"),
  F: new Element("F", 9, 3.98, 7, 18.998, "#a0d66a"),
  Ne: new Element("Ne", 10, 0, 8, 20.18, "#b8d7ed"),
  Na: new Element("Na", 11, 0.93, 1, 22.99, "#8e67d5"),
  Mg: new Element("Mg", 12, 1.31, 2, 24.305, "#42ad72"),
  Al: new Element("Al", 13, 1.61, 3, 26.982, "#a8b7c2"),
  Si: new Element("Si", 14, 1.9, 4, 28.085, "#d1a875"),
  P: new Element("P", 15, 2.19, 5, 30.974, "#e8a24b"),
  S: new Element("S", 16, 2.58, 6, 32.06, "#e8d45e"),
  Cl: new Element("Cl", 17, 3.16, 7, 35.45, "#58bd74"),
  Ar: new Element("Ar", 18, 3.0, 8, 39.948, "#83d7d7"),
  K: new Element("K", 19, 0.82, 1, 39.098, "#9062c5"),
  Ca: new Element("Ca", 20, 1.0, 2, 40.078, "#54aa69"),
  Cr: new Element("Cr", 24, 1.66, 6, 51.996, "#7294a0", 18),
  Mn: new Element("Mn", 25, 1.55, 7, 54.938, "#9f7790", 18),
  Br: new Element("Br", 35, 2.96, 7, 79.904, "#a65336"),
  Fe: new Element("Fe", 26, 1.83, 2, 55.845, "#c27d60", 18),
  Co: new Element("Co", 27, 1.88, 2, 58.933, "#6689bc", 18),
  Ni: new Element("Ni", 28, 1.91, 2, 58.693, "#50a987", 18),
  Cu: new Element("Cu", 29, 1.9, 1, 63.546, "#cb805e", 18),
  Zn: new Element("Zn", 30, 1.65, 2, 65.38, "#8299b6", 18),
  Se: new Element("Se", 34, 2.55, 6, 78.971, "#d78f4f"),
  I: new Element("I", 53, 2.66, 7, 126.904, "#9562bc"),
  Ag: new Element("Ag", 47, 1.93, 1, 107.868, "#c1c8cb", 18),
  Sn: new Element("Sn", 50, 1.96, 4, 118.71, "#abb6be", 18),
  Pt: new Element("Pt", 78, 2.28, 1, 195.084, "#abb7bd", 18),
  Au: new Element("Au", 79, 2.54, 1, 196.967, "#e6b84a", 18),
  Hg: new Element("Hg", 80, 2.0, 2, 200.592, "#9eacc0", 18),
  Pb: new Element("Pb", 82, 2.33, 4, 207.2, "#8796a9", 18),
});

export class Atom {
  constructor(
    element,
    {
      id,
      formalCharge = 0,
      aromatic = false,
      implicitHydrogens = 0,
      chirality = null,
      isWildcard = false,
    } = {},
  ) {
    if (!(element instanceof Element)) {
      throw new TypeError("An atom must be created from an Element.");
    }

    this.element = element;
    this.id = id;
    this.formalCharge = formalCharge;
    this.aromatic = aromatic;
    this.implicitHydrogens = implicitHydrogens;
    this.isWildcard = isWildcard;
    if (chirality !== null && chirality !== "@" && chirality !== "@@") {
      throw new Error(`Unsupported tetrahedral chirality marker: ${chirality}`);
    }
    this.chirality = chirality;
    this.stereoNeighbors = [];
  }
}

export function parseSmiles(smiles, options = {}) {
  return parseSmilesGraph(smiles, { ...options, Atom, Elements });
}

function bondKey(first, second) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function atomToken(atom, chirality = atom.chirality) {
  const symbol = atom.aromatic ? atom.element.symbol.toLowerCase() : atom.element.symbol;
  const organicSubset = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"]);
  const needsBracket =
    !organicSubset.has(atom.element.symbol) ||
    atom.formalCharge !== 0 ||
    (atom.aromatic && atom.element.symbol === "N" && atom.implicitHydrogens > 0) ||
    chirality !== null;

  if (!needsBracket) return symbol;

  const hydrogenToken =
    atom.implicitHydrogens > 0
      ? `H${atom.implicitHydrogens > 1 ? atom.implicitHydrogens : ""}`
      : "";
  const chargeToken = atom.formalCharge
    ? `${atom.formalCharge > 0 ? "+" : "-"}${Math.abs(atom.formalCharge) > 1 ? Math.abs(atom.formalCharge) : ""}`
    : "";
  return `[${symbol}${chirality ?? ""}${hydrogenToken}${chargeToken}]`;
}

function initialInvariant(atom, neighbors) {
  const bondOrderSum = neighbors.reduce((sum, neighbor) => sum + neighbor.bond.order, 0);
  return [
    atom.element.atomicNumber,
    neighbors.length,
    bondOrderSum,
    atom.formalCharge,
    atom.aromatic ? 1 : 0,
    atom.implicitHydrogens,
    atom.chirality ? 1 : 0,
    neighbors.filter((neighbor) => neighbor.bond.stereo).length,
  ];
}

function assignRanks(signatures) {
  const unique = [...new Set(signatures.map((signature) => JSON.stringify(signature)))].sort();
  const rankBySignature = new Map(unique.map((signature, rank) => [signature, rank]));
  return signatures.map((signature) => rankBySignature.get(JSON.stringify(signature)));
}

function samePartition(first, second) {
  for (let left = 0; left < first.length; left += 1) {
    for (let right = left + 1; right < first.length; right += 1) {
      if ((first[left] === first[right]) !== (second[left] === second[right])) return false;
    }
  }
  return true;
}

function refineRanks(atoms, adjacency, startingRanks) {
  let ranks = startingRanks;

  for (let iteration = 0; iteration < atoms.length; iteration += 1) {
    const refined = assignRanks(
      atoms.map((atom, index) => [
        ranks[index],
        initialInvariant(atom, adjacency[index]),
        ...adjacency[index]
          .map(({ atomIndex, bond }) => [
            bond.order,
            bond.aromatic ? 1 : 0,
            bond.stereo ?? "",
            ranks[atomIndex],
          ])
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      ]),
    );
    if (samePartition(ranks, refined)) return refined;
    ranks = refined;
  }

  return ranks;
}

function canonicalSmilesSearch(atoms, adjacency, ranks) {
  const refined = refineRanks(atoms, adjacency, ranks);
  const classes = new Map();
  refined.forEach((rank, atomIndex) => {
    const group = classes.get(rank) ?? [];
    group.push(atomIndex);
    classes.set(rank, group);
  });
  const unresolved = [...classes.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([leftRank, left], [rightRank, right]) => left.length - right.length || leftRank - rightRank)[0];

  if (!unresolved) {
    return atoms
      .map((_, root) => serializeFromRoot(atoms, adjacency, refined, root))
      .sort()[0];
  }

  const [rank, group] = unresolved;
  let best = null;
  for (const atomIndex of group) {
    const individualized = assignRanks(
      refined.map((currentRank, currentIndex) => [currentRank, currentRank === rank && currentIndex === atomIndex ? 1 : 0]),
    );
    const candidate = canonicalSmilesSearch(atoms, adjacency, individualized);
    if (best === null || candidate < best) best = candidate;
  }
  return best;
}

function isUniformAromaticCycle(atoms, adjacency) {
  if (
    atoms.length < 3 ||
    !atoms.every(
      (atom, index) =>
        atom.aromatic &&
        atom.element.symbol === atoms[0].element.symbol &&
        atom.formalCharge === atoms[0].formalCharge &&
        atom.implicitHydrogens === atoms[0].implicitHydrogens &&
        !atom.chirality &&
        adjacency[index].length === 2,
    ) ||
    !adjacency.every((neighbors) => neighbors.every(({ bond }) => bond.aromatic))
  ) {
    return false;
  }

  const connected = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const current = pending.pop();
    for (const { atomIndex } of adjacency[current]) {
      if (connected.has(atomIndex)) continue;
      connected.add(atomIndex);
      pending.push(atomIndex);
    }
  }
  return connected.size === atoms.length;
}

function canonicalStereoDirections(bonds) {
  const bondByKey = new Map(bonds.map((bond) => [bondKey(bond.from, bond.to), bond]));
  const constraints = new Map();
  const addConstraint = (first, second, parity) => {
    const firstConstraints = constraints.get(first) ?? [];
    firstConstraints.push({ edge: second, parity });
    constraints.set(first, firstConstraints);
    const secondConstraints = constraints.get(second) ?? [];
    secondConstraints.push({ edge: first, parity });
    constraints.set(second, secondConstraints);
  };

  bonds
    .filter((bond) => bond.stereo && bond.stereoRefs?.length === 2)
    .forEach((bond) => {
      const [fromReference, toReference] = bond.stereoRefs;
      const fromReferenceBond = bondByKey.get(bondKey(bond.from, fromReference));
      const toReferenceBond = bondByKey.get(bondKey(bond.to, toReference));
      if (!fromReferenceBond || !toReferenceBond) {
        throw new Error("Could not serialize E-Z stereochemistry: a reference bond is missing.");
      }
      const fromFactor = fromReferenceBond.from === bond.from ? 1 : -1;
      const toFactor = toReferenceBond.from === bond.to ? 1 : -1;
      const relativeDirection = bond.stereo === "E" ? -1 : 1;
      addConstraint(
        bondKey(fromReferenceBond.from, fromReferenceBond.to),
        bondKey(toReferenceBond.from, toReferenceBond.to),
        relativeDirection * fromFactor * toFactor,
      );
    });

  const directions = new Map();
  const components = [];
  for (const edge of constraints.keys()) {
    if (directions.has(edge)) continue;
    directions.set(edge, 1);
    const component = [];
    const pending = [edge];
    while (pending.length) {
      const current = pending.pop();
      component.push(current);
      for (const { edge: neighbor, parity } of constraints.get(current) ?? []) {
        const direction = directions.get(current) * parity;
        if (directions.has(neighbor)) {
          if (directions.get(neighbor) !== direction) {
            throw new Error("Could not serialize conflicting E-Z stereochemistry.");
          }
          continue;
        }
        directions.set(neighbor, direction);
        pending.push(neighbor);
      }
    }
    components.push(component);
  }
  return { directions, components };
}

function bondToken(bond, fromIndex, toIndex, stereoDirections) {
  if (bond.order === 1 && stereoDirections.has(bondKey(bond.from, bond.to))) {
    const direction = stereoDirections.get(bondKey(bond.from, bond.to)) * (fromIndex === bond.from ? 1 : -1);
    return direction > 0 ? "/" : "\\";
  }
  if (bond.aromatic || bond.order === 1) return "";
  if (bond.order === 2) return "=";
  if (bond.order === 3) return "#";
  throw new Error(`Unsupported bond order: ${bond.order}`);
}

function serializeFromRoot(atoms, adjacency, ranks, root) {
  const stereo = canonicalStereoDirections(adjacency.flatMap((neighbors, atomIndex) =>
    neighbors
      .filter(({ atomIndex: neighborIndex }) => atomIndex < neighborIndex)
      .map(({ bond }) => bond),
  ));
  function serialize(stereoDirections) {
  const visited = new Set();
  const treeEdges = new Set();
  const visitOrder = [];
  const children = new Map();

  const orderedNeighbors = (atomIndex) =>
    adjacency[atomIndex]
      .map(({ atomIndex: neighborIndex, bond }) => ({ atomIndex: neighborIndex, bond }))
      .sort(
        (left, right) =>
          ranks[left.atomIndex] - ranks[right.atomIndex] ||
          atoms[left.atomIndex].element.symbol.localeCompare(atoms[right.atomIndex].element.symbol) ||
          left.atomIndex - right.atomIndex,
      );

  function buildTree(atomIndex) {
    visited.add(atomIndex);
    visitOrder.push(atomIndex);
    const atomChildren = [];

    for (const neighbor of orderedNeighbors(atomIndex)) {
      if (visited.has(neighbor.atomIndex)) continue;
      treeEdges.add(bondKey(atomIndex, neighbor.atomIndex));
      atomChildren.push(neighbor);
      buildTree(neighbor.atomIndex);
    }

    children.set(atomIndex, atomChildren);
  }

  buildTree(root);
  for (const atomIndex of [...atoms.keys()].sort((left, right) => ranks[left] - ranks[right] || left - right)) {
    if (!visited.has(atomIndex)) buildTree(atomIndex);
  }

  const visitIndex = new Map(visitOrder.map((atomIndex, index) => [atomIndex, index]));
  const ringClosures = new Map(atoms.map((_, index) => [index, []]));
  const ringEdges = [];

  adjacency.forEach((neighbors, atomIndex) => {
    neighbors.forEach(({ atomIndex: neighborIndex, bond }) => {
      const key = bondKey(atomIndex, neighborIndex);
      if (atomIndex < neighborIndex && !treeEdges.has(key)) {
        ringEdges.push({ first: atomIndex, second: neighborIndex, bond });
      }
    });
  });
  ringEdges.sort(
    (left, right) =>
      Math.min(visitIndex.get(left.first), visitIndex.get(left.second)) -
        Math.min(visitIndex.get(right.first), visitIndex.get(right.second)) ||
      Math.max(visitIndex.get(left.first), visitIndex.get(left.second)) -
        Math.max(visitIndex.get(right.first), visitIndex.get(right.second)),
  );

  ringEdges.forEach(({ first, second, bond }, index) => {
    const label = index < 9 ? String(index + 1) : `%${index + 1}`;
    const earlier = visitIndex.get(first) < visitIndex.get(second) ? first : second;
    const later = earlier === first ? second : first;
    ringClosures.get(earlier).push({
      neighborIndex: later,
      token: `${bondToken(bond, earlier, later, stereoDirections)}${label}`,
    });
    ringClosures.get(later).push({ neighborIndex: earlier, token: label });
  });

  function emit(atomIndex, parentIndex = null) {
    const atomChildren = children.get(atomIndex) ?? [];
    const rings = ringClosures.get(atomIndex);
    const outputNeighbors = [
      ...(atoms[atomIndex].implicitHydrogens ? ["H"] : []),
      ...(parentIndex === null ? [] : [parentIndex]),
      ...rings.map(({ neighborIndex }) => neighborIndex),
      ...atomChildren.map(({ atomIndex: childIndex }) => childIndex),
    ];
    let chirality = atoms[atomIndex].chirality;
    if (chirality) {
      const inputNeighbors = atoms[atomIndex].stereoNeighbors;
      if (
        inputNeighbors.length !== outputNeighbors.length ||
        outputNeighbors.some((neighbor) => !inputNeighbors.includes(neighbor))
      ) {
        throw new Error(
          `Could not preserve tetrahedral stereochemistry while generating canonical SMILES: ` +
            `${JSON.stringify(inputNeighbors)} != ${JSON.stringify(outputNeighbors)}.`,
        );
      }
      let inversions = 0;
      for (let left = 0; left < outputNeighbors.length; left += 1) {
        for (let right = left + 1; right < outputNeighbors.length; right += 1) {
          if (inputNeighbors.indexOf(outputNeighbors[left]) > inputNeighbors.indexOf(outputNeighbors[right])) {
            inversions += 1;
          }
        }
      }
      if (inversions % 2 === 1) chirality = chirality === "@" ? "@@" : "@";
    }

    let result = `${atomToken(atoms[atomIndex], chirality)}${rings.map(({ token }) => token).join("")}`;

    atomChildren.forEach((child, index) => {
      const segment =
        `${bondToken(child.bond, atomIndex, child.atomIndex, stereoDirections)}` +
        `${emit(child.atomIndex, atomIndex)}`;
      result += index === atomChildren.length - 1 ? segment : `(${segment})`;
    });

    return result;
  }

  const componentRoots = [];
  const reached = new Set();
  for (const atomIndex of visitOrder) {
    if (reached.has(atomIndex)) continue;
    componentRoots.push(atomIndex);
    const stack = [atomIndex];
    while (stack.length) {
      const current = stack.pop();
      if (reached.has(current)) continue;
      reached.add(current);
      stack.push(...(children.get(current) ?? []).map(({ atomIndex: childIndex }) => childIndex));
    }
  }

    return componentRoots.map((componentRoot) => emit(componentRoot)).sort().join(".");
  }

  let directions = stereo.directions;
  let canonical = serialize(directions);
  for (const component of stereo.components) {
    const flipped = new Map(directions);
    component.forEach((edge) => flipped.set(edge, -flipped.get(edge)));
    const candidate = serialize(flipped);
    if (candidate < canonical) {
      directions = flipped;
      canonical = candidate;
    }
  }
  return canonical;
}

export function cangen(atoms, bonds) {
  if (!Array.isArray(atoms) || atoms.length === 0) {
    throw new Error("CANGEN requires at least one atom.");
  }

  const adjacency = atoms.map(() => []);
  for (const bond of bonds) {
    const { from, to } = bond;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= atoms.length ||
      to >= atoms.length ||
      from === to
    ) {
      throw new Error("A bond must connect two distinct atoms in the molecule.");
    }
    adjacency[from].push({ atomIndex: to, bond });
    adjacency[to].push({ atomIndex: from, bond });
  }

  const stereoFreeAdjacency = adjacency.map((neighbors) =>
    neighbors.map(({ atomIndex, bond }) => ({
      atomIndex,
      bond: { ...bond, stereo: undefined, stereoRefs: undefined },
    })),
  );
  const stereoFreeRanks = refineRanks(
    atoms,
    stereoFreeAdjacency,
    assignRanks(atoms.map((atom, index) => initialInvariant(atom, stereoFreeAdjacency[index]))),
  );
  const canonicalBonds = bonds.map((bond) => {
    if (!bond.stereo || bond.stereoRefs?.length !== 2) return { ...bond };
    const preferredReferences = [bond.from, bond.to].map((atomIndex, side) => {
      const opposite = side === 0 ? bond.to : bond.from;
      return adjacency[atomIndex]
        .filter(({ atomIndex: neighbor }) => neighbor !== opposite)
        .map(({ atomIndex: neighbor }) => neighbor)
        .sort(
          (first, second) =>
            stereoFreeRanks[second] - stereoFreeRanks[first] ||
            atoms[first].element.symbol.localeCompare(atoms[second].element.symbol) ||
            first - second,
        )[0];
    });
    const changedSides = preferredReferences.filter(
      (reference, side) => reference !== bond.stereoRefs[side],
    ).length;
    return {
      ...bond,
      stereo: changedSides % 2 ? (bond.stereo === "E" ? "Z" : "E") : bond.stereo,
      stereoRefs: preferredReferences,
    };
  });
  const canonicalAdjacency = atoms.map(() => []);
  canonicalBonds.forEach((bond) => {
    canonicalAdjacency[bond.from].push({ atomIndex: bond.to, bond });
    canonicalAdjacency[bond.to].push({ atomIndex: bond.from, bond });
  });
  const ranks = assignRanks(atoms.map((atom, index) => initialInvariant(atom, canonicalAdjacency[index])));
  if (isUniformAromaticCycle(atoms, canonicalAdjacency)) {
    const minimum = Math.min(...atoms.map((atom) => atom.element.atomicNumber));
    const start = atoms.findIndex((atom) => atom.element.atomicNumber === minimum);
    return `${atomToken(atoms[start])}1${Array(atoms.length - 1)
      .fill(atomToken(atoms[start]))
      .join("")}1`;
  }

  return canonicalSmilesSearch(atoms, canonicalAdjacency, ranks);
}

export class Molecule {
  constructor(name = null, atomsOrSmiles, bonds = []) {
    const { atoms, bonds: moleculeBonds } =
      typeof atomsOrSmiles === "string"
        ? parseSmiles(atomsOrSmiles)
        : { atoms: atomsOrSmiles, bonds };
    if (!Array.isArray(atoms) || !Array.isArray(moleculeBonds)) {
      throw new TypeError("A molecule requires a SMILES string or atom and bond arrays.");
    }

    this.atoms = atoms;
    this.bonds = moleculeBonds;
    this.canonicalSmiles = cangen(atoms, moleculeBonds);
    this.name = name?.trim() || this.formula;
    this.molecularMass = atoms.reduce(
      (mass, atom) =>
        mass +
        atom.element.atomicMass +
        atom.implicitHydrogens * Elements.H.atomicMass,
      0,
    );
  }

  get formula() {
    const counts = new Map();
    this.atoms.forEach((atom) => {
      const symbol = atom.element.symbol;
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      if (atom.implicitHydrogens) {
        counts.set("H", (counts.get("H") ?? 0) + atom.implicitHydrogens);
      }
    });

    const symbols = [...counts.keys()];
    const orderedSymbols = symbols.includes("C")
      ? ["C", "H", ...symbols.filter((symbol) => symbol !== "C" && symbol !== "H").sort()]
      : symbols.sort();

    const neutralFormula = orderedSymbols
      .filter((symbol, index, ordered) => counts.has(symbol) && ordered.indexOf(symbol) === index)
      .map((symbol) => `${symbol}${counts.get(symbol) > 1 ? counts.get(symbol) : ""}`)
      .join("");
    const formalCharge = this.atoms.reduce((charge, atom) => charge + atom.formalCharge, 0);
    if (formalCharge === 0) return neutralFormula;

    const chargeMagnitude = Math.abs(formalCharge);
    const chargeSuffix = `${chargeMagnitude > 1 ? chargeMagnitude : ""}${formalCharge > 0 ? "+" : "-"}`;
    return `[${neutralFormula}]${chargeSuffix}`;
  }

  getDensity() {
    return 1;
  }

  getIonicComponents() {
    const adjacency = this.atoms.map(() => []);
    this.bonds.forEach((bond) => {
      adjacency[bond.from].push(bond.to);
      adjacency[bond.to].push(bond.from);
    });

    const components = [];
    const visited = new Set();
    this.atoms.forEach((_, startIndex) => {
      if (visited.has(startIndex)) return;
      const indices = [];
      const pending = [startIndex];
      while (pending.length) {
        const atomIndex = pending.pop();
        if (visited.has(atomIndex)) continue;
        visited.add(atomIndex);
        indices.push(atomIndex);
        adjacency[atomIndex].forEach((neighbor) => pending.push(neighbor));
      }
      components.push(indices);
    });

    if (components.length < 2) return [this];
    const componentCharges = components.map((indices) =>
      indices.reduce((charge, index) => charge + this.atoms[index].formalCharge, 0),
    );
    if (
      !componentCharges.some((charge) => charge !== 0) ||
      !componentCharges.some((charge) => charge === 0)
    ) {
      return [this];
    }

    return components.map((indices) => {
      const oldToNew = new Map(indices.map((oldIndex, newIndex) => [oldIndex, newIndex]));
      const atoms = indices.map((oldIndex) => {
        const atom = this.atoms[oldIndex];
        const clone = new Atom(atom.element, {
          id: atom.id,
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
      const componentIndices = new Set(indices);
      const bonds = this.bonds
        .filter((bond) => componentIndices.has(bond.from) && componentIndices.has(bond.to))
        .map((bond) => ({
          ...bond,
          from: oldToNew.get(bond.from),
          to: oldToNew.get(bond.to),
          ...(bond.stereoRefs
            ? { stereoRefs: bond.stereoRefs.map((reference) => oldToNew.get(reference)) }
            : {}),
        }));
      return new Molecule(null, atoms, bonds);
    });
  }

  static fromSmiles(smiles, name = null) {
    return new Molecule(name, smiles);
  }
}

export class MixtureContainer {
  constructor(contents = [], temperatureKelvin = 298.15) {
    if (!Number.isFinite(temperatureKelvin) || temperatureKelvin < 0) {
      throw new Error("Container temperature must be a non-negative kelvin value.");
    }
    this.contents = [...contents];
    this.temperatureKelvin = temperatureKelvin;
    this.contentVersion = 0;
  }

  get liquidVolume() {
    return this.contents.reduce(
      (volume, entry) =>
        entry.state === "liquid"
          ? volume + (entry.moles * entry.molecule.molecularMass) / entry.molecule.getDensity()
          : volume,
      0,
    );
  }

  get liquidVolumeLiters() {
    return this.liquidVolume / 1000;
  }

  get totalMass() {
    return this.contents.reduce(
      (mass, entry) => mass + entry.moles * entry.molecule.molecularMass,
      0,
    );
  }

  add(molecule, moles, state = "liquid") {
    if (!(molecule instanceof Molecule) || !Number.isFinite(moles) || moles <= 0) {
      throw new Error("Mixture contents require a Molecule and a positive molar amount.");
    }
    if (!["liquid", "solid", "gas"].includes(state)) {
      throw new Error(`Unsupported state of matter: ${state}`);
    }

    molecule.getIonicComponents().forEach((component) => {
      const existing = this.contents.find(
        (entry) =>
          entry.molecule.canonicalSmiles === component.canonicalSmiles &&
          entry.state === state,
      );
      if (existing) existing.moles += moles;
      else this.contents.push({ molecule: component, moles, state });
      this.contentVersion += 1;
    });
  }

  remove(moleculeSmiles, moles, state = null) {
    const entry = this.contents.find(
      (content) =>
        content.molecule.canonicalSmiles === moleculeSmiles &&
        (state === null || content.state === state),
    );
    if (!entry || !Number.isFinite(moles) || moles <= 0) return;
    entry.moles = Math.max(0, entry.moles - moles);
    if (entry.moles === 0) this.contents = this.contents.filter((content) => content !== entry);
    this.contentVersion += 1;
  }

  transferTo(target, moles) {
    if (!(target instanceof MixtureContainer) && target !== null) {
      throw new TypeError("A transfer target must be a MixtureContainer or null.");
    }
    if (target === this) {
      throw new Error("A mixture cannot be transferred into itself.");
    }
    if (!Number.isFinite(moles) || moles <= 0) return 0;

    const totalMoles = this.contents.reduce((sum, entry) => sum + entry.moles, 0);
    if (totalMoles === 0) return 0;

    const amountToTransfer = Math.min(moles, totalMoles);
    const transferred = [];
    let remainingToTransfer = amountToTransfer;
    this.contents = this.contents.flatMap((entry, index) => {
      const amount = index === this.contents.length - 1
        ? Math.min(entry.moles, remainingToTransfer)
        : Math.min(entry.moles, amountToTransfer * (entry.moles / totalMoles));
      remainingToTransfer -= amount;
      if (amount > 0) transferred.push({ ...entry, moles: amount });

      const remainingMoles = entry.moles - amount;
      return remainingMoles > 1e-12 ? [{ ...entry, moles: remainingMoles }] : [];
    });
    this.contentVersion += 1;

    if (target) {
      const transferredMass = transferred.reduce(
        (mass, entry) => mass + entry.moles * entry.molecule.molecularMass,
        0,
      );
      const existingMass = target.totalMass;
      if (transferredMass > 0) {
        target.temperatureKelvin =
          existingMass === 0
            ? this.temperatureKelvin
            : (existingMass * target.temperatureKelvin +
                transferredMass * this.temperatureKelvin) /
              (existingMass + transferredMass);
      }
      transferred.forEach((entry) => target.add(entry.molecule, entry.moles, entry.state));
    }

    return amountToTransfer;
  }
}
