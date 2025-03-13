// HybridGenerator.jsx - Updated with mild/extreme hybrid options
'use client';

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';
import { initializeSpecimens } from '../data/specimens';
import { generateHybridImage } from '../utils/hybridImageGenerator';

export default function HybridGenerator({ onComplete, hybridityMode = 'mild', isVisible = true }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedHybrids, setGeneratedHybrids] = useState([]);
  const [log, setLog] = useState([]);
  
  // Get data from game store
  const specimenList = useGameStore(state => state.specimenList);
  const gameStarted = useGameStore(state => state.gameStarted);
  const setSpecimenList = useGameStore(state => state.setSpecimenList);
  
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
        console.log(`Initialized ${initialSpecimens.length} specimens for potential hybridization`);
      }
      
      // Auto-generate hybrids when the component becomes visible and mode is set
      if (hybridityMode !== 'none') {
        generateHybrids(4);
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
        console.log("Skipping invalid specimen:", specimen);
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
  
  // Function to select random parent pairs for hybridization
  const selectRandomParents = (groups, numHybrids = 4) => {
    const potentialGroups = Object.entries(groups);
    const selectedParents = [];
    
    console.log("Potential groups for hybridization:", potentialGroups);
    
    for (let i = 0; i < numHybrids; i++) {
      if (potentialGroups.length === 0) {
        console.log("No more potential groups available");
        break;
      }
      
      // Select a random group
      const randomGroupIndex = Math.floor(Math.random() * potentialGroups.length);
      const [taxonomicGroup, specimens] = potentialGroups[randomGroupIndex];
      
      // Select two different specimens from the group
      if (specimens.length < 2) {
        console.log(`Not enough specimens in group ${taxonomicGroup}, skipping`);
        potentialGroups.splice(randomGroupIndex, 1);
        continue;
      }
      
      const specimenIndices = [...Array(specimens.length).keys()];
      const firstIndex = specimenIndices.splice(Math.floor(Math.random() * specimenIndices.length), 1)[0];
      
      if (specimenIndices.length === 0) {
        console.log(`Not enough different specimens in group ${taxonomicGroup}, skipping`);
        potentialGroups.splice(randomGroupIndex, 1);
        continue;
      }
      
      const secondIndex = specimenIndices[Math.floor(Math.random() * specimenIndices.length)];
      
      console.log(`Selected parent pair ${i+1}:`, {
        taxonomicGroup,
        parent1: specimens[firstIndex].name,
        parent2: specimens[secondIndex].name
      });
      
      selectedParents.push({
        taxonomicGroup,
        parent1: specimens[firstIndex],
        parent2: specimens[secondIndex]
      });
      
      // Remove this group to avoid creating multiple hybrids from the same group
      // This ensures diversity in hybrid types
      potentialGroups.splice(randomGroupIndex, 1);
    }
    
    addLog(`Selected ${selectedParents.length} potential parent pairs`);
    return selectedParents;
  };

  // Function to generate a hybrid ID
  const generateHybridId = (parent1, parent2) => {
    // Create a unique ID that clearly identifies it as a hybrid
    const mode = hybridityModeRef.current === 'extreme' ? 'ex' : 'mi';
    return `hybrid_${mode}_${parent1.id.substring(0, 4)}${parent2.id.substring(0, 4)}`;
  };
  
  // Random location generator
  const getRandomLocation = () => {
    return {
      x: Math.floor(Math.random() * 4),
      y: Math.floor(Math.random() * 4)
    };
  };

  // Function to create a hybrid using an LLM
  const createHybrid = async (parent1, parent2, taxonomicGroup) => {
    const mode = hybridityModeRef.current;
    addLog(`Creating ${mode} hybrid between ${parent1.name} and ${parent2.name}...`);
    
    try {
      const response = await fetch('/api/generate-hybrid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent1,
          parent2,
          taxonomicGroup,
          hybridityMode: mode
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const data = await response.json();
      console.log("API response data:", data);
      
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
         emoji: hybridData.emoji || determineHybridEmoji(parent1, parent2, sub_order),
        
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
        
        // Random location on the map
        location: getRandomLocation()
      };

try {
  // Generate image asynchronously
  generateHybridImage(hybridSpecimen)
    .then(imageUrl => {
      console.log(`Generated image for ${hybridSpecimen.name}`);
      // You can update the hybrid with the image URL if needed
    })
    .catch(err => {
      console.warn(`Image generation failed for ${hybridSpecimen.name}:`, err);
    });
} catch (error) {
  console.warn("Error initiating image generation:", error);
}

      
      addLog(`Successfully created ${mode} hybrid: ${hybridSpecimen.name}!`);
      return hybridSpecimen;
      
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
    console.log(`Using fallback ${mode} hybrid creation method`);
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
    
    return {
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
      location: getRandomLocation()
    };
  };
  
  // Main function to generate hybrids
  const generateHybrids = async (numHybrids = 3) => {
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
    addLog(`Starting ${currentMode} hybrid generation process...`);
    
    try {
      // Group specimens by taxonomy level (sub_order for mild, order for extreme)
      const groups = groupSpecimensByTaxonomy();
      
      if (Object.keys(groups).length === 0) {
        throw new Error(`No suitable groups found for ${currentMode} hybridization`);
      }
      
      // Select random parents
      const selectedParents = selectRandomParents(groups, numHybrids);
      
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
          
          console.log(`Store updated successfully with ${currentMode} hybrids!`);
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
            Enable the discovery of natural hybrid species that combine traits from related animals and plants. Darwin will be able to find these unusual specimens during his exploration.
          </p>
          {!isGenerating && generatedHybrids.length === 0 && (
            <button
              onClick={() => generateHybrids(10)}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              disabled={isGenerating}
            >
              Enable Hybrid Species
            </button>
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