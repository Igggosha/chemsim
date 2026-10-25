import iceBathLowerAsset from "../../assets/ice_bath/ice_bath_lower.png";
import iceBathUpperAsset from "../../assets/ice_bath/ice_bath_upper.png";
import { addEquipmentLink } from "./equipmentGroups.js";
import {
  VESSEL_SIZE,
  VESSEL_TYPES,
} from "./vessels.js";
import {
  applyHeatToContainer,
  LIQUID_SPECIFIC_HEAT_J_PER_G_K,
} from "./thermalEnergy.js";

export const ICE_BATH_SIZE = 120;
export const ICE_BATH_HIT_RADIUS_X = ICE_BATH_SIZE * 0.55;
export const ICE_BATH_HIT_RADIUS_Y = ICE_BATH_SIZE * 0.4;
export const ICE_BATH_TARGET_TEMPERATURE_K = 273.15;
export const ICE_BATH_COOLING_POWER_WATTS = 200;
export const ICE_BATH_ASSETS = Object.freeze({
  iceBathLower: iceBathLowerAsset,
  iceBathUpper: iceBathUpperAsset,
});
export const ICE_BATH_DEFINITION = Object.freeze({
  label: "Ice bath",
});

export function createIceBath(index, x, y) {
  return {
    id: `iceBath-${index}`,
    kind: "iceBath",
    label: `${ICE_BATH_DEFINITION.label} ${String(index).padStart(2, "0")}`,
    x,
    y,
    groupId: null,
  };
}

export function getIceBathAlignment(vessel, bath, canvasHeight) {
  const topAlignmentOffset = VESSEL_SIZE / 2 - ICE_BATH_SIZE / 2;
  return {
    x: bath.x,
    y: bath.y + topAlignmentOffset / canvasHeight,
  };
}

export function connectVesselToIceBath(items, vessel, bath, groupId, canvasHeight) {
  const mergedGroupIds = new Set([bath.groupId, vessel.groupId].filter(Boolean));
  const position = getIceBathAlignment(vessel, bath, canvasHeight);
  return addEquipmentLink(items, vessel.id, bath.id).map((item) => {
    const isEmptyVessel = item.id === vessel.id && item.container.contents.length === 0;
    if (isEmptyVessel) {
      item.container.temperatureKelvin = ICE_BATH_TARGET_TEMPERATURE_K;
    }
    if (
      item.id === vessel.id ||
      item.id === bath.id ||
      (item.groupId && mergedGroupIds.has(item.groupId))
    ) {
      return {
        ...item,
        groupId,
        ...(item.id === vessel.id ? position : {}),
      };
    }
    return item;
  });
}

export function findIceBathForVessel(vessel, initialPosition, items, canvasSize) {
  if (
    !vessel?.container ||
    !VESSEL_TYPES[vessel.kind] ||
    !initialPosition ||
    !canvasSize.width ||
    !canvasSize.height
  ) {
    return null;
  }
  return items.find((item) => {
    if (item.kind !== "iceBath") return false;
    const xDistance = Math.abs(item.x - vessel.x) * canvasSize.width;
    const yDistance = (vessel.y - item.y) * canvasSize.height;
    return (
      xDistance <= ICE_BATH_SIZE * 0.85 &&
      yDistance >= -ICE_BATH_SIZE * 0.65 &&
      yDistance <= ICE_BATH_SIZE * 1.15
    );
  }) ?? null;
}

export function coolVesselsInIceBaths(baths, items, elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new TypeError("The ice bath time step must be a non-negative number.");
  }

  let changed = false;
  baths.forEach((bath) => {
    const connectedVesselIds = new Set(
      (bath.connections ?? []).map((connection) => connection.peerId),
    );
    if (connectedVesselIds.size === 0) return;
    items
      .filter(
        (item) =>
          connectedVesselIds.has(item.id) &&
          item.container &&
          VESSEL_TYPES[item.kind],
      )
      .forEach((vessel) => {
        const container = vessel.container;
        if (container.contents.length === 0) {
          if (container.temperatureKelvin !== ICE_BATH_TARGET_TEMPERATURE_K) {
            container.temperatureKelvin = ICE_BATH_TARGET_TEMPERATURE_K;
            changed = true;
          }
          return;
        }

        const temperatureDifference =
          container.temperatureKelvin - ICE_BATH_TARGET_TEMPERATURE_K;
        if (temperatureDifference <= 0) return;

        const heatToRemove = Math.min(
          ICE_BATH_COOLING_POWER_WATTS * elapsedSeconds,
          container.totalMass *
            LIQUID_SPECIFIC_HEAT_J_PER_G_K *
            temperatureDifference,
        );
        changed = applyHeatToContainer(container, -heatToRemove) || changed;
      });
  });
  return changed;
}
