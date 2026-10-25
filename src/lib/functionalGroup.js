import { Atom, Elements } from "./chemistry.js";
import { parseSmiles } from "./smiles.js";

function createAdjacency(atomCount, bonds) {
  const adjacency = Array.from({ length: atomCount }, () => []);
  bonds.forEach((bond) => {
    adjacency[bond.from].push({ atomIndex: bond.to, bond });
    adjacency[bond.to].push({ atomIndex: bond.from, bond });
  });
  return adjacency;
}

function atomMatches(patternAtom, moleculeAtom) {
  if (patternAtom.isWildcard) return moleculeAtom.element.symbol !== "H";
  if (patternAtom.element.symbol !== moleculeAtom.element.symbol) return false;
  if (patternAtom.aromatic && !moleculeAtom.aromatic) return false;
  if (patternAtom.formalCharge !== 0 && patternAtom.formalCharge !== moleculeAtom.formalCharge) {
    return false;
  }
  return (
    patternAtom.element.symbol !== "O" ||
    patternAtom.implicitHydrogens === moleculeAtom.implicitHydrogens
  );
}

function bondMatches(patternBond, moleculeBond, molecule) {
  const chargeSeparatedNitroBond =
    patternBond.order === 2 &&
    moleculeBond.order === 1 &&
    [molecule.atoms[moleculeBond.from], molecule.atoms[moleculeBond.to]].some(
      (atom) => atom.element.symbol === "N" && atom.formalCharge === 1,
    ) &&
    [molecule.atoms[moleculeBond.from], molecule.atoms[moleculeBond.to]].some(
      (atom) => atom.element.symbol === "O" && atom.formalCharge === -1,
    );
  return (
    (patternBond.order === moleculeBond.order || chargeSeparatedNitroBond) &&
    (!patternBond.aromatic || moleculeBond.aromatic)
  );
}

export class FunctionalGroup {
  constructor(name, smiles) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("A functional group requires a name.");
    }
    const patterns = Array.isArray(smiles) ? smiles : [smiles];
    if (!patterns.length || patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())) {
      throw new TypeError("A functional group requires a SMILES pattern.");
    }

    const parsedPatterns = patterns.map((pattern) =>
      parseSmiles(pattern, { Atom, Elements, allowR: true }),
    );
    parsedPatterns.forEach((pattern) => {
      pattern.atoms.forEach((atom) => {
        Object.freeze(atom.stereoNeighbors);
        Object.freeze(atom);
      });
      pattern.bonds.forEach(Object.freeze);
    });
    this.name = name.trim();
    this.smiles = patterns.map((pattern) => pattern.trim()).join("|");
    this.patterns = Object.freeze(parsedPatterns.map((pattern) => ({
      atoms: Object.freeze(pattern.atoms),
      bonds: Object.freeze(pattern.bonds),
      adjacency: Object.freeze(
        createAdjacency(pattern.atoms.length, pattern.bonds).map((neighbors) => Object.freeze(neighbors)),
      ),
    })));
    this.atoms = this.patterns[0].atoms;
    this.bonds = this.patterns[0].bonds;
    this.adjacency = this.patterns[0].adjacency;
    Object.freeze(this);
  }

  matches(molecule) {
    if (!molecule || !Array.isArray(molecule.atoms) || !Array.isArray(molecule.bonds)) {
      return false;
    }

    const moleculeAdjacency = createAdjacency(molecule.atoms.length, molecule.bonds);
    return this.patterns.some((pattern) => this.matchesPattern(molecule, moleculeAdjacency, pattern));
  }

  matchesPattern(molecule, moleculeAdjacency, pattern) {
    const patternOrder = pattern.atoms
      .map((atom, index) => index)
      .sort(
        (first, second) =>
          pattern.adjacency[second].length - pattern.adjacency[first].length ||
          Number(pattern.atoms[second].isWildcard) - Number(pattern.atoms[first].isWildcard),
      );
    const mapping = new Map();
    const usedMoleculeAtoms = new Set();

    function matchAt(orderIndex) {
      if (orderIndex === patternOrder.length) return true;
      const patternIndex = patternOrder[orderIndex];
      const patternAtom = pattern.atoms[patternIndex];

      for (let moleculeIndex = 0; moleculeIndex < molecule.atoms.length; moleculeIndex += 1) {
        if (
          usedMoleculeAtoms.has(moleculeIndex) ||
          !atomMatches(patternAtom, molecule.atoms[moleculeIndex]) ||
          moleculeAdjacency[moleculeIndex].length < pattern.adjacency[patternIndex].length
        ) {
          continue;
        }

        const compatible = pattern.adjacency[patternIndex].every(({ atomIndex, bond }) => {
          const mappedNeighbor = mapping.get(atomIndex);
          if (mappedNeighbor === undefined) return true;
          return moleculeAdjacency[moleculeIndex].some(
            (neighbor) =>
              neighbor.atomIndex === mappedNeighbor &&
              bondMatches(bond, neighbor.bond, molecule),
          );
        });
        if (!compatible) continue;

        mapping.set(patternIndex, moleculeIndex);
        usedMoleculeAtoms.add(moleculeIndex);
        if (matchAt.call(this, orderIndex + 1)) return true;
        mapping.delete(patternIndex);
        usedMoleculeAtoms.delete(moleculeIndex);
      }
      return false;
    }

    return matchAt.call(this, 0);
  }
}

export const FUNCTIONAL_GROUPS = Object.freeze([
  new FunctionalGroup("Alcohol", "RO"),
  new FunctionalGroup("Carboxylic acid", "RC(=O)O"),
  new FunctionalGroup("Alkene", "C=C"),
  new FunctionalGroup("Alkyne", "C#C"),
  new FunctionalGroup("Amine", "N"),
  new FunctionalGroup("Nitrate", "RON(=O)=O"),
  new FunctionalGroup("Ester", "RC(=O)OR"),
  new FunctionalGroup("Ether", "ROR"),
]);
