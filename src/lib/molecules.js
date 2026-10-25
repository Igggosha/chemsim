import { Molecule } from "./chemistry.js";

const namedSmiles = Object.freeze({
  "Acetic Acid": "CC(=O)O",
  Acetone: "CC(=O)C",
  Benzene: "c1ccccc1",
  Ethane: "CC",
  Ethanol: "CCO",
});

const moleculesBySmiles = new Map(
  Object.entries(namedSmiles).map(([name, smiles]) => [Molecule.fromSmiles(smiles).canonicalSmiles, name]),
);

export function resolveMoleculeName(canonicalSmiles) {
  return moleculesBySmiles.get(canonicalSmiles) ?? null;
}

export function createMolecule(smiles, name = null) {
  const molecule = Molecule.fromSmiles(smiles);
  molecule.name = resolveMoleculeName(molecule.canonicalSmiles) || name?.trim() || molecule.formula;
  return molecule;
}

export const namedMoleculeSmiles = namedSmiles;

export const benzene = createMolecule(namedSmiles.Benzene);
export const ethanol = createMolecule(namedSmiles.Ethanol);
export const ethane = createMolecule(namedSmiles.Ethane);
export const aceticAcid = createMolecule(namedSmiles["Acetic Acid"]);
export const acetone = createMolecule(namedSmiles.Acetone);