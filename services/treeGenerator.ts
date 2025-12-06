import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { LetterMap, LetterPattern, TreeConfig } from '../types';

/**
 * A simple seeded random number generator.
 */
function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Generates smooth, continuous noise based on position.
 */
function continuousNoise(x: number, y: number, z: number, seed: number, amp: number) {
    const freq = 0.8;
    const val = Math.sin(x * freq + seed * 12.989) * 
                Math.cos(y * freq + seed * 78.233) * 
                Math.sin(z * freq + seed * 39.111);
    return val * amp;
}

/**
 * Helper to apply noise to a geometry's vertices.
 * Includes a 'safetyZone' to prevent noise from breaking connection points.
 */
function applyNoiseToGeometry(
    geometry: THREE.BufferGeometry, 
    roughness: number, 
    radius: number, 
    seedBase: number,
    safetyYRange?: { min: number, max: number } // Range where noise is dampened
) {
    if (roughness <= 0) return;

    const posAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const noiseAmp = roughness * radius * 0.5;

    for (let i = 0; i < posAttribute.count; i++) {
        vertex.fromBufferAttribute(posAttribute, i);

        let ampFactor = 1.0;
        if (safetyYRange) {
            // Calculate distance to safety range
            if (vertex.y >= safetyYRange.min && vertex.y <= safetyYRange.max) {
                ampFactor = 0.0; // No noise in safety zone
            } else {
                // Smooth transition out of safety zone (optional, but keeps mesh clean)
                const distMin = Math.abs(vertex.y - safetyYRange.min);
                const distMax = Math.abs(vertex.y - safetyYRange.max);
                const dist = Math.min(distMin, distMax);
                // Fade noise in over 0.5 units
                ampFactor = THREE.MathUtils.smoothstep(dist, 0, 0.5);
            }
        }

        if (ampFactor > 0.001) {
            const nx = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 1, noiseAmp);
            const ny = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 2, noiseAmp * 0.2); 
            const nz = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 3, noiseAmp);

            vertex.add(new THREE.Vector3(nx * ampFactor, ny * ampFactor, nz * ampFactor));
            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
    }
    geometry.computeVertexNormals();
}

/**
 * Caps the open ends of a TubeGeometry.
 */
function capTubeGeometry(geo: THREE.BufferGeometry, radialSegments: number, tubularSegments: number) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const ind = geo.index;
    if (!pos || !ind) return;

    const stride = radialSegments + 1;
    const numPoints = pos.count;
    const newNumPoints = numPoints + 2;
    const newNumIndices = ind.count + (radialSegments * 2 * 3);

    const newPosArr = new Float32Array(newNumPoints * 3);
    newPosArr.set(pos.array);

    const newIndArr = new Uint32Array(newNumIndices);
    newIndArr.set(ind.array);

    const getV = (idx: number) => new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx));

    // --- 1. Start Cap (Bottom) ---
    const startCenter = new THREE.Vector3();
    for(let i=0; i<radialSegments; i++) {
        startCenter.add(getV(i));
    }
    startCenter.divideScalar(radialSegments);

    const startIdx = numPoints;
    newPosArr[startIdx*3] = startCenter.x;
    newPosArr[startIdx*3+1] = startCenter.y;
    newPosArr[startIdx*3+2] = startCenter.z;

    // --- 2. End Cap (Top) ---
    const endCenter = new THREE.Vector3();
    const endOffset = tubularSegments * stride;
    for(let i=0; i<radialSegments; i++) {
        endCenter.add(getV(endOffset + i));
    }
    endCenter.divideScalar(radialSegments);

    const endIdx = numPoints + 1;
    newPosArr[endIdx*3] = endCenter.x;
    newPosArr[endIdx*3+1] = endCenter.y;
    newPosArr[endIdx*3+2] = endCenter.z;

    // --- 3. Add Indices for Caps ---
    let curInd = ind.count;

    for(let i=0; i<radialSegments; i++) {
        newIndArr[curInd++] = startIdx;
        newIndArr[curInd++] = i + 1;
        newIndArr[curInd++] = i;
    }

    for(let i=0; i<radialSegments; i++) {
        const r0 = endOffset + i;
        const r1 = endOffset + i + 1;
        newIndArr[curInd++] = endIdx;
        newIndArr[curInd++] = r0;
        newIndArr[curInd++] = r1;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(newPosArr, 3));
    geo.setIndex(new THREE.BufferAttribute(newIndArr, 1));
}

function prepareForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    geo.computeVertexNormals(); 
    if (geo.index) {
        return geo.toNonIndexed();
    }
    return geo;
}

function tracePaths(pattern: LetterPattern): string[][] {
    const segments: string[][] = [];
    const processedEdges = new Set<string>();
    const getOuts = (id: string) => pattern.connections.filter(c => c.from === id);

    const traverse = (startNodeId: string) => {
        const outs = getOuts(startNodeId);
        outs.forEach(conn => {
            const edgeId = `${conn.from}-${conn.to}`;
            if (processedEdges.has(edgeId)) return;
            processedEdges.add(edgeId);

            const path = [conn.from, conn.to];
            let curr = conn.to;

            while(true) {
                const nextOuts = getOuts(curr);
                if (nextOuts.length !== 1) break;
                const nextConn = nextOuts[0];
                const nextEdgeId = `${nextConn.from}-${nextConn.to}`;
                if (processedEdges.has(nextEdgeId)) break;

                processedEdges.add(nextEdgeId);
                path.push(nextConn.to);
                curr = nextConn.to;
            }
            segments.push(path);
            if (getOuts(curr).length > 0) {
                traverse(curr);
            }
        });
    };

    traverse('node-0');
    return segments;
}

/**
 * Generates a 3D tree group based on the input word and configuration.
 */
