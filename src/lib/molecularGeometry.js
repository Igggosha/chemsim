import { Atom, Elements } from "./chemistry.js";

const BOND_LENGTH = 1.35;
const GEOMETRY_ITERATIONS = 180;

function add(first, second) {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function subtract(first, second) {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function dot(first, second) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function cross(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return scale(vector, 1 / length);
}

function rotateVector(vector, axis, angle) {
  const unitAxis = normalize(axis);
  return add(
    add(scale(vector, Math.cos(angle)), scale(cross(unitAxis, vector), Math.sin(angle))),
    scale(unitAxis, dot(unitAxis, vector) * (1 - Math.cos(angle))),
  );
}

function alignedDirections(directions, target) {
  if (!directions.length) return [];
  const source = normalize(directions[0]);
  const destination = normalize(target);
  const axis = cross(source, destination);
  const axisLength = Math.hypot(...axis);

  if (axisLength < 1e-6) {
    if (dot(source, destination) > 0) return directions;
    const perpendicular = normalize(cross(source, [0, 0, 1]));
    return directions.map((direction) => rotateVector(direction, perpendicular, Math.PI));
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, dot(source, destination))));
  return directions.map((direction) => rotateVector(direction, axis, angle));
}

function trigonalBipyramidal() {
  const z = Math.sqrt(2 / 3);
  return [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-0.5, Math.sqrt(3) / 2, 0],
    [-0.5, -Math.sqrt(3) / 2, 0],
  ].map(normalize);
}

