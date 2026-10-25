import { FunctionalGroup } from "../functionalGroup.js";

export const ALKYL_HALIDE = new FunctionalGroup("Alkyl halide", [
  "R[Cl]",
  "R[Br]",
  "R[I]",
]);

export const NUCLEOPHILE = new FunctionalGroup("Nucleophile", [
  "[O-]",
  "[OH]",
  "[OH2]",
  "[NH-]",
  "[NH2]",
  "[NH3]",
  "[SH-]",
  "[SH]",
  "N",
  "O",
  "S",
]);

export const BASE = new FunctionalGroup("Base", [
  "[O-]",
  "[OH]",
  "[OH2]",
  "[NH-]",
  "[NH2]",
  "[NH3]",
  "[SH-]",
  "[SH]",
  "N",
  "O",
  "S",
]);

export const CARBOXYLIC_ACID = new FunctionalGroup("Carboxylic acid", "RC(=O)O");
export const CARBONYL = new FunctionalGroup("Carbonyl", "C=O");
export const ACYL_DERIVATIVE = new FunctionalGroup("Acyl chloride or anhydride", [
  "RC(=O)Cl",
  "RC(=O)OC(=O)R",
]);
export const WATER = new FunctionalGroup("Water", "[OH2]");
export const CARBOXYLATE = new FunctionalGroup("Carboxylate", "RC(=O)[O-]");
export const HYDRONIUM = new FunctionalGroup("Hydronium", "[OH3+]");
export const HYDROGEN_HALIDE = new FunctionalGroup("Hydrogen halide", [
  "F",
  "Cl",
  "Br",
  "I",
]);
export const HALIDE_ION = new FunctionalGroup("Halide ion", [
  "[F-]",
  "[Cl-]",
  "[Br-]",
  "[I-]",
]);