export const generateTree = (
  word: string,
  config: TreeConfig,
  patterns: LetterMap
): THREE.Group => {
  const group = new THREE.Group();
  const cleanWord = word.toUpperCase().replace(/[^A-Z]/g, '');

  if (cleanWord.length === 0) return group;

  const treeGeometries: THREE.BufferGeometry[] = [];
  const leafGeometries: THREE.BufferGeometry[] = [];

  // --- 1. Base Generation ---
  const baseRadius = config.baseRadius ?? (config.trunkRadius * 2.5);
  let baseGeometry: THREE.BufferGeometry;

  const moundHeight = baseRadius * 0.5;
  // Calculate the radius of the "flat top"
  // We want the top flat spot to be just slightly larger than the generic trunk radius
  // so the trunk sits comfortably on it.
  const flatTopRadius = config.trunkRadius * 1.1; // 10% larger than trunk

  let treeStartY = moundHeight;

  if (config.geometryStyle === 'organic') {
    const points: THREE.Vector2[] = [];
    // 0. Start at Center Bottom (0,0)
    points.push(new THREE.Vector2(0, 0));

    // 1. Flat Bottom to Rim (baseRadius, 0)
    points.push(new THREE.Vector2(baseRadius, 0));

    // 2. Curve up to the "Shoulder" (flatTopRadius, moundHeight)
    const steps = 16; 
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic curve from BaseRadius to FlatTopRadius
        // Using a Cosine ease to make it look mound-like
        const angle = (Math.PI / 2) * t; // 0 to 90 degrees

        // Interpolate X from BaseRadius down to FlatTopRadius
        // We use a power function on t to make the base wider at bottom
        const currentR = baseRadius - (baseRadius - flatTopRadius) * Math.sin(angle);
        const currentH = moundHeight * (1 - Math.cos(angle));

        points.push(new THREE.Vector2(currentR, currentH));
    }

    // 3. Flat Top (Center Top)
    // Closes the loop at the top center height
    points.push(new THREE.Vector2(0, moundHeight));

    baseGeometry = new THREE.LatheGeometry(points, 32);

    // Apply noise to base, BUT preserve the flat top and flat bottom
    if (config.roughness > 0) {
        // Safety range: Don't noise the very bottom (bed adhesion) or the very top (trunk connection)
        const safety = { min: moundHeight * 0.85, max: moundHeight * 2.0 }; 
        applyNoiseToGeometry(baseGeometry, config.roughness, baseRadius, 0, safety);
    }

    // Flatten the very bottom ring explicitly to y=0 in case noise leaked
    const pos = baseGeometry.attributes.position;
    for(let i=0; i<pos.count; i++) {
        if(pos.getY(i) < 0.1) pos.setY(i, 0);
    }
    baseGeometry.computeVertexNormals();

  } else {
    // Geometric: A simple cylinder with a flat top
    baseGeometry = new THREE.CylinderGeometry(flatTopRadius, baseRadius, moundHeight, 32, 1);
    // CylinderGeometry centers at 0, so we lift it up by half height to sit on 0
    baseGeometry.translate(0, moundHeight / 2, 0);
    treeStartY = moundHeight;
  }

  treeGeometries.push(prepareForMerge(baseGeometry));

  // --- 2. Root Trunk ---
  const rootLength = config.rootLength;
  const rootRadiusTop = config.trunkRadius * config.radiusDecay;

  // FIX: Explicit Overlap.
  // Trunk starts slightly BELOW the flat top of the base.
  // Base Top Y = moundHeight.
  // Trunk Bottom Y = moundHeight - 0.2.
  const overlap = 0.2;
  const trunkBottomY = treeStartY - overlap; 

  const trunkTopY = treeStartY + rootLength;
  const trunkHeight = trunkTopY - trunkBottomY;

  let trunkGeo: THREE.BufferGeometry;
  if (config.geometryStyle === 'organic') {
      trunkGeo = new THREE.CylinderGeometry(rootRadiusTop, config.trunkRadius, trunkHeight, 16, 8, false);

      // Important: Don't apply roughness to the bottom part of the trunk that mates with the base
      // This ensures the "peg" stays round and fits into the "hole" (or rather, merges cleanly with the flat top)
      const safety = { min: -trunkHeight/2 - 0.1, max: -trunkHeight/2 + 1.0 }; // Local coordinates
      applyNoiseToGeometry(trunkGeo, config.roughness, config.trunkRadius, 1, safety);

  } else {
      trunkGeo = new THREE.CylinderGeometry(rootRadiusTop, config.trunkRadius, trunkHeight, 12, 1, false);
  }

  // Align trunk center
  const trunkCenterY = trunkBottomY + (trunkHeight / 2);
  trunkGeo.translate(0, trunkCenterY, 0);
  treeGeometries.push(prepareForMerge(trunkGeo));

  const startY = trunkTopY;

  // --- 3. Leaf Geometry ---
  let leafGeoTemplate: THREE.BufferGeometry | null = null;
  if (config.showLeaves) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.2, 0.2, 0.2, 0.8, 0, 1.2); 
      shape.bezierCurveTo(-0.2, 0.8, -0.2, 0.2, 0, 0);

      leafGeoTemplate = new THREE.ExtrudeGeometry(shape, {
        depth: 0.05 * config.leafSize,
        bevelEnabled: true,
        bevelThickness: 0.02 * config.leafSize,
        bevelSize: 0.01 * config.leafSize,
        bevelSegments: 1
      });
      leafGeoTemplate.computeBoundingBox();
      const bb = leafGeoTemplate.boundingBox!;
      leafGeoTemplate.translate(
          -(bb.max.x + bb.min.x) / 2, 
          -bb.min.y, 
          -(bb.max.z + bb.min.z) / 2
      );
  }


  // --- 4. Recursive Builder ---
  const buildLevel = (
    parentMatrix: THREE.Matrix4,
    depth: number,
    radius: number,
    lengthScale: number
  ) => {
    if (depth >= cleanWord.length) return;

    const char = cleanWord[depth];
    const pattern = patterns[char];
    if (!pattern) return;

    const helixRot = new THREE.Matrix4().makeRotationY(
      THREE.MathUtils.degToRad(config.helixAngle * depth)
    );
    const levelScale = lengthScale * config.trunkLength * 0.2;

    const nodeWorldPositions = new Map<string, THREE.Vector3>();
    const startPos = new THREE.Vector3(0,0,0).applyMatrix4(parentMatrix);
    nodeWorldPositions.set('node-0', startPos);

    const queue = ['node-0'];
    const visited = new Set<string>(['node-0']);

    const adj: Record<string, string[]> = {};
    pattern.connections.forEach(c => {
        if(!adj[c.from]) adj[c.from] = [];
        adj[c.from].push(c.to);
    });

    while (queue.length > 0) {
        const currId = queue.shift()!;
        const currPos = nodeWorldPositions.get(currId)!;
        const neighbors = adj[currId] || [];

        neighbors.forEach(nextId => {
            if (visited.has(nextId)) return;
            const nextNodeDef = pattern.nodes.find(n => n.id === nextId);
            const currNodeDef = pattern.nodes.find(n => n.id === currId);

            if (nextNodeDef && currNodeDef) {
                const localDelta = new THREE.Vector3(
                    nextNodeDef.x - currNodeDef.x,
                    nextNodeDef.y - currNodeDef.y,
                    0
                ).multiplyScalar(levelScale);

                localDelta.applyMatrix4(helixRot);
                const worldDelta = localDelta.clone().transformDirection(parentMatrix);

                if (config.printable) {
                    if (worldDelta.y < 0) worldDelta.y = Math.abs(worldDelta.y) * 0.5;
                    const horizDist = Math.sqrt(worldDelta.x * worldDelta.x + worldDelta.z * worldDelta.z);
                    const maxAngleRad = THREE.MathUtils.degToRad(config.maxOverhang || 45);
                    const minVertical = horizDist / Math.tan(maxAngleRad);
                    if (worldDelta.y < minVertical) worldDelta.y = minVertical;
                } else if (config.forceUpwards > 0) {
                     worldDelta.lerp(new THREE.Vector3(0, 1, 0), config.forceUpwards);
                }

                const nextPos = currPos.clone().add(worldDelta);
                nodeWorldPositions.set(nextId, nextPos);
                visited.add(nextId);
                queue.push(nextId);
            }
        });
    }

    const paths = tracePaths(pattern);

    paths.forEach((pathNodeIds, pathIdx) => {
        const points: THREE.Vector3[] = [];
        pathNodeIds.forEach(nodeId => {
            const pos = nodeWorldPositions.get(nodeId);
            if (pos) points.push(pos);
        });

        if (points.length < 2) return;

        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'catmullrom';
        curve.tension = 0.5;

        const curveLength = curve.getLength();
        const tubularSegments = Math.max(8, Math.floor(curveLength * 5)); 
        const radialSegments = config.geometryStyle === 'organic' ? 12 : 8;

        const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
        capTubeGeometry(tubeGeo, radialSegments, tubularSegments);

        const seed = depth * 1000 + pathIdx;
        if (config.geometryStyle === 'organic') {
            applyNoiseToGeometry(tubeGeo, config.roughness, radius, seed);
        }

        treeGeometries.push(prepareForMerge(tubeGeo));

        const addJoint = (pos: THREE.Vector3, r: number, s: number) => {
            let jGeo: THREE.BufferGeometry;
            const jointRadius = r * 1.2; 
            if (config.geometryStyle === 'organic') {
                jGeo = new THREE.IcosahedronGeometry(jointRadius, 1);
                applyNoiseToGeometry(jGeo, config.roughness, r, s);
            } else {
                jGeo = new THREE.SphereGeometry(jointRadius, 16, 16);
            }
            jGeo.translate(pos.x, pos.y, pos.z);
            treeGeometries.push(prepareForMerge(jGeo));
        };

        addJoint(points[0], radius, seed + 100);
        addJoint(points[points.length - 1], radius, seed + 200);
        for(let i=1; i<points.length-1; i++) {
            addJoint(points[i], radius, seed + 100 + i);
        }
    });

    const exitNodes = pattern.nodes.filter(n => n.isExit);

    exitNodes.forEach((exitNode, exitIndex) => {
        const worldExitPos = nodeWorldPositions.get(exitNode.id);
        if (!worldExitPos) return;

        let tangent = new THREE.Vector3(0, 1, 0);
        const incoming = pattern.connections.find(c => c.to === exitNode.id);
        if (incoming) {
            const worldFromPos = nodeWorldPositions.get(incoming.from);
            if (worldFromPos) tangent.subVectors(worldExitPos, worldFromPos).normalize();
        }

        if (config.printable && tangent.y < 0) tangent.y = -tangent.y;

        const newParentMatrix = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        newParentMatrix.makeRotationFromQuaternion(q);

        if (config.rotationVariance > 0) {
            const seed = (depth + 1) * 7331 + exitIndex * 827;
            const rand = seededRandom(seed);
            const angleDeg = (rand - 0.5) * 2 * config.rotationVariance;
            newParentMatrix.multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(angleDeg)));
        }

        newParentMatrix.setPosition(worldExitPos);

        if (depth === cleanWord.length - 1 && config.showLeaves && leafGeoTemplate) {
            const seed = (depth + 1) * 9999 + exitIndex * 888;
            for(let l=0; l<3; l++) {
                 const leaf = leafGeoTemplate.clone();
                 const r1 = seededRandom(seed + l * 10);
                 const r2 = seededRandom(seed + l * 20);

                 if (config.printable) {
                    const heading = Math.atan2(tangent.x, tangent.z);
                    const angleOffset = (l / 3) * Math.PI * 2 + (r2 - 0.5); 
                    const angleY = heading + angleOffset;
                    const maxRad = THREE.MathUtils.degToRad(config.maxOverhang || 45);
                    const splay = THREE.MathUtils.degToRad(5) + r1 * (maxRad - THREE.MathUtils.degToRad(5));

                    const rotQ = new THREE.Quaternion();
                    rotQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
                    rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), splay));
                    leaf.applyQuaternion(rotQ);
                 } else {
                     const splay = (Math.PI / 4) + (r1 * 0.3);
                     const around = (l / 3) * Math.PI * 2 + (r2 * 0.5);
                     const rotQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), around);
                     rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), splay));
                     leaf.applyQuaternion(rotQ);
                     leaf.applyQuaternion(q);
                 }

                 const scale = config.leafSize * (0.8 + seededRandom(seed+l)*0.4);
                 leaf.scale(scale, scale, scale);
                 leaf.translate(worldExitPos.x, worldExitPos.y, worldExitPos.z);
                 leafGeometries.push(prepareForMerge(leaf));
            }
        }

        buildLevel(
            newParentMatrix,
            depth + 1,
            radius * config.radiusDecay,
            lengthScale * config.lengthDecay
        );
    });
  };

  const startMatrix = new THREE.Matrix4();
  startMatrix.setPosition(0, startY, 0);
  buildLevel(startMatrix, 0, rootRadiusTop, 1.0);

  let finalWoodGeometry: THREE.BufferGeometry | null = null;
  if (treeGeometries.length > 0) {
      try {
        finalWoodGeometry = mergeBufferGeometries(treeGeometries, false);
      } catch (e) {
          console.error("Failed to merge wood geometries", e);
      }
  }

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: config.geometryStyle === 'geometric'
  });

  if (finalWoodGeometry) {
      const mesh = new THREE.Mesh(finalWoodGeometry, woodMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
  }

  let finalLeafGeometry: THREE.BufferGeometry | null = null;
  if (leafGeometries.length > 0) {
      try {
        finalLeafGeometry = mergeBufferGeometries(leafGeometries, false);
      } catch (e) {
          console.error("Failed to merge leaf geometries", e);
      }
  }

  if (finalLeafGeometry) {
      const leafMat = new THREE.MeshStandardMaterial({
          color: config.leafColor,
          roughness: 0.8,
          side: THREE.DoubleSide
      });
      const leafMesh = new THREE.Mesh(finalLeafGeometry, leafMat);
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      group.add(leafMesh);
  }

  return group;
};