function octahedral() {
  return [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
}

function domainDirections(domainCount) {
  if (domainCount <= 1) return [[1, 0, 0]];
  if (domainCount === 2) return [[1, 0, 0], [-1, 0, 0]];
  if (domainCount === 3) {
    return [
      [1, 0, 0],
      [-0.5, Math.sqrt(3) / 2, 0],
      [-0.5, -Math.sqrt(3) / 2, 0],
    ];
  }
  if (domainCount === 4) {
    return [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ].map(normalize);
  }
  if (domainCount === 5) return trigonalBipyramidal();
  return octahedral();
}

function neighborCount(atom, atomIndex, bonds) {
  return bonds.filter((bond) => bond.from === atomIndex || bond.to === atomIndex).length + atom.implicitHydrogens;
}

export function getVseprShape(atom, bonds, atomIndex = 0) {
  const bondingDomains = neighborCount(atom, atomIndex, bonds);
  const bondingElectrons = bonds
    .filter((bond) => bond.from === atomIndex || bond.to === atomIndex)
    .reduce((sum, bond) => sum + bond.order, 0) + atom.implicitHydrogens;
  const lonePairs = Math.max(
    0,
    Math.floor((atom.element.outerShellElectrons - atom.formalCharge - bondingElectrons) / 2),
  );
  const domains = bondingDomains + lonePairs;

  let shape = "unknown";
  if (domains === 2) shape = "linear";
  else if (domains === 3) shape = lonePairs === 1 ? "bent" : "trigonal planar";
  else if (domains === 4) {
    shape = lonePairs === 0 ? "tetrahedral" : lonePairs === 1 ? "trigonal pyramidal" : "bent";
  } else if (domains === 5) {
    shape = ["trigonal bipyramidal", "seesaw", "T-shaped", "linear"][Math.min(lonePairs, 3)];
  } else if (domains === 6) {
    shape = ["octahedral", "square pyramidal", "square planar"][Math.min(lonePairs, 2)];
  }

  return { bondingDomains, lonePairs, domains, shape };
}

function createGraph(molecule) {
  const bonds = molecule.bonds.map((bond) => ({ ...bond }));
  const sourceAtoms = molecule.atoms;
  const graphAtoms = sourceAtoms.map((atom, sourceIndex) => ({ atom, sourceIndex }));

  for (const atom of sourceAtoms) {
    const sourceIndex = sourceAtoms.indexOf(atom);
    for (let hydrogen = 0; hydrogen < atom.implicitHydrogens; hydrogen += 1) {
      const hydrogenIndex = graphAtoms.length;
      graphAtoms.push({ atom: new Atom(Elements.H, { id: `${atom.id ?? sourceIndex}-H${hydrogen + 1}` }), sourceIndex: null });
      bonds.push({ from: sourceIndex, to: hydrogenIndex, order: 1, aromatic: false });
    }
  }

  const adjacency = graphAtoms.map(() => []);
  bonds.forEach((bond, bondIndex) => {
    adjacency[bond.from].push({ atomIndex: bond.to, bondIndex });
    adjacency[bond.to].push({ atomIndex: bond.from, bondIndex });
  });

  return { atoms: graphAtoms, bonds, adjacency };
}

function cyclicBlocks(graph) {
  const discovery = new Array(graph.atoms.length).fill(-1);
  const low = new Array(graph.atoms.length).fill(-1);
  const edgeStack = [];
  const blocks = [];
  let time = 0;

  function visit(atomIndex, parentBondIndex = -1) {
    discovery[atomIndex] = time;
    low[atomIndex] = time;
    time += 1;

    for (const neighbor of graph.adjacency[atomIndex]) {
      if (neighbor.bondIndex === parentBondIndex) continue;
      if (discovery[neighbor.atomIndex] === -1) {
        edgeStack.push([atomIndex, neighbor.atomIndex, neighbor.bondIndex]);
        visit(neighbor.atomIndex, neighbor.bondIndex);
        low[atomIndex] = Math.min(low[atomIndex], low[neighbor.atomIndex]);

        if (low[neighbor.atomIndex] >= discovery[atomIndex]) {
          const atoms = new Set();
          let edge;
          do {
            edge = edgeStack.pop();
            atoms.add(edge[0]);
            atoms.add(edge[1]);
          } while (edge[2] !== neighbor.bondIndex);

          const atomIndices = [...atoms];
          const atomSet = new Set(atomIndices);
          const edgeCount = graph.bonds.reduce(
            (count, bond) =>
              count + (atomSet.has(bond.from) && atomSet.has(bond.to) ? 1 : 0),
            0,
          );
          if (atomIndices.length >= 3 && edgeCount >= atomIndices.length) {
            blocks.push({ atoms: atomIndices, edgeCount });
          }
        }
      } else if (discovery[neighbor.atomIndex] < discovery[atomIndex]) {
        edgeStack.push([atomIndex, neighbor.atomIndex, neighbor.bondIndex]);
        low[atomIndex] = Math.min(low[atomIndex], discovery[neighbor.atomIndex]);
      }
    }
  }

  for (let atomIndex = 0; atomIndex < graph.atoms.length; atomIndex += 1) {
    if (discovery[atomIndex] === -1) visit(atomIndex);
  }

  return blocks;
}

function orderSimpleCycle(graph, block) {
  const atomSet = new Set(block.atoms);
  if (
    block.atoms.some(
      (atomIndex) =>
        graph.adjacency[atomIndex].filter(({ atomIndex: neighbor }) => atomSet.has(neighbor)).length !== 2,
    )
  ) {
    return null;
  }

  const ordered = [];
  let previous = -1;
  let current = block.atoms[0];
  while (!ordered.includes(current)) {
    ordered.push(current);
    const next = graph.adjacency[current]
      .map(({ atomIndex }) => atomIndex)
      .find((atomIndex) => atomSet.has(atomIndex) && atomIndex !== previous && !ordered.includes(atomIndex));
    if (next === undefined) break;
    previous = current;
    current = next;
  }
  return ordered.length === block.atoms.length ? ordered : null;
}

function spectralBlockCoordinates(graph, block) {
  const atomIndices = block.atoms;
  const localIndex = new Map(atomIndices.map((atomIndex, index) => [atomIndex, index]));
  const size = atomIndices.length;
  const laplacian = Array.from({ length: size }, () => new Array(size).fill(0));

  atomIndices.forEach((atomIndex, index) => {
    graph.adjacency[atomIndex]
      .filter(({ atomIndex: neighbor }) => localIndex.has(neighbor))
      .forEach(({ atomIndex: neighbor }) => {
        const adjacentIndex = localIndex.get(neighbor);
        laplacian[index][index] += 1;
        laplacian[index][adjacentIndex] -= 1;
      });
  });

  const eigenvectors = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
  for (let iteration = 0; iteration < size * size * 50; iteration += 1) {
    let first = 0;
    let second = 1;
    let largest = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        if (Math.abs(laplacian[row][column]) > largest) {
          largest = Math.abs(laplacian[row][column]);
          first = row;
          second = column;
        }
      }
    }
    if (largest < 1e-10) break;

    const difference = (laplacian[second][second] - laplacian[first][first]) /
      (2 * laplacian[first][second]);
    const tangent =
      Math.sign(difference || 1) / (Math.abs(difference) + Math.sqrt(1 + difference * difference));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;
    const firstDiagonal = laplacian[first][first];
    const secondDiagonal = laplacian[second][second];
    const crossTerm = laplacian[first][second];

    laplacian[first][first] = firstDiagonal - tangent * crossTerm;
    laplacian[second][second] = secondDiagonal + tangent * crossTerm;
    laplacian[first][second] = 0;
    laplacian[second][first] = 0;
    for (let index = 0; index < size; index += 1) {
      if (index !== first && index !== second) {
        const firstValue = laplacian[index][first];
        const secondValue = laplacian[index][second];
        laplacian[index][first] = cosine * firstValue - sine * secondValue;
        laplacian[first][index] = laplacian[index][first];
        laplacian[index][second] = sine * firstValue + cosine * secondValue;
        laplacian[second][index] = laplacian[index][second];
      }
      const firstVector = eigenvectors[index][first];
      const secondVector = eigenvectors[index][second];
      eigenvectors[index][first] = cosine * firstVector - sine * secondVector;
      eigenvectors[index][second] = sine * firstVector + cosine * secondVector;
    }
  }

  const dimensions = atomIndices.every((atomIndex) => graph.atoms[atomIndex].atom.aromatic) ? 2 : 3;
  const modes = Array.from({ length: size }, (_, index) => index)
    .sort((first, second) => laplacian[first][first] - laplacian[second][second])
    .slice(1, dimensions + 1);
  const coordinates = new Map(
    atomIndices.map((atomIndex, index) => [
      atomIndex,
      [0, 1, 2].map((axis) => eigenvectors[index][modes[axis]] ?? 0),
    ]),
  );
  const edgeLengths = [];
  atomIndices.forEach((atomIndex) => {
    for (const { atomIndex: neighbor } of graph.adjacency[atomIndex]) {
      if (atomIndex < neighbor && localIndex.has(neighbor)) {
        edgeLengths.push(Math.hypot(...subtract(coordinates.get(atomIndex), coordinates.get(neighbor))));
      }
    }
  });
  const meanLength = edgeLengths.reduce((sum, length) => sum + length, 0) / edgeLengths.length;
  const factor = meanLength ? BOND_LENGTH / meanLength : BOND_LENGTH;
  coordinates.forEach((position, atomIndex) => coordinates.set(atomIndex, scale(position, factor)));
  return coordinates;
}

