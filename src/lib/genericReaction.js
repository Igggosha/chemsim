import { Molecule } from "./chemistry.js";
import { FunctionalGroup } from "./functionalGroup.js";

export class GenericReaction {
  constructor({
    name,
    functionalGroups,
    ratePowers,
    catalystIndices = [],
    equilibrium = null,
  } = {}) {
    if (new.target === GenericReaction) {
      throw new TypeError("GenericReaction is abstract and cannot be instantiated directly.");
    }
    if (new.target.prototype.RunReaction === GenericReaction.prototype.RunReaction) {
      throw new TypeError(`${new.target.name || "A reaction subclass"} must implement RunReaction().`);
    }
    if (
      !Array.isArray(functionalGroups) ||
      functionalGroups.length === 0 ||
      functionalGroups.some((group) => !(group instanceof FunctionalGroup))
    ) {
      throw new TypeError("A reaction must declare at least one FunctionalGroup reactant.");
    }
    if (
      !Array.isArray(ratePowers) ||
      ratePowers.length !== functionalGroups.length ||
      ratePowers.some((power) => ![0, 1, 2].includes(power))
    ) {
      throw new TypeError("A reaction must declare one rate power (0, 1, or 2) per reactant.");
    }
    if (
      !Array.isArray(catalystIndices) ||
      catalystIndices.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= functionalGroups.length,
      ) ||
      new Set(catalystIndices).size !== catalystIndices.length
    ) {
      throw new TypeError("Catalyst indices must uniquely identify declared reaction reactants.");
    }

    this.name = typeof name === "string" && name.trim() ? name.trim() : new.target.name;
    this.functionalGroups = Object.freeze([...functionalGroups]);
    this.ratePowers = Object.freeze([...ratePowers]);
    this.catalystIndices = Object.freeze([...catalystIndices]);
    this.reactantStoichiometricCoefficients = Object.freeze(
      functionalGroups.map((_, index) => (this.catalystIndices.includes(index) ? 0 : 1)),
    );
    if (equilibrium !== null) {
      const { constant, productCount, reverseRatePowers, productFunctionalGroups } = equilibrium;
      if (
        !Number.isFinite(constant) ||
        constant <= 0 ||
        !Number.isInteger(productCount) ||
        productCount < 1 ||
        !Array.isArray(reverseRatePowers) ||
        reverseRatePowers.length !== productCount ||
        reverseRatePowers.some((power) => ![0, 1, 2].includes(power)) ||
        (productFunctionalGroups !== undefined &&
          (!Array.isArray(productFunctionalGroups) ||
            productFunctionalGroups.length !== productCount ||
            productFunctionalGroups.some((group) => !(group instanceof FunctionalGroup))))
      ) {
        throw new TypeError(
          "Equilibrium reactions require a positive constant, product count, and valid reverse rate powers.",
        );
      }
      this.equilibrium = Object.freeze({
        constant,
        productCount,
        reverseRatePowers: Object.freeze([...reverseRatePowers]),
        productFunctionalGroups: productFunctionalGroups
          ? Object.freeze([...productFunctionalGroups])
          : null,
      });
    } else {
      this.equilibrium = null;
    }
  }

  RunReaction() {
    throw new Error("RunReaction() must be implemented by a GenericReaction subclass.");
  }

  getKineticModifier() {
    return 1;
  }

  canReact(...reactants) {
    return (
      reactants.length === this.functionalGroups.length &&
      reactants.every((molecule, index) =>
        molecule instanceof Molecule && this.functionalGroups[index].matches(molecule),
      )
    );
  }

  getRateFactor(reactantConcentrations, ...reactants) {
    if (
      !Array.isArray(reactantConcentrations) ||
      reactantConcentrations.length !== this.ratePowers.length ||
      reactantConcentrations.some((concentration) => !Number.isFinite(concentration) || concentration < 0)
    ) {
      throw new TypeError("Provide one non-negative concentration for each reactant.");
    }
    const concentrationFactor = this.ratePowers.reduce(
      (factor, power, index) => factor * reactantConcentrations[index] ** power,
      1,
    );
    const kineticModifier = this.getKineticModifier(...reactants);
    if (!Number.isFinite(kineticModifier) || kineticModifier < 0) {
      throw new TypeError("A reaction kinetic modifier must be a non-negative finite number.");
    }
    return concentrationFactor * kineticModifier;
  }

  getNetRate(
    reactantConcentrations,
    productConcentrations,
    forwardRateConstant = 1,
    ...reactants
  ) {
    if (!this.equilibrium) {
      throw new Error(`${this.name} is not configured as an equilibrium reaction.`);
    }
    if (
      !Array.isArray(productConcentrations) ||
      productConcentrations.length !== this.equilibrium.productCount ||
      productConcentrations.some((concentration) => !Number.isFinite(concentration) || concentration < 0)
    ) {
      throw new TypeError("Provide one non-negative concentration for each equilibrium product.");
    }
    if (!Number.isFinite(forwardRateConstant) || forwardRateConstant < 0) {
      throw new TypeError("The forward rate constant must be a non-negative finite number.");
    }

    const reverseFactor = this.equilibrium.reverseRatePowers.reduce(
      (factor, power, index) => factor * productConcentrations[index] ** power,
      1,
    );
    return forwardRateConstant * (
      this.getRateFactor(reactantConcentrations, ...reactants) -
      reverseFactor / this.equilibrium.constant
    );
  }

  runReaction(...reactants) {
    if (reactants.length !== this.functionalGroups.length) {
      throw new TypeError(`This reaction requires ${this.functionalGroups.length} reactant molecule(s).`);
    }
    reactants.forEach((molecule, index) => {
      if (!(molecule instanceof Molecule)) {
        throw new TypeError(`Reactant ${index + 1} must be a Molecule.`);
      }
      if (!this.functionalGroups[index].matches(molecule)) {
        throw new TypeError(
          `Reactant ${index + 1} does not match the ${this.functionalGroups[index].name} functional group.`,
        );
      }
    });

    const products = this.RunReaction(...reactants);
    if (
      !Array.isArray(products) ||
      (this.equilibrium && products.length !== this.equilibrium.productCount) ||
      products.some(
        (product) =>
          !product ||
          !(product.molecule instanceof Molecule) ||
          !Number.isFinite(product.moles) ||
          product.moles <= 0,
      )
    ) {
      throw new TypeError("RunReaction() must return products as { molecule, moles } entries.");
    }
    return products;
  }

  RunReverseReaction() {
    throw new Error(`${this.name} does not implement a reverse reaction.`);
  }

  runReverseReaction(...reactants) {
    if (!this.equilibrium) {
      throw new Error(`${this.name} is not configured as an equilibrium reaction.`);
    }
    if (!this.equilibrium.productFunctionalGroups) {
      throw new Error(`${this.name} does not declare its reverse-reaction functional groups.`);
    }
    if (
      reactants.length !== this.equilibrium.productCount ||
      reactants.some(
        (molecule, index) =>
          !(molecule instanceof Molecule) ||
          !this.equilibrium.productFunctionalGroups[index].matches(molecule),
      )
    ) {
      throw new TypeError(`${this.name} received invalid reactants for its reverse reaction.`);
    }
    const products = this.RunReverseReaction(...reactants);
    if (
      !Array.isArray(products) ||
      products.length !== this.functionalGroups.length ||
      products.some(
        (product) =>
          !product ||
          !(product.molecule instanceof Molecule) ||
          !Number.isFinite(product.moles) ||
          product.moles <= 0,
      )
    ) {
      throw new TypeError("RunReverseReaction() must return valid { molecule, moles } products.");
    }
    return products;
  }
}
