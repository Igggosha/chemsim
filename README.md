# Chem Sim

Chem Sim is an interactive isometric workspace for using lab equipment to simulate organic reactions.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Workspace controls

- Drag a vessel to move it around the canvas.
- Select any piece of equipment and edit its name in the inspector.
- With a linked object selected, use the arrow keys to select the nearest connected object in that direction.
- The workspace canvas uses a repeating paper texture.
- Choose a beaker, volumetric flask, round-bottom flask, heating mantle, ice bath, condenser, or T joint in the equipment selector before adding it.
- Right-click and hold a vessel to tilt it and pour at 0.5 mol/s. Contents transfer into a vessel positioned below the pouring outlet; otherwise they are discarded.
- Drag a volumetric or round-bottom flask down into a heating mantle to align and join it. The mantle inspector sets its 25–450 °C target and switches heating on or off. Empty flasks immediately take on the mantle target temperature.
- Drag a beaker or flask down into an ice bath to align it. The bath cools its contents at 200 W to 0 °C; an empty vessel immediately reaches 0 °C.
- Drag compatible joints together to snap and group their equipment. Each joint can hold only one connection. Volumetric and round-bottom flasks have a female joint at the top; the condenser has a male joint at the bottom and a female joint at the top; the T joint has male joints at the bottom and angled branch. The condenser can attach to either flask or the T-joint branch; the branch sets its rotation to 75° anticlockwise. Connected equipment moves together. Use the condenser inspector to switch its on/off state; this does not change the condenser image.
- Mixture inspectors show the total mass and temperature. Temperatures are stored in kelvin and displayed in Celsius; transferred mixtures reach a mass-weighted temperature.
- The molecule cards show estimated normal boiling points. `src/lib/boilingPoint.js` applies Pailhes' method (F. Pailhes, *Fluid Phase Equilibria* 41 (1988), 97-107) to compounds with low-pressure vapor data and Lydersen critical-property data from the paper, and uses Joback group contributions for other supported organic molecules; estimates are cached by canonical SMILES. `src/lib/vaporizationSystem.js` applies the provided mass-flux equation over the reaction system's 0.2-second tick, assumes a 90 cm² liquid surface and a water-like liquid heat capacity, and removes latent heat from the mixture. Vapor escapes from open equipment; an upright condenser returns liquid at 5 K below its estimated boiling point, while an angled condenser pours to a nearby vessel at room temperature.
- `src/lib/thermalEnergy.js` converts heat to temperature change with `q = m c ΔT` using a water-like specific heat of `4.18 J/(g·K)`. Heating mantles heat connected contents at `min(30, 125 / mass in grams)` °C/s until their target is reached; ice baths remove up to 200 J per second until contents reach 0 °C.
- Add equipment, then Shift-click at least two items and use **Join selected** to group them. Select a directly connected pair and use **Disconnect selected pair** to remove only their connection; other connections in the setup remain intact.
- Select a vessel to inspect its mixture. The starting scene contains 1 mol of liquid benzene.
- Add or remove benzene to see the mixture amount update.

## Chemistry model

Equipment behavior is split into `src/lib/vessels.js`, `src/lib/heatingMantle.js`, `src/lib/condenser.js`, `src/lib/tJoint.js`, `src/lib/equipmentConnections.js`, and `src/lib/equipmentGroups.js`. The equipment modules register joint positions and rotations; the shared connection module snaps compatible male/female joints together, prevents occupied joints from being reused, and records pairwise links so disconnecting a pair preserves the rest of the setup.

The chemistry model lives in `src/lib/chemistry.js`, with shared SMILES parsing in `src/lib/smiles.js`:

- `Element` stores immutable elemental properties; `Elements` provides common element constants.
- `Atom` represents an instance of an element.
- `Molecule` stores an atom/bond graph, its generated canonical SMILES, and a cached molecular mass in g/mol.
- `Molecule.getDensity()` currently returns the placeholder density `1 g/cm³`. `MixtureContainer.liquidVolume` sums the volume of liquid contents in cm³, and `liquidVolumeLiters` provides the corresponding volume for molar concentration calculations.
- `Molecule` can be constructed directly from a SMILES string and derives its molecular formula.
- The named molecule registry in `src/lib/molecules.js` stores names and SMILES strings; matching canonical structures show their registered name, while other molecules default to their formula and can be named on creation.
- `MixtureContainer` stores molecules, molar amounts, phases, temperature in kelvin, and derives its total mass in grams.
- When a disconnected SMILES mixture contains neutral and charged components, or only charged components with a net charge of zero, adding it to a `MixtureContainer` stores each component as its own molecule entry while preserving the amount and phase. This dissociates ionic salts such as `[Na+].[OH-]` into sodium and hydroxide ions.
- `cangen` performs invariant ranking and iterative neighbor refinement, individualizes tied ranks, and serializes the canonical graph as SMILES.
- `Molecule.fromSmiles` uses the shared parser for branches, ring closures, bond orders, aromatic atoms, bracket charges/hydrogens, tetrahedral `@`/`@@` chirality, and alkene E/Z `/` and `\` directional bonds.
- `FunctionalGroup` defines a named SMILES substructure; `R` is a wildcard substituent. `FUNCTIONAL_GROUPS` provides alcohol, carboxylic acid, alkene, alkyne, amine, nitrate, ester, and ether patterns.
- `GenericReaction` is an abstract reaction base. Subclasses declare a functional-group list and a matching `ratePowers` list of 0, 1, or 2, then implement `RunReaction(...molecules)` to return `{ molecule, moles }` products. `runReaction(...molecules)` validates reactants and products, and `getRateFactor(concentrations, ...reactants)` applies the declared concentration powers and optional reaction-specific kinetic modifier. Catalyst reactants can be marked with `catalystIndices`; they participate in matching and rate calculations but are not depleted.
- `src/lib/reactions/` contains carboxylic-acid and hydrogen-halide dissociation, alcohol deprotonation and oxidation, aldehyde oxidation, carboxylic-acid and carbonyl reduction, water autoionization, SN1, SN2, E1, E2, acid-catalyzed nucleophilic addition, and acid-catalyzed nucleophilic addition-elimination reactions. Each reaction is implemented in its own module. Alcohol deprotonation supports hydroxide (`Kc = 0.5`), amide (`Kc = 1e19`), and hydride (`Kc = 1e19`), producing the alkoxide and water, ammonia, or hydrogen gas. Water autoionization follows `2 H2O ⇌ H3O+ + OH-` with `Kc = 3.25e-18`. Neutral oxygen species are not nucleophiles; hydroxide and alkoxide are. Alcohol and aldehyde oxidation use dichromate or permanganate under acidic aqueous conditions, producing Cr3+ or Mn2+ and water. Carboxylic-acid reduction to aldehydes and carbonyl reduction to alcohols use borohydride or aluminium hydride with aqueous work-up; the inorganic products are represented as borate or aluminate, and hydrogen from carboxylic-acid reduction as H2. These redox transformations use stoichiometrically balanced reactant coefficients and simplified qualitative kinetics. The acid-catalyzed reactions require hydronium as a catalyst; addition targets aldehydes and ketones, while addition-elimination targets acyl chlorides and acid anhydrides. Carboxylic-acid dissociation defaults to `Ka = 1.8e-5`; hydrogen-halide dissociation defaults to `Ka = 1e7`. Equilibrium constants can be overridden in their constructors. Equilibrium reactions declare reverse-product rate powers and expose a signed net rate through `getNetRate(reactantConcentrations, productConcentrations, forwardRateConstant)`. SN1/SN2 use substrate substitution degree and relative nucleophile strength; E1/E2 use substrate substitution degree and a separate base-strength modifier. These are qualitative simulation factors, not measured rate constants.
- `src/lib/reactionSystem.js` checks changed mixture containers every 0.2 seconds. It estimates concentrations using each container's liquid volume, calculates the Arrhenius rate constant with `A = 0.102`, `Ea = 50 J/mol`, and `R = 8.31 J/(mol·K)`, and advances reactions by `dt = 0.2 s`. Reactant depletion is capped, catalysts are not consumed, and equilibrium reactions are limited to avoid stepping across equilibrium.
- `createMolecularGeometry` infers implicit hydrogens, VSEPR lone pairs and shapes, then lays out atoms in 3D; ring coordinates preserve constrained cyclic bond angles.
- The inspector's interactive 3D viewer renders atom spheres and bond cylinders, rotates automatically, and supports mouse drag rotation.

The canonicalizer preserves and canonicalizes tetrahedral `@`/`@@` and alkene E/Z stereochemistry. It does not implement other SMILES stereochemistry classes, isotope notation, or full chemical validation. The SMILES parser supports the elements defined in `Elements`.