function ringCoordinates(graph, ring) {
  const ringAtoms = new Set(ring);
  const ringEdges = [];
  ring.forEach((atomIndex) => {
    for (const { atomIndex: neighbor } of graph.adjacency[atomIndex]) {
      if (ringAtoms.has(neighbor) && atomIndex < neighbor) ringEdges.push([atomIndex, neighbor]);
    }
  });

  const positions = new Map();
  const radius = BOND_LENGTH / (2 * Math.sin(Math.PI / ring.length));
  const flexibleRing =
    ring.every((atomIndex) => !graph.atoms[atomIndex].atom.aromatic) &&
    ringEdges.every(([first, second]) =>
      graph.adjacency[first].some(
        ({ atomIndex, bondIndex }) => atomIndex === second && graph.bonds[bondIndex].order === 1,
      ),
    );
  const puckeringAmplitude = flexibleRing && ring.length >= 5 ? 0.42 * Math.sqrt(ring.length / 6) : 0;
  const puckeringMode = Math.floor(ring.length / 2);
  ring.forEach((atomIndex, index) => {
    const angle = (2 * Math.PI * index) / ring.length;
    const puckering = Math.cos(puckeringMode * angle);
    positions.set(atomIndex, [
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      puckeringAmplitude * puckering,
    ]);
  });
  const targetZ = new Map([...positions].map(([atomIndex, position]) => [atomIndex, position[2]]));

  for (let iteration = 0; iteration < GEOMETRY_ITERATIONS; iteration += 1) {
    let maximumChange = 0;
    const relaxed = new Map(positions);

    for (const atomIndex of ring) {
      const current = positions.get(atomIndex);
      const neighbors = graph.adjacency[atomIndex]
        .map(({ atomIndex: neighbor }) => neighbor)
        .filter((neighbor) => ringAtoms.has(neighbor))
        .map((neighbor) => positions.get(neighbor));
      if (neighbors.length !== 2) continue;

      let gradient = [0, 0, 0];
      for (const neighbor of neighbors) {
        const offset = subtract(current, neighbor);
        const length = Math.hypot(...offset) || 1;
        gradient = add(gradient, scale(offset, (length - BOND_LENGTH) / length));
      }
      gradient[2] += (current[2] - targetZ.get(atomIndex)) * 0.4;

      const change = scale(gradient, 0.12);
      maximumChange = Math.max(maximumChange, Math.hypot(...change));
      relaxed.set(atomIndex, subtract(current, change));
    }

    for (const [first, second] of ringEdges) {
      const firstPosition = relaxed.get(first);
      const secondPosition = relaxed.get(second);
      const vector = subtract(secondPosition, firstPosition);
      const length = Math.hypot(...vector) || 1;
      const correction = scale(vector, ((length - BOND_LENGTH) * 0.5) / length);
      relaxed.set(first, add(firstPosition, correction));
      relaxed.set(second, subtract(secondPosition, correction));
    }

    for (const atomIndex of ring) positions.set(atomIndex, relaxed.get(atomIndex));
    if (maximumChange < 1e-5) break;
  }

  return positions;
}

