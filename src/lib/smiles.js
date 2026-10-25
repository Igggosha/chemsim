function bondKey(first, second) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function expectedValence(atom) {
  const symbol = atom.element.symbol;
  if (atom.aromatic) return symbol === "C" || symbol === "B" ? 4 : 3;
  if (symbol === "H" || symbol === "F" || symbol === "Cl" || symbol === "Br" || symbol === "I") return 1;
  if (symbol === "O" || symbol === "S") return 2;
  if (symbol === "N") return atom.formalCharge > 0 ? 4 : 3;
  if (symbol === "B") return 3;
  if (symbol === "C" || symbol === "Si") return 4;
  if (symbol === "P") return 3;
  return 0;
}

function implicitHydrogenCount(atom, bonds) {
  const bondValence = bonds.reduce((sum, bond) => sum + bond.order, 0);
  return Math.max(0, Math.round(expectedValence(atom) - bondValence));
}

function markAromaticCarbonRings(atoms, bonds) {
  const adjacency = atoms.map(() => []);
  bonds.forEach((bond, bondIndex) => {
    adjacency[bond.from].push({ atomIndex: bond.to, bondIndex });
    adjacency[bond.to].push({ atomIndex: bond.from, bondIndex });
  });

  const visited = new Set();
  for (let start = 0; start < atoms.length; start += 1) {
    if (visited.has(start)) continue;
    const component = [];
    const pending = [start];
    while (pending.length) {
      const atomIndex = pending.pop();
      if (visited.has(atomIndex)) continue;
      visited.add(atomIndex);
      component.push(atomIndex);
      pending.push(...adjacency[atomIndex].map(({ atomIndex: neighbor }) => neighbor));
    }

    const members = new Set(component);
    const ringBonds = bonds.filter((bond) => members.has(bond.from) && members.has(bond.to));
    if (
      component.length < 6 ||
      component.length % 4 !== 2 ||
      ringBonds.length !== component.length ||
      component.some(
        (atomIndex) =>
          atoms[atomIndex].element.symbol !== "C" ||
          atoms[atomIndex].aromatic ||
          adjacency[atomIndex].length !== 2,
      )
    ) {
      continue;
    }

    const alternating = component.every((atomIndex) => {
      const orders = adjacency[atomIndex].map(({ bondIndex }) => bonds[bondIndex].order);
      return orders.includes(1) && orders.includes(2) && orders[0] !== orders[1];
    });
    if (!alternating) continue;

    component.forEach((atomIndex) => {
      atoms[atomIndex].aromatic = true;
    });
    ringBonds.forEach((bond) => {
      bond.aromatic = true;
      bond.order = 1.5;
    });
  }
}

