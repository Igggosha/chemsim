"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import chemsimLogoAsset from "../../assets/chemsim_logo.png";
import paperAsset from "../../assets/paper.png";
import MoleculeViewer from "./MoleculeViewer";
import {
  connectFlaskToMantle,
  createHeatingMantle,
  findMantleForFlask,
  heatConnectedFlasks,
  HEATING_MANTLE_ASSETS,
  HEATING_MANTLE_DEFINITION,
  isFlask,
  isMixtureVessel,
  MANTLE_HIT_RADIUS_X,
  MANTLE_HIT_RADIUS_Y,
  MANTLE_SIZE,
} from "../lib/heatingMantle";
import {
  connectVesselToIceBath,
  coolVesselsInIceBaths,
  createIceBath,
  findIceBathForVessel,
  ICE_BATH_ASSETS,
  ICE_BATH_COOLING_POWER_WATTS,
  ICE_BATH_DEFINITION,
  ICE_BATH_HIT_RADIUS_X,
  ICE_BATH_HIT_RADIUS_Y,
  ICE_BATH_SIZE,
  ICE_BATH_TARGET_TEMPERATURE_K,
} from "../lib/iceBath";
import {
  CONDENSER_ASSETS,
  CONDENSER_DEFINITION,
  CONDENSER_HEIGHT,
  createCondenser,
  isCondenser,
} from "../lib/condenser";
import {
  connectEquipment,
  findEquipmentConnection,
  getEquipmentDimensions,
  getEquipmentHitBounds,
} from "../lib/equipmentConnections";
import {
  createTJoint,
  isTJoint,
  T_JOINT_ASSETS,
  T_JOINT_DEFINITION,
} from "../lib/tJoint";
import {
  findNearestLinkedEquipment,
  hasDirectEquipmentConnection,
  getJoinableGroupId,
  joinEquipment,
  removeEquipmentFromGroups,
  separateSelectedEquipment,
} from "../lib/equipmentGroups";
import { createMolecule } from "../lib/molecules";
import { getNormalBoilingPoint } from "../lib/boilingPoint";
import { createReactionSystem } from "../lib/reactionSystem";
import { createVaporizationSystem } from "../lib/vaporizationSystem";
import {
  createInitialVessels,
  createVessel,
  findPourTarget,
  getPourPoint,
  POUR_ANGLE,
  POUR_RATE,
  VESSEL_HIT_RADIUS_X,
  VESSEL_HIT_RADIUS_Y,
  VESSEL_IMAGE_ASSETS,
  VESSEL_SIZE,
  VESSEL_TYPES,
} from "../lib/vessels";
import { benzene } from "../lib/molecules";

function formatMoles(moles) {
  return Number(moles.toFixed(3)).toString();
}

const INSPECTOR_MOLECULE_MIN_MOLES = 0.001;

function getStateSymbol(state) {
  return { gas: "(g)", liquid: "(l)", solid: "(s)" }[state] ?? "";
}