function relaxBondLengths(positions, bonds) {
  for (let iteration = 0; iteration < GEOMETRY_ITERATIONS; iteration += 1) {
    let maximumError = 0;
    for (const bond of bonds) {
      const first = positions[bond.from];
      const second = positions[bond.to];
      const vector = subtract(second, first);
      const length = Math.hypot(...vector) || 1;
      const error = length - BOND_LENGTH;
      maximumError = Math.max(maximumError, Math.abs(error));
      const correction = scale(vector, error / (2 * length));
      positions[bond.from] = add(first, correction);
      positions[bond.to] = subtract(second, correction);
    }
    if (maximumError < 1e-4) break;
  }
}

function findRotatableBonds(graph) {
  const rotatableBonds = [];
  graph.bonds.forEach((bond, bondIndex) => {
    if (bond.order !== 1 || graph.atoms[bond.from].atom.element.symbol === "H" ||
        graph.atoms[bond.to].atom.element.symbol === "H") {
      return;
    }

    const firstSide = new Set([bond.from]);
    const pending = [bond.from];
    while (pending.length) {
      const current = pending.pop();
      graph.adjacency[current].forEach(({ atomIndex, bondIndex: adjacentBond }) => {
        if (adjacentBond === bondIndex || firstSide.has(atomIndex)) return;
        firstSide.add(atomIndex);
        pending.push(atomIndex);
      });
    }
    if (firstSide.has(bond.to)) return;

    const secondSide = new Set(graph.atoms.map((_, index) => index).filter((index) => !firstSide.has(index)));
    const moved = firstSide.size <= secondSide.size ? firstSide : secondSide;
    const stationaryAtom = moved.has(bond.from) ? bond.to : bond.from;
    const movingAtom = moved.has(bond.from) ? bond.from : bond.to;
    if (moved.size <= 1 || moved.size >= graph.atoms.length) return;

    rotatableBonds.push({ moved, stationaryAtom, movingAtom });
  });
  return rotatableBonds;
}

