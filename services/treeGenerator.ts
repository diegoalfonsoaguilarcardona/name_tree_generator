
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
 */
function applyNoiseToGeometry(
    geometry: THREE.BufferGeometry, 
    roughness: number, 
    radius: number, 
    seedBase: number
) {
    if (roughness <= 0) return;

    const posAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const noiseAmp = roughness * radius * 0.5;

    for (let i = 0; i < posAttribute.count; i++) {
        vertex.fromBufferAttribute(posAttribute, i);
        
        // Use world-like coordinates (relative to shape center) for noise
        // Note: geometry is usually centered or local, but continuousNoise handles continuity
        const nx = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 1, noiseAmp);
        const ny = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 2, noiseAmp * 0.2); 
        const nz = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 3, noiseAmp);
        
        vertex.add(new THREE.Vector3(nx, ny, nz));
        posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals();
}

/**
 * Helper to prepare geometry for merging:
 * 1. Computes Vertex Normals
 * 2. Converts to Non-Indexed (ensures compatibility between different geometry types)
 * 3. Deletes unused attributes (like color, if any, though usually none)
 */
function prepareForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    geo.computeVertexNormals();
    if (geo.index) {
        return geo.toNonIndexed();
    }
    return geo;
}

/**
 * Decomposes a LetterPattern into continuous segments for TubeGeometry.
 * A segment breaks whenever a node has != 1 outgoing connection.
 */
