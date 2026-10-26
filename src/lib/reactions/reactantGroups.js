import { FunctionalGroup } from "../functionalGroup.js";

export const ALKYL_HALIDE = new FunctionalGroup("Alkyl halide", [
  "R[Cl]",
  "R[Br]",
  "R[I]",
]);

export const NUCLEOPHILE = new FunctionalGroup("Nucleophile", [
  "[O-]",
  "[OH-]",
  "[NH-]",
  "[NH2]",
  "[NH3]",
  "[SH-]",
  "[SH]",
  "N",
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
export const ALCOHOL = new FunctionalGroup("Alcohol", "C[OH]");
export const ALKOXIDE = new FunctionalGroup("Alkoxide", "C[O-]");
export const CARBONYL = new FunctionalGroup("Carbonyl", "C=O");
export const ACYL_DERIVATIVE = new FunctionalGroup("Acyl chloride or anhydride", [
  "RC(=O)Cl",
  "RC(=O)OC(=O)R",
]);
export const WATER = new FunctionalGroup("Water", "[OH2]");
export const CARBOXYLATE = new FunctionalGroup("Carboxylate", "RC(=O)[O-]");
export const HYDRONIUM = new FunctionalGroup("Hydronium", "[OH3+]");
export const HYDROXIDE = new FunctionalGroup("Hydroxide", "[OH-]");
export const AMIDE_ION = new FunctionalGroup("Amide ion", "[NH2-]");
export const HYDRIDE_ION = new FunctionalGroup("Hydride ion", "[H-]");
export const AMMONIA = new FunctionalGroup("Ammonia", "[NH3]");
export const HYDROGEN_GAS = new FunctionalGroup("Hydrogen gas", "[H][H]");
export const PROTON = new FunctionalGroup("Proton", "[H+]");
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
