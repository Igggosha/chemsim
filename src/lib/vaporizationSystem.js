import { getEquipmentJointPosition } from "./equipmentConnections.js";
import { getNormalBoilingPoint } from "./boilingPoint.js";
import { findPourTargetAtPoint, VESSEL_SIZE, AMBIENT_TEMPERATURE_K } from "./vessels.js";
import { REACTION_DT_SECONDS } from "./reactionSystem.js";
import { applyHeatToContainer } from "./thermalEnergy.js";

export { LIQUID_SPECIFIC_HEAT_J_PER_G_K } from "./thermalEnergy.js";

export const VAPORIZATION_DT_SECONDS = REACTION_DT_SECONDS;
export const VAPORIZATION_AREA_M2 = 0.009 * 1000;
export const VAPORIZATION_ENVIRONMENTAL_CONSTANT = 1.1e-4;
export const LATENT_HEAT_FACTOR_J_PER_MOL_K = 88;
export const SUB_BOILING_EVAPORATION_FACTOR = 0.01;
export const ABOVE_BOILING_EVAPORATION_FACTOR = 20;
const UPRIGHT_CONDENSER_TOLERANCE_DEGREES = 10;

function normalizeDegrees(degrees) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function calculateEvaporationMassFlux(
  molecularMassGramsPerMol,
  temperatureKelvin,
  boilingPointKelvin,
) {
  if (
    !Number.isFinite(molecularMassGramsPerMol) || molecularMassGramsPerMol <= 0 ||
    !Number.isFinite(temperatureKelvin) || temperatureKelvin < 0 ||
    !Number.isFinite(boilingPointKelvin) || boilingPointKelvin <= 0
  ) {
    throw new TypeError("Evaporation requires positive molecular mass and boiling point values.");
  }
  if (temperatureKelvin === 0) return 0;

  const exponent = 10.58 * (1 - boilingPointKelvin / temperatureKelvin);
  const subBoilingFactor = temperatureKelvin < boilingPointKelvin
    ? SUB_BOILING_EVAPORATION_FACTOR
    : ABOVE_BOILING_EVAPORATION_FACTOR;
  return (
    VAPORIZATION_ENVIRONMENTAL_CONSTANT *
    molecularMassGramsPerMol ** (2 / 3) /
    temperatureKelvin *
    Math.exp(Math.min(exponent, 700)) *
    subBoilingFactor
  );
}

function findCondenserAlongVaporPath(source, items) {
  let connection = (source.connections ?? []).find(
    (candidate) => candidate.jointId === "top",
  );
  const visited = new Set([source.id]);

  while (connection) {
    const nextItem = items.find((item) => item.id === connection.peerId);
    if (!nextItem || visited.has(nextItem.id)) return null;
    if (nextItem.kind === "condenser") return nextItem;
    if (nextItem.kind !== "tJoint") return null;

    visited.add(nextItem.id);
    const incomingJointId = connection.peerJointId;
    connection = (nextItem.connections ?? []).find(
      (candidate) =>
        candidate.jointId !== incomingJointId &&
        !visited.has(candidate.peerId),
    );
  }

  return null;
}

function getCondensateTarget(source, condenser, items, canvasSize) {
  const angle = normalizeDegrees(condenser.rotationDegrees ?? 0);
  if (Math.abs(angle) <= UPRIGHT_CONDENSER_TOLERANCE_DEGREES) {
    return {
      item: source,
      temperatureKelvin: null,
    };
  }

  const outlet = getEquipmentJointPosition(condenser, "male", "bottom", canvasSize);
  if (!outlet) return null;
  const sourceY = source.y * canvasSize.height;
  const target = findPourTargetAtPoint(
    source.id,
    outlet,
    items,
    canvasSize,
    outlet.y,
    Math.max(outlet.y, sourceY) + VESSEL_SIZE * 1.8,
  );
  return target
    ? { item: target, temperatureKelvin: AMBIENT_TEMPERATURE_K }
    : null;
}

