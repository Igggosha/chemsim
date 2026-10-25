import beakerAsset from "../../assets/beaker.png";
import pouringAsset from "../../assets/pouring.png";
import roundBottomFlaskAsset from "../../assets/round_bottom_flask.png";
import volumetricFlaskAsset from "../../assets/volumetric_flask.png";
import { MixtureContainer } from "./chemistry.js";
import { benzene } from "./molecules.js";

export const VESSEL_SIZE = 82;
export const VESSEL_HIT_RADIUS_X = 54;
export const VESSEL_HIT_RADIUS_Y = 48;
export const POUR_RATE = 0.5;
export const POUR_ANGLE = -Math.PI / 4;
export const AMBIENT_TEMPERATURE_K = 298.15;

export const VESSEL_TYPES = Object.freeze({
  beaker: { label: "Beaker", asset: beakerAsset, neckY: -0.225 },
  volumetric: { label: "Volumetric flask", asset: volumetricFlaskAsset, neckY: -0.455 },
  roundBottom: { label: "Round-bottom flask", asset: roundBottomFlaskAsset, neckY: -0.455 },
});

export const VESSEL_JOINTS = Object.freeze({
  volumetric: {
    imageSize: { width: 400, height: 400 },
    renderedSize: { width: VESSEL_SIZE, height: VESSEL_SIZE },
    female: [{ id: "top", x: 200, y: 24, rotationDegrees: -90 }],
  },
  roundBottom: {
    imageSize: { width: 400, height: 400 },
    renderedSize: { width: VESSEL_SIZE, height: VESSEL_SIZE },
    female: [{ id: "top", x: 200, y: 24, rotationDegrees: -90 }],
  },
});

export const VESSEL_IMAGE_ASSETS = Object.freeze({
  ...Object.fromEntries(Object.entries(VESSEL_TYPES).map(([kind, vessel]) => [kind, vessel.asset])),
  pouring: pouringAsset,
});

export function createInitialVessels() {
  const container = new MixtureContainer();
  container.add(benzene, 1, "liquid");
  return [{
    id: "beaker-1",
    kind: "beaker",
    label: "Beaker 01",
    x: 0.5,
    y: 0.49,
    container,
    groupId: null,
  }];
}

export function createVessel(kind, index, x, y) {
  if (!VESSEL_TYPES[kind]) throw new Error(`Unsupported vessel type: ${kind}`);
  return {
    id: `${kind}-${index}`,
    kind,
    label: `${VESSEL_TYPES[kind].label} ${String(index).padStart(2, "0")}`,
    x,
    y,
    container: new MixtureContainer([], AMBIENT_TEMPERATURE_K),
    groupId: null,
  };
}

export function getPourPoint(vessel, canvasSize) {
  const centerX = vessel.x * canvasSize.width;
  const centerY = vessel.y * canvasSize.height;
  const neckOffsetY = VESSEL_SIZE * VESSEL_TYPES[vessel.kind].neckY;
  return {
    x: centerX - neckOffsetY * Math.sin(POUR_ANGLE),
    y: centerY + neckOffsetY * Math.cos(POUR_ANGLE),
  };
}

export function findPourTarget(source, items, canvasSize) {
  const pourPoint = getPourPoint(source, canvasSize);
  const sourceY = source.y * canvasSize.height;
  return findPourTargetAtPoint(
    source.id,
    pourPoint,
    items,
    canvasSize,
    sourceY,
    sourceY + VESSEL_SIZE * 1.8,
  );
}

export function findPourTargetAtPoint(
  sourceId,
  pourPoint,
  items,
  canvasSize,
  minimumY,
  maximumY,
) {
  return items
    .filter((item) => item.id !== sourceId && item.container)
    .filter((item) => {
      const x = item.x * canvasSize.width;
      const y = item.y * canvasSize.height;
      return (
        Math.abs(x - pourPoint.x) <= VESSEL_HIT_RADIUS_X &&
        y > Math.max(pourPoint.y, minimumY) &&
        y <= maximumY
      );
    })
    .sort((first, second) => first.y - second.y)[0] ?? null;
}