function tracePaths(pattern: LetterPattern): string[][] {
    const segments: string[][] = [];
    const processedEdges = new Set<string>();
    
    // Get connections starting FROM a specific node
    const getOuts = (id: string) => pattern.connections.filter(c => c.from === id);
    
    // Recursive traversal to find linear chains
    const traverse = (startNodeId: string) => {
        const outs = getOuts(startNodeId);
        
        outs.forEach(conn => {
            const edgeId = `${conn.from}-${conn.to}`;
            if (processedEdges.has(edgeId)) return;
            processedEdges.add(edgeId);

            // Start a new path
            const path = [conn.from, conn.to];
            let curr = conn.to;
            
            // Try to extend the path linearly
            while(true) {
                const nextOuts = getOuts(curr);
                
                // We stop extending if:
                // 1. It's a dead end (0 outs)
                // 2. It's a branching point (> 1 outs)
                if (nextOuts.length !== 1) break;
                
                const nextConn = nextOuts[0];
                const nextEdgeId = `${nextConn.from}-${nextConn.to}`;
                
                // Also check if we've already processed this edge (loops?)
                if (processedEdges.has(nextEdgeId)) break;

                processedEdges.add(nextEdgeId);
                path.push(nextConn.to);
                curr = nextConn.to;
            }
            
            segments.push(path);
            
            // If we stopped at a node that has branches, recurse from there
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

  // Arrays to hold all geometries before merging
  const treeGeometries: THREE.BufferGeometry[] = [];
  const leafGeometries: THREE.BufferGeometry[] = [];

  // --- 1. Base Generation ---
  // Use config.baseRadius, fallback to multiple of trunk if undefined (for old saves)
  const baseRadius = config.baseRadius ?? (config.trunkRadius * 2.5);
  let baseGeometry: THREE.BufferGeometry;
  let treeStartY = 0;

  if (config.geometryStyle === 'organic') {
    const points: THREE.Vector2[] = [];
    const steps = 32; // Increased resolution for smoother base
    const moundHeight = baseRadius * 0.5;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = (Math.PI / 2) * (1 - t);
        const x = Math.cos(angle) * baseRadius;
        const y = Math.sin(angle) * moundHeight;
        points.push(new THREE.Vector2(x, y));
    }
    // Close the loop for Lathe
    points.push(new THREE.Vector2(0, 0));
    baseGeometry = new THREE.LatheGeometry(points, 64);
    treeStartY = moundHeight;
    
    if (config.roughness > 0) {
        // Custom noise application for Base to PRESERVE FLAT BOTTOM
        // We mask the noise amplitude based on the Y height.
        // Y=0 -> Noise=0 (Perfect circle for adhesion)
        // Y>0 -> Noise increases
        const posAttribute = baseGeometry.attributes.position;
        const vertex = new THREE.Vector3();
        const noiseAmp = config.roughness * baseRadius * 0.5;
        const seedBase = 0;

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // Smoothly fade in noise from bottom (0) to top.
            // Vertices at Y=0 (the bottom disk) stay at 0 noise.
            const heightFactor = THREE.MathUtils.smoothstep(vertex.y, 0, baseRadius * 0.2);
            
            if (heightFactor > 0.001) {
                const nx = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 1, noiseAmp) * heightFactor;
                const ny = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 2, noiseAmp * 0.2) * heightFactor;
                const nz = continuousNoise(vertex.x, vertex.y, vertex.z, seedBase + 3, noiseAmp) * heightFactor;
                
                vertex.add(new THREE.Vector3(nx, ny, nz));
                posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
        }
        baseGeometry.computeVertexNormals();
    }

  } else {
    const baseHeight = config.trunkRadius * 1.0;
    baseGeometry = new THREE.CylinderGeometry(baseRadius * 0.8, baseRadius, baseHeight, 32, 1);
    treeStartY = baseHeight;
  }
  
  // Shift base up slightly if needed, or keep at 0. Organic bases sit at 0.
  baseGeometry.translate(0, config.geometryStyle === 'organic' ? 0 : config.trunkRadius * 0.5, 0);
  treeGeometries.push(prepareForMerge(baseGeometry));


  // --- 2. Root Trunk Generation ---
  // To look like one object, we embed the root trunk slightly into the base
  const rootLength = config.rootLength;
  const rootRadiusTop = config.trunkRadius * config.radiusDecay;
  
  // Calculate a safe bottom Y to ensure we don't penetrate the floor (Y=0)
  // treeStartY is the height of the base mound/cylinder top.
  const idealBottomY = treeStartY - (config.trunkRadius * 0.5);
  // Keep strictly above 0.2 to avoid Z-fighting with the bottom of the base or penetrating floor
  const safeBottomY = 0.2; 
  
  const trunkBottomY = Math.max(safeBottomY, idealBottomY);
  
  // The trunk extends from trunkBottomY up to (treeStartY + rootLength)
  const trunkTopY = treeStartY + rootLength;
  const trunkHeight = trunkTopY - trunkBottomY;
  
  let trunkGeo: THREE.BufferGeometry;
  
  if (config.geometryStyle === 'organic') {
      trunkGeo = new THREE.CylinderGeometry(rootRadiusTop, config.trunkRadius, trunkHeight, 16, 8, false);
      applyNoiseToGeometry(trunkGeo, config.roughness, config.trunkRadius, 1);
  } else {
      trunkGeo = new THREE.CylinderGeometry(rootRadiusTop, config.trunkRadius, trunkHeight, 12, 1, false);
  }
  
  // Position: Center of cylinder
  const trunkCenterY = trunkBottomY + (trunkHeight / 2);
  trunkGeo.translate(0, trunkCenterY, 0);
  treeGeometries.push(prepareForMerge(trunkGeo));

  // The recursive tree starts at the top of the root trunk
  const startY = trunkTopY;


  // --- 3. Leaf Geometry Template ---
  let leafGeoTemplate: THREE.BufferGeometry | null = null;
  if (config.showLeaves) {
      const shape = new THREE.Shape();
      // Define a simple leaf shape starting at (0,0)
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
      
      // Calculate Bounding Box to center X and Z, but keep Y anchored at 0
      leafGeoTemplate.computeBoundingBox();
      const bb = leafGeoTemplate.boundingBox!;
      const centerOffsetX = - (bb.max.x + bb.min.x) / 2; // Center Width
      const centerOffsetZ = - (bb.max.z + bb.min.z) / 2; // Center Thickness
      // IMPORTANT: We do NOT center Y. We want Y to start at 0 (the stem).
      // If the shape is defined from 0 to 1.2, min.y is 0. 
      const minOffsetY = - bb.min.y; 

      // Apply translation to the template geometry so all instances pivot correctly
      leafGeoTemplate.translate(centerOffsetX, minOffsetY, centerOffsetZ);
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

    // Twist for this level
    const helixRot = new THREE.Matrix4().makeRotationY(
      THREE.MathUtils.degToRad(config.helixAngle * depth)
    );

    // Scaling factor for this level
    const levelScale = lengthScale * config.trunkLength * 0.2;

    // ---------------------------------------------------------
    // STEP 1: Calculate "Real" World Positions for all Nodes
    // If "printable" is true, we must adjust these positions 
    // to satisfy the overhang constraints (Organic Supports).
    // ---------------------------------------------------------
    const nodeWorldPositions = new Map<string, THREE.Vector3>();
    
    // The letter starts at origin (0,0,0) in its local space, which transforms to parentMatrix position
    const startPos = new THREE.Vector3(0,0,0).applyMatrix4(parentMatrix);
    nodeWorldPositions.set('node-0', startPos);

    // Traverse the pattern graph to compute positions relative to parent
    // We use a queue for BFS
    const queue = ['node-0'];
    const visited = new Set<string>(['node-0']);

    // Pre-calculate local vectors for all connections
    // This allows us to know the "intended" direction
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
            if (visited.has(nextId)) return; // Avoid cycles/re-visit

            const nextNodeDef = pattern.nodes.find(n => n.id === nextId);
            const currNodeDef = pattern.nodes.find(n => n.id === currId);
            
            if (nextNodeDef && currNodeDef) {
                // 1. Calculate the ideal delta in pattern space (scaled)
                // We don't just use absolute positions because we want the relative vector
                // to be transformed by helix/parent rotation.
                const localDelta = new THREE.Vector3(
                    nextNodeDef.x - currNodeDef.x,
                    nextNodeDef.y - currNodeDef.y,
                    0
                ).multiplyScalar(levelScale);
                
                // 2. Transform this delta to World Space direction
                localDelta.applyMatrix4(helixRot); // Apply spiral twist
                // Only rotate by parent, don't translate, because it's a delta
                const worldDelta = localDelta.clone().transformDirection(parentMatrix);

                // 3. Apply Constraints (The "Organic Support" Logic)
                if (config.printable) {
                    // Force Upward: Y must be positive
                    if (worldDelta.y < 0) {
                        worldDelta.y = Math.abs(worldDelta.y) * 0.5; // Flip up, but dampen
                    }

                    // Enforce Max Overhang Angle
                    // If maxOverhang is 45 deg, min Y = horizontalDist / tan(45)
                    const horizDist = Math.sqrt(worldDelta.x * worldDelta.x + worldDelta.z * worldDelta.z);
                    const maxAngleRad = THREE.MathUtils.degToRad(config.maxOverhang || 45);
                    const minVertical = horizDist / Math.tan(maxAngleRad);

                    if (worldDelta.y < minVertical) {
                        // Shear upwards to satisfy constraint
                        worldDelta.y = minVertical;
                    }
                } else if (config.forceUpwards > 0) {
                    // Soft bias
                     worldDelta.lerp(new THREE.Vector3(0, 1, 0), config.forceUpwards);
                }

                // 4. Set final position
                const nextPos = currPos.clone().add(worldDelta);
                nodeWorldPositions.set(nextId, nextPos);
                
                visited.add(nextId);
                queue.push(nextId);
            }
        });
    }

    // Trace paths for smooth tubes
    const paths = tracePaths(pattern);

    paths.forEach((pathNodeIds, pathIdx) => {
        // Collect points from our calculated map
        const points: THREE.Vector3[] = [];
        pathNodeIds.forEach(nodeId => {
            const pos = nodeWorldPositions.get(nodeId);
            if (pos) points.push(pos);
        });

        if (points.length < 2) return;

        // Create Curve
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'catmullrom';
        curve.tension = 0.5;

        // Tube Generation
        const curveLength = curve.getLength();
        // Ensure enough segments for smoothness
        const tubularSegments = Math.max(8, Math.floor(curveLength * 5)); 
        const radialSegments = config.geometryStyle === 'organic' ? 12 : 8;

        const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
        
        // Apply Noise
        const seed = depth * 1000 + pathIdx;
        if (config.geometryStyle === 'organic') {
            applyNoiseToGeometry(tubeGeo, config.roughness, radius, seed);
        }
        
        treeGeometries.push(prepareForMerge(tubeGeo));

        // Create Joint Knots
        const addJoint = (pos: THREE.Vector3, r: number, s: number) => {
            let jGeo: THREE.BufferGeometry;
            const jointRadius = r * 1.1; // Slightly larger to cover seams
            
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


    // --- 5. Process Exits (Recursion) ---
    const exitNodes = pattern.nodes.filter(n => n.isExit);
    
    exitNodes.forEach((exitNode, exitIndex) => {
        // Use the constrained world position we calculated earlier
        const worldExitPos = nodeWorldPositions.get(exitNode.id);
        if (!worldExitPos) return;

        // Determine Tangent for the next branch based on the incoming connection
        // We look at the vector from the node leading into the exit
        let tangent = new THREE.Vector3(0, 1, 0);
        const incoming = pattern.connections.find(c => c.to === exitNode.id);
        
        if (incoming) {
            const worldFromPos = nodeWorldPositions.get(incoming.from);
            if (worldFromPos) {
                 tangent.subVectors(worldExitPos, worldFromPos).normalize();
            }
        }
        
        if (config.printable) {
             if (tangent.y < 0) tangent.y = -tangent.y;
        }

        // Setup Matrix for Child
        const newParentMatrix = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        newParentMatrix.makeRotationFromQuaternion(q);
        
        // Apply Rotation Variance
        if (config.rotationVariance > 0) {
            const seed = (depth + 1) * 7331 + exitIndex * 827;
            const rand = seededRandom(seed);
            const angleDeg = (rand - 0.5) * 2 * config.rotationVariance;
            newParentMatrix.multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(angleDeg)));
        }
        
        newParentMatrix.setPosition(worldExitPos);

        // Add Leaves at Tips of Last Level
        if (depth === cleanWord.length - 1 && config.showLeaves && leafGeoTemplate) {
            const seed = (depth + 1) * 9999 + exitIndex * 888;
            for(let l=0; l<3; l++) {
                 const leaf = leafGeoTemplate.clone();
                 // Randomize Leaf Orientation
                 const r1 = seededRandom(seed + l * 10);
                 const r2 = seededRandom(seed + l * 20);
                 
                 if (config.printable) {
                    // Strict Upward Growth for Leaves
                    // 1. Get branch heading (azimuth) in XZ plane
                    const heading = Math.atan2(tangent.x, tangent.z);
                    
                    // 2. Distribute leaves around the heading
                    const angleOffset = (l / 3) * Math.PI * 2 + (r2 - 0.5); 
                    const angleY = heading + angleOffset;

                    // 3. Determine splay from vertical (0 to maxOverhang)
                    const maxRad = THREE.MathUtils.degToRad(config.maxOverhang || 45);
                    // Ensure leaves always point somewhat up (at least 5 deg) and max maxOverhang
                    const splay = THREE.MathUtils.degToRad(5) + r1 * (maxRad - THREE.MathUtils.degToRad(5));

                    const rotQ = new THREE.Quaternion();
                    // Rotate around Global Y (Azimuth)
                    rotQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
                    // Tilt outward (Splay) around Local X
                    rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), splay));
                    
                    leaf.applyQuaternion(rotQ);
                 } else {
                     // Standard Organic behavior (Relative to branch)
                     const splay = (Math.PI / 4) + (r1 * 0.3);
                     const around = (l / 3) * Math.PI * 2 + (r2 * 0.5);
                     
                     const rotQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), around);
                     rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), splay));
                     
                     leaf.applyQuaternion(rotQ);
                     leaf.applyQuaternion(q); // Align with branch
                 }
                 
                 const scale = config.leafSize * (0.8 + seededRandom(seed+l)*0.4);
                 leaf.scale(scale, scale, scale);
                 leaf.translate(worldExitPos.x, worldExitPos.y, worldExitPos.z);
                 
                 leafGeometries.push(prepareForMerge(leaf));
            }
        }

        // Recurse
        buildLevel(
            newParentMatrix,
            depth + 1,
            radius * config.radiusDecay,
            lengthScale * config.lengthDecay
        );
    });
  };

  // Start Build Process
  const startMatrix = new THREE.Matrix4();
  // Start at the top of the root trunk
  startMatrix.setPosition(0, startY, 0);
  
  buildLevel(startMatrix, 0, rootRadiusTop, 1.0);


  // --- 6. Final Merge ---
  
  // Merge Wood
  let finalWoodGeometry: THREE.BufferGeometry | null = null;
  if (treeGeometries.length > 0) {
      try {
        finalWoodGeometry = mergeBufferGeometries(treeGeometries, false);
      } catch (e) {
          console.error("Failed to merge wood geometries", e);
      }
  }

  // Create Wood Mesh
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

  // Merge Leaves
  let finalLeafGeometry: THREE.BufferGeometry | null = null;
  if (leafGeometries.length > 0) {
      try {
        finalLeafGeometry = mergeBufferGeometries(leafGeometries, false);
      } catch (e) {
          console.error("Failed to merge leaf geometries", e);
      }
  }

  // Create Leaf Mesh
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
