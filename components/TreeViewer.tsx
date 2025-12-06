import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { generateTree } from '../services/treeGenerator';
import { TreeConfig, LetterMap } from '../types';
import { STLExporter } from 'three-stdlib';
import { OBJExporter } from 'three-stdlib';

interface TreeViewerProps {
  word: string;
  config: TreeConfig;
  patterns: LetterMap;
  triggerExport: { type: 'stl' | 'obj'; ts: number } | null;
}

const TreeModel: React.FC<{ 
  word: string; 
  config: TreeConfig; 
  patterns: LetterMap; 
  setGroupRef: (ref: THREE.Group) => void; 
}> = ({ word, config, patterns, setGroupRef }) => {
  const group = useMemo(() => {
    return generateTree(word, config, patterns);
  }, [word, config, patterns]);

  useEffect(() => {
      setGroupRef(group);
  }, [group, setGroupRef]);

  return <primitive object={group} />;
};

const ExportHandler: React.FC<{
  triggerExport: { type: 'stl' | 'obj'; ts: number } | null;
  sceneGroup: THREE.Group | null;
}> = ({ triggerExport, sceneGroup }) => {
  const lastHandledTs = useRef<number>(0);

  useEffect(() => {
    if (!triggerExport || !sceneGroup) return;

    // Fix: Prevent re-exporting if we've already handled this specific trigger timestamp
    if (triggerExport.ts === lastHandledTs.current) return;

    // Update the tracker so we don't run this again for the same trigger
    lastHandledTs.current = triggerExport.ts;

    const exportFile = (blob: Blob, filename: string) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    };

    if (triggerExport.type === 'stl') {
      const exporter = new STLExporter();
      const result = exporter.parse(sceneGroup, { binary: true });
      const blob = new Blob([result], { type: 'application/octet-stream' });
      exportFile(blob, 'name_tree.stl');
    } else {
        const exporter = new OBJExporter();
        const result = exporter.parse(sceneGroup);
        const blob = new Blob([result as BlobPart], { type: 'text/plain' });
        exportFile(blob, 'name_tree.obj');
    }

  }, [triggerExport, sceneGroup]);

  return null;
};


export const TreeViewer: React.FC<TreeViewerProps> = (props) => {
  const groupRef = useRef<THREE.Group | null>(null);

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-900 to-gray-800">
      <Canvas shadows camera={{ position: [20, 20, 20], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight 
            position={[10, 20, 10]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize={[1024, 1024]} 
        />
        <pointLight position={[-10, 10, -10]} intensity={0.5} />
        
        <TreeModel 
            word={props.word} 
            config={props.config} 
            patterns={props.patterns} 
            setGroupRef={(g) => groupRef.current = g} 
        />
        
        <Grid infiniteGrid fadeDistance={50} sectionColor="#444" cellColor="#222" />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
        <Environment preset="park" />
        
        <ExportHandler triggerExport={props.triggerExport} sceneGroup={groupRef.current} />
      </Canvas>
    </div>
  );
};