export default function Home() {
  const [sceneItems, setSceneItems] = useState(createInitialVessels);
  const canvasRef = useRef(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const imagesRef = useRef({});
  const dragRef = useRef(null);
  const sceneItemsRef = useRef(sceneItems);
  const nextVesselIdsRef = useRef({
    beaker: 2,
    volumetric: 1,
    roundBottom: 1,
    heatingMantle: 1,
    condenser: 1,
    tJoint: 1,
    iceBath: 1,
  });
  const nextGroupRef = useRef(1);
  const [selectedIds, setSelectedIds] = useState(["beaker-1"]);
  const [activeId, setActiveId] = useState("beaker-1");
  const [vesselTypeToAdd, setVesselTypeToAdd] = useState("beaker");
  const [pouringId, setPouringId] = useState(null);
  const [highlightedTargetId, setHighlightedTargetId] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageLoadVersion, setImageLoadVersion] = useState(0);
  const [selectedMoleculeSmiles, setSelectedMoleculeSmiles] = useState(null);
  const [customSmiles, setCustomSmiles] = useState("");
  const [customMoleculeName, setCustomMoleculeName] = useState("");
  const [customMoleculeAmount, setCustomMoleculeAmount] = useState("1");
  const [customError, setCustomError] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [mantleTargetDraft, setMantleTargetDraft] = useState(null);
  const [isObjectMenuOpen, setIsObjectMenuOpen] = useState(false);

  const activeItem = sceneItems.find((item) => item.id === activeId);
  const inspectorContents =
    activeItem?.container?.contents.filter(
      (entry) => entry.moles >= INSPECTOR_MOLECULE_MIN_MOLES,
    ).sort((first, second) => second.moles - first.moles) ?? [];
  const activeMolecule =
    inspectorContents.find(
      (entry) => entry.molecule.canonicalSmiles === selectedMoleculeSmiles,
    )?.molecule ?? inspectorContents[0]?.molecule;
  const beakerCount = sceneItems.length;
  const totalMoles = activeItem?.container?.contents.reduce((sum, item) => sum + item.moles, 0) ?? 0;
  const totalMass = activeItem?.container?.totalMass ?? 0;
  const totalVolume = activeItem?.container?.liquidVolume ?? 0;
  const liquidVolumeLiters = activeItem?.container?.liquidVolumeLiters ?? 0;
  const sharedSelectedGroupId = getJoinableGroupId(sceneItems, selectedIds);
  const selectedPairIsConnected = hasDirectEquipmentConnection(sceneItems, selectedIds);
  const itemTypes = {
    ...VESSEL_TYPES,
    heatingMantle: HEATING_MANTLE_DEFINITION,
    iceBath: ICE_BATH_DEFINITION,
    condenser: CONDENSER_DEFINITION,
    tJoint: T_JOINT_DEFINITION,
  };

  useEffect(() => {
    sceneItemsRef.current = sceneItems;
  }, [sceneItems]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      ) {
        return;
      }

      const linkedItem = findNearestLinkedEquipment(
        sceneItemsRef.current,
        activeId,
        event.key,
        canvasSizeRef.current,
      );
      if (!linkedItem) return;

      event.preventDefault();
      setActiveId(linkedItem.id);
      setSelectedIds([linkedItem.id]);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      setCanvasSize({ width: bounds.width, height: bounds.height });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const images = Object.fromEntries(
      Object.entries({
        ...VESSEL_IMAGE_ASSETS,
        ...HEATING_MANTLE_ASSETS,
        ...ICE_BATH_ASSETS,
        ...CONDENSER_ASSETS,
        ...T_JOINT_ASSETS,
        paper: paperAsset,
      }).map(([name, asset]) => {
        const image = new window.Image();
        image.onload = () => setImageLoadVersion((version) => version + 1);
        image.onerror = () => console.error(`The ${name} image could not be loaded.`);
        image.src = asset.src;
        return [name, image];
      }),
    );
    imagesRef.current = images;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasSize.width * pixelRatio);
    canvas.height = Math.round(canvasSize.height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const paper = imagesRef.current.paper;
    const paperPattern = paper?.complete && paper.naturalWidth
      ? context.createPattern(paper, "repeat")
      : null;
    context.fillStyle = "#111917";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    if (paperPattern) {
      context.fillStyle = paperPattern;
      context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }

    const mantles = sceneItems.filter((item) => item.kind === "heatingMantle");
    const iceBaths = sceneItems.filter((item) => item.kind === "iceBath");
    const jointedItems = sceneItems.filter((item) => getEquipmentDimensions(item.kind));
    const tJoints = jointedItems.filter(isTJoint);
    const condensers = jointedItems.filter(isCondenser);
    const vessels = sceneItems.filter(
      (item) =>
        item.kind !== "heatingMantle" &&
      item.kind !== "iceBath" &&
      !isCondenser(item) &&
        !isTJoint(item),
    );

    sceneItems.forEach((item) => {
      const x = item.x * canvasSize.width;
      const y = item.y * canvasSize.height;
      const selected = selectedIds.includes(item.id);
      const active = item.id === activeId;
      const mantle = item.kind === "heatingMantle";
      const iceBath = item.kind === "iceBath";
      const thermalEquipment = mantle || iceBath;
      const equipmentBounds = getEquipmentHitBounds(item.kind, item.rotationDegrees);
      context.save();
      context.fillStyle = "rgba(15, 31, 21, 0.14)";
      context.beginPath();
      context.ellipse(
        x,
        y + (thermalEquipment ? 21 : equipmentBounds ? equipmentBounds.height * 0.38 : 28),
        thermalEquipment ? 59 : equipmentBounds ? equipmentBounds.width * 0.42 : 43,
        thermalEquipment ? 17 : equipmentBounds ? 9 : 13,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();

      if (active || selected || item.id === highlightedTargetId) {
        context.strokeStyle = item.id === highlightedTargetId
          ? "rgba(109, 224, 206, 0.95)"
          : active
            ? "#b3edb0"
            : "rgba(179, 237, 176, 0.56)";
        context.fillStyle = "rgba(109, 224, 206, 0.12)";
        context.lineWidth = item.id === highlightedTargetId ? 3 : active ? 1.5 : 1;
        if (active) context.setLineDash([4, 5]);
        if (item.id === highlightedTargetId) {
          context.shadowColor = "rgba(109, 224, 206, 0.7)";
          context.shadowBlur = 18;
        }
        context.beginPath();
        context.ellipse(
          x,
          y + 3,
          thermalEquipment ? 69 : equipmentBounds ? equipmentBounds.width * 0.55 : 55,
          thermalEquipment ? 45 : equipmentBounds ? equipmentBounds.height * 0.5 : 48,
          0,
          0,
          Math.PI * 2,
        );
        if (item.id === highlightedTargetId) context.fill();
        context.stroke();
        context.restore();
      } else {
        context.restore();
      }
    });

    mantles.forEach((mantle) => {
      const x = mantle.x * canvasSize.width;
      const y = mantle.y * canvasSize.height;
      const image = imagesRef.current.heatingMantleLower;
      if (image?.complete && image.naturalWidth) {
        context.drawImage(image, x - MANTLE_SIZE / 2, y - MANTLE_SIZE / 2, MANTLE_SIZE, MANTLE_SIZE);
      }
    });

    iceBaths.forEach((bath) => {
      const x = bath.x * canvasSize.width;
      const y = bath.y * canvasSize.height;
      const image = imagesRef.current.iceBathLower;
      if (image?.complete && image.naturalWidth) {
        context.drawImage(
          image,
          x - ICE_BATH_SIZE / 2,
          y - ICE_BATH_SIZE / 2,
          ICE_BATH_SIZE,
          ICE_BATH_SIZE,
        );
      }
    });

    vessels.forEach((item) => {
      const x = item.x * canvasSize.width;
      const y = item.y * canvasSize.height;
      const tilted = item.id === pouringId;
      const image = imagesRef.current[item.kind];
      if (image?.complete && image.naturalWidth) {
        context.save();
        context.translate(x, y);
        if (tilted) context.rotate(POUR_ANGLE);
        context.drawImage(image, -VESSEL_SIZE / 2, -VESSEL_SIZE / 2, VESSEL_SIZE, VESSEL_SIZE);
        context.restore();
      } else {
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#254832";
        context.lineWidth = 2;
        context.save();
        context.translate(x, y);
        if (tilted) context.rotate(POUR_ANGLE);
        context.beginPath();
        context.roundRect(-23, -30, 46, 59, 8);
        context.fill();
        context.stroke();
        context.restore();
      }
    });

    [...tJoints, ...condensers].forEach((item) => {
      const dimensions = getEquipmentDimensions(item.kind);
      const x = item.x * canvasSize.width;
      const y = item.y * canvasSize.height;
      const image = imagesRef.current[item.kind];
      if (image?.complete && image.naturalWidth) {
        context.save();
        context.translate(x, y);
        context.rotate(((item.rotationDegrees ?? 0) * Math.PI) / 180);
        context.drawImage(
          image,
          -dimensions.width / 2,
          -dimensions.height / 2,
          dimensions.width,
          dimensions.height,
        );
        context.restore();
      }
    });

    mantles.forEach((mantle) => {
      const x = mantle.x * canvasSize.width;
      const y = mantle.y * canvasSize.height;
      const upperImage = imagesRef.current.heatingMantleUpper;
      const statusImage = imagesRef.current[mantle.isOn ? "heatingMantleOn" : "heatingMantle"];
      if (upperImage?.complete && upperImage.naturalWidth) {
        context.drawImage(upperImage, x - MANTLE_SIZE / 2, y - MANTLE_SIZE / 2, MANTLE_SIZE, MANTLE_SIZE);
      }
      if (statusImage?.complete && statusImage.naturalWidth) {
        context.drawImage(statusImage, x - MANTLE_SIZE / 2, y - MANTLE_SIZE / 2, MANTLE_SIZE, MANTLE_SIZE);
      }
    });

    iceBaths.forEach((bath) => {
      const x = bath.x * canvasSize.width;
      const y = bath.y * canvasSize.height;
      const image = imagesRef.current.iceBathUpper;
      if (image?.complete && image.naturalWidth) {
        context.drawImage(
          image,
          x - ICE_BATH_SIZE / 2,
          y - ICE_BATH_SIZE / 2,
          ICE_BATH_SIZE,
          ICE_BATH_SIZE,
        );
      }
    });

    sceneItems.forEach((item) => {
      const x = item.x * canvasSize.width;
      const y = item.y * canvasSize.height;
      const equipmentDimensions = getEquipmentDimensions(item.kind);
      const pouring =
        item.kind !== "heatingMantle" &&
        item.kind !== "iceBath" &&
        item.id === pouringId &&
        item.container?.contents.length > 0;
      context.save();
      if (pouring) {
        const pourPoint = getPourPoint(item, canvasSize);
        const streamImage = imagesRef.current.pouring;
        if (streamImage?.complete && streamImage.naturalWidth) {
          context.drawImage(streamImage, pourPoint.x - 17, pourPoint.y - 24, 34, 48);
        }
      }

      context.fillStyle = "#e8f2ed";
      context.font = "600 11px var(--font-geist-mono), monospace";
      context.textAlign = "center";
      context.fillText(
        item.label,
        x,
        y + (item.kind === "heatingMantle"
          ? 48
          : item.kind === "iceBath"
            ? 49
          : isCondenser(item)
            ? -CONDENSER_HEIGHT / 2 - 8
            : equipmentDimensions
              ? equipmentDimensions.height / 2 + 15
              : 57),
      );
      if (item.groupId) {
        context.fillStyle = "#b3edb0";
        context.font = "10px var(--font-geist-mono), monospace";
        context.fillText(
          "LINKED",
          x,
          y + (item.kind === "heatingMantle"
            ? 63
            : item.kind === "iceBath"
              ? 64
            : isCondenser(item)
              ? -CONDENSER_HEIGHT / 2 + 6
              : equipmentDimensions
                ? equipmentDimensions.height / 2 + 29
                : 72),
        );
      }
      context.restore();
    });
  }, [activeId, canvasSize, highlightedTargetId, imageLoadVersion, pouringId, sceneItems, selectedIds]);

  useEffect(() => {
    if (!pouringId) return undefined;

    let previousTime = performance.now();
    let lastRenderTime = previousTime;
    const interval = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min((now - previousTime) / 1000, 0.25);
      previousTime = now;
      const drag = dragRef.current;
      if (!drag?.leftHeld || !drag.pouring || drag.itemId !== pouringId) {
        setPouringId(null);
        setHighlightedTargetId(null);
        return;
      }
      const items = sceneItemsRef.current;
      const source = items.find((item) => item.id === pouringId);
      const hasContents = source?.container.contents.some((entry) => entry.moles > 0);
      const target = source && hasContents ? findPourTarget(source, items, canvasSize) : null;
      setHighlightedTargetId((current) => current === target?.id ? current : target?.id ?? null);

      if (source && hasContents) {
        source.container.transferTo(target?.container ?? null, elapsedSeconds * POUR_RATE);
        if (now - lastRenderTime >= 80 || source.container.contents.length === 0) {
          setSceneItems([...items]);
          lastRenderTime = now;
        }
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [canvasSize, pouringId]);

  useEffect(() => {
    let previousTime = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min((now - previousTime) / 1000, 0.25);
      previousTime = now;
      const items = sceneItemsRef.current;
      const heated = heatConnectedFlasks(
        items.filter((item) => item.kind === "heatingMantle"),
        items,
        elapsedSeconds,
      );
      const cooled = coolVesselsInIceBaths(
        items.filter((item) => item.kind === "iceBath"),
        items,
        elapsedSeconds,
      );
      const changed = heated || cooled;
      if (changed) setSceneItems([...items]);
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const vaporizationSystem = createVaporizationSystem({
      getItems: () => sceneItemsRef.current,
      getCanvasSize: () => canvasSizeRef.current,
      onContentsChanged: () => setSceneItems([...sceneItemsRef.current]),
    });
    const reactionSystem = createReactionSystem({
      getContainers: () =>
        sceneItemsRef.current
          .map((item) => item.container)
          .filter((container) => Boolean(container)),
      onContentsChanged: () => setSceneItems([...sceneItemsRef.current]),
      onTick: () => vaporizationSystem.tick(),
    });
    return reactionSystem.start();
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const hit = [...sceneItems].reverse().find((item) => {
        const x = item.x * bounds.width;
        const y = item.y * bounds.height;
        const equipmentBounds = getEquipmentHitBounds(item.kind, item.rotationDegrees);
        const radiusX = item.kind === "heatingMantle"
          ? MANTLE_HIT_RADIUS_X
          : item.kind === "iceBath"
            ? ICE_BATH_HIT_RADIUS_X
          : equipmentBounds
            ? equipmentBounds.width / 2
            : VESSEL_HIT_RADIUS_X;
        const radiusY = item.kind === "heatingMantle"
          ? MANTLE_HIT_RADIUS_Y
          : item.kind === "iceBath"
            ? ICE_BATH_HIT_RADIUS_Y
          : equipmentBounds
            ? equipmentBounds.height / 2
            : VESSEL_HIT_RADIUS_Y;
        return Math.abs(point.x - x) <= radiusX && Math.abs(point.y - y) <= radiusY;
      });

      if (!hit) {
        setActiveId(null);
        setSelectedIds([]);
        setIsObjectMenuOpen(false);
        dragRef.current = null;
        return;
      }

      setActiveId(hit.id);
      setIsObjectMenuOpen(false);
      if (event.shiftKey) {
        setSelectedIds((current) =>
          current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id],
        );
        dragRef.current = null;
        return;
      }
      const nextSelected = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
      setSelectedIds(nextSelected);
      const movingIds = hit.groupId
        ? sceneItems.filter((item) => item.groupId === hit.groupId).map((item) => item.id)
        : nextSelected.includes(hit.id)
          ? nextSelected
          : [hit.id];
      dragRef.current = {
        pointerId: event.pointerId,
        itemId: hit.id,
        leftHeld: true,
        pouring: false,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPositions: new Map(
          sceneItems
            .filter((item) => movingIds.includes(item.id))
            .map((item) => [item.id, { x: item.x, y: item.y }]),
        ),
        bounds,
      };
      canvas.setPointerCapture(event.pointerId);
    },
    [sceneItems, selectedIds],
  );

  const handleMouseDown = useCallback((event) => {
    if (event.button !== 2 || (event.buttons & 1) !== 1) return;
    const drag = dragRef.current;
    if (!drag || !drag.leftHeld) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.contains(event.target)) return;
    const item = sceneItemsRef.current.find((sceneItem) => sceneItem.id === drag.itemId);
    if (!item?.container) return;
    event.preventDefault();
    drag.pouring = true;
    setPouringId(item.id);
  }, []);

  const finishDrag = useCallback((alignFlask = true) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    drag.leftHeld = false;
    if (alignFlask && !drag.pouring) {
      const currentItems = sceneItemsRef.current;
      const movedVessel = [...drag.startPositions.keys()]
        .map((id) => currentItems.find((item) => item.id === id))
        .find(isMixtureVessel);
      const initialPosition = movedVessel && drag.startPositions.get(movedVessel.id);
      let alignedItems = currentItems;
      const mantle = movedVessel && isFlask(movedVessel)
        ? findMantleForFlask(movedVessel, initialPosition, currentItems, drag.bounds)
        : null;
      const iceBath = movedVessel
        ? findIceBathForVessel(movedVessel, initialPosition, currentItems, drag.bounds)
        : null;

      if (movedVessel && (mantle || iceBath)) {
        const nearestBath = [mantle, iceBath]
          .filter(Boolean)
          .sort((first, second) =>
            Math.hypot(
              (first.x - movedVessel.x) * drag.bounds.width,
              (first.y - movedVessel.y) * drag.bounds.height,
            ) -
            Math.hypot(
              (second.x - movedVessel.x) * drag.bounds.width,
              (second.y - movedVessel.y) * drag.bounds.height,
            ),
          )[0];
        const groupId = nearestBath.groupId ||
          movedVessel.groupId ||
          `group-${nextGroupRef.current++}`;
        alignedItems = nearestBath.kind === "heatingMantle"
          ? connectFlaskToMantle(
              alignedItems,
              movedVessel,
              nearestBath,
              groupId,
              drag.bounds.height,
            )
          : connectVesselToIceBath(
              alignedItems,
              movedVessel,
              nearestBath,
              groupId,
              drag.bounds.height,
            );
      }

      const connection = findEquipmentConnection(
        [...drag.startPositions.keys()],
        alignedItems,
        drag.bounds,
      );
      if (connection) {
        const groupId = connection.movingGroupId ||
          connection.stationaryGroupId ||
          `group-${nextGroupRef.current++}`;
        alignedItems = connectEquipment(alignedItems, connection, groupId, drag.bounds);
      }

      if (alignedItems !== currentItems) {
        sceneItemsRef.current = alignedItems;
        setSceneItems(alignedItems);
      }
    }
    setPouringId(null);
    setHighlightedTargetId(null);
    dragRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(drag.pointerId)) {
      canvas.releasePointerCapture(drag.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) !== 1) {
      finishDrag();
      return;
    }
    event.preventDefault();
    const deltaX = (event.clientX - drag.startClientX) / drag.bounds.width;
    const deltaY = (event.clientY - drag.startClientY) / drag.bounds.height;
    const movedItems = sceneItemsRef.current.map((item) => {
        const start = drag.startPositions.get(item.id);
        if (!start) return item;
        return {
          ...item,
          x: Math.min(0.96, Math.max(0.04, start.x + deltaX)),
          y: Math.min(0.92, Math.max(0.08, start.y + deltaY)),
        };
    });
    sceneItemsRef.current = movedItems;
    setSceneItems(movedItems);
  }, [finishDrag]);

  const handlePointerUp = useCallback((event) => {
    if (dragRef.current?.pointerId === event.pointerId && (event.buttons & 1) !== 1) {
      finishDrag(event.type !== "pointercancel");
    }
  }, [finishDrag]);

  const handleMouseUp = useCallback((event) => {
    if (event.button === 2 && dragRef.current?.pouring) {
      dragRef.current.pouring = false;
      setPouringId(null);
      setHighlightedTargetId(null);
      return;
    }
    if (event.button === 0) finishDrag();
  }, [finishDrag]);

  useEffect(() => {
    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [handleMouseDown]);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  function addVessel() {
    const kind = vesselTypeToAdd;
    const index = nextVesselIdsRef.current[kind];
    nextVesselIdsRef.current[kind] += 1;
    const x = Math.min(0.82, 0.5 + sceneItems.length * 0.15);
    const y = Math.min(0.78, 0.49 + sceneItems.length * 0.08);
    const item = kind === "heatingMantle"
      ? createHeatingMantle(index, x, y)
      : kind === "iceBath"
        ? createIceBath(index, x, y)
        : kind === "condenser"
          ? createCondenser(index, x, y)
          : kind === "tJoint"
            ? createTJoint(index, x, y)
            : createVessel(kind, index, x, y);
    setSceneItems((items) => [
      ...items,
      item,
    ]);
    setActiveId(item.id);
    setSelectedIds([item.id]);
    setIsObjectMenuOpen(false);
  }

  function deleteActiveObject() {
    if (!activeItem) return;
    const remainingItems = removeEquipmentFromGroups(
      sceneItemsRef.current,
      activeItem.id,
      () => `group-${nextGroupRef.current++}`,
    );
    sceneItemsRef.current = remainingItems;
    setSceneItems(remainingItems);
    setActiveId(null);
    setSelectedIds([]);
    setIsObjectMenuOpen(false);
  }

  function joinSelected() {
    if (selectedIds.length < 2) return;
    const groupId = `group-${nextGroupRef.current}`;
    nextGroupRef.current += 1;
    setSceneItems((items) => joinEquipment(items, selectedIds, groupId));
  }

  function separateSelected() {
    const separatedItems = separateSelectedEquipment(
      sceneItemsRef.current,
      selectedIds,
      () => `group-${nextGroupRef.current++}`,
    );
    sceneItemsRef.current = separatedItems;
    setSceneItems(separatedItems);
    setSelectedIds([]);
  }

  function addBenzene() {
    if (!activeItem) return;
    activeItem.container.add(benzene, 0.25, "liquid");
    setSceneItems((items) => [...items]);
  }

  function removeBenzene() {
    if (!activeItem) return;
    activeItem.container.remove(benzene.canonicalSmiles, 0.25);
    setSceneItems((items) => [...items]);
  }

  function addCustomMolecule(event) {
    event.preventDefault();
    if (!activeItem) return;
    const amount = Number(customMoleculeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCustomError("Enter a molar amount greater than zero.");
      return;
    }

    try {
      const molecule = createMolecule(customSmiles.trim(), customMoleculeName);
      activeItem.container.add(molecule, amount, "liquid");
      setSceneItems((items) => [...items]);
      setSelectedMoleculeSmiles(molecule.canonicalSmiles);
      setCustomSmiles("");
      setCustomMoleculeName("");
      setCustomMoleculeAmount("1");
      setCustomError("");
      setShowCustomForm(false);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "Could not parse this SMILES string.");
    }
  }

  function updateHeatingMantle(updates) {
    if (!activeItem || activeItem.kind !== "heatingMantle") return;
    setSceneItems((items) => {
      const updatedItems = items.map((item) =>
        item.id === activeItem.id ? { ...item, ...updates } : item,
      );
      const mantle = updatedItems.find((item) => item.id === activeItem.id);
      if (mantle.isOn) heatConnectedFlasks([mantle], updatedItems, 0);
      return updatedItems;
    });
  }

  function renameEquipment(id, label) {
    const renamedItems = sceneItemsRef.current.map((item) =>
      item.id === id ? { ...item, label } : item,
    );
    sceneItemsRef.current = renamedItems;
    setSceneItems(renamedItems);
  }

  function setMantleTargetTemperature(value) {
    setMantleTargetDraft({ id: activeItem.id, value });
    const celsius = Number(value);
    if (value !== "" && Number.isFinite(celsius) && celsius >= 25 && celsius <= 450) {
      updateHeatingMantle({ targetTemperatureKelvin: celsius + 273.15 });
    }
  }

  function commitMantleTargetTemperature() {
    if (!activeItem || activeItem.kind !== "heatingMantle" || mantleTargetDraft?.id !== activeItem.id) return;
    const value = Number(mantleTargetDraft.value);
    const celsius = Number.isFinite(value) ? Math.min(450, Math.max(25, value)) : 25;
    updateHeatingMantle({ targetTemperatureKelvin: celsius + 273.15 });
    setMantleTargetDraft(null);
  }

  return (
    <main className="lab-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="ChemSim home">
          <Image alt="ChemSim" height={66} src={chemsimLogoAsset} width={110} />
        </Link>
        {/* <div className="topbar-center"><span className="status-dot" /> SIMULATION READY</div> */}
        <div className="topbar-right">
          <span className="profile-name">made by igggosha</span>
        </div>
      </header>

      <section className="workspace">
        <div className="workbench">
          <section className="scene-panel" aria-label="Isometric lab scene">
            <div className="scene-toolbar">
              <div className="toolbar-left">
                <span className="toolbar-label">OBJECTS</span>
                <span className="toolbar-count">{String(beakerCount).padStart(2, "0")}</span>
              </div>
              <div className="toolbar-actions">
                <label className="vessel-select-label">
                  <span className="sr-only">Item type to add</span>
                  <select
                    aria-label="Item type to add"
                    className="vessel-select"
                    onChange={(event) => setVesselTypeToAdd(event.target.value)}
                    value={vesselTypeToAdd}
                  >
                    {Object.entries(itemTypes).map(([kind, vessel]) => (
                      <option key={kind} value={kind}>{vessel.label}</option>
                    ))}
                  </select>
                </label>
                <button className="quiet-button" onClick={addVessel} type="button">
                  <span aria-hidden="true">+</span>
                  {vesselTypeToAdd === "heatingMantle"
                    ? "Add heating mantle"
                    : vesselTypeToAdd === "iceBath"
                      ? "Add ice bath"
                    : vesselTypeToAdd === "condenser"
                      ? "Add condenser"
                      : vesselTypeToAdd === "tJoint"
                        ? "Add T joint"
                        : "Add vessel"}
                </button>
                <button
                  className="join-button"
                  disabled={sharedSelectedGroupId ? !selectedPairIsConnected : selectedIds.length < 2}
                  onClick={sharedSelectedGroupId ? separateSelected : joinSelected}
                  type="button"
                >
                  <span aria-hidden="true">{sharedSelectedGroupId ? "↔" : "↗"}</span>
                  {sharedSelectedGroupId ? "Disconnect selected pair" : "Join selected"}
                </button>
              </div>
            </div>

            <div className="canvas-wrap">
              <canvas
                aria-label="Hold the left mouse button and drag equipment to move it. Use the arrow keys to navigate linked equipment. While holding left, right-click a vessel to pour. Release left to stop."
                className="lab-canvas"
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={() => finishDrag(false)}
                ref={canvasRef}
                role="application"
              />
              {/* <div className="canvas-coordinate" aria-hidden="true">X 01 — Y 01</div> */}
              <div className="canvas-instructions">
                <span className="mouse-icon" aria-hidden="true" />
                <span>Hold left to move <i /> Shift-click to select <i /> Arrow keys to navigate linked equipment <i /> Right-click while holding left to pour</span>
              </div>
            </div>
          </section>

          <aside className="inspector" aria-label="Vessel contents">
            <div className="inspector-heading">
              <div>
                <div className="eyebrow">INSPECTOR</div>
                <h2>{activeItem ? activeItem.label : "Nothing selected"}</h2>
              </div>
              {activeItem && (
                <div
                  className="inspector-menu"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsObjectMenuOpen(false);
                    }
                  }}
                >
                  <button
                    aria-expanded={isObjectMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Equipment actions"
                    className="more-button"
                    onClick={() => setIsObjectMenuOpen((open) => !open)}
                    type="button"
                  >···</button>
                  {isObjectMenuOpen && (
                    <div className="inspector-menu-dropdown" role="menu">
                      <button
                        className="delete-object-button"
                        onClick={deleteActiveObject}
                        role="menuitem"
                        type="button"
                      >
                        Delete {activeItem.kind === "heatingMantle"
                          ? "heating mantle"
                          : activeItem.kind === "iceBath"
                            ? "ice bath"
                          : activeItem.kind === "condenser"
                            ? "condenser"
                            : isTJoint(activeItem)
                              ? "T joint"
                            : "container"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeItem && (
              <div className="equipment-name-control">
                <label htmlFor="equipment-name">Equipment name</label>
                <input
                  id="equipment-name"
                  maxLength={40}
                  onChange={(event) => renameEquipment(activeItem.id, event.target.value)}
                  type="text"
                  value={activeItem.label}
                />
              </div>
            )}

            {activeItem ? (activeItem.kind === "heatingMantle" ? (
              <>
                <div className="vessel-summary">
                  <div className="vessel-icon" aria-hidden="true">
                    <Image
                      alt=""
                      height={30}
                      src={activeItem.isOn
                        ? HEATING_MANTLE_ASSETS.heatingMantleOn
                        : HEATING_MANTLE_ASSETS.heatingMantle}
                      width={30}
                    />
                  </div>
                  <div>
                    <div className="summary-title">Heating mantle</div>
                    <div className="summary-subtitle">
                      {activeItem.groupId ? "Flask aligned" : "No flask connected"}
                    </div>
                  </div>
                  <span className={`vessel-status${activeItem.isOn ? " mantle-status-on" : ""}`}>
                    <i /> {activeItem.isOn ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="mantle-controls">
                  <label htmlFor="mantle-target-temperature">Target temperature</label>
                  <div className="temperature-input-wrap">
                    <input
                      id="mantle-target-temperature"
                      max="450"
                      min="25"
                      onChange={(event) => setMantleTargetTemperature(event.target.value)}
                      onBlur={commitMantleTargetTemperature}
                      step="1"
                      type="number"
                      value={
                        mantleTargetDraft?.id === activeItem.id
                          ? mantleTargetDraft.value
                          : ((activeItem.targetTemperatureKelvin ?? 373.15) - 273.15).toFixed(0)
                      }
                    />
                    <span>°C</span>
                  </div>
                  <button
                    aria-pressed={Boolean(activeItem.isOn)}
                    className={`mantle-power-button${activeItem.isOn ? " mantle-power-on" : ""}`}
                    onClick={() => updateHeatingMantle({ isOn: !activeItem.isOn })}
                    type="button"
                  >
                    {activeItem.isOn ? "Turn heating off" : "Turn heating on"}
                  </button>
                  <p className="mantle-help">
                    Heats connected flask contents at up to 3 °C/s, stopping at the target.
                  </p>
                </div>
              </>
            ) : activeItem.kind === "iceBath" ? (
              <>
                <div className="vessel-summary">
                  <div className="vessel-icon ice-bath-icon" aria-hidden="true">❄</div>
                  <div>
                    <div className="summary-title">Ice bath</div>
                    <div className="summary-subtitle">
                      {activeItem.groupId ? "Vessel cooling" : "No vessel placed"}
                    </div>
                  </div>
                  <span className="vessel-status mantle-status-on"><i /> 0 °C</span>
                </div>
                <div className="mantle-controls">
                  <p className="mantle-help">
                    Cools beakers and flasks at {ICE_BATH_COOLING_POWER_WATTS} W until their
                    contents reach {ICE_BATH_TARGET_TEMPERATURE_K - 273.15} °C.
                  </p>
                </div>
              </>
            ) : activeItem.kind === "condenser" ? (
              <>
                <div className="vessel-summary">
                  <div className="vessel-icon" aria-hidden="true">
                    <Image alt="" height={30} src={CONDENSER_DEFINITION.asset} width={30} />
                  </div>
                  <div>
                    <div className="summary-title">Condenser</div>
                    <div className="summary-subtitle">
                      {activeItem.groupId ? "Connected" : "No joint connected"}
                    </div>
                  </div>
                  <span className={`vessel-status${activeItem.isOn ? " mantle-status-on" : ""}`}>
                    <i /> {activeItem.isOn ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="mantle-controls">
                  <button
                    aria-pressed={Boolean(activeItem.isOn)}
                    className={`mantle-power-button${activeItem.isOn ? " mantle-power-on" : ""}`}
                    onClick={() =>
                      setSceneItems((items) =>
                        items.map((item) =>
                          item.id === activeItem.id ? { ...item, isOn: !item.isOn } : item,
                        ),
                      )
                    }
                    type="button"
                  >
                    {activeItem.isOn ? "Turn condenser off" : "Turn condenser on"}
                  </button>
                  <p className="mantle-help">
                    The condenser state does not change its displayed asset.
                  </p>
                </div>
              </>
            ) : isTJoint(activeItem) ? (
              <div className="vessel-summary">
                <div className="vessel-icon" aria-hidden="true">
                  <Image alt="" height={30} src={T_JOINT_DEFINITION.asset} width={30} />
                </div>
                <div>
                  <div className="summary-title">T joint</div>
                  <div className="summary-subtitle">
                    {activeItem.groupId ? "Connected" : "Standalone"}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="vessel-summary">
                  <div className="vessel-icon" aria-hidden="true">
                    <Image alt="" height={30} src={itemTypes[activeItem.kind].asset} width={30} />
                  </div>
                  <div>
                    <div className="summary-title">Mixture container</div>
                    <div className="summary-subtitle">Glassware · {activeItem.groupId ? "Linked" : "Standalone"}</div>
                  </div>
                </div>

                {activeMolecule && <MoleculeViewer molecule={activeMolecule} />}

                <div className="contents-heading">
                  <div>
                    <h3>Contents</h3>
                    <p>Current mixture in this vessel</p>
                  </div>
                  <span className="content-count">{String(inspectorContents.length).padStart(2, "0")}</span>
                </div>

                {inspectorContents.length ? (
                  <div className="contents-list">
                    {inspectorContents.map((entry) => (
                      <button
                        className={`molecule-card${activeMolecule === entry.molecule ? " molecule-card-selected" : ""}`}
                        key={`${entry.molecule.canonicalSmiles}-${entry.state}`}
                        onClick={() => setSelectedMoleculeSmiles(entry.molecule.canonicalSmiles)}
                        type="button"
                      >
                        <div className="molecule-name-row">
                          <span className="molecule-name">{entry.molecule.name}</span>
                          <span className="phase-tag">{getStateSymbol(entry.state)}</span>
                        </div>
                        <div className="smiles-label">CANONICAL SMILES</div>
                        <code className="smiles-value">{entry.molecule.canonicalSmiles}</code>
                        <div className="amount-row">
                          <span>Amount</span>
                          <strong>{formatMoles(entry.moles)} <small>mol</small></strong>
                        </div>
                        <div className="molecular-mass-row">
                          <span>Molecular mass</span>
                          <strong>{entry.molecule.molecularMass.toFixed(2)} <small>g/mol</small></strong>
                        </div>
                        <div
                          className="molecular-mass-row"
                          title={getNormalBoilingPoint(entry.molecule)?.method ?? "No estimate available"}
                        >
                          <span>Est. normal boiling point</span>
                          <strong>
                            {getNormalBoilingPoint(entry.molecule)
                              ? `${(getNormalBoilingPoint(entry.molecule).temperatureKelvin - 273.15).toFixed(1)}`
                              : "—"}{" "}
                            {getNormalBoilingPoint(entry.molecule) && <small>°C</small>}
                          </strong>
                        </div>
                        <div className="molecular-mass-row">
                          <span>Concentration</span>
                          <strong>
                            {liquidVolumeLiters > 0
                              ? (
                                  activeItem.container.contents
                                    .filter(
                                      (content) =>
                                        content.molecule.canonicalSmiles ===
                                        entry.molecule.canonicalSmiles,
                                    )
                                    .reduce((sum, content) => sum + content.moles, 0) /
                                  liquidVolumeLiters
                                ).toPrecision(4)
                              : "—"}{" "}
                            <small>mol/L</small>
                          </strong>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon" aria-hidden="true">⌬</span>
                    <strong>No displayable contents</strong>
                    <span>Molecules below 0.001 mol are hidden from the inspector.</span>
                  </div>
                )}

                <div className="inspector-actions">
                  <button className="add-content-button" onClick={addBenzene} type="button">
                    <span aria-hidden="true">+</span> Add 0.25 mol benzene
                  </button>
                  <button
                    className="custom-molecule-button"
                    onClick={() => {
                      setShowCustomForm((shown) => !shown);
                      setCustomError("");
                    }}
                    type="button"
                  >
                    <span aria-hidden="true">+</span> Add custom molecule
                  </button>
                  {activeItem.container.contents.length > 0 && (
                    <button className="remove-content-button" onClick={removeBenzene} type="button">
                      Remove 0.25 mol
                    </button>
                  )}
                </div>

                {showCustomForm && (
                  <form className="custom-molecule-form" onSubmit={addCustomMolecule}>
                    <label htmlFor="custom-smiles">SMILES representation</label>
                    <input
                      autoComplete="off"
                      id="custom-smiles"
                      onChange={(event) => setCustomSmiles(event.target.value)}
                      placeholder="e.g. CCO"
                      value={customSmiles}
                    />
                    <label htmlFor="custom-molecule-name">Name (optional)</label>
                    <input
                      autoComplete="off"
                      id="custom-molecule-name"
                      onChange={(event) => setCustomMoleculeName(event.target.value)}
                      placeholder="Uses formula if left blank"
                      value={customMoleculeName}
                    />
                    <label htmlFor="custom-molecule-amount">Amount to add (mol)</label>
                    <input
                      autoComplete="off"
                      id="custom-molecule-amount"
                      min="0"
                      onChange={(event) => setCustomMoleculeAmount(event.target.value)}
                      required
                      step="any"
                      type="number"
                      value={customMoleculeAmount}
                    />
                    {customError && <div className="custom-smiles-error" role="alert">{customError}</div>}
                    <button className="add-content-button" type="submit">
                      Add {customMoleculeAmount || "0"} mol
                    </button>
                  </form>
                )}

                <div className="mixture-readings">
                  <div>
                    <span>TOTAL AMOUNT</span>
                    <strong>{formatMoles(totalMoles)} <small>mol</small></strong>
                  </div>
                  <div>
                    <span>TOTAL MASS</span>
                    <strong>{totalMass.toFixed(2)} <small>g</small></strong>
                  </div>
                  <div>
                    <span>TOTAL VOLUME</span>
                    <strong>{totalVolume.toFixed(2)} <small>cm³</small></strong>
                  </div>
                  <div>
                    <span>TEMPERATURE</span>
                    <strong>
                      {(activeItem.container.temperatureKelvin - 273.15).toFixed(1)} <small>°C</small>
                    </strong>
                  </div>
                </div>
              </>
            )) : (
              <div className="empty-inspector">Select a vessel in the scene to inspect its mixture.</div>
            )}
          </aside>
        </div>

      </section>
    </main>
  );
}
