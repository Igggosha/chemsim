import tJointAsset from "../../assets/t_joint.png";

export const T_JOINT_WIDTH = 82;
export const T_JOINT_HEIGHT = 123;

export const T_JOINT_ASSETS = Object.freeze({
  tJoint: tJointAsset,
});

export const T_JOINT_DEFINITION = Object.freeze({
  label: "T joint",
  asset: tJointAsset,
});

export const T_JOINT_JOINTS = Object.freeze({
  imageSize: { width: 400, height: 600 },
  renderedSize: { width: T_JOINT_WIDTH, height: T_JOINT_HEIGHT },
  male: [
    { id: "bottom", x: 200, y: 560, rotationDegrees: 90 },
    { id: "branch", x: 311, y: 456, rotationDegrees: 15 },
  ],
});

export function createTJoint(index, x, y) {
  return {
    id: `tJoint-${index}`,
    kind: "tJoint",
    label: `${T_JOINT_DEFINITION.label} ${String(index).padStart(2, "0")}`,
    x,
    y,
    groupId: null,
  };
}

export function isTJoint(item) {
  return item?.kind === "tJoint";
}
