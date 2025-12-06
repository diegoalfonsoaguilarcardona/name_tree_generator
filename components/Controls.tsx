
import React from 'react';
import { TreeConfig } from '../types';

interface ControlsProps {
  word: string;
  setWord: (s: string) => void;
  config: TreeConfig;
  setConfig: (c: TreeConfig) => void;
  onGenerate: () => void;
  onExport: (type: 'stl' | 'obj') => void;
}

export const Controls: React.FC<ControlsProps> = ({ 
  word, setWord, config, setConfig, onGenerate, onExport 
}) => {
  
  const handleChange = (key: keyof TreeConfig, value: number | string | boolean) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <div className="p-4 bg-gray-800 text-white rounded-lg shadow-lg flex flex-col gap-4 max-h-full overflow-y-auto">
      <div>
        <label className="block text-sm font-bold mb-1">Word / Name</label>
        <div className="flex gap-2">
            <input 
            type="text" 
            value={word} 
            onChange={(e) => setWord(e.target.value)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white uppercase"
            placeholder="ENTER NAME"
            maxLength={10}
            />
        </div>
        <p className="text-xs text-gray-400 mt-1">Max 10 chars recommended.</p>
      </div>

      <button 
        onClick={onGenerate}
        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded transition"
      >
        GENERATE TREE
      </button>

      <hr className="border-gray-700" />

      <div>
        <label className="block text-sm font-bold mb-2">Geometry Style</label>
        <div className="flex gap-2">
            <button 
                onClick={() => handleChange('geometryStyle', 'geometric')}
                className={`flex-1 py-1 px-2 rounded text-xs ${config.geometryStyle === 'geometric' ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
                Geometric
            </button>
            <button 
                onClick={() => handleChange('geometryStyle', 'organic')}
                className={`flex-1 py-1 px-2 rounded text-xs ${config.geometryStyle === 'organic' ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
                Organic
            </button>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Roughness</label>
        <input 
            type="range" min="0" max="1" step="0.1"
            value={config.roughness}
            onChange={(e) => handleChange('roughness', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Root Height</label>
        <input 
            type="range" min="0" max="50" step="1"
            value={config.rootLength}
            onChange={(e) => handleChange('rootLength', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Base Radius</label>
        <input 
            type="range" min="1" max="15" step="0.5"
            value={config.baseRadius ?? 4.5}
            onChange={(e) => handleChange('baseRadius', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>
      
      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Initial Thickness</label>
        <input 
            type="range" min="0.1" max="5.0" step="0.1"
            value={config.trunkRadius}
            onChange={(e) => handleChange('trunkRadius', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Thickness Decay</label>
        <input 
            type="range" min="0.1" max="1.0" step="0.05"
            value={config.radiusDecay}
            onChange={(e) => handleChange('radiusDecay', parseFloat(e.target.value))}
            className="w-full"
        />
        <span className="text-xs text-gray-500">1.0 = No thinning</span>
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Branch Length</label>
        <input 
            type="range" min="5" max="20" step="1"
            value={config.trunkLength}
            onChange={(e) => handleChange('trunkLength', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Length Decay</label>
        <input 
            type="range" min="0.5" max="1.0" step="0.05"
            value={config.lengthDecay}
            onChange={(e) => handleChange('lengthDecay', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

       <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Helix Twist</label>
        <input 
            type="range" min="0" max="360" step="5"
            value={config.helixAngle}
            onChange={(e) => handleChange('helixAngle', parseFloat(e.target.value))}
            className="w-full"
        />
      </div>

      <hr className="border-gray-700" />
      
      <div>
        <div className="flex items-center gap-2 mb-2">
            <input 
                type="checkbox" 
                id="leavesCheck"
                checked={config.showLeaves}
                onChange={(e) => handleChange('showLeaves', e.target.checked)}
                className="w-4 h-4 rounded"
            />
            <label htmlFor="leavesCheck" className="text-sm font-bold text-green-400 cursor-pointer">Show Leaves</label>
        </div>
        
        {config.showLeaves && (
          <div className="pl-6 flex flex-col gap-2">
             <div>
                <label className="block text-xs uppercase text-gray-400 mb-1">Leaf Size</label>
                <input 
                    type="range" min="0.1" max="2.0" step="0.1"
                    value={config.leafSize}
                    onChange={(e) => handleChange('leafSize', parseFloat(e.target.value))}
                    className="w-full"
                />
             </div>
             <div>
                <label className="block text-xs uppercase text-gray-400 mb-1">Leaf Color</label>
                <input 
                    type="color"
                    value={config.leafColor}
                    onChange={(e) => handleChange('leafColor', e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                />
             </div>
          </div>
        )}
      </div>

      <hr className="border-gray-700" />
      
      <div>
        <div className="flex items-center gap-2 mb-2">
            <input 
                type="checkbox" 
                id="printableCheck"
                checked={config.printable}
                onChange={(e) => handleChange('printable', e.target.checked)}
                className="w-4 h-4 rounded"
            />
            <label htmlFor="printableCheck" className="text-sm font-bold text-green-400 cursor-pointer">Strict Upward Growth</label>
        </div>
        <p className="text-xs text-gray-500 mb-2">
            Forces branches to satisfy overhang constraints (like organic supports).
        </p>

        {config.printable && (
            <div className="pl-6">
                <label className="block text-xs uppercase text-gray-400 mb-1">Max Print Angle</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="range" min="0" max="60" step="5"
                        value={config.maxOverhang || 45}
                        onChange={(e) => handleChange('maxOverhang', parseFloat(e.target.value))}
                        className="flex-1"
                    />
                    <span className="text-xs w-6">{config.maxOverhang}°</span>
                </div>
            </div>
        )}
      </div>

      {!config.printable && (
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">Upward Bias</label>
            <input 
                type="range" min="0" max="1" step="0.05"
                value={config.forceUpwards}
                onChange={(e) => handleChange('forceUpwards', parseFloat(e.target.value))}
                className="w-full"
            />
            <span className="text-xs text-gray-500">Soft upward strength</span>
          </div>
      )}

      <div>
        <label className="block text-xs uppercase text-gray-400 mb-1">Rotation Variance</label>
        <input 
            type="range" min="0" max="180" step="5"
            value={config.rotationVariance}
            onChange={(e) => handleChange('rotationVariance', parseFloat(e.target.value))}
            className="w-full"
        />
        <span className="text-xs text-gray-500">Prevents overlapping</span>
      </div>

      <hr className="border-gray-700" />

      <div className="flex gap-2">
        <button 
            onClick={() => onExport('stl')}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-2 rounded"
        >
            Export STL
        </button>
        <button 
            onClick={() => onExport('obj')}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-2 rounded"
        >
            Export OBJ
        </button>
      </div>
    </div>
  );
};