function createStericPairs(graph, cycleMemberships) {
  const radii = {
    H: 0.72,
    C: 1,
    N: 0.95,
    O: 0.9,
    F: 0.85,
    Cl: 1.05,
    Br: 1.1,
    I: 1.15,
  };
  const pairs = [];

  for (let first = 0; first < graph.atoms.length; first += 1) {
    const oneTwoNeighbors = new Set(
      graph.adjacency[first].map(({ atomIndex }) => atomIndex),
    );
    const oneThreeNeighbors = new Set(
      graph.adjacency[first].flatMap(({ atomIndex }) =>
        graph.adjacency[atomIndex].map(({ atomIndex: second }) => second),
      ),
    );
    for (let second = first + 1; second < graph.atoms.length; second += 1) {
      if (
        oneTwoNeighbors.has(second) ||
        oneThreeNeighbors.has(second) ||
        cycleMemberships[first].some((blockIndex) => cycleMemberships[second].includes(blockIndex))
      ) {
        continue;
      }
      const firstSymbol = graph.atoms[first].atom.element.symbol;
      const secondSymbol = graph.atoms[second].atom.element.symbol;
      pairs.push({
        first,
        second,
        contactDistance: (radii[firstSymbol] ?? 1) + (radii[secondSymbol] ?? 1),
        weight: firstSymbol === "H" || secondSymbol === "H" ? 0.3 : 1,
      });
    }
  }
  return pairs;
}

function nonbondedRepulsion(positions, pairs) {
  let energy = 0;
  for (const { first, second, contactDistance, weight } of pairs) {
    const distance = Math.hypot(...subtract(positions[first], positions[second]));
    const overlap = contactDistance - distance;
    if (overlap > 0) energy += overlap * overlap * (1 + overlap * 2) * weight;
  }
  return energy;
}

