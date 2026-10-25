import condenserAsset from "../../assets/condenser.png";

export const CONDENSER_WIDTH = 82;
export const CONDENSER_HEIGHT = 164;

export const CONDENSER_ASSETS = Object.freeze({
  condenser: condenserAsset,
});

export const CONDENSER_DEFINITION = Object.freeze({
  label: "Condenser",
  asset: condenserAsset,
});

export const CONDENSER_JOINTS = Object.freeze({
  imageSize: { width: 400, height: 800 },
  renderedSize: { width: CONDENSER_WIDTH, height: CONDENSER_HEIGHT },
  male: [{ id: "bottom", x: 200, y: 770, rotationDegrees: 90 }],
  female: [{ id: "top", x: 200, y: 16, rotationDegrees: -90 }],
});

export function createCondenser(index, x, y) {
  return {
    id: `condenser-${index}`,
    kind: "condenser",
    label: `${CONDENSER_DEFINITION.label} ${String(index).padStart(2, "0")}`,
    x,
    y,
    isOn: false,
    groupId: null,
  };
}

export function isCondenser(item) {
  return item?.kind === "condenser";
}
