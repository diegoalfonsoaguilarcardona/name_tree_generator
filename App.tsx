import React, { useState, useRef } from 'react';
import { TreeViewer } from './components/TreeViewer';
import { PatternEditor } from './components/PatternEditor';
import { Controls } from './components/Controls';
import { LetterPattern, LetterMap, TreeConfig } from './types';
import { DEFAULT_CONFIG, INITIAL_PATTERNS } from './constants';
import { load, dump } from 'js-yaml';
import { Download, Upload, Save, FolderOpen } from 'lucide-react';

const App: React.FC = () => {
  const [word, setWord] = useState('CELESTE');
  // We use a triggerWord to control when the tree actually updates (on "Generate" click)
  const [generatedWord, setGeneratedWord] = useState('CELESTE');
  
  const [config, setConfig] = useState<TreeConfig>(DEFAULT_CONFIG);
  const [patterns, setPatterns] = useState<LetterMap>(INITIAL_PATTERNS);
  
  // Pattern editor selection
  const [selectedChar, setSelectedChar] = useState<string>('C');

  // Export trigger state
  const [exportTrigger, setExportTrigger] = useState<{ type: 'stl' | 'obj'; ts: number } | null>(null);

  // File input ref for importing
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePatternUpdate = (newPattern: LetterPattern) => {
    setPatterns(prev => ({
      ...prev,
      [newPattern.char]: newPattern
    }));
  };

  const resetPattern = () => {
    if (INITIAL_PATTERNS[selectedChar]) {
        handlePatternUpdate(INITIAL_PATTERNS[selectedChar]);
    }
  };

  const handleGenerate = () => {
    setGeneratedWord(word);
  };

  const handleExportPatterns = () => {
    try {
        const yamlStr = dump(patterns);
        const blob = new Blob([yamlStr], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tree-patterns.yml';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Export failed', e);
        alert('Failed to export patterns.');
    }
  };

  const handleSaveProject = () => {
    const project = {
      timestamp: Date.now(),
      word,
      config,
      patterns
    };
    
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${word || 'tree'}_project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target?.result as string;
            
            if (file.name.toLowerCase().endsWith('.json')) {
                // Load Project
                const project = JSON.parse(content);
                // Basic validation
                if (project.config && project.patterns) {
                    if (project.word) {
                        setWord(project.word);
                        setGeneratedWord(project.word);
                    }
                    setConfig(project.config);
                    setPatterns(project.patterns);
                    alert('Project loaded successfully!');
                } else {
                    alert('Invalid project file structure.');
                }
            } else {
                // Load Patterns (YAML)
                const loaded = load(content) as LetterMap;
                
                // Basic validation
                if (loaded && typeof loaded === 'object') {
                    setPatterns(prev => ({ ...prev, ...loaded }));
                    alert('Patterns imported successfully!');
                } else {
                    throw new Error('Invalid format');
                }
            }
        } catch (err) {
            console.error(err);
            alert('Failed to load file. ' + (err instanceof Error ? err.message : ''));
        }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Ensure current selected char has a pattern
  const currentPattern = patterns[selectedChar] || { char: selectedChar, nodes: [], connections: [] };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-white font-sans">
      {/* Hidden file input for import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: 'none' }} 
        accept=".yml,.yaml,.json"
      />

      {/* Left Sidebar: Pattern Editor */}
      <div className="w-80 flex flex-col border-r border-gray-700 bg-gray-900 z-10">
        <div className="p-4 border-b border-gray-700">
            <h1 className="text-xl font-bold tracking-wider text-green-400">TREE GEN</h1>
            <p className="text-xs text-gray-500">Procedural Name Trees</p>
        </div>

        {/* Project Section */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/50">
            <h3 className="text-xs uppercase text-gray-400 font-bold mb-2">Project</h3>
            <div className="flex gap-2">
                 <button 
                    onClick={handleSaveProject}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white py-2 rounded text-xs transition shadow-md"
                    title="Save current tree, settings and patterns"
                 >
                    <Save size={14} /> Save
                 </button>
                 <button 
                    onClick={handleImportClick}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-xs transition shadow-md"
                    title="Load Project (JSON) or Import Patterns (YAML)"
                 >
                    <FolderOpen size={14} /> Load
                 </button>
            </div>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto flex flex-col">
             <label className="block text-sm font-bold mb-2">Edit Letter Pattern</label>
             <select 
                className="w-full bg-gray-800 border border-gray-600 rounded p-2 mb-4"
                value={selectedChar}
                onChange={(e) => setSelectedChar(e.target.value)}
             >
                 {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(char => (
                     <option key={char} value={char}>{char}</option>
                 ))}
             </select>

             <PatternEditor 
                letter={selectedChar} 
                pattern={currentPattern}
                onUpdate={handlePatternUpdate}
                onReset={resetPattern}
             />
             
             <div className="mt-4 text-xs text-gray-500 leading-relaxed mb-4">
                 <p className="mb-2"><strong className="text-gray-300">How to use:</strong></p>
                 <ul className="list-disc pl-4 space-y-1">
                     <li>Drag white nodes to shape the letter.</li>
                     <li>The Blue node is the entry (bottom).</li>
                     <li>Red nodes are exits (where next letters grow).</li>
                     <li>Click "Add Segment" to extend.</li>
                     <li>Click "Add Exit" to branch out.</li>
                 </ul>
             </div>

             <div className="mt-auto pt-4 border-t border-gray-700">
                 <h3 className="text-xs uppercase text-gray-400 font-bold mb-2">Patterns Only</h3>
                 <div className="flex gap-2">
                     <button 
                        onClick={handleExportPatterns}
                        className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white py-2 rounded text-xs"
                     >
                        <Download size={14} /> Export YML
                     </button>
                     <button 
                        onClick={handleImportClick}
                        className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white py-2 rounded text-xs"
                     >
                        <Upload size={14} /> Import YML
                     </button>
                 </div>
             </div>
        </div>
      </div>

      {/* Center: 3D View */}
      <div className="flex-1 relative">
        <TreeViewer 
            word={generatedWord} 
            config={config} 
            patterns={patterns} 
            triggerExport={exportTrigger}
        />
        
        <div className="absolute top-4 left-4 bg-black/50 p-2 rounded text-xs pointer-events-none">
            Viewing: {generatedWord}<br/>
            Left Mouse: Rotate<br/>
            Right Mouse: Pan<br/>
            Scroll: Zoom
        </div>
      </div>

      {/* Right Sidebar: Controls */}
      <div className="w-72 bg-gray-900 border-l border-gray-700 z-10 flex flex-col">
        <Controls 
            word={word} 
            setWord={setWord} 
            config={config} 
            setConfig={setConfig} 
            onGenerate={handleGenerate}
            onExport={(type) => setExportTrigger({ type, ts: Date.now() })}
        />
      </div>
    </div>
  );
};

export default App;