export function parseSmiles(smiles, { Atom, Elements, allowR = false } = {}) {
  if (typeof smiles !== "string" || !smiles.trim()) {
    throw new Error("Enter a SMILES string.");
  }
  if (typeof Atom !== "function" || !Elements || !Elements.C) {
    throw new TypeError("SMILES parsing requires Atom and Elements definitions.");
  }

  const atoms = [];
  const bonds = [];
  const branches = [];
  const rings = new Map();
  const elementBySymbol = new Map(Object.values(Elements).map((element) => [element.symbol, element]));
  const explicitHydrogensByAtom = new Map();
  const bracketAtoms = new Set();
  const stereoNeighborOrders = [];
  let current = null;
  let pendingBond = null;
  let previousWasBond = false;

  const connect = (from, to, bond, { recordFrom = true, recordTo = true } = {}) => {
    if (from === to || bonds.some((entry) => bondKey(entry.from, entry.to) === bondKey(from, to))) {
      throw new Error("SMILES contains a duplicate or invalid bond.");
    }
    const aromatic = bond?.aromatic ?? (atoms[from].aromatic && atoms[to].aromatic);
    bonds.push({
      from,
      to,
      order: bond?.order ?? (aromatic ? 1.5 : 1),
      aromatic,
      ...(bond?.direction === undefined ? {} : { direction: bond.direction }),
    });
    if (recordFrom && atoms[from].chirality) stereoNeighborOrders[from].push(to);
    if (recordTo && atoms[to].chirality) stereoNeighborOrders[to].push(from);
  };

  for (let index = 0; index < smiles.length; index += 1) {
    const character = smiles[index];
    if (/\s/.test(character)) continue;

    if (character === "(") {
      if (current === null) throw new Error("A SMILES branch must follow an atom.");
      branches.push(current);
      continue;
    }
    if (character === ")") {
      if (!branches.length) throw new Error("SMILES has an unmatched closing branch.");
      current = branches.pop();
      continue;
    }
    if (character === ".") {
      current = null;
      pendingBond = null;
      continue;
    }
    if (character === "-" || character === "=" || character === "#" || character === ":") {
      if (current === null || pendingBond) throw new Error("SMILES has a misplaced bond marker.");
      pendingBond = {
        order: character === "=" ? 2 : character === "#" ? 3 : character === ":" ? 1.5 : 1,
        aromatic: character === ":",
      };
      previousWasBond = true;
      continue;
    }
    if (character === "/" || character === "\\") {
      if (current === null || pendingBond) throw new Error("SMILES has a misplaced bond marker.");
      pendingBond = { order: 1, aromatic: false, direction: character === "/" ? 1 : -1 };
      previousWasBond = true;
      continue;
    }
    if (/\d/.test(character) || character === "%") {
      if (current === null) throw new Error("A ring closure must follow an atom.");
      let label = character;
      if (character === "%") {
        const digits = smiles.slice(index + 1, index + 3);
        if (!/^\d{2}$/.test(digits)) throw new Error("A percent ring closure requires two digits.");
        label += digits;
        index += 2;
      }
      if (rings.has(label)) {
        const opening = rings.get(label);
        const openingOrder = stereoNeighborOrders[opening.atomIndex];
        const placeholderIndex = openingOrder?.indexOf(opening.placeholder) ?? -1;
        if (placeholderIndex !== -1) openingOrder[placeholderIndex] = current;
        const openingDirection = opening.bond?.direction;
        const closingDirection = pendingBond?.direction === undefined ? undefined : -pendingBond.direction;
        if (
          openingDirection !== undefined &&
          closingDirection !== undefined &&
          openingDirection !== closingDirection
        ) {
          throw new Error("SMILES has conflicting directional markers on a ring bond.");
        }
        const closureBond = pendingBond ?? opening.bond;
        connect(
          opening.atomIndex,
          current,
          { ...closureBond, direction: openingDirection ?? closingDirection },
          { recordFrom: false },
        );
        rings.delete(label);
      } else {
        const placeholder = {};
        if (atoms[current].chirality) stereoNeighborOrders[current].push(placeholder);
        rings.set(label, { atomIndex: current, bond: pendingBond, placeholder });
      }
      pendingBond = null;
      previousWasBond = false;
      continue;
    }

    let symbol;
    let aromatic = false;
    let formalCharge = 0;
    let atomHydrogens = null;
    let chirality = null;
    let isWildcard = false;
    if (character === "[") {
      const close = smiles.indexOf("]", index + 1);
      if (close === -1) throw new Error("SMILES has an unclosed bracket atom.");
      const bracket = smiles.slice(index + 1, close);
      if (bracket === "R" && allowR) {
        symbol = "C";
        isWildcard = true;
        bracketAtoms.add(atoms.length);
      } else {
        const match = /^([A-Z][a-z]?|[bcnops])(@@?)?(?:H(\d*))?([+-]\d*|[+-])?$/.exec(bracket);
        if (!match) throw new Error(`Unsupported bracket atom: [${bracket}]`);
        symbol = match[1][0].toUpperCase() + match[1].slice(1);
        aromatic = match[1] === match[1].toLowerCase();
        chirality = match[2] ?? null;
        atomHydrogens = match[3] === undefined ? null : Number(match[3] || 1);
        if (match[4]) formalCharge = match[4][0] === "+" ? 1 : -1;
        if (match[4]?.length > 1) formalCharge *= Number(match[4].slice(1));
        bracketAtoms.add(atoms.length);
      }
      index = close;
    } else if (character === "R" && allowR) {
      symbol = "C";
      isWildcard = true;
    } else {
      const twoCharacter = smiles.slice(index, index + 2);
      if (elementBySymbol.has(twoCharacter)) {
        symbol = twoCharacter;
        index += 1;
      } else if (elementBySymbol.has(character.toUpperCase())) {
        symbol = character.toUpperCase();
        aromatic = character === character.toLowerCase();
      } else {
        throw new Error(`Unsupported SMILES character: ${character}`);
      }
    }

    const element = elementBySymbol.get(symbol);
    if (!element) throw new Error(`Element ${symbol} is not defined.`);
    const atomIndex = atoms.length;
    atoms.push(
      new Atom(element, {
        id: `atom-${atomIndex + 1}`,
        formalCharge,
        aromatic,
        chirality,
        isWildcard,
      }),
    );
    stereoNeighborOrders.push([]);
    if (atomHydrogens !== null) explicitHydrogensByAtom.set(atomIndex, atomHydrogens);
    if (current !== null) connect(current, atomIndex, pendingBond);
    current = atomIndex;
    pendingBond = null;
    previousWasBond = false;
  }

  if (previousWasBond || pendingBond) throw new Error("SMILES must not end with a bond marker.");
  if (branches.length) throw new Error("SMILES has an unclosed branch.");
  if (rings.size) throw new Error(`SMILES has unclosed ring label(s): ${[...rings.keys()].join(", ")}`);
  if (!atoms.length) throw new Error("SMILES did not contain any atoms.");

  atoms.forEach((atom, atomIndex) => {
    const adjacentBonds = bonds.filter((bond) => bond.from === atomIndex || bond.to === atomIndex);
    atom.implicitHydrogens = atom.isWildcard
      ? 0
      : explicitHydrogensByAtom.get(atomIndex) ??
        (bracketAtoms.has(atomIndex) ? 0 : implicitHydrogenCount(atom, adjacentBonds));
    if (atom.chirality) {
      const neighbors = [
        ...(atom.implicitHydrogens ? ["H"] : []),
        ...stereoNeighborOrders[atomIndex],
      ];
      if (neighbors.length !== 4 || new Set(neighbors).size !== 4) {
        throw new Error(
          "Tetrahedral @/@@ stereochemistry requires exactly four distinct neighbors " +
            `(found ${neighbors.length}).`,
        );
      }
      atom.stereoNeighbors = neighbors;
    }
  });

  const directionalBonds = bonds.filter((bond) => bond.direction !== undefined);
  const associatedDirectionalBonds = new Set();
  bonds
    .filter((bond) => bond.order === 2)
    .forEach((doubleBond) => {
      const directionalNeighbors = (atomIndex) =>
        bonds
          .filter(
            (bond) =>
              bond !== doubleBond &&
              bond.direction !== undefined &&
              bond.order === 1 &&
              (bond.from === atomIndex || bond.to === atomIndex),
          )
          .map((bond) => ({
            bond,
            atomIndex: bond.from === atomIndex ? bond.to : bond.from,
            outwardDirection: bond.direction * (bond.from === atomIndex ? 1 : -1),
          }));
      const fromNeighbors = directionalNeighbors(doubleBond.from);
      const toNeighbors = directionalNeighbors(doubleBond.to);

      if (!fromNeighbors.length && !toNeighbors.length) return;
      if (!fromNeighbors.length || !toNeighbors.length) {
        throw new Error("E-Z stereochemistry requires a directional bond at both ends of a double bond.");
      }

      fromNeighbors.forEach(({ bond }) => associatedDirectionalBonds.add(bond));
      toNeighbors.forEach(({ bond }) => associatedDirectionalBonds.add(bond));
      const fromReference = fromNeighbors[0];
      const toReference = toNeighbors[0];
      doubleBond.stereo =
        fromReference.outwardDirection === toReference.outwardDirection ? "Z" : "E";
      doubleBond.stereoRefs = [fromReference.atomIndex, toReference.atomIndex];
    });

  if (directionalBonds.some((bond) => !associatedDirectionalBonds.has(bond))) {
    throw new Error("A directional SMILES bond must be adjacent to a double bond.");
  }

  markAromaticCarbonRings(atoms, bonds);
  return { atoms, bonds };
}
