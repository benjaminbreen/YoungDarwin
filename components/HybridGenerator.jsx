// HybridGenerator.jsx - Updated with mild/extreme hybrid options
'use client';

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';
import { initializeSpecimens } from '../data/specimens';
import { generateHybridImage } from '../utils/hybridImageGenerator';
import { assignHybridLocation } from '../utils/hybridPlacement';
import { buildLLMRequestMeta } from '../utils/llmClient';
import {
  DEFAULT_HYBRID_BATCH_SIZE,
  clampHybridBatchSize,
  selectDeterministicParentPairs,
  shouldAutoGenerateHybrids,
} from '../utils/hybridGenerationPolicy';

const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export default function HybridGenerator({ onComplete, hybridityMode = 'mild', isVisible = true }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedHybrids, setGeneratedHybrids] = useState([]);
  const [log, setLog] = useState([]);
  const [batchSize, setBatchSize] = useState(DEFAULT_HYBRID_BATCH_SIZE);
  const [generateImages, setGenerateImages] = useState(false);
  
  // Get data from game store
  const specimenList = useGameStore(state => state.specimenList);
  const setSpecimenList = useGameStore(state => state.setSpecimenList);
  const expeditionSeed = useGameStore(state => state.expeditionSeed);
  
  // Use refs to prevent stale closures in useEffect
  const specimenListRef = useRef(specimenList);
  const hybridityModeRef = useRef(hybridityMode);
  
  // Update refs when props change
  useEffect(() => {
    specimenListRef.current = specimenList;
    hybridityModeRef.current = hybridityMode;
  }, [specimenList, hybridityMode]);
  
  // Initialize when component mounts or becomes visible
  useEffect(() => {
    if (isVisible) {
      // Clear previous logs and state
      setLog([]);
      setGeneratedHybrids([]);
      setProgress(0);
      addLog('Hybrid generator initialized');
      addLog(`Hybridity mode: ${hybridityMode}`);
      
      // If we're on the title screen and specimens aren't loaded yet, initialize them
      if (specimenList.length === 0) {
        const initialSpecimens = initializeSpecimens();
        specimenListRef.current = initialSpecimens;
        addLog('Loaded initial specimen data for hybrids');
        debugLog(`Initialized ${initialSpecimens.length} specimens for potential hybridization`);
      }
      
      if (shouldAutoGenerateHybrids({ isVisible, hybridityMode, explicitStart: false })) {
        generateHybrids(batchSize);
      }
    }
  }, [isVisible, hybridityMode]);
  
  // Add log entry with timestamp
  const addLog = (message) => {
    setLog(prevLog => [...prevLog, {
      time: new Date().toLocaleTimeString(),
      message
    }]);
  };
  
  // Function to group specimens by taxonomic level
  const groupSpecimensByTaxonomy = () => {
    // Use local specimens if store is empty
    const specimens = specimenListRef.current.length > 0 
      ? specimenListRef.current 
      : initializeSpecimens();
      
    addLog(`Analyzing ${specimens.length} specimens for hybridization potential...`);
    
    // For mild mode, group by sub_order
    // For extreme mode, group by order
    const taxonomyLevel = hybridityModeRef.current === 'extreme' ? 'order' : 'sub_order';
    addLog(`Using taxonomy level: ${taxonomyLevel} (${hybridityModeRef.current} mode)`);
    
    const groups = {};
    
    specimens.forEach(specimen => {
      // Skip if specimen is invalid or missing required properties
      if (!specimen || !specimen[taxonomyLevel]) {
        debugLog("Skipping invalid specimen:", specimen);
        return;
      }
      
      if (!groups[specimen[taxonomyLevel]]) {
        groups[specimen[taxonomyLevel]] = [];
      }
      
      groups[specimen[taxonomyLevel]].push(specimen);
    });
    
    // Filter out groups with only one specimen (can't hybridize with itself)
    const validGroups = Object.fromEntries(
      Object.entries(groups).filter(([_, specimens]) => specimens.length > 1)
    );
    
    addLog(`Found ${Object.keys(validGroups).length} species groups suitable for hybridization`);
    return validGroups;
  };
  
  // Function to generate a hybrid ID
  const generateHybridId = (parent1, parent2) => {
    // Create a unique ID that clearly identifies it as a hybrid
    const mode = hybridityModeRef.current === 'extreme' ? 'ex' : 'mi';
    return `hybrid_${mode}_${parent1.id.substring(0, 4)}${parent2.id.substring(0, 4)}`;
  };
  
  const determineHybridEmoji = (parent1, parent2, taxonomicGroup) => {
    const text = `${parent1?.sub_order || ''} ${parent2?.sub_order || ''} ${taxonomicGroup || ''} ${parent1?.name || ''} ${parent2?.name || ''}`.toLowerCase();
    if (text.includes('tortoise')) return '🐢';
    if (text.includes('iguana') || text.includes('lizard')) return '🦎';
    if (text.includes('bird') || text.includes('finch') || text.includes('mocking')) return '🐦';
    if (text.includes('crab')) return '🦀';
    if (text.includes('plant') || text.includes('cactus') || text.includes('mangrove')) return '🌱';
    if (text.includes('fish') || text.includes('shark') || text.includes('ray') || text.includes('marine')) return '🐟';
    if (text.includes('volcanic') || text.includes('mineral') || text.includes('rock')) return '🪨';
    return '🧬';
  };

  // Function to create a hybrid using an LLM
  const createHybrid = async (parent1, parent2, taxonomicGroup) => {
    const mode = hybridityModeRef.current;
    addLog(`Creating ${mode} hybrid between ${parent1.name} and ${parent2.name}...`);
    
    try {
      const requestMeta = buildLLMRequestMeta({
        sessionId: expeditionSeed,
        route: '/api/generate-hybrid',
        kind: 'hybrid',
        prompt: `${mode}:${taxonomicGroup}:${parent1.id || parent1.name}:${parent2.id || parent2.name}`,
      });
      const response = await fetch('/api/generate-hybrid', {
        method: 'POST',
        headers: requestMeta.headers,
        body: JSON.stringify({
          parent1,
          parent2,
          taxonomicGroup,
          hybridityMode: mode,
          idempotencyKey: requestMeta.idempotencyKey,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const data = await response.json();
      debugLog("API response data:", data);
      
      // Extract hybrid data or use fallback
      const hybridData = data.hybrid || createFallbackHybrid(parent1, parent2, taxonomicGroup);
      
      // Merge habitats
      const habitats = new Set([
        ...(parent1.habitat ? parent1.habitat.split(', ') : []), 
        ...(parent2.habitat ? parent2.habitat.split(', ') : [])
      ]);
      
      // If no habitats could be determined, add a generic one
      if (habitats.size === 0) {
        habitats.add('scrubland');
        habitats.add('shore');
      }
      
      // Generate a unique ID for the hybrid
      const hybridId = generateHybridId(parent1, parent2);
      
      // Create a merged hybrid specimen with ALL necessary properties
      const hybridSpecimen = {
        // Basic properties from the API response
        ...hybridData,
        
        // Essential properties for the game system
        id: hybridId,
        name: hybridData.name || `${parent1.name}-${parent2.name} Hybrid`,
        latin: hybridData.latin || `${parent1.latin.split(' ')[0]} ${parent2.latin.split(' ')[1]} hybridus`,
        ontology: hybridData.ontology || parent1.ontology || 'Animal',
        order: mode === 'extreme' ? `Hybrid (${parent1.order}/${parent2.order})` : parent1.order || taxonomicGroup,
        sub_order: mode === 'extreme' ? `Hybrid Sub-order` : taxonomicGroup,
        description: hybridData.description || `This unusual specimen appears to be a natural hybrid of ${parent1.name} and ${parent2.name}.`,
        details: hybridData.details || [
          `Shows ${parent1.name} characteristics in its appearance`,
          `Displays behavior similar to ${parent2.name}`,
          `An unusual specimen that warrants careful study`,
          `Could represent a new variety or even species`
        ],
        habitat: Array.from(habitats).join(', '),
         emoji: hybridData.emoji || determineHybridEmoji(parent1, parent2, taxonomicGroup),
        
        // Status properties
        collected: false,
        observations: [],
        
        // Scientific properties
        scientificValue: mode === 'extreme' ? 
          (hybridData.scientificValue || Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 4) : 
          (hybridData.scientificValue || Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 2),
        hybrid_ease: hybridData.hybrid_ease || Math.floor((parent1.hybrid_ease || 5) + (parent2.hybrid_ease || 5)) / 2,
        hybrid_temperature: hybridData.hybrid_temperature || Math.floor((parent1.hybrid_temperature || 5) + (parent2.hybrid_temperature || 5)) / 2,
        danger: mode === 'extreme' ? 
          (hybridData.danger || Math.max(parent1.danger || 1, parent2.danger || 1) + 2) : 
          (hybridData.danger || Math.max(parent1.danger || 1, parent2.danger || 1)),
        timeofday: hybridData.timeofday || parent1.timeofday || 'Diurnal',
        
        // Keywords for searching
        keywords: hybridData.keywords || [
          ...(parent1.keywords || []), 
          ...(parent2.keywords || []),
          'hybrid', 
          'unusual', 
          'variation'
        ],
        
        // Hybrid-specific properties
        isHybrid: true,
        hybridityType: mode,
        parent1Id: parent1.id,
        parent2Id: parent2.id,
        
        // Memory text for Darwin's thoughts
        memoryText: hybridData.memoryText || 
          (mode === 'extreme' ? 
            `"This is the most extraordinary specimen I've ever encountered! It appears to combine traits of both ${parent1.name} and ${parent2.name} in ways I would have thought impossible."` :
            `"I've never seen such a specimen before. It appears to combine traits of both ${parent1.name} and ${parent2.name} in most peculiar ways."`),
        
        location: null
      };
      const placedHybridSpecimen = assignHybridLocation(hybridSpecimen, {
        parent1,
        parent2,
        seed: `${mode}:${taxonomicGroup}`,
      });

      if (generateImages) {
        try {
          generateHybridImage(placedHybridSpecimen, {
            parent1,
            parent2,
            hybridityMode: mode,
            sessionId: expeditionSeed,
          })
            .then(imageUrl => {
              debugLog(`Generated image for ${placedHybridSpecimen.name}`, imageUrl);
            })
            .catch(err => {
              console.warn(`Image generation failed for ${placedHybridSpecimen.name}:`, err);
            });
        } catch (error) {
          console.warn("Error initiating image generation:", error);
        }
      } else {
        addLog(`Image generation skipped for ${placedHybridSpecimen.name}`);
      }

      
      addLog(`Successfully created ${mode} hybrid: ${placedHybridSpecimen.name} near ${placedHybridSpecimen.location?.name || 'a suitable habitat'}!`);
      return placedHybridSpecimen;
      
    } catch (error) {
      addLog(`Error creating hybrid from API: ${error.message}`);
      console.error("Error creating hybrid:", error);
      
      // Fallback hybrid creation if API fails
      return createFallbackHybrid(parent1, parent2, taxonomicGroup);
    }
  };

  // Fallback method if the API fails
  const createFallbackHybrid = (parent1, parent2, taxonomicGroup) => {
    const mode = hybridityModeRef.current;
    debugLog(`Using fallback ${mode} hybrid creation method`);
    addLog("Using local hybrid generation (API unavailable)");
    
    const hybridName = `${parent1.name.split(' ')[0]}-${parent2.name.split(' ')[1]} Hybrid`;
    const latinName = `${parent1.latin.split(' ')[0]} ${parent2.latin.split(' ')[1]} hybridus`;
    
    // Merge habitats
    const habitats = new Set([
      ...(parent1.habitat ? parent1.habitat.split(', ') : []), 
      ...(parent2.habitat ? parent2.habitat.split(', ') : [])
    ]);
    
    // If no habitats could be determined, add a generic one
    if (habitats.size === 0) {
      habitats.add('scrubland');
      habitats.add('shore');
    }
    
    // Combine keywords, removing duplicates
    const keywords = [
      ...new Set([
        ...(parent1.keywords || []),
        ...(parent2.keywords || []),
        'hybrid',
        'unusual',
        'variation'
      ])
    ];
    
    return assignHybridLocation({
      id: generateHybridId(parent1, parent2),
      name: hybridName,
      latin: latinName,
      ontology: parent1.ontology || 'Animal',
      order: mode === 'extreme' ? `Hybrid (${parent1.order}/${parent2.order})` : parent1.order || taxonomicGroup,
      sub_order: mode === 'extreme' ? `Hybrid Sub-order` : taxonomicGroup,
      description: mode === 'extreme' ? 
        `This extraordinary specimen defies classification, appearing to combine traits of both ${parent1.name} and ${parent2.name} in ways that challenge our understanding of natural history.` :
        `This unusual specimen appears to be a natural hybrid of ${parent1.name} and ${parent2.name}. It shows characteristics of both parent species.`,
      details: [
        `Shows ${parent1.name} characteristics in its appearance`,
        `Displays behavior similar to ${parent2.name}`,
        `An unusual specimen that warrants careful study`,
        `Could represent a new variety or even species`
      ],
      habitat: Array.from(habitats).join(', '),
      collected: false,
      observations: [],
      scientificValue: mode === 'extreme' ? 
        Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 4 : 
        Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 2,
      hybrid_ease: Math.floor((parent1.hybrid_ease || 5) + (parent2.hybrid_ease || 5)) / 2,
      hybrid_temperature: Math.floor((parent1.hybrid_temperature || 5) + (parent2.hybrid_temperature || 5)) / 2,
      danger: mode === 'extreme' ? 
        Math.max(parent1.danger || 1, parent2.danger || 1) + 2 : 
        Math.max(parent1.danger || 1, parent2.danger || 1),
      timeofday: parent1.timeofday || 'Diurnal',
      keywords: keywords,
      isHybrid: true,
      hybridityType: mode,
      parent1Id: parent1.id,
      parent2Id: parent2.id,
      memoryText: mode === 'extreme' ? 
        `"This is the most extraordinary specimen I've ever encountered! It appears to combine traits of both ${parent1.name} and ${parent2.name} in ways I would have thought impossible."` :
        `"I've never seen such a specimen before. It appears to combine traits of both ${parent1.name} and ${parent2.name} in most peculiar ways."`,
      location: null
    }, {
      parent1,
      parent2,
      seed: `${mode}:${taxonomicGroup}:fallback`,
    });
  };
  
  // Main function to generate hybrids
  const generateHybrids = async (numHybrids = 3) => {
    const requestedCount = clampHybridBatchSize(numHybrids);
    // Set generating state
    setIsGenerating(true);
    setProgress(10);
    
    // Make sure we have specimens to work with
    const workingSpecimens = specimenListRef.current.length > 0 
      ? specimenListRef.current 
      : initializeSpecimens();
      
    if (workingSpecimens.length === 0) {
      addLog("Error: Could not initialize specimen data");
      setIsGenerating(false);
      setProgress(0);
      return;
    }
    
    // Update ref with working specimens if needed
    if (specimenListRef.current.length === 0) {
      specimenListRef.current = workingSpecimens;
    }
    
    setProgress(20);
    setGeneratedHybrids([]);
    
    const currentMode = hybridityModeRef.current;
    addLog(`Starting ${currentMode} hybrid generation process for ${requestedCount} specimen${requestedCount === 1 ? '' : 's'}...`);
    
    try {
      // Group specimens by taxonomy level (sub_order for mild, order for extreme)
      const groups = groupSpecimensByTaxonomy();
      
      if (Object.keys(groups).length === 0) {
        throw new Error(`No suitable groups found for ${currentMode} hybridization`);
      }
      
      // Select random parents
      const selectedParents = selectDeterministicParentPairs(
        groups,
        requestedCount,
        `${expeditionSeed || 'young-darwin'}:${currentMode}`,
      );
      
      if (selectedParents.length === 0) {
        throw new Error("No parent pairs could be selected");
      }
      
      // Generate hybrids sequentially
      const hybrids = [];
      setProgress(30); // Update progress
      
      for (let i = 0; i < selectedParents.length; i++) {
        const { taxonomicGroup, parent1, parent2 } = selectedParents[i];
        // Update progress based on how many hybrids we've processed
        setProgress(30 + Math.floor(((i + 1) / selectedParents.length) * 50));
        
        const hybrid = await createHybrid(parent1, parent2, taxonomicGroup);
        hybrids.push(hybrid);
        
        addLog(`Created ${currentMode} hybrid ${i + 1} of ${selectedParents.length}`);
      }
      
      setGeneratedHybrids(hybrids);
      setProgress(80); // Almost done
      
      // Update the game store with the new hybrids
      if (hybrids.length > 0) {
        try {
          // Get the current specimen list - use workingSpecimens if store is empty
          const currentSpecimens = workingSpecimens;
          
          // Create a new list with the hybrids added
          const newSpecimenList = [...currentSpecimens, ...hybrids];
          
          // Update the store with the updated specimen list including hybrids
          setSpecimenList(newSpecimenList);
          
          debugLog(`Store updated successfully with ${currentMode} hybrids!`);
          addLog(`Successfully added ${hybrids.length} ${currentMode} hybrids to the game world!`);
        } catch (error) {
          console.error("Error updating store:", error);
          addLog(`Failed to update game state: ${error.message}`);
        }
      }
      
      setProgress(100);
      
      // Call the onComplete callback to signal that generation is done
      if (onComplete) {
        onComplete(hybrids);
      }
      
    } catch (error) {
      addLog(`Error generating hybrids: ${error.message}`);
      console.error("Hybrid generation error:", error);
      setProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Component render 
  return (
    <div className="hybrid-generator p-4 bg-amber-50 rounded-lg border border-amber-300 shadow-md">
      <h2 className="text-xl font-bold mb-4 text-amber-800">Darwin's Hybrid Species Generator</h2>
      
      <div className="flex items-center mb-4">
        <div className="flex-1 mr-4">
          <p className="text-sm text-gray-700 mb-2">
            Enable a bounded set of natural hybrid species that combine traits from related animals and plants. Text generation runs only when you press the button; image generation is optional.
          </p>
          {!isGenerating && generatedHybrids.length === 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-amber-900">
                  <span>Count</span>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={batchSize}
                    onChange={(event) => setBatchSize(clampHybridBatchSize(event.target.value))}
                    className="w-16 rounded border border-amber-300 bg-white px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    checked={generateImages}
                    onChange={(event) => setGenerateImages(event.target.checked)}
                  />
                  Generate hybrid images
                </label>
              </div>
              <button
                onClick={() => generateHybrids(batchSize)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                disabled={isGenerating}
              >
                Generate Hybrid Species
              </button>
            </div>
          )}
        </div>
        
        {/* Darwin with DNA icon */}
        <div className="hidden md:block w-16 h-16 bg-amber-100 rounded-full overflow-hidden border-2 border-amber-300">
          <div className="w-full h-full flex items-center justify-center text-3xl">
            🧬
          </div>
        </div>
      </div>
      
      {/* Progress indicator during generation */}
      {isGenerating && (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-600">
              Generating hybrid species...
            </span>
            <span className="text-xs text-gray-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-amber-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Generated hybrids list */}
      {generatedHybrids.length > 0 && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2 text-amber-700">Generated Hybrid Species:</h3>
          <div className="bg-white rounded-lg border border-amber-200 p-3 max-h-40 overflow-y-auto">
            <ul className="space-y-2">
              {generatedHybrids.map((hybrid, index) => (
                <li key={hybrid.id || index} className="flex items-start">
                  <span className="text-lg mr-2">🔎</span>
                  <div>
                    <div className="font-medium">{hybrid.name}</div>
                    <div className="text-xs text-gray-500 italic">{hybrid.latin}</div>
                    <div className="text-xs text-amber-700">
                      Hybrid of: {
                        specimenListRef.current.find(s => s.id === hybrid.parent1Id)?.name || 'Unknown'
                      } × {
                        specimenListRef.current.find(s => s.id === hybrid.parent2Id)?.name || 'Unknown'
                      }
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {/* Log output */}
      {log.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1 text-gray-700">Generation Log:</h3>
          <div className="bg-gray-100 rounded-lg border border-gray-200 p-2 text-xs font-mono h-32 overflow-y-auto">
            {log.map((entry, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-500">[{entry.time}]</span> {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