function relaxStericContacts(positions, graph, stericPairs, cycleMemberships) {
  const relaxed = positions.map((position) => position.slice());
  const reference = positions.map((position) => position.slice());
  const fixedAtoms = new Set(
    cycleMemberships.flatMap((memberships, atomIndex) =>
      memberships.length ? [atomIndex] : [],
    ),
  );

  for (let iteration = 0; iteration < 150; iteration += 1) {
    const changes = graph.atoms.map(() => [0, 0, 0]);
    for (const { first, second, contactDistance, weight } of stericPairs) {
      const vector = subtract(relaxed[first], relaxed[second]);
      const distance = Math.hypot(...vector) || 1e-6;
      const overlap = contactDistance - distance;
      if (overlap <= 0) continue;

      const firstMovable = !fixedAtoms.has(first);
      const secondMovable = !fixedAtoms.has(second);
      if (!firstMovable && !secondMovable) continue;
      const fraction = 0.2 * weight;
      const firstShare = firstMovable ? (secondMovable ? 0.5 : 1) : 0;
      const secondShare = secondMovable ? (firstMovable ? 0.5 : 1) : 0;
      const correction = scale(vector, (overlap * fraction) / distance);
      changes[first] = add(changes[first], scale(correction, firstShare));
      changes[second] = subtract(changes[second], scale(correction, secondShare));
    }

    relaxed.forEach((position, atomIndex) => {
      if (fixedAtoms.has(atomIndex)) return;
      relaxed[atomIndex] = add(
        add(position, changes[atomIndex]),
        scale(subtract(reference[atomIndex], position), 0.002),
      );
    });

    for (const bond of graph.bonds) {
      const first = relaxed[bond.from];
      const second = relaxed[bond.to];
      const vector = subtract(second, first);
      const length = Math.hypot(...vector) || 1e-6;
      const error = length - BOND_LENGTH;
      const firstMovable = !fixedAtoms.has(bond.from);
      const secondMovable = !fixedAtoms.has(bond.to);
      if (!firstMovable && !secondMovable) continue;
      const firstShare = firstMovable ? (secondMovable ? 0.5 : 1) : 0;
      const secondShare = secondMovable ? (firstMovable ? 0.5 : 1) : 0;
      const correction = scale(vector, error / length);
      relaxed[bond.from] = add(first, scale(correction, firstShare));
      relaxed[bond.to] = subtract(second, scale(correction, secondShare));
    }
  }

  for (let iteration = 0; iteration < 40; iteration += 1) {
    let maximumError = 0;
    for (const bond of graph.bonds) {
      const first = relaxed[bond.from];
      const second = relaxed[bond.to];
      const vector = subtract(second, first);
      const length = Math.hypot(...vector) || 1e-6;
      const error = length - BOND_LENGTH;
      maximumError = Math.max(maximumError, Math.abs(error));
      const firstMovable = !fixedAtoms.has(bond.from);
      const secondMovable = !fixedAtoms.has(bond.to);
      if (!firstMovable && !secondMovable) continue;
      const firstShare = firstMovable ? (secondMovable ? 0.5 : 1) : 0;
      const secondShare = secondMovable ? (firstMovable ? 0.5 : 1) : 0;
      const correction = scale(vector, error / length);
      relaxed[bond.from] = add(first, scale(correction, firstShare));
      relaxed[bond.to] = subtract(second, scale(correction, secondShare));
    }
    if (maximumError < 1e-4) break;
  }

  return relaxed;
}

function rotateFragment(positions, movedAtoms, origin, axis, angle) {
  const updated = positions.slice();
  movedAtoms.forEach((atomIndex) => {
    updated[atomIndex] = add(
      origin,
      rotateVector(subtract(positions[atomIndex], origin), axis, angle),
    );
  });
  return updated;
}

function applyDoubleBondStereo(positions, graph) {
  const adjusted = positions.slice();

  graph.bonds.forEach((bond, bondIndex) => {
    if (bond.order !== 2 || !bond.stereo || bond.stereoRefs?.length !== 2) return;

    const moved = new Set([bond.to]);
    const pending = [bond.to];
    while (pending.length) {
      const current = pending.pop();
      graph.adjacency[current].forEach(({ atomIndex, bondIndex: adjacentBond }) => {
        if (adjacentBond === bondIndex || moved.has(atomIndex)) return;
        moved.add(atomIndex);
        pending.push(atomIndex);
      });
    }
    if (moved.has(bond.from)) return;

    const axis = normalize(subtract(adjusted[bond.to], adjusted[bond.from]));
    const projectPerpendicular = (vector) =>
      subtract(vector, scale(axis, dot(vector, axis)));
    const fromVector = projectPerpendicular(
      subtract(adjusted[bond.stereoRefs[0]], adjusted[bond.from]),
    );
    const toVector = projectPerpendicular(
      subtract(adjusted[bond.stereoRefs[1]], adjusted[bond.to]),
    );
    if (Math.hypot(...fromVector) < 1e-6 || Math.hypot(...toVector) < 1e-6) return;

    const desiredToVector = scale(
      normalize(fromVector),
      bond.stereo === "E" ? -1 : 1,
    );
    const angle = Math.atan2(
      dot(axis, cross(toVector, desiredToVector)),
      dot(toVector, desiredToVector),
    );
    const rotated = rotateFragment(
      adjusted,
      moved,
      adjusted[bond.to],
      axis,
      angle,
    );
    rotated.forEach((position, atomIndex) => {
      if (moved.has(atomIndex)) adjusted[atomIndex] = position;
    });
  });

  return adjusted;
}

