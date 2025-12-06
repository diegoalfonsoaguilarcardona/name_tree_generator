import React, { useState, useRef, useEffect } from 'react';
import { LetterPattern, Point2D } from '../types';
import { Trash2, Plus, RotateCcw, Spline, CircleDot } from 'lucide-react';

interface PatternEditorProps {
  letter: string;
  pattern: LetterPattern;
  onUpdate: (newPattern: LetterPattern) => void;
  onReset: () => void;
}

const CANVAS_SIZE = 300;
const COORD_SCALE = 50; // pixels per unit
const OFFSET_X = CANVAS_SIZE / 2;
const OFFSET_Y = CANVAS_SIZE - 50; // Start near bottom

export const PatternEditor: React.FC<PatternEditorProps> = ({ letter, pattern, onUpdate, onReset }) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('node-0'); // Default select entry
  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-select node-0 if selection is invalid/null when pattern changes
  useEffect(() => {
    if (!pattern.nodes.find(n => n.id === selectedId)) {
        setSelectedId('node-0');
    }
  }, [pattern, selectedId]);

  // Convert logical coordinates to SVG coordinates
  const toScreen = (x: number, y: number) => ({
    x: OFFSET_X + x * COORD_SCALE,
    y: OFFSET_Y - y * COORD_SCALE, // Y is up in logic, down in SVG
  });

  // Convert SVG coordinates to logical
  const toLogical = (sx: number, sy: number) => ({
    x: (sx - OFFSET_X) / COORD_SCALE,
    y: (OFFSET_Y - sy) / COORD_SCALE,
  });

  const handlePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault(); 
    setSelectedId(nodeId);
    if (nodeId === 'node-0') return; // Cannot move entry point
    setDraggingId(nodeId);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !svgRef.current) return;
    
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return;

    const p = svgRef.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const transformed = p.matrixTransform(CTM.inverse());
    
    const logical = toLogical(transformed.x, transformed.y);

    const newNodes = pattern.nodes.map(n => {
      if (n.id === draggingId) {
        return { ...n, x: logical.x, y: logical.y };
      }
      return n;
    });

    onUpdate({ ...pattern, nodes: newNodes });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingId(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleBgClick = () => {
    // We keep the selection active to make chaining easier
  };

  const toggleExit = (nodeId: string) => {
    if (nodeId === 'node-0') return; 
    const newNodes = pattern.nodes.map(n => {
      if (n.id === nodeId) {
        return { ...n, isExit: !n.isExit };
      }
      return n;
    });
    onUpdate({ ...pattern, nodes: newNodes });
  };

  const addNode = (isExit: boolean) => {
    // Parent is current selection or last node or root
    let parentId = selectedId;
    if (!parentId || !pattern.nodes.find(n => n.id === parentId)) {
        parentId = pattern.nodes[pattern.nodes.length - 1]?.id || 'node-0';
    }
    
    const parentNode = pattern.nodes.find(n => n.id === parentId);
    if (!parentNode) return;

    const newNodeId = `node-${Date.now()}`;
    // Place new node slightly offset from parent
    const newNode = {
        id: newNodeId,
        x: parentNode.x + 0.2, 
        y: parentNode.y + 0.5,
        isExit: isExit
    };
    
    const newConn = { from: parentId, to: newNodeId };
    
    onUpdate({
        ...pattern,
        nodes: [...pattern.nodes, newNode],
        connections: [...pattern.connections, newConn]
    });
    
    // Select the new node to allow chaining
    setSelectedId(newNodeId);
  };

  const deleteSelected = () => {
    if (!selectedId || selectedId === 'node-0') return;
    
    const newNodes = pattern.nodes.filter(n => n.id !== selectedId);
    const newConns = pattern.connections.filter(c => c.from !== selectedId && c.to !== selectedId);
    
    onUpdate({ ...pattern, nodes: newNodes, connections: newConns });
    setSelectedId('node-0');
  };

  // Render lines
  const lines = pattern.connections.map((conn, idx) => {
    const from = pattern.nodes.find(n => n.id === conn.from);
    const to = pattern.nodes.find(n => n.id === conn.to);
    if (!from || !to) return null;
    const s = toScreen(from.x, from.y);
    const e = toScreen(to.x, to.y);
    return (
      <line
        key={`line-${idx}`}
        x1={s.x} y1={s.y} x2={e.x} y2={e.y}
        stroke="#4b5563"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  });

  // Render nodes
  const circles = pattern.nodes.map((node) => {
    const pos = toScreen(node.x, node.y);
    const isEntry = node.id === 'node-0';
    const isSelected = node.id === selectedId;
    
    let fillColor = '#ffffff'; // Normal (White)
    if (isEntry) fillColor = '#3b82f6'; // Entry (Blue)
    else if (node.isExit) fillColor = '#ef4444'; // Exit (Red)

    return (
      <g 
        key={node.id} 
        transform={`translate(${pos.x}, ${pos.y})`}
        onPointerDown={(e) => handlePointerDown(e, node.id)}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => { e.preventDefault(); toggleExit(node.id); }}
        style={{ cursor: isEntry ? 'pointer' : 'move' }}
      >
        {/* Selection Ring */}
        {isSelected && (
            <circle r={16} fill="none" stroke="#fbbf24" strokeWidth="3" opacity={0.8} />
        )}
        
        <circle 
            r={10} 
            fill={fillColor}
            stroke="black"
            strokeWidth="2"
        />
      </g>
    );
  });

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-800 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-white">Pattern: {letter}</h3>
        <button onClick={onReset} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Reset Pattern">
            <RotateCcw size={16} />
        </button>
      </div>

      <div className="relative border border-gray-600 rounded bg-gray-900 overflow-hidden" style={{ height: CANVAS_SIZE }}>
        <svg 
            ref={svgRef}
            width="100%" 
            height="100%" 
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            className="touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerDown={handleBgClick}
            onContextMenu={(e) => e.preventDefault()}
        >
          {/* Grid lines */}
          <line x1={OFFSET_X} y1={0} x2={OFFSET_X} y2={CANVAS_SIZE} stroke="#333" />
          <line x1={0} y1={OFFSET_Y} x2={CANVAS_SIZE} y2={OFFSET_Y} stroke="#333" />
          
          {lines}
          {circles}
        </svg>
        
        <div className="absolute top-2 left-2 text-xs text-gray-500 pointer-events-none select-none">
          Blue: Entry<br/>
          White: Segment<br/>
          Red: Exit<br/>
          Right-click node to toggle Exit
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <div className="flex gap-2">
            <button 
                onClick={() => addNode(false)}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded text-xs transition"
                title="Add a structural node"
            >
                <Plus size={14} /> Add Segment
            </button>
            <button 
                onClick={() => addNode(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-red-900/80 hover:bg-red-800 text-white py-2 rounded text-xs transition"
                title="Add a branching point"
            >
                <Spline size={14} /> Add Exit
            </button>
        </div>
        
         <button 
            onClick={deleteSelected}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded text-xs transition ${
                !selectedId || selectedId === 'node-0' 
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
            disabled={!selectedId || selectedId === 'node-0'}
        >
            <Trash2 size={14} /> Delete Selected
        </button>
      </div>
      
      <div className="text-xs text-gray-400 mt-1">
         Select a node (yellow ring) to branch from it.
      </div>
    </div>
  );
};