function addCondensate(container, molecule, moles, temperatureKelvin) {
  const incomingMass = moles * molecule.molecularMass;
  const existingMass = container.totalMass;
  if (incomingMass <= 0) return false;

  container.temperatureKelvin =
    existingMass === 0
      ? temperatureKelvin
      : (
          existingMass * container.temperatureKelvin +
          incomingMass * temperatureKelvin
        ) / (existingMass + incomingMass);
  container.add(molecule, moles, "liquid");
  return true;
}

export function vaporizeContainer(
  container,
  source,
  items,
  canvasSize,
  elapsedSeconds,
  processedContainers = new Set(),
) {
  if (!container?.contents || !source || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    throw new TypeError("Vaporization requires a mixture, its equipment, and a positive time step.");
  }
  if (
    processedContainers.has(container) ||
    !canvasSize?.width ||
    !canvasSize?.height
  ) {
    return false;
  }

  const temperatureKelvin = container.temperatureKelvin;
  const evaporationPlans = container.contents
    .filter((entry) => entry.state === "liquid" && entry.moles > 0)
    .flatMap((entry) => {
      const boilingPoint = getNormalBoilingPoint(entry.molecule);
      if (!boilingPoint) return [];
      const flux = calculateEvaporationMassFlux(
        entry.molecule.molecularMass,
        temperatureKelvin,
        boilingPoint.temperatureKelvin,
      );
      const massKg = flux * VAPORIZATION_AREA_M2 * elapsedSeconds;
      const moles = Math.min(
        entry.moles,
        (massKg * 1000) / entry.molecule.molecularMass,
      );
      return moles > 0
        ? [{ entry, moles, boilingPointKelvin: boilingPoint.temperatureKelvin }]
        : [];
    });
  if (!evaporationPlans.length) return false;

  let latentHeatJoules = 0;
  evaporationPlans.forEach(({ entry, moles, boilingPointKelvin }) => {
    container.remove(entry.molecule.canonicalSmiles, moles, "liquid");
    latentHeatJoules += moles * LATENT_HEAT_FACTOR_J_PER_MOL_K * boilingPointKelvin;
  });

  const remainingMassGrams = container.totalMass;
  if (remainingMassGrams > 0) {
    applyHeatToContainer(container, -latentHeatJoules);
  }

  const condenser = findCondenserAlongVaporPath(source, items);
  if (condenser) {
    const target = getCondensateTarget(source, condenser, items, canvasSize);
    if (target) {
      evaporationPlans.forEach(({ entry, moles, boilingPointKelvin }) => {
        addCondensate(
          target.item.container,
          entry.molecule,
          moles,
          target.temperatureKelvin ?? Math.max(0, boilingPointKelvin - 5),
        );
      });
      if (target.item.container !== container) {
        processedContainers.add(target.item.container);
      }
    }
  }

  return true;
}

export function createVaporizationSystem({
  getItems,
  getCanvasSize,
  onContentsChanged = () => {},
} = {}) {
  if (typeof getItems !== "function" || typeof getCanvasSize !== "function") {
    throw new TypeError("The vaporization system requires item and canvas-size callbacks.");
  }
  if (typeof onContentsChanged !== "function") {
    throw new TypeError("The vaporization content-change callback must be a function.");
  }

  function tick(elapsedSeconds = VAPORIZATION_DT_SECONDS) {
    const items = getItems();
    const canvasSize = getCanvasSize();
    let changed = false;
    const processedContainers = new Set();
    items.forEach((item) => {
      if (!item.container) return;
      if (
        vaporizeContainer(
          item.container,
          item,
          items,
          canvasSize,
          elapsedSeconds,
          processedContainers,
        )
      ) {
        changed = true;
        processedContainers.add(item.container);
      }
    });
    if (changed) onContentsChanged(items);
    return changed;
  }

  return Object.freeze({ tick });
}
