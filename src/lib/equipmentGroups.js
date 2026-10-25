export function getJoinableGroupId(items, selectedIds) {
  if (selectedIds.length < 2) return null;
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  if (selectedItems.length !== selectedIds.length) return null;
  const groupId = selectedItems[0].groupId;
  return groupId && selectedItems.every((item) => item.groupId === groupId) ? groupId : null;
}

function addLink(items, firstId, secondId, firstJointId = null, secondJointId = null) {
  if (firstId === secondId) return items;
  const firstItem = items.find((item) => item.id === firstId);
  const secondItem = items.find((item) => item.id === secondId);
  if (!firstItem || !secondItem) return items;
  const hasLink = (item, peerId, jointId) =>
    (item.connections ?? []).some(
      (connection) => connection.peerId === peerId && connection.jointId === jointId,
    );
  if (
    hasLink(firstItem, secondId, firstJointId) &&
    hasLink(secondItem, firstId, secondJointId)
  ) {
    return items;
  }

  return items.map((item) => {
    if (item.id === firstId) {
      return {
        ...item,
        connections: [
          ...(item.connections ?? []),
          { peerId: secondId, jointId: firstJointId, peerJointId: secondJointId },
        ],
      };
    }
    if (item.id === secondId) {
      return {
        ...item,
        connections: [
          ...(item.connections ?? []),
          { peerId: firstId, jointId: secondJointId, peerJointId: firstJointId },
        ],
      };
    }
    return item;
  });
}

export function addEquipmentLink(items, firstId, secondId) {
  return addLink(items, firstId, secondId);
}

export function hasDirectEquipmentConnection(items, selectedIds) {
  if (selectedIds.length !== 2) return false;
  const [firstId, secondId] = selectedIds;
  return items.some((item) =>
    item.id === firstId &&
    (item.connections ?? []).some((connection) => connection.peerId === secondId),
  );
}

export function findNearestLinkedEquipment(items, selectedId, direction, canvasSize) {
  const activeItem = items.find((item) => item.id === selectedId);
  if (!activeItem || !canvasSize?.width || !canvasSize?.height) return null;

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const linkedIds = new Set([selectedId]);
  const pending = [selectedId];
  while (pending.length) {
    const current = itemsById.get(pending.pop());
    (current?.connections ?? []).forEach((connection) => {
      if (itemsById.has(connection.peerId) && !linkedIds.has(connection.peerId)) {
        linkedIds.add(connection.peerId);
        pending.push(connection.peerId);
      }
    });
  }

  const directions = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  const vector = directions[direction];
  if (!vector) return null;

  const activeX = activeItem.x * canvasSize.width;
  const activeY = activeItem.y * canvasSize.height;
  return items
    .filter((item) => linkedIds.has(item.id) && item.id !== selectedId)
    .map((item) => {
      const deltaX = item.x * canvasSize.width - activeX;
      const deltaY = item.y * canvasSize.height - activeY;
      const directionalDistance = deltaX * vector.x + deltaY * vector.y;
      return {
        item,
        directionalDistance,
        distance: Math.hypot(deltaX, deltaY),
      };
    })
    .filter((candidate) => candidate.directionalDistance > 0)
    .sort((first, second) => first.distance - second.distance)[0]?.item ?? null;
}

export function joinEquipment(items, selectedIds, groupId) {
  if (selectedIds.length < 2) return items;
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  if (selectedItems.length !== selectedIds.length) return items;
  const selectedGroups = new Set(selectedItems.map((item) => item.groupId).filter(Boolean));
  const joinedIds = new Set(
    items
      .filter((item) => selectedIds.includes(item.id) || selectedGroups.has(item.groupId))
      .map((item) => item.id),
  );
  const representatives = new Map();
  selectedItems.forEach((item) => {
    const key = item.groupId ?? item.id;
    if (!representatives.has(key)) representatives.set(key, item.id);
  });

  let linkedItems = items;
  const [firstRepresentative, ...otherRepresentatives] = representatives.values();
  otherRepresentatives.forEach((representative) => {
    linkedItems = addLink(linkedItems, firstRepresentative, representative);
  });
  return linkedItems.map((item) =>
    joinedIds.has(item.id) ? { ...item, groupId } : item,
  );
}

function getGroupComponents(items, groupId) {
  const members = items.filter((item) => item.groupId === groupId);
  const memberIds = new Set(members.map((item) => item.id));
  const visited = new Set();
  const components = [];
  members.forEach((member) => {
    if (visited.has(member.id)) return;
    const component = [];
    const pending = [member.id];
    visited.add(member.id);
    while (pending.length) {
      const currentId = pending.pop();
      component.push(currentId);
      const current = members.find((item) => item.id === currentId);
      (current?.connections ?? []).forEach((connection) => {
        if (memberIds.has(connection.peerId) && !visited.has(connection.peerId)) {
          visited.add(connection.peerId);
          pending.push(connection.peerId);
        }
      });
    }
    components.push(component);
  });
  return components;
}

function assignGroupComponents(items, groupId, components, retainedComponentId, nextGroupId) {
  if (components.length === 0) return items;
  if (components.length === 1) {
    return components[0].length > 1
      ? items
      : items.map((item) =>
          item.groupId === groupId ? { ...item, groupId: null } : item,
        );
  }
  const retainedComponent = components.find((component) => component.includes(retainedComponentId));
  const otherGroupIds = new Map();
  components.forEach((component) => {
    if (component === retainedComponent || component.length < 2) return;
    otherGroupIds.set(component, nextGroupId());
  });
  return items.map((item) => {
    if (item.groupId !== groupId) return item;
    const component = components.find((entry) => entry.includes(item.id));
    if (component === retainedComponent) {
      return component.length > 1 ? item : { ...item, groupId: null };
    }
    return { ...item, groupId: component.length > 1 ? otherGroupIds.get(component) : null };
  });
}

export function separateSelectedEquipment(items, selectedIds, nextGroupId = () => null) {
  if (selectedIds.length !== 2 || !hasDirectEquipmentConnection(items, selectedIds)) return items;
  const [firstId, secondId] = selectedIds;
  const firstItem = items.find((item) => item.id === firstId);
  const secondItem = items.find((item) => item.id === secondId);
  if (!firstItem?.groupId || firstItem.groupId !== secondItem?.groupId) return items;
  const groupId = firstItem.groupId;
  const disconnectedItems = items.map((item) => ({
    ...item,
    connections: (item.connections ?? []).filter(
      (connection) =>
        !(
          (item.id === firstId && connection.peerId === secondId) ||
          (item.id === secondId && connection.peerId === firstId)
        ),
    ),
  }));
  return assignGroupComponents(
    disconnectedItems,
    groupId,
    getGroupComponents(disconnectedItems, groupId),
    firstId,
    nextGroupId,
  );
}

export function removeEquipmentFromGroups(items, removedId, nextGroupId = () => null) {
  const removedItem = items.find((item) => item.id === removedId);
  const remainingItems = items
    .filter((item) => item.id !== removedId)
    .map((item) => ({
      ...item,
      connections: (item.connections ?? []).filter(
        (connection) => connection.peerId !== removedId,
      ),
    }));
  if (!removedItem?.groupId) return remainingItems;
  return assignGroupComponents(
    remainingItems,
    removedItem.groupId,
    getGroupComponents(remainingItems, removedItem.groupId),
    remainingItems.find((item) => item.groupId === removedItem.groupId)?.id,
    nextGroupId,
  );
}
