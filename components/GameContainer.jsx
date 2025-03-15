/// GameContainer.jsx for YOUNG DARWIN

'use client';

import React, { useState, useEffect } from 'react';
import useGameStore from '../hooks/useGameStore';
import Portrait from './Portrait';
import PlayerInput from './PlayerInput';
import SpecimenCollection from './SpecimenCollection';
import GameLog from './GameLog';
import BannerImage from './BannerImage';
import { tools, collectionTools } from '../data/tools';
import { openingTexts } from '../data/openingTexts';
import MemoryButton from './MemoryButton';
import MemoryModal from './MemoryModal';
import { initializeSpecimens, analyzeNarrativeForSpecimens } from '../data/specimens';
import { npcs, getNPCsForLocation, formatNPCForLLM } from '../data/npcs';
import WeatherTimeDisplay from './WeatherTimeDisplay';
import CollectionResultPopup from './CollectionResultPopup';
import InteriorMap from './InteriorMap';
import { getCellByCoordinates, islandGrid } from '../utils/locationSystem';
import LLMTransparency from './LLMTransparency';
import NearbySpecimenDetail from './NearbySpecimenDetail';
import EnhancedEventHistory from './EnhancedEventHistory';
import EventHistoryDebug from './EventHistoryDebug';
import buildLLMPromptContext from '../utils/generateLLMContext';
import HybridGenerator from './HybridGenerator';
import HybridsDebug from './HybridsDebug';
import { useLocationSystem } from '../utils/locationHook';
import EnhancedMapBox from './EnhancedMapBox';
import { useMemo } from 'react';
import HybridSpecimenImage from './HybridSpecimenImage';
import { getSpecimenIcon } from '../utils/specimenUtils';
import Journal from './Journal';
import HamburgerMenu from './HamburgerMenu';
import EndGame from './EndGame';

