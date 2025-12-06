
export interface Point2D {
  id: string;
  x: number;
  y: number;
  isExit: boolean;
  isEntry?: boolean; // Usually implicitly (0,0)
}

export interface Connection {
  from: string;
  to: string;
}

export interface LetterPattern {
  char: string;
  nodes: Point2D[];
  connections: Connection[];
}

export interface TreeConfig {
  rootLength: number;
  baseRadius: number; // Size of the base mound/cylinder
  trunkLength: number;
  trunkRadius: number;
  lengthDecay: number; // Scale factor for length per level
  radiusDecay: number; // Scale factor for radius per level
  helixAngle: number; // Degrees to rotate the pattern around the growth axis per level
  geometryStyle: 'geometric' | 'organic';
  roughness: number; // 0 to 1
  forceUpwards: number; // 0 to 1, biases branches towards Y axis
  rotationVariance: number; // 0 to 180, adds random twist to branches
  printable: boolean; // Forces upward growth to avoid overhangs
  maxOverhang: number; // Maximum angle from vertical (degrees) for printable mode
  // Leaf settings
  showLeaves: boolean;
  leafSize: number;
  leafColor: string;
}

export type LetterMap = Record<string, LetterPattern>;