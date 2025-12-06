
import { LetterMap, LetterPattern } from './types';

export const DEFAULT_CONFIG = {
  rootLength: 15,
  baseRadius: 4.5,
  trunkLength: 10,
  trunkRadius: 1.5,
  lengthDecay: 0.85,
  radiusDecay: 0.7,
  helixAngle: 137.5, // Golden angle approximation for natural spiral
  geometryStyle: 'organic' as const,
  roughness: 0.2,
  forceUpwards: 0.2,
  rotationVariance: 45,
  printable: false,
  maxOverhang: 45, // Degrees from vertical
  showLeaves: true,
  leafSize: 0.5,
  leafColor: '#2d6e32',
};

// Helper to create simple patterns
const createPattern = (char: string, nodes: any[], edges: [number, number][]): LetterPattern => {
  const nodeObjs = nodes.map((n, i) => ({
    id: `node-${i}`,
    x: n.x,
    y: n.y,
    isExit: !!n.exit,
    isEntry: i === 0,
  }));
  
  const connections = edges.map(([from, to]) => ({
    from: `node-${from}`,
    to: `node-${to}`,
  }));

  return { char, nodes: nodeObjs, connections };
};

// Define some suggestive shapes. 
// Coordinate system: (0,0) is entry. Y is Up. 
// Values are roughly -1 to 1 range for width, 0 to 2 for height, but scaled by logic later.

const defaultPatterns: LetterMap = {};

// C - A curve
defaultPatterns['C'] = createPattern('C', [
  { x: 0, y: 0 }, // 0: Entry
  { x: 0.5, y: 0.2 }, // 1
  { x: 0.8, y: 0.8 }, // 2
  { x: 0.5, y: 1.4 }, // 3
  { x: 0, y: 1.6, exit: true }, // 4: Exit
], [[0, 1], [1, 2], [2, 3], [3, 4]]);

// E - Vertical with side branches
defaultPatterns['E'] = createPattern('E', [
  { x: 0, y: 0 }, // 0: Entry
  { x: 0, y: 0.8 }, // 1
  { x: 0, y: 1.6, exit: true }, // 2: Top Exit
  { x: 0.6, y: 0.8, exit: true }, // 3: Middle Exit
  { x: 0.6, y: 0.1, exit: true }, // 4: Bottom Exit (offset slightly up so it's not at 0)
], [[0, 1], [1, 2], [1, 3], [0, 4]]);

// L - Up and Right
defaultPatterns['L'] = createPattern('L', [
  { x: 0, y: 0 },
  { x: 0, y: 1.5, exit: true }, // Top vertical exit
  { x: 0.8, y: 0.2, exit: true }, // Bottom horizontal exit
], [[0, 1], [0, 2]]);

// S - Sinuous
defaultPatterns['S'] = createPattern('S', [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.4 },
  { x: 0, y: 0.8 },
  { x: -0.5, y: 1.2 },
  { x: 0, y: 1.6, exit: true },
], [[0, 1], [1, 2], [2, 3], [3, 4]]);

// T - Vertical and crossbar
defaultPatterns['T'] = createPattern('T', [
  { x: 0, y: 0 },
  { x: 0, y: 1.5 }, // Top center
  { x: -0.8, y: 1.5, exit: true }, // Left
  { x: 0.8, y: 1.5, exit: true }, // Right
], [[0, 1], [1, 2], [1, 3]]);

// Default fallback for others (Y shape)
const createDefaultY = (char: string) => createPattern(char, [
  { x: 0, y: 0 },
  { x: 0, y: 1.0 },
  { x: -0.5, y: 1.8, exit: true },
  { x: 0.5, y: 1.8, exit: true },
], [[0, 1], [1, 2], [1, 3]]);

// Fill A-Z
for (let i = 65; i <= 90; i++) {
  const char = String.fromCharCode(i);
  if (!defaultPatterns[char]) {
    defaultPatterns[char] = createDefaultY(char);
  }
}

export const INITIAL_PATTERNS = defaultPatterns;