function GameContainer() {
  // Pull all needed functions and state from the game store
  const {
    gameStarted,
    startGame,
    fatigue,
    darwinMood,
    specimenList,
    currentSpecimen,
    inventory,
    narrativeText,
    collectSpecimen,
    useScientificTool,
    setCurrentSpecimen,
    advanceTime,
    formatGameTime,
    setNarrativeText,
    getRecentHistory,
    updateMoodAndFatigue,
    addJournalEntry,
    addToGameHistory,
    isLoading,
    setIsLoading,
    currentNPC,
    setCurrentNPC,
    daysPassed,
    gameTime,
     setSpecimenList
  } = useGameStore();
  
  // Use the location hook for grid-based movement
  const { 
  playerPosition, 
  currentLocationId, 
  handleMove, 
  moveToLocation, 
  detectMovementInText,
  getCurrentLocation,
  getValidDirections,
  isInInterior,         
  interiorType,         
  interiorPlayerPosition, 
  enterInterior,       
  exitInterior,        
  moveInInterior        
 } = useLocationSystem((locationInfo) => {

   // If we're entering an interior, use interior type instead of exterior cell
if (isInInterior) {
  const currentInterior = getCurrentLocation();
  if (currentInterior && currentInterior.type) {
    // Find all specimens that can exist in this interior type
    const specimenIds = specimenList
      .filter(s => s.habitat && s.habitat.split(', ').includes(currentInterior.type))
      .map(s => s.id);
    setNearbySpecimenIds(specimenIds);
  }
  return;
}

const specimen = specimenList?.find(s => s.id === specifiedId);

// This callback runs when location changes
const currentCell = getCellByCoordinates(locationInfo.position.x, locationInfo.position.y);
if (currentCell && currentCell.type) {
  // Find all specimens that can exist in this habitat type
  const specimenIds = specimenList
    .filter(s => s.habitat && s.habitat.split(', ').includes(currentCell.type))
    .map(s => s.id);
  setNearbySpecimenIds(specimenIds);
}
  
  
  // Clear current NPC when location changes
  if (currentNPC) {
    setCurrentNPC(null);
  }
  
  
});

   // check for NPCS before changing location
const handleNPCsOnMovement = () => {
  // If there's a current NPC
  if (currentNPC) {
    // Check if it's Syms Covington, who should follow the player
    const isSyms = currentNPC === 'syms_covington';
    
    // If not Syms, clear the current NPC
    if (!isSyms) {
      setCurrentNPC(null);
      setVisibleNPCs([]);
    }
  }
};

const handleHybriditySelection = (mode) => {
  setHybridityMode(mode);
  
  // If selecting 'none', clear any previously generated hybrids
  if (mode === 'none') {
    setGeneratedHybrids([]);
    setHybridsEnabled(false);
  }
};


const handleHybridsGenerated = (generatedHybrids) => {
  console.log("Hybrids generated and received in GameContainer:", generatedHybrids);
  setHybridsEnabled(true);
  setGeneratedHybrids(generatedHybrids);
  
  // Close the hybrid options panel
  setShowHybridOptions(false);

  
  // Check if hybrids already have locations
  const hybridsWithLocations = generatedHybrids.map(hybrid => {
    // If the hybrid doesn't have a location, assign a random one
    if (!hybrid.location) {
      return {
        ...hybrid,
        // Assign random location that will likely be on the map
        location: {
          x: Math.floor(Math.random() * 4),
          y: Math.floor(Math.random() * 4)
        }
      };
    }
    return hybrid;
  });
  
  // Make sure all hybrids have the isHybrid flag set
  const verifiedHybrids = hybridsWithLocations.map(hybrid => ({
    ...hybrid,
    isHybrid: true
  }));
  
  // Update the specimen list with the new hybrids
  const updatedSpecimenList = [...specimenList, ...verifiedHybrids];
  setSpecimenList(updatedSpecimenList);
  
  // Set state to show hybrids are enabled
  setHybridsEnabled(true);
  setGeneratedHybrids(verifiedHybrids);
  
  // Close the hybrid options panel
  setShowHybridOptions(false);
  
  // Log the hybrids for debugging
  console.log("Updated specimen list with hybrids:", 
    updatedSpecimenList.filter(s => s.isHybrid).map(s => ({
      id: s.id,
      name: s.name,
      habitat: s.habitat,
      location: s.location
    }))
  );
};

  
  // Local state
  const [gameInitialized, setGameInitialized] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [nearbySpecimenIds, setNearbySpecimenIds] = useState([]);
  const [discoveredNPCs, setDiscoveredNPCs] = useState([]);
  const [visibleNPCs, setVisibleNPCs] = useState([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [nextStepSuggestions, setNextStepSuggestions] = useState([
    { text: 'Observe surroundings', action: 'Carefully observe the surroundings for any interesting specimens.' },
    { text: 'Take notes', action: 'Record detailed observations in my journal about what I see.' },
    { text: 'Move north', action: 'Go north' },
    { text: 'Examine area', action: 'Examine the area for marine specimens.' }
  ]);
  const [lastUserInput, setLastUserInput] = useState('');
  const [showCollectionPopup, setShowCollectionPopup] = useState(false);
  const [collectingSpecimenId, setCollectingSpecimenId] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [collectionNotes, setCollectionNotes] = useState('');
  // tk should change this to make it more modular for other POVs - i.e. POVthoughts 
const [tortoiseThoughts, setTortoiseThoughts] = useState(null);


// for LLMtransparency.jtx
const [rawLLMResponse, setRawLLMResponse] = useState('');
const [rawLLMPrompt, setRawLLMPrompt] = useState('');


const [showCollectionResult, setShowCollectionResult] = useState(false);
const [collectionResult, setCollectionResult] = useState(null);
const [collectionSpecimenName, setCollectionSpecimenName] = useState('');
const [collectionMethod, setCollectionMethod] = useState('');
const currentLocation = useMemo(() => getCurrentLocation(), [playerPosition]);
const [showNearbySpecimenDetail, setShowNearbySpecimenDetail] = useState(false);
const [selectedNearbySpecimen, setSelectedNearbySpecimen] = useState(null);
const [primaryCollectible, setPrimaryCollectible] = useState(null);
const [encounteredNPCs, setEncounteredNPCs] = useState([]);
const [showFatigueWarning, setShowFatigueWarning] = useState(false);
const [showRestButton, setShowRestButton] = useState(false);
const [currentInteriorRoom, setCurrentInteriorRoom] = useState(null);
const [showHybridOptions, setShowHybridOptions] = useState(false);
const [hybridsEnabled, setHybridsEnabled] = useState(false);
const [generatedHybrids, setGeneratedHybrids] = useState([]);
const [hybridityMode, setHybridityMode] = useState('none'); // 'none', 'mild', or 'extreme'
const [isMovingViaMap, setIsMovingViaMap] = useState(false);
const [journalOpen, setJournalOpen] = useState(false);
const [journalSpecimen, setJournalSpecimen] = useState(null);

  // Initialize the game
  useEffect(() => {
    if (gameStarted && !gameInitialized) {
      // Initialize suggestions based on valid directions
      updateNextStepSuggestions();
      
      // Select a random opening text
      const randomIndex = Math.floor(Math.random() * openingTexts.length);
      const selectedOpening = openingTexts[randomIndex];
      setNarrativeText(selectedOpening.text);
      
      updateMoodAndFatigue('curious', null);
      setGameInitialized(true);
    }
  }, [gameStarted, gameInitialized, setNarrativeText, updateMoodAndFatigue]);

  // Update direction suggestions based on current location
  const updateNextStepSuggestions = () => {
    const validDirs = getValidDirections();
    const dirNames = {
      'N': 'north',
      'S': 'south',
      'E': 'east',
      'W': 'west',
      'NE': 'northeast',
      'NW': 'northwest',
      'SE': 'southeast',
      'SW': 'southwest'
    };
    
    const locationSuggestions = validDirs.map(dir => ({
      text: `Move ${dirNames[dir]}`,
      action: `Go ${dirNames[dir]}`
    }));
    
    // Combine and limit to 4 suggestions
    const allSuggestions = [...locationSuggestions];
    setNextStepSuggestions(allSuggestions.slice(0, 4));
  };
  



// Detection of specimens and NPCs in narrative text
useEffect(() => {
  if (narrativeText) {
    // Detect specimens explicitly marked by LLM
    const collectibleMatches = narrativeText.match(/\[COLLECTIBLE:(.*?)\]/g);
    let specimenIds = [];
    
    if (collectibleMatches) {
      // Get specimens from explicit markers
      specimenIds = collectibleMatches.map(match => 
        match.replace('[COLLECTIBLE:', '').replace(']', '').trim()
      );
    } else {
      // Only as fallback, look for bold-formatted specimens in the text
      const boldItems = narrativeText.match(/\*\*(.*?)\*\*/g) || [];
      
      // Check what bold items correspond to collectible specimens
      for (const boldItem of boldItems) {
        const cleanItem = boldItem.replace(/\*\*/g, '').toLowerCase();
        
        // Find corresponding specimen ID
        const matchedSpecimen = specimenList.find(specimen => 
          cleanItem.includes(specimen.id) || 
          specimen.keywords.some(keyword => cleanItem.includes(keyword.toLowerCase()))
        );
        
        if (matchedSpecimen && !specimenIds.includes(matchedSpecimen.id)) {
          specimenIds.push(matchedSpecimen.id);
        }
      }
    }
const npcStatusMatch = narrativeText.match(/\[NPC_STATUS:\s*(.*?)\]/);
if (npcStatusMatch && npcStatusMatch[1] === 'dismissed') {
  console.log("Dismissing NPC based on [NPC_STATUS: dismissed]");
  setCurrentNPC(null);
  setVisibleNPCs([]);
}

// 2) Optionally, check for simple “departure” phrases.
//    This is only if you want to parse text for “He left” or “He walked away.” 
//    If you prefer to rely solely on the [NPC_STATUS] marker, skip this.
const departureRegex = /(left|walked away|departed|farewell)/i;
if (departureRegex.test(narrativeText)) {
  console.log("Dismissing NPC based on a departure phrase in the text");
  setCurrentNPC(null);
  setVisibleNPCs([]);
}
    
    // Only detect NPCs if we don't have an active NPC conversation
    if (!currentNPC) {
      // Get NPCs available at current location and time
      const availableNPCs = getNPCsForCurrentLocationAndTime();
      
      if (availableNPCs.length > 0) {
        setVisibleNPCs(availableNPCs);
      }
    }
    
    // Process narrative for movement directions
    const movementResult = detectMovementInText(narrativeText);
    if (movementResult) {
      console.log("Movement detected in narrative:", movementResult);
      // Update suggestions based on new location
      updateNextStepSuggestions();
    }
  }

}, [narrativeText, currentNPC, lastUserInput, specimenList, gameTime]);

const checkHybridsInLocation = (locationId) => {
  console.log(`Checking for hybrids in location: ${locationId}`);

    const location = islandGrid.find(cell => cell.id === locationId);
  if (!location) {
    console.log(`Location ${locationId} not found in islandGrid`);
    return;
  }

    const hybridsForLocation = specimenList.filter(s => 
    s?.isHybrid && 
    s.habitat && 
    (s.habitat.includes(location.type) || true) // true to see all hybrids for debugging
  );
  
  console.log(`Found ${hybridsForLocation.length} hybrids for location type ${location.type}:`,
    hybridsForLocation.map(h => h.name));
  
  return hybridsForLocation;
};

// NPC clearing
useEffect(() => {
  // If an NPC conversation ends, clear their visibility
  if (!currentNPC) {
    setVisibleNPCs([]);
  }
}, [currentNPC]);

// After your other useEffect hooks
// Monitor fatigue and show warnings or trigger pass out
useEffect(() => {
  // High fatigue warning (75% or higher)
  if (fatigue >= 75 && fatigue < 95) {
    setShowFatigueWarning(true);
    // Auto-hide warning after 5 seconds
    const timer = setTimeout(() => {
      setShowFatigueWarning(false);
    }, 5000);
    return () => clearTimeout(timer);
  }
  
  // Critical fatigue - pass out (95% or higher)
  if (fatigue >= 95) {
    handlePassOut();
  }
}, [fatigue]);

// Check if current location allows resting
useEffect(() => {
  const currentLocation = getCurrentLocation();
  const restableLocations = ['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT'];
  
  // Only show rest button if in a restable location AND fatigue is above 50
  if (currentLocation && 
      restableLocations.includes(currentLocation.id) && 
      fatigue > 50) {
    setShowRestButton(true);
  } else {
    setShowRestButton(false);
  }
}, [playerPosition, fatigue]);

// Helper function to get NPCs at current location and time
const getNPCsForCurrentLocationAndTime = () => {
  const currentLocation = getCurrentLocation()?.id;
  const currentHour = Math.floor((gameTime % 1440) / 60);
  
  if (!currentLocation) return [];
  
  // Simple time-based rules for NPCs
  const availableNPCs = [];
  
  // Syms Covington: at Post Office Bay from 6pm-8am
  if (currentLocation === 'POST_OFFICE_BAY' && (currentHour >= 18 || currentHour < 8)) {
    availableNPCs.push('syms_covington');
  }
  
  // FitzRoy: always on the HMS Beagle
  if (currentLocation === 'BEAGLE') {
    availableNPCs.push('fitzroy');
  }
  
  // Gabriel Puig: always at Pirate Caves, TK commented out because of duplicate IDs
  //if (currentLocation === 'CAVE') {
  //  availableNPCs.push('gabriel_puig');
  //}
  
  // Maria Yupanqui: at C_NORTH from 10am to 5pm
  if (currentLocation === 'C_NORTH' && currentHour >= 10 && currentHour < 17) {
    availableNPCs.push('maria');
  }

   // Maria Yupanqui: at governors house other times
  if (currentLocation === 'GOVERNORS_HOUSE_GARDEN' && currentHour >= 18 && currentHour < 9) {
    availableNPCs.push('maria');
  }
  
  
  // Lascar Joe: at HMS Beagle from 6am to 1pm, at N_OUTCROP from 1pm to 6am
  if ((currentLocation === 'BEAGLE' && currentHour >= 6 && currentHour < 13) || 
      (currentLocation === 'N_OUTCROP' && (currentHour >= 13 || currentHour < 6))) {
    availableNPCs.push('lascar_joe');
  }
  
  // Special cases for interior locations
  if (isInInterior) {
    if (interiorType === 'cave') {
      availableNPCs.push('gabriel_puig');
    } else if (interiorType === 'hms_beagle') {
      availableNPCs.push('fitzroy');
    } else if (interiorType === 'governors_house') {
      availableNPCs.push('nicolas_lawson');
    }
  }
  
  return availableNPCs;
};


// Handle NPC interaction
const handleTalkToNPC = (npcId) => {
  // Get full NPC data
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  
  // Set the current NPC
  setCurrentNPC(npcId);
  
  // Build a detailed prompt about the NPC
  const prompt = `
You are now in conversation with ${npc.name}, ${npc.role}.

${npc.name} is ${npc.shortDescription}

Character details:
- Background: ${npc.background}
- Appearance: ${npc.appearance}
- Personality: ${npc.personality}
- Game role: ${npc.gameRole}
- Sample dialogue (alter and adapt this to the setting): ${npc.dialogueExamples}
- Initial reaction to Darwin: ${npc.initialReaction}


Start a conversation with ${npc.name}.
`;
  
  // Send to LLM
  sendToLLM(prompt);
};

// When ending an NPC interaction
const handleEndNPCInteraction = () => {
  setCurrentNPC(null);
  setVisibleNPCs([]);
};

// function to handle cave entry
const handleEnterCave = () => {
  // Only available from Pirate Caves location
  if (currentLocationId !== 'E_MID') {
    sendToLLM("There are no caves nearby to enter.");
    return;
  }
  
  // Enter Gabriel's Cave - use the enterInterior function from useLocationSystem
  const result = enterInterior('cave', { x: 1, y: 2 }); // Start at cave entrance
  
  if (result.success) {
    // Force Gabriel to be present in the cave
    setVisibleNPCs(['gabriel_puig']);
    sendToLLM(result.message + " The cave is dimly lit by a few candles. As your eyes adjust to the darkness, you make out the silhouette of a man sitting at a makeshift desk covered in papers.");
  }
};

// Add this useEffect after your other useEffects
useEffect(() => {
  // This runs when hybrids are enabled to ensure they're properly integrated
  if (hybridsEnabled && generatedHybrids.length > 0) {
    console.log("Verifying hybrids in specimen list...");
    
    // Find hybrids in the specimen list
    const hybridsInList = specimenList.filter(s => s?.isHybrid);
    console.log(`Found ${hybridsInList.length} hybrids in specimen list`);
    
    // Check if all hybrids have locations
    const hybridsWithoutLocations = hybridsInList.filter(
      s => !s.location || (!s.location.x && !s.location.y)
    );
    
    // If any hybrids are missing locations, add them
    if (hybridsWithoutLocations.length > 0) {
      console.log(`Found ${hybridsWithoutLocations.length} hybrids without locations, fixing...`);
      
      const updatedList = specimenList.map(specimen => {
        if (specimen?.isHybrid && (!specimen.location || (!specimen.location.x && !specimen.location.y))) {
          return {
            ...specimen,
            location: {
              x: Math.floor(Math.random() * 4),
              y: Math.floor(Math.random() * 4)
            }
          };
        }
        return specimen;
      });
      
      setSpecimenList(updatedList);
    }
  }
}, [hybridsEnabled, generatedHybrids, specimenList]);



  // Collection popup handlers
const handleOpenCollectionPopup = (specimenId) => {
  console.log("Opening collection popup for:", specimenId);
  const specimen = specimenList.find(s => s.id === specimenId);
  if (!specimen) {
    console.error("Invalid specimen ID:", specimenId);
    return;
  }
  
  // Set the current specimen (this is important for context)
  setCurrentSpecimen(specimen);
  
  // Set up the collection popup
  setCollectingSpecimenId(specimenId);
  setSelectedMethod(null);
  setCollectionNotes('');
  setShowCollectionPopup(true);
};

// Handle collection confirmation
const handleCollectionConfirm = () => {
  if (!collectingSpecimenId || !selectedMethod) return;
  
  // Call the collection method
  handleCollectSpecimenMethod(collectingSpecimenId, selectedMethod, collectionNotes);
  
  // Close the popup
  setShowCollectionPopup(false);
};

  // Updated handleCollectNearbySpecimen function
const handleCollectNearbySpecimen = async (specimenId) => {
  const specimen = specimenList.find(s => s.id === specimenId);
  
  if (specimen) {
    try {
      // Prepare context for collection attempt
      const collectionContext = {
        specimenId,
        specimenName: specimen.name,
        location: currentLocationId,
        narrativeContext: narrativeText
      };

      const response = await fetch('/api/collection-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectionContext)
      });

      const result = await response.json();

      // Set popup data
      setCollectionResult(result);
      setCollectionSpecimenName(specimen.name);
      setCollectionMethod("hands"); // Default method when not specified
      
      // If successful, collect the specimen and send narrative
      if (result.success) {
        collectSpecimen(specimenId);
        sendToLLM(`You successfully collected the ${specimen.name} for further study.`);
      } else {
        // Send narrative about failed collection attempt
        sendToLLM(`You attempted to collect the ${specimen.name}, but encountered significant challenges. ${result.reason || ''}`);
      }
      
      // Show the popup
      setShowCollectionResult(true);
      
    } catch (error) {
      console.error('Collection attempt failed:', error);
      sendToLLM(`There was an error attempting to collect the ${specimen.name}.`);
    }
  }
};

  // nearby specimen detail popup

const handleViewNearbySpecimenDetail = (specimen) => {
  setSelectedNearbySpecimen(specimen);
  setShowNearbySpecimenDetail(true);
};

// specimen collection method handler

const handleCollectSpecimenMethod = async (specimenId, method, notes) => {
  console.log("Collecting specimen with method:", method?.name, "notes:", notes);

  // Find the specimen to be collected
  const specimen = specimenList.find(s => s.id === specimenId);
  if (!specimen) {
    console.error("Specimen not found:", specimenId);
    return;
  }

  try {
   
    // Set loading state FIRST
    setIsLoading(true);
    setNarrativeText('');
    
    // Prepare the collection context data
    const collectionContext = {
      specimenId,
      specimenName: specimen.name,
      location: currentLocationId,
      narrativeContext: narrativeText,
      collectionMethod: method?.name || "",
      playerNotes: notes || ""
    };

    // Call the collection-decision API
    const response = await fetch('/api/collection-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectionContext)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const result = await response.json();

    // Set popup data and show the popup IMMEDIATELY (while still loading)
    setCollectionResult(result);
    setCollectionSpecimenName(specimen.name);
    setCollectionMethod(method?.name || "your method");
    setShowCollectionResult(true);
    
    // Process the result in the background
    if (result.success) {
      // If successful, add to inventory
      collectSpecimen(specimenId);
      
      // Create a descriptive message about the successful collection
      const successMessage = `You successfully collected the ${specimen.name} using ${method?.name}. ${
        method?.name === 'Shotgun' ? 'The sound echoes across the landscape.' :
        method?.name === 'Hands' ? 'You carefully gather the specimen.' :
        method?.name === 'Snare' ? 'The trap works perfectly.' :
        method?.name === 'Insect Net' ? 'With a swift motion, you capture it.' :
        'The collection is successful.'
      } ${notes ? `Your approach - ${notes} - proved effective.` : ''}`;
      
      // Send success message to LLM
      sendToLLM(successMessage);
    } else {
      // Create a descriptive message about the failed collection
      const failureMessage = `You attempted to collect the ${specimen.name} with ${method?.name}, but encountered difficulties. ${result.reason || 'The specimen evaded your efforts.'}`;
      
      // Send failure message to LLM
      sendToLLM(failureMessage);
    }
    
  } catch (error) {
    console.error('Collection attempt failed:', error);
    sendToLLM(`An error occurred while attempting to collect the ${specimen.name}: ${error.message}`);
    setIsLoading(false);
  }

}
  
  // Handle detailed tool use
  const handleDetailedToolUse = (toolId, specimenId, userDetails) => {
    const tool = tools.find(t => t.id === toolId);
    const specimen = specimenList.find(s => s.id === specimenId);
    
    if (tool && specimen) {
      // Set active tool temporarily for banner image
      setActiveTool(tool.name);
      setTimeout(() => setActiveTool(null), 5000);
      
      // Send tool use prompt
      const detailedPrompt = `Darwin uses his ${tool.name} to examine the ${specimen.name}. Specifically, he ${userDetails}.`;
      sendToLLM(detailedPrompt);
    }
  };

/// Resting, journal, and fatigue handlers

const handleOpenJournal = (specimen) => {
  setJournalSpecimen(specimen);
  setJournalOpen(true);
};

//  handlePassOut function with random NPC rescue
const handlePassOut = () => {
  // Reset fatigue
  updateMoodAndFatigue(null, 0);
  
  // Get list of NPCs who could find Darwin
  const possibleRescuers = [
    { id: 'syms_covington', name: 'Syms Covington', location: 'POST_OFFICE_BAY', description: "You remember little after your collapse. Syms must have followed you and found you unconscious - he's dragged you back to the ship. 'Blasted fool,' he mutters, handing you water. 'What would the Captain say if I'd lost ye?'" },
    { id: 'maria', name: 'María Yupanqui', location: 'GOVERNORS_HOUSE_GARDEN', description: "You wake to the smell of unfamiliar herbs steeping in hot water. María Yupanqui sits nearby, mixing a poultice. 'The island takes those who don't respect its dangers,' she says softly. 'Drink this. It will restore your strength.'" },
    { id: 'gabriel_puig', name: 'Gabriel Puig', location: 'E_MID', description: "You wake in a dim cave, a revolutionary's hideout. Gabriel Puig eyes you suspiciously. 'I found you half-dead. A British naturalist shouldn't die from simple exhaustion,' he says, almost disappointed. 'It would be too... ordinary.'" },
    { id: 'lascar_joe', name: 'Lascar Joe', location: 'NW_SHORE', description: "You wake on black sand, the hull of a small boat providing shade. Lascar Joe sits silently nearby, mending a net. He nods when he sees you stir. 'Man must know his limits,' he says simply, offering a waterskin." },
    { id: 'nicolas_lawson', name: 'Nicolás Lawson', location: 'SETTLEMENT', description: "You wake in an unfamiliar bed. Vice-Governor Lawson stands at a desk reviewing papers. 'Ah, the naturalist lives. My men found you sprawled like a shipwreck victim. The islands demand respect, Mr. Darwin. Even from men of science.'" }
  ];
  
  // Randomly select one rescuer
  const rescuer = possibleRescuers[Math.floor(Math.random() * possibleRescuers.length)];
  
  // Advance time to next morning
  const currentHour = Math.floor((gameTime % 1440) / 60);
  const minutesToNextDay = (24 - currentHour) * 60;
  advanceTime(minutesToNextDay + 6 * 60); // Add 6 hours for next morning at 6 AM
  
  // Move to the rescuer's location
  moveToLocation(rescuer.location);
  
  // Set the rescuer as the active NPC
  setCurrentNPC(rescuer.id);
  
  // Create the popup message
  const popupMessage = `
    <div class="text-center mb-4 ">
      <p class="text-xl font-bold">Darwin collapsed from exhaustion!</p>
      <p>You were found by ${rescuer.name}.</p>
    </div>
    <p>${rescuer.description}</p>
  `;
  
  // Show a popup (you can use your existing popup mechanism or add this simple one)
  // This assumes you have a way to show popups in your game
  showPassOutPopup(popupMessage, () => {
    // After popup is dismissed, send message to LLM about the recovery
    sendToLLM(`Darwin collapsed from exhaustion yesterday and was found by ${rescuer.name}. It's now morning, and Darwin is recovering in ${getCurrentLocation().name}.`);
  });
};

// Simple popup function (if you don't already have one)
const showPassOutPopup = (message, onClose) => {
  // Create popup element
  const popupOverlay = document.createElement('div');
  popupOverlay.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50';
  
  const popupContent = document.createElement('div');
  popupContent.className = 'bg-amber rounded-lg shadow-xl p-6 max-w-md mx-4';
  popupContent.innerHTML = `
    ${message}
    <div class="mt-6 text-center">
      <button class="bg-amber-700 hover:bg-amber-800 text-white py-2 px-6 rounded-lg">
        Continue
      </button>
    </div>
  `;
  
  popupOverlay.appendChild(popupContent);
  document.body.appendChild(popupOverlay);
  
  // Add click handler to close button
  const continueButton = popupContent.querySelector('button');
  continueButton.addEventListener('click', () => {
    document.body.removeChild(popupOverlay);
    if (onClose) onClose();
  });
};

// Generic rest function that works in any valid rest location
const handleRest = () => {
  // Get current location
  const currentLocation = getCurrentLocation();
  
  // Reset fatigue
  updateMoodAndFatigue(null, 0);
  
  // Advance time (different amounts based on location)
  const currentHour = Math.floor((gameTime % 1440) / 60);
  
  // Different rest messages based on location
  let restMessage = "";
  
  if (currentLocation.id === 'POST_OFFICE_BAY') {
    // Full night's rest on Beagle
    const minutesToNextDay = (24 - currentHour) * 60;
    advanceTime(minutesToNextDay + 6 * 60); // Next day at 6 AM
    
    restMessage = "You return to the HMS Beagle for the night, enjoying a hearty meal with the crew. After a good night's rest in your small but comfortable cabin, you awaken refreshed and ready to continue your explorations at dawn.";
  } 
  else if (currentLocation.id === 'W_LAVA') {
    // Shorter rest at whaler's huts
    advanceTime(240); // 4 hours
    
    restMessage = "You take shelter in one of the seasonal whaler's huts. The simple structure offers welcome protection from the elements. You spread your coat on the dirt floor and rest for several hours, lulled by the distant sound of waves. When you awaken, you feel remarkably refreshed.";
  }
  else if (currentLocation.id === 'SETTLEMENT') {
    // Rest at settlement
    advanceTime(360); // 6 hours
    
    restMessage = "Despite the grim atmosphere of the penal colony, you find a relatively comfortable corner in one of the structures where travelers are permitted to stay. The colonists leave you to your own devices, and you manage several hours of solid rest. You awaken feeling restored and ready to continue your explorations.";
  }
  
  // Send message about rest
  sendToLLM(restMessage);
};
  
  // Handle resting at HMS Beagle
  const handleRestAtBeagle = () => {
    // Reset fatigue
    updateMoodAndFatigue(null, 0);
    
    // Advance time to next morning
    const currentHour = Math.floor((gameTime % 1440) / 60);
    const minutesToNextDay = (24 - currentHour) * 60;
    advanceTime(minutesToNextDay + 6 * 60); // Add 6 hours for next morning at 6 AM
    
    // Send message about restc
    sendToLLM("Darwin returns to the HMS Beagle for the night, enjoying a hearty meal with Captain FitzRoy and the crew. After a good night's rest in his small but comfortable cabin, he awakens refreshed and ready to continue his explorations at dawn.");
  };

  // handle switch POV 
const handleSwitchPOV = async (prompt) => {
  setIsLoading(true);
  try {
    // Get current location for context
    const currentLocation = getCurrentLocation();
    
    // Build context data similar to your existing sendToLLM function
    const contextData = {
      location: currentLocation?.name || "Isla Floreana",
      locationDesc: currentLocation?.description || "",
      time: formatGameTime(),
      day: daysPassed,

    };
    
    // Call the API using the tortoise prompt
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameState: contextData,
        prompt: prompt,
        isTortoiseRequest: true // flag to differentiate it
      })
    });
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    const tortoiseResponse = data.choices?.[0]?.message?.content || 
                           data.message?.content || 
                           'Warm rock... sun good... slow blink...';
    
    // Display the tortoise thoughts
    setTortoiseThoughts(tortoiseResponse);
    
  } catch (error) {
    console.error("Error getting tortoise perspective:", error);
    setTortoiseThoughts(`Error: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};
  
  // Process player input
 const handlePlayerInput = async (input) => {
  // Check for rest commands
  const restTerms = ['rest', 'sleep', 'nap', 'lay down', 'lie down', 'make camp', 'build shelter'];
  const isRestCommand = restTerms.some(term => input.toLowerCase().includes(term));
  
  // If it's a rest command and in a valid location, handle rest
  const currentLocation = getCurrentLocation();
  const restableLocations = ['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT'];
  
  if (isRestCommand && currentLocation && restableLocations.includes(currentLocation.id)) {
    handleRest();
    return;
  }
    // Save the input for movement detection
    setLastUserInput(input);


    
    // Check for movement commands
    const movementResult = detectMovementInText(input);
    if (movementResult) {
  // Check if we should remove the current NPC
  handleNPCsOnMovement();
  
  if (movementResult.success) {
    // Movement was successful
    sendToLLM(movementResult.message);
    
    if (movementResult.fatigueIncrease) {
      updateMoodAndFatigue(null, fatigue + movementResult.fatigueIncrease);
    }
    
    // Update suggestions (directions)
    updateNextStepSuggestions();
    
    // Update nearby specimens
    if (movementResult.newPosition) {
      const newCell = getCellByCoordinates(
        movementResult.newPosition.x,
        movementResult.newPosition.y
      );
      if (newCell && newCell.type) {
        const habitatSpecimens = specimenList.filter(spec => {
          const habitats = spec.habitat.split(', ');
          return habitats.includes(newCell.type);
        });

        setNearbySpecimenIds(habitatSpecimens.map(s => s.id));
      } else {
        setNearbySpecimenIds([]);
      }
    }
    
    return;  // Stop here
  } else {
    // Movement was attempted but failed
    sendToLLM(movementResult.message);
    return;  // Stop here
  }
}

 // handling attempts to enter interior maps 
// In GameContainer.jsx, update the handleInteriorEntry function

const handleInteriorEntry = (interiorType) => {
  const layout = interiorLayouts[interiorType];
  if (!layout) {
    sendToLLM("There's nothing to enter here.");
    return;
  }
  
  // Check if we can enter from current location
  const currentLocation = getCurrentLocation();
  if (currentLocation.id !== layout.exteriorLocation) {
    sendToLLM(`The ${layout.name} is not accessible from here.`);
    return;
  }
  
  // Enter the interior
  const result = enterInterior(interiorType);
  
  if (result.success) {
    // The NPCs should now come from the room definition
    // This automatically happens in getCurrentLocation
    sendToLLM(result.message);
  }
};

const detectInteriorEntry = (text) => {
  if (!text) return null;
  const lowercaseText = text.toLowerCase();
  
  // Patterns for entering different interiors
  const cavePatterns = [
    /\b(?:enter|explore|investigate|go\s+in(?:to)?|check\s+out)\s+(?:the\s+)?(?:caves?|pirate'?s?\s+caves?)\b/i,
    /\b(?:go|head|walk)\s+(?:to|into|in)\s+(?:the\s+)?(?:caves?|pirate'?s?\s+caves?)\b/i,
    /\bexamine\s+(?:the\s+)?cave\s+entrance\b/i
  ];
  
  const shipPatterns = [
    /\b(?:board|enter|go\s+(?:on|into|aboard)|return\s+to)\s+(?:the\s+)?(?:beagle|ship|vessel|hms\s+beagle)\b/i,
    /\b(?:climb|go)\s+(?:up|on)\s+(?:the\s+)?(?:gangplank|ladder|aboard)\b/i,
    /\bvisit\s+(?:the\s+)?(?:captain|fitzroy|ship|beagle)\b/i
  ];
  
  const housePatterns = [
    /\b(?:enter|go\s+in(?:to)?|visit|head\s+into)\s+(?:the\s+)?(?:governor'?s?|lawson'?s?|vice[\s-]governor'?s?)\s+(?:house|residence|home|quarters)\b/i,
    /\b(?:accept|take\s+up)\s+lawson'?s?\s+(?:offer|invitation)\b/i,
    /\b(?:follow|go\s+with)\s+lawson\b/i,
    /\bmay\s+i\s+(?:come|go|enter|visit)\s+in(?:side)?\b/i
  ];
  
  // Check each pattern
  for (const pattern of cavePatterns) {
    if (pattern.test(lowercaseText)) return 'cave';
  }
  
  for (const pattern of shipPatterns) {
    if (pattern.test(lowercaseText)) return 'hms_beagle';
  }
  
  for (const pattern of housePatterns) {
    if (pattern.test(lowercaseText)) return 'governors_house';
  }
  
  return null;
};

const interiorType = detectInteriorEntry(input);
if (interiorType) {
  handleInteriorEntry(interiorType);
  return;
}
    
    // Check for collect command
    const collectMatch = input.match(/collect\s+(.+)/i);
    if (collectMatch && collectMatch[1]) {
      const specimenName = collectMatch[1].toLowerCase();
      
      // Find matching specimen
      const specimenToCollect = specimenList.find(s => 
        s.name.toLowerCase().includes(specimenName) || 
        s.id.toLowerCase() === specimenName ||
        s.keywords.some(k => specimenName.includes(k.toLowerCase()))
      );
      
      if (specimenToCollect && !specimenToCollect.collected) {
        handleCollectNearbySpecimen(specimenToCollect.id);
        return;
      }
    }


    
    // Handle command patterns
    if (input.startsWith('/move ')) {
      const locationId = input.replace('/move ', '').trim();
      const moveResult = moveToLocation(locationId);
      if (moveResult.success) {
        sendToLLM(moveResult.message);
        updateMoodAndFatigue(null, fatigue + (moveResult.fatigueIncrease || 5));
        updateNextStepSuggestions();
      } else {
        sendToLLM(moveResult.message);
      }
      return;
    } else if (input.startsWith('/collect ')) {
      const specimenId = input.replace('/collect ', '').trim();
      const collectDesc = collectSpecimen(specimenId);
      if (collectDesc) {
        sendToLLM(collectDesc);
      }
      return;
    } else if (input.startsWith('/use ')) {
      const parts = input.replace('/use ', '').split(' on ');
      if (parts.length === 2) {
        const toolDesc = useScientificTool(parts[0].trim(), parts[1].trim());
        if (toolDesc) {
          sendToLLM(toolDesc);
        }
      }
      return;
    }
    
    // Process all other inputs
    await sendToLLM(input);
  };



  // Map location fast travel
const handleMapLocationClick = (locationIdOrDirection) => {
  // Set the movement flag (KEEP THIS LINE)
  setIsMovingViaMap(true);

  console.log(`Player clicked: ${locationIdOrDirection}`);
  
  // Check if this is an interior location
  const interiorIDs = ['cave', 'hms_beagle', 'governors_house', 'watkins_cabin', 'whalers_hut'];
  if (interiorIDs.includes(locationIdOrDirection)) {
    handleInteriorEntry(locationIdOrDirection);
    return; // Stop further processing
  }
  
  // Handle the expand button specially
  if (locationIdOrDirection === 'expand') {
    return; // The EnhancedMapBox component handles expansion internally
  }
  
  let moveResult;
  
  // Check if this is a cardinal direction
  if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(locationIdOrDirection)) {
    // Convert direction to handleMove format
    const directionMap = {
      'N': 'north',
      'S': 'south',
      'E': 'east',
      'W': 'west',
      'NE': 'northeast',
      'NW': 'northwest',
      'SE': 'southeast',
      'SW': 'southwest'
    };
    
    moveResult = handleMove(directionMap[locationIdOrDirection]);
  } else {
    // Otherwise treat as a location ID
    moveResult = moveToLocation(locationIdOrDirection);
    console.log("After moveToLocation, result:", moveResult);
  }

  // Handle any NPC changes
  handleNPCsOnMovement();
  
  // After successfully moving to a new location, update the game state
  if (moveResult && moveResult.success) {
    // IMPORTANT: Generate a narrative for the movement
    // We'll now directly use sendToLLM to ensure narrative is updated
    sendToLLM(`You traveled to ${moveResult.newLocationName || getCurrentLocation().name}. ${moveResult.message || ''}`);
    
    // Update fatigue based on movement
    if (moveResult.fatigueIncrease) {
      updateMoodAndFatigue(null, fatigue + moveResult.fatigueIncrease);
    }
    
    // Update nearby specimens context
    const newCell = getCellByCoordinates(
      moveResult.newPosition ? moveResult.newPosition.x : playerPosition.x,
      moveResult.newPosition ? moveResult.newPosition.y : playerPosition.y
    );
    
    if (newCell && newCell.type) {
      // Find specimens for this habitat type
      const habitatSpecimens = specimenList.filter(specimen => {
        const habitats = specimen.habitat.split(', ');
        return habitats.includes(newCell.type);
      });
      
      // Update nearby specimens state
      setNearbySpecimenIds(habitatSpecimens.map(specimen => specimen.id));
    }
    
    // Update suggestions based on new location
    updateNextStepSuggestions();
  } else if (moveResult) {
    // Show failure message for failed movement
    sendToLLM(moveResult.message || "You cannot travel there.");
  }
  
  // Reset the movement flag after a delay
  setTimeout(() => setIsMovingViaMap(false), 500);
};

  
  // Request a memory from Darwin
  const handleRequestMemory = async () => {
    if (isLoadingMemory) return;
    
    setIsLoadingMemory(true);
    
    try {
      // Prepare context for Darwin's memory
      const currentLocation = getCurrentLocation();

       const contextData = {
      location: currentLocation?.name || 'Unknown',
      time: formatGameTime(),
      day: daysPassed,
      fatigue: fatigue,
      mood: darwinMood,
      currentSpecimen: currentSpecimen?.name || "None",
      collectedSpecimens: inventory.map(item => item.name).join(", "),
      narrativeText: narrativeText 
    };
    
      
      // Memory prompt
      const memoryPrompt = `Recall a self-loathing, elliptical, cryptic, or confused memory SPECIFICALLY related to your current situation, dilemma, or observations in ${contextData.location}. The memory should directly relate to the most eventful or important thing that has just occurred.`;
      
      // Call API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: memoryPrompt,
          gameState: contextData,
          isMemoryRequest: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`API error: ${data.error} (${data.details || 'No details provided'})`);
      }
      
      // Extract content
      const memoryResponse = data.choices?.[0]?.message?.content || 
                            data.message?.content || 
                            'No memories surface at the moment...';
      
      // Show memory
      setMemoryContent(memoryResponse);
      setShowMemoryModal(true);
      
    } catch (error) {
      console.error("Error retrieving memory:", error);
      setMemoryContent(`Error retrieving memory: ${error.message}`);
      setShowMemoryModal(true);
    } finally {
      setIsLoadingMemory(false);
    }
  };
  
  // Parse LLM response for game state updates
  const parseLLMResponse = (response, userInput) => {
  // Extract mood
  const moodMatch = response.match(/\[MOOD:\s*(.*?)\]/);
  if (moodMatch && moodMatch[1]) {
    updateMoodAndFatigue(moodMatch[1].trim(), null);
  }
  
  // Extract fatigue
  const fatigueMatch = response.match(/\[FATIGUE:\s*(\d+)\]/);
  if (fatigueMatch && fatigueMatch[1]) {
    const fatigueDelta = parseInt(fatigueMatch[1]);
    console.log(`Adding fatigue increment: ${fatigueDelta}`);
    
    // Get current fatigue and add the new delta
    const currentFatigue = fatigue; // This already has previous accumulated fatigue
    const newFatigue = currentFatigue + fatigueDelta;
    
    // Update fatigue with accumulated value, capped at 100
    if (!isNaN(fatigueDelta)) {
      updateMoodAndFatigue(null, newFatigue);
    }
  }
    
    // Check for NPC departure cues
   const npcStatusMatch = response.match(/\[NPC_STATUS:\s*(.*?)\]/);
  if (npcStatusMatch && npcStatusMatch[1] === 'dismissed') {
    // Clear current NPC and visible NPCs
    setCurrentNPC(null);
    setVisibleNPCs([]);
  }
    
   
 
  // Extract primary collectible for the collection button with improved hybrid handling
  const collectibleMatches = response.match(/\[COLLECTIBLE:(.*?)\]/g);
  if (collectibleMatches && collectibleMatches.length > 0) {
    const primaryCollectible = collectibleMatches[0]
      .replace('[COLLECTIBLE:', '')
      .replace(']', '')
      .trim();
    
    // Check if this is a hybrid specimen ID
    const hybridSpecimen = specimenList.find(s => 
      s.isHybrid && (
        s.id.toLowerCase() === primaryCollectible.toLowerCase() ||
        s.name.toLowerCase().includes(primaryCollectible.toLowerCase())
      )
    );
    
    if (hybridSpecimen) {
      console.log(`Found hybrid specimen as collectible: ${hybridSpecimen.name} (${hybridSpecimen.id})`);
      setPrimaryCollectible(hybridSpecimen.id);
    } else {
      // Regular specimen handling
      setPrimaryCollectible(primaryCollectible);
    }
  }
    
  // Process NPC markers
  const npcMatch = response.match(/\[NPC:\s*(.*?)\]/);
  if (npcMatch) {
    const npcId = npcMatch[1].trim();
    // If NPC is null or empty, clear the current NPC
    if (npcId === 'null' || npcId === '') {
      console.log("NPC dismissed based on LLM response");
      setCurrentNPC(null);
      setVisibleNPCs([]);
    } else if (npcId !== 'null' && !currentNPC) {
      // Only set NPC if we don't already have one active
      const npc = npcs.find(n => n.id === npcId);
      if (npc) {
        setCurrentNPC(npcId);
      }
    }
  }
  
  // Check for explicit NPC dismissal in user input
  const dismissalTerms = [
    "goodbye", "farewell", "leave", "go away", "dismissed", 
    "that's all", "that will be all", "we're done", "leave me"
  ];
  
  const userDismissalAttempt = dismissalTerms.some(term => 
    userInput.toLowerCase().includes(term)
  );
  
  if (userDismissalAttempt && currentNPC) {
    console.log("User explicitly dismissed NPC");
    setCurrentNPC(null);
    setVisibleNPCs([]);
  }
    
    // Extract potential next steps

const stepsSection = response.match(/NEXTSTEPS:([\s\S]*?)(?=\[|$)/);
    
if (stepsSection && stepsSection[1]) {
  const stepsText = stepsSection[1].trim();
  const lines = stepsText.split('\n').filter(line => line.trim().startsWith('-'));
  
  if (lines.length > 0) {
    const currentLocation = getCurrentLocation();
    const newSuggestions = lines.map(line => {
      const stepText = line.replace(/^-\s*/, '').trim();
      
      return {
        text: stepText,
        action: stepText
      };
    });
    
    if (newSuggestions.length > 0) {
      setNextStepSuggestions(newSuggestions);
    }
  }
}
    
    // Always advance time (representing the passage of time)
    advanceTime(60);
  };
  
  // Process LLM response for display
  const processForDisplay = (text) => {
    // Remove next steps section
    let cleanedText = text.replace(/NEXTSTEPS[\s\S]*?(?=\[STATUS|\[FATIGUE|\[SCIENTIFIC_INSIGHT|\[COLLECTIBLE|$)/, '');
    
    // Remove metadata markers
    cleanedText = cleanedText
      .replace(/\[STATUS:.*?\]/g, '')

   .replace(/\[NEXTSTEPS:.*?\]/g, '')
       .replace(/\[NPC:.*?\]/g, '')

      .trim();

          // Save the latest narrative in a cookie for the historian critique
    if (typeof document !== 'undefined') {
      document.cookie = `lastNarrativeText=${encodeURIComponent(cleanedText)}; path=/; max-age=3600`;
    }
    
    return cleanedText;
  };
  
  

// Send request to LLM API
// Optimized sendToLLM function for GameContainer.jsx

const sendToLLM = async (userInput) => {
  setIsLoading(true);
  
  try {
    // Get current location info
    const currentLocation = getCurrentLocation();
    
    // Get current NPC if one is active
    const npcObject = currentNPC ? npcs.find(n => n.id === currentNPC) : null;

    // Get all NPCs that should be at this location
    const locationNPCs = getNPCsForCurrentLocationAndTime();
    
    // Get names for all nearby specimens INCLUDING HYBRIDS
    const nearbySpecimenNames = nearbySpecimenIds.map(id => {
      const specimen = specimenList.find(s => s.id === id);
      // For hybrids, include both the ID and name for better context
      if (specimen?.isHybrid) {
        return `${specimen.id} (hybrid: ${specimen.name})`;
      }
      return specimen ? specimen.id : id;
    }).join(", ");

    const contextSummary = useGameStore.getState().generateLLMContext();

    // Build game context for main narrative
    const contextData = {
      location: currentLocation?.name || "Isla Floreana",
      locationDesc: currentLocation?.description || "",
      time: formatGameTime(),
      day: daysPassed,
      fatigue: fatigue,
      mood: darwinMood,
      currentSpecimen: currentSpecimen?.name || 'None',
      collectedSpecimens: inventory.map(item => item.name).join(", ") || 'None',
      currentNPC: npcObject ? npcObject.name : 'None',
      validDirections: getValidDirections().join(", "),
      potentialSpecimens: nearbySpecimenNames || 'None',
      primaryCollectible: primaryCollectible || 'None',
      contextSummary: contextSummary
    };
        
    // Add to history
 addToGameHistory('user', userInput);
    const history = getRecentHistory().slice(-5);
    
    // DEFUNCT? TK 
    // This is the key optimization for reducing token count and improving latency
    // const historySummary = useGameStore.getState().getEventHistorySummary();
    
    // Create NPC context string
    let npcContext = '';
    
    // If we're actively talking to an NPC, add full details
    if (npcObject) {
      npcContext = `
ACTIVE NPC: ${npcObject.name} (${npcObject.role})
Background: ${npcObject.background || ""}
Appearance: ${npcObject.appearance || ""}
Personality: ${npcObject.personality || ""}
Dialogue Examples:
${npcObject.dialogueExamples ? npcObject.dialogueExamples.map(ex => `- "${ex}"`).join('\n') : ""}

THIS IS AN NPC INTERACTION TURN. Focus primarily on the NPC's dialogue and reactions.`;
    }
    
    // Always add information about NPCs that should be in this location
    if (locationNPCs.length > 0 && !npcObject) {
      npcContext += `\n\nNPCs PRESENT IN THIS LOCATION:`;
      
      locationNPCs.forEach(npcId => {
        const npc = npcs.find(n => n.id === npcId);
        if (npc) {
          npcContext += `\n- ${npc.name} (${npc.role}): ${npc.shortDescription}`;
          
          // For special cases like Gabriel, add more details
          if (npcId === 'gabriel_puig') {
            npcContext += `\n  Note: Gabriel is an escaped political prisoner who will try to flee or yell insults in Catalan when approached initially, but who can speak an odd kind of English littered with Spanish and Catalan words and early socialist terminology, and warms up to Darwin if he shows an interest in the plight of the prisoners.`;
          }
          if (npcId === 'fitzroy') {
            npcContext += `\n  Note: Captain FitzRoy is strictly religious and often in conflict with Darwin's scientific ideas.`;
          }
        }
      });
    }
    
    // Build complete prompt with context and summarized history
    const enhancedInput = `
[Context: Darwin is at ${contextData.location}. ${contextData.locationDesc}. It's ${contextData.time} on day ${contextData.day}.
Fatigue: ${contextData.fatigue}/100. 
Status: ${contextData.mood}.
Currently examining: ${contextData.currentSpecimen}.
Collected specimens: ${contextData.collectedSpecimens}
Current NPC: ${contextData.currentNPC}
Potential specimens visible to Darwin in this setting: ${contextData.potentialSpecimens}
Most plausibly collectible specimen: use your judgement, pick best option from potential specimens
Valid movement directions: ${contextData.validDirections}]

${contextData.contextSummary}
${npcContext}

User input: ${userInput}

Remember to respond as if you are Darwin's first-person perspective, using second-person ("you"). Assessment is almost always wittily barbed and critical. Your narratives are never more than two paragraphs. Follow your prompt exactly.
`;
    
    // Save the raw prompt for transparency
    setRawLLMPrompt(enhancedInput);
    
    // Call API
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameState: contextData,
        prompt: enhancedInput
      })
    });
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    
    // Process response
    const data = await response.json();
    const llmResponse = data.choices?.[0]?.message?.content || 
                       data.message?.content || '';
    
    setRawLLMResponse(llmResponse);
    parseLLMResponse(llmResponse, userInput);
    
    // Set narrative text
    setNarrativeText(processForDisplay(llmResponse));
    
    // Add to history
    addToGameHistory('assistant', llmResponse);
  } catch (error) {
    console.error("Error with LLM request:", error);
    setNarrativeText(`Error: ${error.message}`);
    setRawLLMResponse(`Error fetching response: ${error.message}`);
    setRawLLMPrompt(`Error sending prompt: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};
  
  // Title screen
  if (!gameStarted) {
  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen p-3 relative overflow-hidden"
      style={{
        backgroundImage: 'url("/splashpage.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'rgb(var(--darwin-primary))',
        backgroundBlendMode: 'soft-light'
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-100">
        <div className="w-full h-full max-w-3xl max-h-3xl" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='45' fill='none' stroke='%238B5A2B' stroke-width='1'/%3E%3Ccircle cx='100' cy='100' r='5' fill='none' stroke='%238B5A2B' stroke-width='0.5'/%3E%3Cpath d='M100 10 L100 30 M100 170 L100 190 M10 100 L30 100 M170 100 L190 100' stroke='%238B5A2B' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center'
        }}></div>
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-3xl">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-16 text-center w-full mx-4">
          <h1 className="text-3xl md:text-4xl font-bold text-darwin-dark mb-3 relative z-10 font-serif tracking-wide">Young Darwin</h1>
          <div className="w-30 h-1 bg-amber-700 opacity-60 rounded mb-3 mx-auto"></div>
          <h2 className="text-lg text-darwin-accent mb-2 font-serif italic">An educational history simulation game by Benjamin Breen (UCSC)</h2>
          
          <div className="max-w-2xl mb-5 text-left p-4 md:p-8 rounded-lg shadow-md relative z-10 darwin-panel bg-white/90">
            <p className="mb-3 font-serif leading-relaxed text-gray-800">The year is 1835. As a young naturalist aboard HMS Beagle, you've arrived at the Galápagos archipelago – a volcanic wonderland teeming with unfamiliar creatures.</p>
            <p className="mb-3 font-serif leading-relaxed text-gray-800">Explore Isla Floreana, collect specimens, and record your observations. Every detail could lead to profound scientific insights. You might even stumble on something unexpected... like an escapee from the penal colony of political prisoners in the central highlands.</p>
            <div className="flex items-center my-3 text-amber-800 opacity-80">
              <div className="flex-1 h-px bg-amber-300"></div>
              <span className="px-4 font-serif italic text-sm">A scientific adventure awaits</span>
              <div className="flex-1 h-px bg-amber-300"></div>
            </div>
            <p className="font-serif leading-relaxed text-gray-800">Will your observations lead to revolutionary understanding, or merely catalog curiosities?</p>
          </div>
          
          {/* Hybrid Options Section */}
          <div className="mb-6">
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2 mx-auto mb-2 ${
                showHybridOptions ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-700'
              }`}
              onClick={() => setShowHybridOptions(!showHybridOptions)}
            >
              <span>🧬</span> Game Options
            </button>
            
            {showHybridOptions && (
              <div className="mt-4 mb-6 max-w-xl mx-auto bg-amber-50/90 backdrop-blur-sm p-4 rounded-lg border border-amber-200">
                <h3 className="text-xl font-bold text-amber-800 mb-3">Hybrid Species Options</h3>
                <p className="text-sm text-amber-700 mb-4">
                  Enable discovery of hybrid species that Darwin might encounter during his exploration.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      hybridityMode === 'mild' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                    }`}
                    onClick={() => handleHybriditySelection('mild')}
                  >
                    <span>🌱</span> Mild Hybridity
                  </button>
                  
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      hybridityMode === 'extreme' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                    }`}
                    onClick={() => handleHybriditySelection('extreme')}
                  >
                    <span>🔬</span> Extreme Hybridity
                  </button>
                  
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      hybridityMode === 'none' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                    }`}
                    onClick={() => handleHybriditySelection('none')}
                  >
                    <span>🚫</span> No Hybrids
                  </button>
                </div>
                
                <div className="mt-4 text-sm text-amber-700">
                  {hybridityMode === 'mild' && (
                    <p><span className="font-bold">Mild Hybridity:</span> Species within the same sub-order can hybridize, creating scientifically plausible new specimens.</p>
                  )}
                  {hybridityMode === 'extreme' && (
                    <p><span className="font-bold">Extreme Hybridity:</span> Species from different orders can hybridize, creating more unusual and fantastical hybrid specimens.</p>
                  )}
                  {hybridityMode === 'none' && (
                    <p><span className="font-bold">No Hybrids:</span> Play with only historically accurate species that Darwin would have encountered.</p>
                  )}
                </div>
                
                {hybridityMode !== 'none' && (
                  <HybridGenerator 
                    onComplete={handleHybridsGenerated}
                    hybridityMode={hybridityMode}
                    isVisible={showHybridOptions} 
                  />
                )}
              </div>
            )}
          </div>
          
          {/* Begin Expedition Button - Now centered */}
          <div className="flex justify-center">
            <button 
              className="py-4 px-10 rounded-lg font-medium relative z-10 text-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50 group flex items-center gap-2"
              onClick={startGame}
              style={{
                backgroundColor: 'rgb(var(--darwin-primary))',
                color: 'white',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            >
              <span className="absolute inset-0 w-full h-full bg-white rounded-lg opacity-0 group-hover:opacity-10 transition-opacity"></span>
              Begin Expedition
              {hybridityMode !== 'none' && (
                <span className="ml-2 text-sm bg-amber-300 text-amber-800 px-2 py-1 rounded-full">
                  🧬 {hybridityMode === 'extreme' ? 'Extreme' : 'Mild'} Hybrids
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
  
  // Main game screen
  return (
    <div className="max-w-7xl mx-auto p-4 min-h-screen bg-darwin-light relative">

   <HamburgerMenu />
      
      <div className="darwin-panel p-4 mb-3 bg-amber-50 relative overflow-hidden shadow-lg rounded-lg">
        {/* Banner image */}
        <BannerImage 
  location={isInInterior ? currentInteriorRoom?.name : getCurrentLocation()?.name}
  activeTool={activeTool}
/>



        {/* Text container for title & details */}
        <div className="relative z-10 flex flex-col items-center text-center">
          
          {/* Title */}
          <h1 className="text-3xl font-bold text-white font-serif uppercase tracking-wide px-8 py-3 
            bg-black/60 rounded-lg shadow-xl backdrop-blur-md inline-block">
            YOUNG DARWIN: 1835
          </h1>

          {/* Subtitle - Date & Location */}
          <div className="mt-2 text-lg text-white font-serif px-6 py-2 bg-black/30 rounded-md shadow-md 
            inline-block opacity-95 backdrop-blur-md">
            {formatGameTime()} • Day {daysPassed} • Isla Floreana (Charles Island), Galápagos
          </div>

          {/* Decorative Line & Expedition Text */}
          <div className="flex items-center justify-center mt-3">
            <div className="w-24 h-px bg-white/40"></div>
            <div className="mx-3 text-sm text-white/80 font-medium px-6 bg-black/30 rounded-md shadow-md tracking-wide uppercase
            inline-block opacity-98 backdrop-blur-md">
              HMS Beagle Expedition
            </div>
            <div className="w-24 h-px bg-white/40"></div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column - Portrait and Map */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Portrait 
            character={currentNPC || 'darwin'} 
            status={darwinMood} 
            fatigue={fatigue} 
            onSwitchPOV={handleSwitchPOV}
          />

{showRestButton && (
 <div className="relative z-10 flex flex-col items-center text-center">
    <button 
      onClick={handleRest}
      className="bg-amber-500 hover:bg-amber-800 text-white py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 transition-all"
    >
      <span>🛌</span> Find Shelter
    </button>
    <p className="text-sm p-3 text-red-600 mb-2">You should try to find shelter soon. Somewhere here might work.</p>
  </div>
)}



   {/* Tortoise POV  */}
         {/* Tortoise POV - Now with Close Button */}
{tortoiseThoughts && (
  <div className="darwin-panel p-3 mt-2 relative">
    <button
      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full shadow-sm"
      onClick={() => setTortoiseThoughts(null)} // Close button to dismiss
      title="Close Tortoise Thoughts"
    >
      ✕
    </button>
    
    <div className="flex items-center mb-1">
      <span className="text-l mr-2">🐢</span>
      <h3 className="font-bold text-darwin-dark text-lg font-serif">Tortoise Thoughts</h3>
    </div>
    <p className="text-medium italic text-green-800">{tortoiseThoughts}</p>
  </div>
)}

{isInInterior ? (
 <InteriorMap
  locationType={interiorType}
  onExitInterior={() => {
    const result = exitInterior();
    sendToLLM(result.message);
    setCurrentInteriorRoom(null);
    // Clear interior-specific specimens when exiting
    setNearbySpecimenIds([]);
  }}
  onInteriorMove={(newPos, roomId, room) => {
    const result = moveInInterior(newPos, roomId);
    sendToLLM(result.message);
    
    // Store current room information and update game state
    setCurrentInteriorRoom({
      id: roomId,
      name: room?.name || roomId,
      description: room?.description || "",
      // Add type property that maps to specimen habitats
      type: interiorType === 'governors_house' ? 'governorshouse' : 
            interiorType === 'hms_beagle' ? 'beagle' :
            interiorType === 'cave' ? 'cave' :
            interiorType === 'whalers_hut' ? 'whalershut' :
              interiorType === 'mail_barrel' ? 'mailbarrel' :
              interiorType === 'watkins_cabin' ? 'watkinscabin' :
            interiorType
    });
    
    // Update nearby specimens based on interior room type
    const roomType = interiorType === 'governors_house' ? 'governorshouse' : 
                    interiorType === 'hms_beagle' ? 'beagle' :
                    interiorType === 'cave' ? 'cave' :
                    interiorType === 'whalers_hut' ? 'whalershut' :
                    interiorType === 'mail_barrel' ? 'mailbarrel' :
                     interiorType === 'watkins_cabin' ? 'watkinscabin' :
                    interiorType;
    
    // Get specimens matching this interior type
    const matchingSpecimens = specimenList.filter(s => 
      s.habitat && s.habitat.split(', ').includes(roomType)
    );
    console.log(`Found ${matchingSpecimens.length} specimens for ${roomType}: `, 
      matchingSpecimens.map(s => s.name));
    
    setNearbySpecimenIds(matchingSpecimens.map(s => s.id));
    
  // Check for NPC encounters in this room
if (interiorType === 'whalers_hut' && roomId === 'HUT_MAIN') {
  setVisibleNPCs(['stowaway']);
} else if (interiorType === 'hms_beagle' && roomId === 'BEAGLE_CABIN') {
  setVisibleNPCs(['fitzroy']);
} else if (interiorType === 'governors_house' && roomId === 'GOVERNORS_HOUSE_GARDEN') {
  // Set both NPCs in this room
  setVisibleNPCs(['nicolas_lawson', 'maria']);
} else if (interiorType === 'governors_house') {
  // Default for other governor's house rooms
  setVisibleNPCs(['nicolas_lawson']);
}  }}
  playerPosition={interiorPlayerPosition}
  currentNPC={currentNPC}
/>
) : (
  <EnhancedMapBox 
    playerPosition={playerPosition} 
    onLocationClick={handleMapLocationClick}
    onRestAtBeagle={handleRestAtBeagle}
      onRest={handleRest}  
  showRestButton={showRestButton}  

  onEnterInterior={(interiorId) => {
  // Only proceed if not already in this interior
  if (interiorId) {
    const result = enterInterior(interiorId);

    
  }
}}
    fatigue={fatigue}
    inventory={inventory}
      currentLocationId={currentLocationId}
  />
)}

         <EnhancedEventHistory /> 
    
                 
          {/* Memory Button */}
          <div className="darwin-panel p-3">
            <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Darwin's Thoughts</h3>
            <p className="text-sm text-gray-600 mb-2">Reflect on your past experiences and early scientific training.</p>
            <div className="flex justify-center">
              <MemoryButton 
                onRequestMemory={handleRequestMemory}
                isDisabled={isLoadingMemory}
              />
            </div>
          </div>
        </div>


        
        {/* Center column - Game narrative */}
        <div className="lg:col-span-6 darwin-panel p-0 min-h-[500px] flex flex-col">

          {/* Primary collectible Specimen Button */}
      {primaryCollectible && (
  <div className="bg-amber-100 border-b border-amber-300 p-3 flex justify-center">
    <div className="text-center">
      <p className="text-sm text-amber-800 mb-2">
        You notice a specimen nearby worth collecting
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {(() => {
          const specimen = specimenList.find(s => s.id === primaryCollectible && !s.collected);
          return specimen ? (
            <button
              key={specimen.id}
              onClick={() => handleOpenCollectionPopup(specimen.id)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center"
            >
              <span className="mr-2">{getSpecimenIcon(specimen.id)}</span>
              Collect {specimen.name}
            </button>
          ) : null;
        })()}
      </div>
    </div>
  </div>
)}
          
{/* NPC Interaction Section - Consolidated */}
{/* Case 1: Active conversation - show conversation indicator */}
{currentNPC ? (
  <div className="bg-emerald-100 border-b border-emerald-300 p-3 flex flex-col items-center">
    <p className="text-sm text-emerald-800 mb-2">
      You are conversing with {npcs.find(n => n.id === currentNPC)?.name || "someone"}
    </p>
    <button
      onClick={() => {
        setCurrentNPC(null);
        setVisibleNPCs([]);
        sendToLLM("End conversation and continue exploration");
      }}
      className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-2 py-1 rounded border border-amber-300"
    >
      End conversation
    </button>
  </div>
) : (
  /* Case 2: No active conversation but NPCs nearby - show talk buttons */
  visibleNPCs.length > 0 && (
    <div className="bg-emerald-100 border-b border-emerald-300 p-3 flex justify-center">
      <div className="text-center">
        <p className="text-sm text-emerald-800 mb-2">
          You notice {visibleNPCs.length > 1 ? 'people' : 'someone'} nearby you could talk to
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {visibleNPCs.map(id => {
            const npc = npcs.find(n => n.id === id);
            return npc ? (
              <button
                key={id}
                onClick={() => handleTalkToNPC(id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center"
              >
                <span className="mr-2">💬</span>
                Talk to {npc.name}
              </button>
            ) : null;
          })}
        </div>
      </div>
    </div>
  )
)}
          
          <GameLog 
          narrative={narrativeText} 
          isLoading={isLoading} 
          lastUserInput={lastUserInput} 
          isMovingViaMap={isMovingViaMap} 

          />

<LLMTransparency rawResponse={rawLLMResponse} rawPrompt={rawLLMPrompt} />
  


          <div className="mt-auto p-4 bg-amber-50 border-t border-amber-200">
            <PlayerInput 
              onSubmit={handlePlayerInput} 
              isLoading={isLoading}
              suggestions={nextStepSuggestions}
              rawResponse={rawLLMResponse}
              rawPrompt={rawLLMPrompt}
            />


          </div>
        </div>
        
        {/* Right column - Weather and Specimen collection */}
        <div className="lg:col-span-3 flex flex-col gap-3">


  {/*  weather/time display */}
  <WeatherTimeDisplay />

      <SpecimenCollection 
  currentSpecimen={currentSpecimen}
  inventory={inventory}
  onSpecimenSelect={setCurrentSpecimen}
  onCollect={handleCollectSpecimenMethod} 
  onUseTool={handleDetailedToolUse}
  narrativeText={narrativeText}
  onViewNearbySpecimenDetail={handleViewNearbySpecimenDetail}
  availableSpecimenIds={nearbySpecimenIds}  
  onOpenCollectionPopup={handleOpenCollectionPopup}
  specimenList={specimenList}  
currentLocation={currentLocationId}
gameTime={gameTime} 
  onOpenJournal={handleOpenJournal}
/>   
 </div>
      </div>

      <EndGame />
      
<div className="mt-4 text-center text-xs text-amber-700/70 font-serif italic">
  This is a HistoryLens prototype created by 
   <a href="https://benjaminpbreen.com/about-2/contact/" className="underline text-amber-700 hover:text-amber-900">
    Benjamin Breen
  </a> in March, 2025 <br /> 
  
  <div className="mt-2 flex justify-center">
    <a href="https://resobscura.substack.com/p/llm-based-educational-games-will" target="_blank" rel="noopener noreferrer">
      <img 
        src="/colophon.png" 
        alt="Colophon" 
        className="w-10 h-10 object-cover rounded-md opacity-100 transition-transform transform hover:scale-105"
      />
    </a>
  </div>
</div>


      

      {/* Memory Modal */}
      <MemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        memoryContent={memoryContent}
      />



  {/* Collection Popup - Enhanced Version with Hybrid Support */}
{showCollectionPopup && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-darwin-light max-w-lg w-full rounded-lg overflow-hidden shadow-xl border border-darwin-secondary/60">
      {/* Specimen Header with Image */}
      <div className="relative">
        {/* Specimen Image */}
        <div className="w-full h-64 relative overflow-hidden">
          {(() => {
            const currentSpecimen = specimenList.find(s => s.id === collectingSpecimenId);
            const isHybrid = currentSpecimen?.isHybrid;
            
            return isHybrid ? (
              <HybridSpecimenImage 
                specimen={currentSpecimen}
                className="w-full h-80"
                size="full"
                disableGeneration={false}
              />
            ) : (
             <div 
               className="absolute inset-0 bg-cover bg-top transform hover:scale-105 transition-transform duration-7000"
               style={{ 
                 backgroundImage: `url(/specimens/${collectingSpecimenId?.toLowerCase()}.jpg)`,
                 backgroundSize: 'cover',
                 backgroundPosition: 'center top 25%'
               }}
             />

            );
          })()}
          
          {/* Gradient Overlay with enhanced depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
          
          {/* Decorative Corner Elements */}
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-white/80 rounded-tl-md" />
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-white/80 rounded-tr-md" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-white/80 rounded-bl-md" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-white/80 rounded-br-md" />
        </div>
        
        {/* Title Overlay with white text and shadow */}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          {(() => {
            const currentSpecimen = specimenList.find(s => s.id === collectingSpecimenId);
            return (
              <>
                <h3 className="font-bold text-3xl mb-1 tracking-wide text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]">
                  Collect {currentSpecimen?.name}
                </h3>
                <p className="italic text-white/80 text-lg font-serif drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {currentSpecimen?.latin || ''}
                </p>
                {currentSpecimen?.isHybrid && (
                  <div className="mt-1">
                    <span className="inline-block px-2 py-1 text-xs font-medium bg-amber-500/80 text-white rounded-md shadow-sm">
                      🧬 Hybrid Specimen
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      
      {/* Specimen Context Information - Redesigned */}
      <div className="p-5 bg-gradient-to-r from-amber-200/40 to-amber-100/70 border-b border-amber-200/60">
        <div className="flex flex-col gap-3">
          {(() => {
            const specimen = specimenList.find(s => s.id === collectingSpecimenId);
            if (!specimen) return null;
            
            // Scientific Value narrative
            const getScientificValueText = (value) => {
              if (value >= 7) return "This specimen would be of exceptional scientific interest. A fine example would greatly enrich your collection.";
              if (value >= 4) return "This specimen appears to have moderate scientific value. Worth documenting carefully.";
              return "This is a common specimen, though still worth noting in your journal.";
            };
            
            // Danger narrative
            const getDangerText = (value) => {
              if (value >= 7) return "Exercise extreme caution. This specimen could pose significant danger if approached carelessly.";
              if (value >= 4) return "Some care should be taken when collecting this specimen. It may resist capture.";
              return "This specimen poses little risk to collect safely.";
            };
            
            return (
              <>
                <div className="flex items-start text-darwin-dark">
                  <div className="rounded-full bg-amber-300/70 p-2 mr-3 flex-shrink-0 shadow-sm">
                    <svg className="w-5 h-5 text-darwin-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                    </svg>
                  </div>
                  <p className="italic text-m leading-snug pt-1">{getScientificValueText(specimen.scientificValue || 3)}</p>
                </div>
                
                <div className="flex items-start text-darwin-dark">
                  <div className="rounded-full bg-red-200/100 p-2 mr-3 flex-shrink-0 shadow-sm">
                    <svg className="w-5 h-5 text-darwin-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <p className="italic text-m leading-snug pt-1">{getDangerText(specimen.danger || 1)}</p>
                </div>
              </>
            );
          })()}
        </div>
      </div>
      
      {/* Collection Methods - Enhanced Styling */}
      <div className="p-5 pb-4 bg-cream-100">
        <h4 className="text-lg text-darwin-dark font-medium mb-4 border-b border-amber-200 pb-2 flex items-center">
          <span className="bg-darwin-primary/10 rounded-full w-7 h-7 flex items-center justify-center mr-2">
            <span className="text-darwin-primary text-sm font-bold">1</span>
          </span>
          Select a method to collect this specimen:
        </h4>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {collectionTools.map(method => (
            <button
              key={method.id}
              onClick={() => setSelectedMethod(method)}
              className={`
                relative p-3 rounded-md flex flex-col items-center justify-center transition-all duration-300
                ${selectedMethod?.id === method.id 
                  ? 'bg-amber-800 text-white shadow-md transform scale-105 border-2 border-amber-600' 
                  : 'bg-amber-50 text-darwin-dark border border-2 border-amber-00/40 hover:bg-amber-100 hover:shadow-md'
                }
              `}
            >
              <span className="text-2xl mb-2">{method.icon}</span>
              <span className="text-sm font-medium">{method.name}</span>
              
              {/* Selection indicator */}
              {selectedMethod?.id === method.id && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-3 h-3 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <h4 className="text-lg text-darwin-dark font-medium mb-3 flex items-center">
          <span className="bg-darwin-primary/10 rounded-full w-7 h-7 flex items-center justify-center mr-2">
            <span className="text-darwin-primary text-sm font-bold">2</span>
          </span>
          Your Approach <span className="text-sm font-normal text-gray-600 ml-1">(Optional)</span>:
        </h4>
        
        <div className="mb-5">
          <textarea
            className="w-full p-4 rounded-md border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 bg-white shadow-inner"
            rows={3}
            placeholder="Describe how you'll approach the collection (e.g., 'I move slowly and quietly to avoid startling the animal')"
            value={collectionNotes}
            onChange={(e) => setCollectionNotes(e.target.value)}
          />
        </div>
        
        <div className="flex justify-between gap-3 mt-6">
          <button
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-md transition-colors border border-gray-300 font-medium"
            onClick={() => setShowCollectionPopup(false)}
          >
            Cancel
          </button>
          <button
            className={`
              flex-1 py-3 px-4 rounded-md transition-all duration-200 font-medium
              ${selectedMethod 
                ? 'bg-amber-700 hover:bg-amber-800 text-white shadow-md' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
            disabled={!selectedMethod}
            onClick={handleCollectionConfirm}
          >
            {selectedMethod 
              ? `Collect with ${selectedMethod.name}` 
              : 'Select a method'}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      {/* Collection Result Popup */}
<CollectionResultPopup
  isOpen={showCollectionResult}
  onClose={() => setShowCollectionResult(false)}
  result={collectionResult}
  specimenName={collectionSpecimenName}
  method={collectionMethod}
  specimenId={collectingSpecimenId} 
  specimenList={specimenList}
  onShowSpecimenDetail={() => {
    // Get the current specimen object
    const specimen = specimenList.find(s => s.name === collectionSpecimenName);
    if (specimen) {
      // Set it as the current specimen
      setCurrentSpecimen(specimen);
      
      // Or use a global state management solution
      if (specimenList.find(s => s.id === specimen.id && s.collected)) {
        // Find the component instance and call its method
        // This is a workaround - a better solution would be to lift this state up
        document.dispatchEvent(new CustomEvent('showSpecimenDetail', { 
          detail: { specimenId: specimen.id }
        }));
      }
    }
  }}
/>

<NearbySpecimenDetail
  isOpen={showNearbySpecimenDetail}
  onClose={() => setShowNearbySpecimenDetail(false)}
  specimen={selectedNearbySpecimen}
  onAttemptCollection={handleOpenCollectionPopup}
/>

{/* Fatigue Warning Popup */}
{showFatigueWarning && (
  <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg z-50 max-w-md">
    <div className="flex">
      <div className="py-1">
        <svg className="h-6 w-6 text-red-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div>
        <p className="font-bold">Extreme Fatigue</p>
        <p className="text-sm">Darwin is becoming dangerously exhausted. Find shelter to rest soon or risk collapse. Try returning to the Beagle or finding shelter in a settlement.</p>
      </div>
    </div>
  </div>
)}

<Journal
  isOpen={journalOpen}
  onClose={() => setJournalOpen(false)}
  specimen={journalSpecimen}
  onSave={(entry) => {
    console.log('Journal entry saved:', entry);
    // Any additional logic
  }}
/>

 {process.env.NODE_ENV === 'development' && (
      <>
        <EventHistoryDebug />
        <HybridsDebug />
      </>
    )}
  </div>


  );
}


export default GameContainer;