function reduceStericClashes(positions, graph) {
  const rotatableBonds = findRotatableBonds(graph);
  const cycleMemberships = graph.atoms.map(() => []);
  cyclicBlocks(graph).forEach((block, blockIndex) => {
    block.atoms.forEach((atomIndex) => cycleMemberships[atomIndex].push(blockIndex));
  });
  const stericPairs = createStericPairs(graph, cycleMemberships);
  if (!stericPairs.length) return positions;
  let optimized = positions;
  let minimumEnergy = nonbondedRepulsion(optimized, stericPairs);
  const angleSteps = 36;

  for (let pass = 0; pass < 6 && rotatableBonds.length; pass += 1) {
    let improved = false;
    for (const { moved, stationaryAtom, movingAtom } of rotatableBonds) {
      const origin = optimized[stationaryAtom];
      const axis = subtract(optimized[movingAtom], origin);
      let bestPositions = optimized;
      let bestEnergy = minimumEnergy;

      for (let step = 0; step < angleSteps; step += 1) {
        const candidate = rotateFragment(
          optimized,
          moved,
          origin,
          axis,
          (2 * Math.PI * step) / angleSteps,
        );
        const energy = nonbondedRepulsion(candidate, stericPairs);
        if (energy < bestEnergy - 1e-8) {
          bestPositions = candidate;
          bestEnergy = energy;
        }
      }

      if (bestEnergy < minimumEnergy - 1e-8) {
        optimized = bestPositions;
        minimumEnergy = bestEnergy;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return relaxStericContacts(optimized, graph, stericPairs, cycleMemberships);
}

function atomLonePairs(atom, bondingElectrons) {
  return Math.max(
    0,
    Math.floor((atom.element.outerShellElectrons - atom.formalCharge - bondingElectrons) / 2),
  );
}

function bondDirections(atom, bondingDomains, bondingElectrons) {
  const lonePairs = atomLonePairs(atom, bondingElectrons);
  const domains = Math.max(1, Math.min(6, bondingDomains + lonePairs));
  return domainDirections(domains).slice(0, bondingDomains);
}

export function createMolecularGeometry(molecule) {
  const graph = createGraph(molecule);
  const positions = new Array(graph.atoms.length).fill(null);
  const blocks = cyclicBlocks(graph);
  const ringAtoms = new Set();
  const visited = new Set();

  blocks.forEach((block, blockIndex) => {
    const orderedRing = orderSimpleCycle(graph, block);
    const coordinates = orderedRing
      ? ringCoordinates(graph, orderedRing)
      : spectralBlockCoordinates(graph, block);
    const offset = [blockIndex * BOND_LENGTH * 2.8, 0, 0];
    block.atoms.forEach((atomIndex) => {
      if (!positions[atomIndex]) {
        positions[atomIndex] = add(coordinates.get(atomIndex), offset);
      }
      ringAtoms.add(atomIndex);
      visited.add(atomIndex);
    });
  });

  const components = [];
  for (let atomIndex = 0; atomIndex < graph.atoms.length; atomIndex += 1) {
    if (visited.has(atomIndex)) continue;
    const component = [];
    const pending = [atomIndex];
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      pending.push(...graph.adjacency[current].map(({ atomIndex: neighbor }) => neighbor));
    }
    components.push(component);
  }

  const positioned = new Set(ringAtoms);
  const pendingRingChildren = [];
  for (const atomIndex of ringAtoms) {
    const radial = normalize([positions[atomIndex][0], positions[atomIndex][1], 0]);
    const outside = graph.adjacency[atomIndex]
      .map(({ atomIndex: neighbor }) => neighbor)
      .filter((neighbor) => !ringAtoms.has(neighbor));
    outside.forEach((neighbor, index) => {
      const angle = outside.length > 1 ? ((index - (outside.length - 1) / 2) * Math.PI) / 4 : 0;
      const direction = normalize(rotateVector(radial, [0, 0, 1], angle));
      positions[neighbor] = add(positions[atomIndex], scale(direction, BOND_LENGTH));
      positioned.add(neighbor);
      pendingRingChildren.push({ atomIndex: neighbor, parentIndex: atomIndex, direction });
    });
  }

  function extendTree(atomIndex, parentIndex, parentDirection) {
    const neighbors = graph.adjacency[atomIndex]
      .map(({ atomIndex: neighbor }) => neighbor)
      .filter((neighbor) => neighbor !== parentIndex && !positioned.has(neighbor));
    if (!neighbors.length) return;

    const bondingElectrons = graph.adjacency[atomIndex].reduce(
      (sum, neighbor) => sum + graph.bonds[neighbor.bondIndex].order,
      0,
    );
    const outgoing = bondDirections(
      graph.atoms[atomIndex].atom,
      graph.adjacency[atomIndex].length,
      bondingElectrons,
    );
    const direction = alignedDirections(outgoing, scale(parentDirection, -1)).slice(1);
    neighbors.forEach((neighbor, index) => {
      const selected = direction[index] ?? normalize(cross(parentDirection, [0, 0, 1]));
      positions[neighbor] = add(positions[atomIndex], scale(selected, BOND_LENGTH));
      positioned.add(neighbor);
      extendTree(neighbor, atomIndex, selected);
    });
  }

  pendingRingChildren.forEach(({ atomIndex, parentIndex, direction }) =>
    extendTree(atomIndex, parentIndex, direction),
  );

  components.forEach((component, componentIndex) => {
    const root = component.reduce(
      (best, index) =>
        graph.adjacency[index].length > graph.adjacency[best].length ? index : best,
      component[0],
    );
    if (positions[root]) return;
    positions[root] = [componentIndex * 3.5, 0, 0];
    positioned.add(root);

    const bondingElectrons = graph.adjacency[root].reduce(
      (sum, neighbor) => sum + graph.bonds[neighbor.bondIndex].order,
      0,
    );
    const directions = bondDirections(graph.atoms[root].atom, graph.adjacency[root].length, bondingElectrons);
    graph.adjacency[root].forEach(({ atomIndex: neighbor }, index) => {
      if (positioned.has(neighbor)) return;
      const direction = directions[index] ?? [0, 0, 1];
      positions[neighbor] = add(positions[root], scale(direction, BOND_LENGTH));
      positioned.add(neighbor);
      extendTree(neighbor, root, direction);
    });
  });

  relaxBondLengths(positions, graph.bonds);
  const stereoPositions = applyDoubleBondStereo(positions, graph);
  const clashReducedPositions = applyDoubleBondStereo(
    reduceStericClashes(stereoPositions, graph),
    graph,
  );

  const validPositions = clashReducedPositions.filter(Boolean);
  const center = [0, 1, 2].map(
    (axis) => validPositions.reduce((sum, position) => sum + position[axis], 0) / validPositions.length,
  );

  return {
    atoms: graph.atoms.map(({ atom }, index) => ({
      atom,
      position: subtract(clashReducedPositions[index] ?? [0, 0, 0], center),
    })),
    bonds: graph.bonds,
    ringAtomIndices: [...ringAtoms],
    shapes: molecule.atoms.map((atom, index) => ({
      atomIndex: index,
      ...getVseprShape(atom, molecule.bonds, index),
    })),
  };
}
