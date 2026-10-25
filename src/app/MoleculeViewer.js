"use client";

import { useEffect, useMemo, useRef } from "react";
import { createMolecularGeometry } from "../lib/molecularGeometry";

function rgb(hex) {
  const value = hex.replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((digit) => digit + digit).join("") : value;
  const integer = Number.parseInt(expanded, 16);
  return [(integer >> 16) & 255, (integer >> 8) & 255, integer & 255];
}

function color(hex, factor = 1) {
  return `rgb(${rgb(hex).map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor)))).join(",")})`;
}

function rotate(point, rotation) {
  const [x, y, z] = point;
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const yawX = x * cosY - z * sinY;
  const yawZ = x * sinY + z * cosY;
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  return [yawX, y * cosX - yawZ * sinX, y * sinX + yawZ * cosX];
}

function atomRadius(atom) {
  const covalentRadius = {
    H: 0.24,
    C: 0.36,
    N: 0.34,
    O: 0.32,
    F: 0.3,
    Cl: 0.39,
    Br: 0.42,
    I: 0.46,
  }[atom.element.symbol] ?? 0.36;
  return covalentRadius * Math.cbrt(atom.element.atomicMass / 12.011);
}

export default function MoleculeViewer({ molecule }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const rotationRef = useRef({ x: -0.3, y: 0 });
  const geometry = useMemo(() => createMolecularGeometry(molecule), [molecule]);
  const mainShape = geometry.shapes[0]?.shape ?? "molecular geometry";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frameId;
    let lastTime = 0;
    let size = { width: 0, height: 0 };
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      size = { width: bounds.width, height: bounds.height };
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(size.width * ratio);
      const height = Math.round(size.height * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    const observer = new ResizeObserver(resizeCanvas);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    resizeCanvas();

    const draw = (time) => {
      frameId = window.requestAnimationFrame(draw);
      if (!size.width || !size.height) return;
      const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      if (!pointerRef.current) rotationRef.current.y += elapsed * 0.16;

      const pixelRatio = window.devicePixelRatio || 1;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size.width, size.height);

      const maxRadius = Math.max(
        1.4,
        ...geometry.atoms.map(({ position }) => Math.hypot(...position)),
      );
      const scaleFactor = Math.min(size.width, size.height) * 0.31 / maxRadius;
      const cameraDistance = maxRadius * 4.5 + 5;
      const project = (position) => {
        const rotated = rotate(position, rotationRef.current);
        const perspective = cameraDistance / (cameraDistance - rotated[2]);
        return {
          x: size.width / 2 + rotated[0] * scaleFactor * perspective,
          y: size.height / 2 + rotated[1] * scaleFactor * perspective,
          z: rotated[2],
          perspective,
        };
      };

      const projectedAtoms = geometry.atoms.map(({ atom, position }, index) => ({
        atom,
        index,
        ...project(position),
        radius: atomRadius(atom) * scaleFactor * project(position).perspective,
      }));
      const primitives = [];

      geometry.bonds.forEach((bond) => {
        const first = projectedAtoms[bond.from];
        const second = projectedAtoms[bond.to];
        if (!first || !second) return;
        const order = bond.order >= 2.5 ? 3 : bond.order >= 1.5 ? 2 : 1;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const length = Math.hypot(dx, dy) || 1;
        const perpendicular = [-dy / length, dx / length];
        const spacing = order > 1 ? 3 : 0;
        for (let line = 0; line < order; line += 1) {
          const offset = (line - (order - 1) / 2) * spacing;
          primitives.push({
            depth: (first.z + second.z) / 2,
            draw() {
              const startTrim = first.radius * 0.72;
              const endTrim = second.radius * 0.72;
              const startRatio = startTrim / length;
              const endRatio = 1 - endTrim / length;
              const startX = first.x + dx * startRatio + perpendicular[0] * offset;
              const startY = first.y + dy * startRatio + perpendicular[1] * offset;
              const endX = first.x + dx * endRatio + perpendicular[0] * offset;
              const endY = first.y + dy * endRatio + perpendicular[1] * offset;
              context.lineCap = "round";
              context.lineWidth = Math.max(2, Math.min(first.radius, second.radius) * 0.52);
              context.strokeStyle = "rgba(174, 190, 183, 0.78)";
              context.beginPath();
              context.moveTo(startX, startY);
              context.lineTo(endX, endY);
              context.stroke();
              context.lineWidth = 0.8;
              context.strokeStyle = "rgba(244, 248, 244, 0.48)";
              context.beginPath();
              context.moveTo(startX, startY - 0.8);
              context.lineTo(endX, endY - 0.8);
              context.stroke();
            },
          });
        }
      });

      projectedAtoms.forEach((projected) => {
        primitives.push({
          depth: projected.z + 0.001,
          draw() {
            const radius = Math.max(3, projected.radius);
            const elementColor = projected.atom.element.displayColour;
            const gradient = context.createRadialGradient(
              projected.x - radius * 0.32,
              projected.y - radius * 0.38,
              radius * 0.04,
              projected.x,
              projected.y,
              radius,
            );
            gradient.addColorStop(0, color(elementColor, 1.55));
            gradient.addColorStop(0.42, elementColor);
            gradient.addColorStop(1, color(elementColor, 0.47));
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = "rgba(231, 240, 234, 0.55)";
            context.lineWidth = 0.8;
            context.stroke();
            if (radius > 10) {
              context.fillStyle = projected.atom.element.symbol === "C" ? "#dbe6df" : "#17231f";
              context.font = `600 ${Math.max(7, Math.min(10, radius * 0.48))}px Arial`;
              context.textAlign = "center";
              context.textBaseline = "middle";
              context.fillText(projected.atom.element.symbol, projected.x, projected.y + 0.3);
            }
          },
        });
      });

      primitives.sort((first, second) => first.depth - second.depth).forEach(({ draw: render }) => render());
    };

    frameId = window.requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [geometry]);

  function handlePointerDown(event) {
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    rotationRef.current.y += (event.clientX - pointer.x) * 0.012;
    rotationRef.current.x = Math.max(
      -1.45,
      Math.min(1.45, rotationRef.current.x + (event.clientY - pointer.y) * 0.012),
    );
    pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
  }

  return (
    <section className="molecule-viewer" aria-label={`3D model of ${molecule.name}`}>
      <div className="molecule-viewer-heading">
        <div>
          <div className="smiles-label">MOLECULAR MODEL</div>
          <div className="viewer-caption">VSEPR · {mainShape.toUpperCase()}</div>
        </div>
        <span className="viewer-rotate-hint">DRAG TO ROTATE</span>
      </div>
      <canvas
        aria-label={`Rotating 3D molecule ${molecule.name}. Drag to rotate.`}
        className="molecule-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        ref={canvasRef}
        role="application"
        style={{ width: "100%", height: 174 }}
      />
      <div className="atom-legend">
        {[...new Set(geometry.atoms.map(({ atom }) => atom.element))].map((element) => (
          <span key={element.symbol}>
            <i style={{ backgroundColor: element.displayColour }} />
            {element.symbol}
          </span>
        ))}
      </div>
    </section>
  );
}
