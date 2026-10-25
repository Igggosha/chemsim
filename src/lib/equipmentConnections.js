import { CONDENSER_JOINTS } from "./condenser.js";
import { T_JOINT_JOINTS } from "./tJoint.js";
import { VESSEL_JOINTS } from "./vessels.js";

export const EQUIPMENT_CONNECTIONS = Object.freeze({
  ...VESSEL_JOINTS,
  condenser: CONDENSER_JOINTS,
  tJoint: T_JOINT_JOINTS,
});

export const CONNECTION_SNAP_RADIUS = 76;

export function getEquipmentDimensions(kind) {
  return EQUIPMENT_CONNECTIONS[kind]?.renderedSize ?? null;
}

export function getEquipmentHitBounds(kind, rotationDegrees = 0) {
  const dimensions = getEquipmentDimensions(kind);
  if (!dimensions) return null;
  const angle = degreesToRadians(rotationDegrees);
  return {
    width: Math.abs(dimensions.width * Math.cos(angle)) +
      Math.abs(dimensions.height * Math.sin(angle)),
    height: Math.abs(dimensions.width * Math.sin(angle)) +
      Math.abs(dimensions.height * Math.cos(angle)),
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function normalizeDegrees(degrees) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function getJointOffset(item, joint) {
  const definition = EQUIPMENT_CONNECTIONS[item.kind];
  if (!definition) return null;
  const scaledX = (joint.x / definition.imageSize.width) * definition.renderedSize.width;
  const scaledY = (joint.y / definition.imageSize.height) * definition.renderedSize.height;
  const angle = degreesToRadians(item.rotationDegrees ?? 0);
  const localX = scaledX - definition.renderedSize.width / 2;
  const localY = scaledY - definition.renderedSize.height / 2;
  return {
    x: localX * Math.cos(angle) - localY * Math.sin(angle),
    y: localX * Math.sin(angle) + localY * Math.cos(angle),
  };
}

function getJointPosition(item, joint, canvasSize) {
  const offset = getJointOffset(item, joint);
  return {
    x: item.x * canvasSize.width + offset.x,
    y: item.y * canvasSize.height + offset.y,
  };
}

export function getEquipmentJointPosition(item, gender, jointId, canvasSize) {
  const definition = EQUIPMENT_CONNECTIONS[item?.kind];
  const joint = definition?.[gender]?.find((candidate) => candidate.id === jointId);
  if (!joint || !canvasSize.width || !canvasSize.height) return null;
  return getJointPosition(item, joint, canvasSize);
}

function getCompatiblePairs(movingItem, stationaryItem) {
  const movingDefinition = EQUIPMENT_CONNECTIONS[movingItem.kind];
  const stationaryDefinition = EQUIPMENT_CONNECTIONS[stationaryItem.kind];
  if (!movingDefinition || !stationaryDefinition) return [];

  return [
    ...(movingDefinition.male ?? []).flatMap((movingJoint) =>
      (stationaryDefinition.female ?? []).map((stationaryJoint) => ({
        movingJoint,
        stationaryJoint,
      })),
    ),
    ...(movingDefinition.female ?? []).flatMap((movingJoint) =>
      (stationaryDefinition.male ?? []).map((stationaryJoint) => ({
        movingJoint,
        stationaryJoint,
      })),
    ),
  ];
}

function isJointOccupied(item, joint) {
  return (item.connections ?? []).some((connection) => connection.jointId === joint.id);
}

function getConnectionCandidate(movingItem, stationaryItem, pair, canvasSize) {
  if (
    isJointOccupied(movingItem, pair.movingJoint) ||
    isJointOccupied(stationaryItem, pair.stationaryJoint)
  ) {
    return null;
  }

  const movingPosition = getJointPosition(movingItem, pair.movingJoint, canvasSize);
  const stationaryPosition = getJointPosition(stationaryItem, pair.stationaryJoint, canvasSize);
  const distance = Math.hypot(
    movingPosition.x - stationaryPosition.x,
    movingPosition.y - stationaryPosition.y,
  );
  if (distance > CONNECTION_SNAP_RADIUS) return null;

  const movingJointAngle = pair.movingJoint.rotationDegrees;
  const stationaryJointAngle = pair.stationaryJoint.rotationDegrees;
  const movingRotation = normalizeDegrees(
    (stationaryItem.rotationDegrees ?? 0) +
    stationaryJointAngle +
    180 -
    movingJointAngle,
  );
  const movingDefinition = EQUIPMENT_CONNECTIONS[movingItem.kind];
  const scaledX = (pair.movingJoint.x / movingDefinition.imageSize.width) *
    movingDefinition.renderedSize.width;
  const scaledY = (pair.movingJoint.y / movingDefinition.imageSize.height) *
    movingDefinition.renderedSize.height;
  const localX = scaledX - movingDefinition.renderedSize.width / 2;
  const localY = scaledY - movingDefinition.renderedSize.height / 2;
  const angle = degreesToRadians(movingRotation);
  const offset = {
    x: localX * Math.cos(angle) - localY * Math.sin(angle),
    y: localX * Math.sin(angle) + localY * Math.cos(angle),
  };
  const center = {
    x: stationaryPosition.x - offset.x,
    y: stationaryPosition.y - offset.y,
  };

  return {
    movingItemId: movingItem.id,
    stationaryItemId: stationaryItem.id,
    movingJointId: pair.movingJoint.id,
    stationaryJointId: pair.stationaryJoint.id,
    movingGroupId: movingItem.groupId,
    stationaryGroupId: stationaryItem.groupId,
    rotationDegrees: movingRotation,
    x: center.x / canvasSize.width,
    y: center.y / canvasSize.height,
    distance,
  };
}

export function findEquipmentConnection(movedIds, items, canvasSize) {
  if (!canvasSize.width || !canvasSize.height) return null;
  const movedSet = new Set(movedIds);
  let bestCandidate = null;

  items.forEach((firstItem) => {
    items.forEach((secondItem) => {
      if (firstItem.id === secondItem.id) return;
      const firstMoved = movedSet.has(firstItem.id);
      const secondMoved = movedSet.has(secondItem.id);
      if (firstMoved === secondMoved) return;
      if (firstItem.groupId && firstItem.groupId === secondItem.groupId) return;

      const movingItem = firstMoved ? firstItem : secondItem;
      const stationaryItem = firstMoved ? secondItem : firstItem;
      getCompatiblePairs(movingItem, stationaryItem).forEach((pair) => {
        const candidate = getConnectionCandidate(movingItem, stationaryItem, pair, canvasSize);
        if (candidate && (!bestCandidate || candidate.distance < bestCandidate.distance)) {
          bestCandidate = candidate;
        }
      });
    });
  });

  return bestCandidate;
}

export function connectEquipment(items, connection, groupId, canvasSize) {
  const movingItem = items.find((item) => item.id === connection.movingItemId);
  const stationaryItem = items.find((item) => item.id === connection.stationaryItemId);
  if (!movingItem || !stationaryItem) return items;

  const movingGroupId = movingItem.groupId;
  const stationaryGroupId = stationaryItem.groupId;
  const anchorX = movingItem.x * canvasSize.width;
  const anchorY = movingItem.y * canvasSize.height;
  const targetX = connection.x * canvasSize.width;
  const targetY = connection.y * canvasSize.height;
  const deltaRotation = degreesToRadians(
    connection.rotationDegrees - (movingItem.rotationDegrees ?? 0),
  );
  const cosine = Math.cos(deltaRotation);
  const sine = Math.sin(deltaRotation);
  return items.map((item) => {
    const inMovingGroup = movingGroupId
      ? item.groupId === movingGroupId
      : item.id === movingItem.id;
    const inStationaryGroup = stationaryGroupId
      ? item.groupId === stationaryGroupId
      : item.id === stationaryItem.id;
    if (!inMovingGroup && !inStationaryGroup) return item;

    if (inStationaryGroup) {
      return {
        ...item,
        groupId,
        ...(item.id === stationaryItem.id
          ? {
              connections: [
                ...(item.connections ?? []),
                {
                  peerId: movingItem.id,
                  jointId: connection.stationaryJointId,
                  peerJointId: connection.movingJointId,
                },
              ],
            }
          : {}),
      };
    }

    const relativeX = item.x * canvasSize.width - anchorX;
    const relativeY = item.y * canvasSize.height - anchorY;
    return {
      ...item,
      x: (targetX + relativeX * cosine - relativeY * sine) / canvasSize.width,
      y: (targetY + relativeX * sine + relativeY * cosine) / canvasSize.height,
      rotationDegrees: normalizeDegrees(
        (item.rotationDegrees ?? 0) +
        connection.rotationDegrees -
        (movingItem.rotationDegrees ?? 0),
      ),
      groupId,
      ...(item.id === movingItem.id
        ? {
            connections: [
              ...(item.connections ?? []),
              {
                peerId: stationaryItem.id,
                jointId: connection.movingJointId,
                peerJointId: connection.stationaryJointId,
              },
            ],
          }
        : {}),
    };
  });
}
