import heatingMantleOffAsset from "../../assets/heating_mantle/heating_mantle_off.png";
import heatingMantleOnAsset from "../../assets/heating_mantle/heating_mantle_on.png";
import heatingMantleLowerAsset from "../../assets/heating_mantle/heating_mantle_lower.png";
import heatingMantleUpperAsset from "../../assets/heating_mantle/heating_mantle_upper.png";
import { VESSEL_SIZE, VESSEL_TYPES } from "./vessels.js";
import { addEquipmentLink } from "./equipmentGroups.js";
import { applyHeatToContainer, LIQUID_SPECIFIC_HEAT_J_PER_G_K } from "./thermalEnergy.js";

export const MANTLE_SIZE = 120;
export const MANTLE_HIT_RADIUS_X = MANTLE_SIZE * 0.55;
export const MANTLE_HIT_RADIUS_Y = MANTLE_SIZE * 0.4;
export const HEATING_MANTLE_ASSETS = Object.freeze({
  heatingMantle: heatingMantleOffAsset,
  heatingMantleOn: heatingMantleOnAsset,
  heatingMantleLower: heatingMantleLowerAsset,
  heatingMantleUpper: heatingMantleUpperAsset,
});
export const HEATING_MANTLE_DEFINITION = Object.freeze({
  label: "Heating mantle",
  asset: heatingMantleOffAsset,
});

export function createHeatingMantle(index, x, y) {
  return {
    id: `heatingMantle-${index}`,
    kind: "heatingMantle",
    label: `${HEATING_MANTLE_DEFINITION.label} ${String(index).padStart(2, "0")}`,
    x,
    y,
    isOn: false,
    targetTemperatureKelvin: 373.15,
    groupId: null,
  };
}

export function isFlask(item) {
  return item && ["volumetric", "roundBottom"].includes(item.kind);
}

export function isMixtureVessel(item) {
  return Boolean(item?.container && VESSEL_TYPES[item.kind]);
}

export function getFlaskMantleAlignment(flask, mantle, canvasHeight) {
  const topAlignmentOffset = VESSEL_SIZE / 2 - MANTLE_SIZE / 2;
  return {
    x: mantle.x,
    y: mantle.y + topAlignmentOffset / canvasHeight,
  };
}

export function connectFlaskToMantle(items, flask, mantle, groupId, canvasHeight) {
  const mergedGroupIds = new Set([mantle.groupId, flask.groupId].filter(Boolean));
  const position = getFlaskMantleAlignment(flask, mantle, canvasHeight);
  return addEquipmentLink(items, flask.id, mantle.id).map((item) => {
    const isEmptyFlask = item.id === flask.id && item.container.contents.length === 0;
    if (isEmptyFlask && mantle.isOn) {
      item.container.temperatureKelvin = mantle.targetTemperatureKelvin;
    }
    if (
      item.id === flask.id ||
      item.id === mantle.id ||
      (item.groupId && mergedGroupIds.has(item.groupId))
    ) {
      return {
        ...item,
        groupId,
        ...(item.id === flask.id ? position : {}),
      };
    }
    return item;
  });
}

export function findMantleForFlask(flask, initialPosition, items, canvasSize) {
  if (!isFlask(flask) || !initialPosition || !canvasSize.height) return null;
  return items.find((item) => {
    const xDistance = Math.abs(item.x - flask.x) * canvasSize.width;
    const yDistance = (flask.y - item.y) * canvasSize.height;
    return (
      item.kind === "heatingMantle" &&
      initialPosition.y < item.y &&
      xDistance <= MANTLE_SIZE * 0.56 &&
      yDistance >= -MANTLE_SIZE * 0.2 &&
      yDistance <= MANTLE_SIZE * 0.85
    );
  }) ?? null;
}

export function heatConnectedFlasks(mantles, items, elapsedSeconds) {
  let changed = false;
  mantles.forEach((mantle) => {
    if (!mantle.isOn || !mantle.groupId) return;
    items
      .filter((item) => item.groupId === mantle.groupId && isFlask(item))
      .forEach((flask) => {
        if (flask.container.contents.length === 0) {
          if (flask.container.temperatureKelvin !== mantle.targetTemperatureKelvin) {
            flask.container.temperatureKelvin = mantle.targetTemperatureKelvin;
            changed = true;
          }
          return;
        }
        const mass = flask.container.totalMass;
        const temperatureGap = mantle.targetTemperatureKelvin - flask.container.temperatureKelvin;
        if (mass <= 0 || temperatureGap <= 0) return;
        const heatingRate = Math.min(30, 125 / mass);
        const temperatureIncrease = Math.min(temperatureGap, heatingRate * elapsedSeconds);
        changed = applyHeatToContainer(
          flask.container,
          mass * LIQUID_SPECIFIC_HEAT_J_PER_G_K * temperatureIncrease,
        ) || changed;
      });
  });
  return changed;
}
