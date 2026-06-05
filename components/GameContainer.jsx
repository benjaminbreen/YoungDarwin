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
import MemoryModal from './MemoryModal';
import { npcs } from '../data/npcs';
import WeatherTimeDisplay from './WeatherTimeDisplay';
import CollectionResultPopup from './CollectionResultPopup';
import InteriorMap from './InteriorMap';
import { getCellByCoordinates, islandGrid } from '../utils/locationSystem';
import NearbySpecimenDetail from './NearbySpecimenDetail';
import EnhancedEventHistory from './EnhancedEventHistory';
import EventHistoryDebug from './EventHistoryDebug';
import HybridGenerator from './HybridGenerator';
import HybridsDebug from './HybridsDebug';
import { useLocationSystem } from '../utils/locationHook';
import EnhancedMapBox from './EnhancedMapBox';
import HybridSpecimenImage from './HybridSpecimenImage';
import { getSpecimenIcon } from '../utils/specimenUtils';
import Journal from './Journal';
import HamburgerMenu from './HamburgerMenu';
import EndGame from './EndGame';
import ExpeditionStatusPanel from './ExpeditionStatusPanel';
import TrapLedger from './TrapLedger';
import CollectionMethodPreview from './CollectionMethodPreview';
import { canonicalSpecimenId, habitatMatches, resolveSpecimen } from '../utils/canonicalIds';
import { createTrap, evaluateCollectionAttempt, evaluateTrap, getVisibleEncounterIds } from '../utils/expeditionSystems';
import { buildActionSuggestions, mergeActionSuggestions } from '../utils/actionSuggestions';
import { buildLLMRequestMeta } from '../utils/llmClient';
import { assignHybridLocation, hasUsableLocation } from '../utils/hybridPlacement';
import { loadExpeditionSummary } from '../utils/localSave';
import { buildSpecimenDocumentationNote, buildSurveyNote, selectDocumentableSpecimen } from '../utils/fieldworkNotes';
import routePlayerCommand from '../utils/playerCommandRouter';

const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

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
    journal,
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
    addFieldEvidence,
    addToGameHistory,
    isLoading,
    setIsLoading,
    currentNPC,
    setCurrentNPC,
    daysPassed,
    gameTime,
    setSpecimenList,
    expeditionSeed,
    objectives,
    traps,
    addTrap,
    updateTrap,
    saveGame,
    loadSavedGame,
    clearSavedGame,
    refreshObjectives,
    eventHistory
  } = useGameStore();
  
  // Use the location hook for grid-based movement
  const { 
  playerPosition, 
  currentLocationId, 
  handleMove, 
  moveToLocation, 
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
    const specimenIds = getVisibleEncounterIds({
      location: currentInterior,
      specimenList,
      inventory,
      gameTime,
      seed: expeditionSeed
    });
    setNearbySpecimenIds(specimenIds);
  }
  return;
}

// This callback runs when location changes
const currentCell = getCellByCoordinates(locationInfo.position.x, locationInfo.position.y);
if (currentCell && currentCell.type) {
  const specimenIds = getVisibleEncounterIds({
    location: currentCell,
    specimenList,
    inventory,
    gameTime,
    seed: expeditionSeed
  });
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
  debugLog("Hybrids generated and received in GameContainer:", generatedHybrids);
  setHybridsEnabled(true);
  setGeneratedHybrids(generatedHybrids);
  
  // Close the hybrid options panel
  setShowHybridOptions(false);

  
  const hybridsWithLocations = generatedHybrids.map(hybrid =>
    assignHybridLocation(hybrid, { seed: `${expeditionSeed || 'young-darwin'}:container` })
  );
  
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
  debugLog("Updated specimen list with hybrids:", 
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
  const [visibleNPCs, setVisibleNPCs] = useState([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [nextStepSuggestions, setNextStepSuggestions] = useState([
    { text: 'Survey site', action: 'Survey the site', kind: 'survey' },
    { text: 'Document specimen', action: 'Document the visible specimen', kind: 'evidence' },
    { text: 'Travel east', action: 'Go east', kind: 'route' },
    { text: 'Open journal', action: 'Open journal', kind: 'journal' }
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
const [showNearbySpecimenDetail, setShowNearbySpecimenDetail] = useState(false);
const [selectedNearbySpecimen, setSelectedNearbySpecimen] = useState(null);
const [primaryCollectible, setPrimaryCollectible] = useState(null);
const [showFatigueWarning, setShowFatigueWarning] = useState(false);
const [passOutEvent, setPassOutEvent] = useState(null);
const [showRestButton, setShowRestButton] = useState(false);
const [currentInteriorRoom, setCurrentInteriorRoom] = useState(null);
const [showHybridOptions, setShowHybridOptions] = useState(false);
const [hybridsEnabled, setHybridsEnabled] = useState(false);
const [generatedHybrids, setGeneratedHybrids] = useState([]);
const [hybridityMode, setHybridityMode] = useState('none'); // 'none', 'mild', or 'extreme'
const [isMovingViaMap, setIsMovingViaMap] = useState(false);
const [journalOpen, setJournalOpen] = useState(false);
const [journalSpecimen, setJournalSpecimen] = useState(null);
const [savedExpeditionSummary, setSavedExpeditionSummary] = useState(null);
const [continueMessage, setContinueMessage] = useState('');

const buildCollectionMetadata = (result, method, notes = '') => ({
  methodId: result?.methodId || method?.id || method,
  methodName: method?.name || method || result?.methodId || 'Unknown method',
  notes,
  reason: result?.reason || '',
  outcomeType: result?.outcomeType || (result?.success ? 'clean_specimen' : 'failed'),
  damage: result?.damage || 0,
  quality: Math.max(0, Math.round((1 - (result?.damage || 0)) * 100)),
  scoreDelta: result?.scoreDelta || 0,
  fatigueDelta: result?.fatigueDelta ?? 5,
});

const recordFieldEvidence = (specimen, result, method, notes = '') => {
  if (!result?.evidence || !specimen) return;
  addFieldEvidence({
    specimenId: specimen.id,
    specimenName: specimen.name,
    methodName: method?.name || method || result.methodId || 'field observation',
    evidence: result.evidence,
    notes,
    scoreDelta: result.scoreDelta || 1,
  });
};

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

  useEffect(() => {
    if (gameStarted) return;
    setSavedExpeditionSummary(loadExpeditionSummary());
  }, [gameStarted]);

  const handleContinueSavedExpedition = () => {
    const loaded = loadSavedGame();
    if (loaded) {
      setContinueMessage('');
      setGameInitialized(false);
    } else {
      setSavedExpeditionSummary(null);
      setContinueMessage('No saved expedition was found.');
    }
  };

  const handleStartNewExpedition = () => {
    clearSavedGame();
    setSavedExpeditionSummary(null);
    setContinueMessage('');
    startGame();
  };

  useEffect(() => {
    if (!gameStarted || specimenList.length === 0) return;
    const location = getCurrentLocation();
    const visibleIds = getVisibleEncounterIds({
      location,
      specimenList,
      inventory,
      gameTime,
      seed: expeditionSeed
    });
    setNearbySpecimenIds(visibleIds);
    setPrimaryCollectible(current => {
      const currentSpecimen = current ? resolveSpecimen(specimenList, current) : null;
      if (currentSpecimen && !currentSpecimen.collected && visibleIds.includes(canonicalSpecimenId(currentSpecimen.id))) {
        return canonicalSpecimenId(currentSpecimen.id);
      }
      return visibleIds[0] || null;
    });
  }, [
    gameStarted,
    currentLocationId,
    isInInterior,
    interiorPlayerPosition.x,
    interiorPlayerPosition.y,
    gameTime,
    expeditionSeed,
    specimenList,
    inventory
  ]);

  useEffect(() => {
    if (!gameStarted) return;
    refreshObjectives();
  }, [gameStarted, inventory, journal, eventHistory, fatigue]);

  useEffect(() => {
    if (!gameStarted) return;
    saveGame();
  }, [gameStarted, currentLocationId, gameTime, daysPassed, fatigue, inventory, journal, traps, objectives]);

  // Update suggestions based on the current expedition state.
  const updateNextStepSuggestions = () => {
    setNextStepSuggestions(buildActionSuggestions({
      location: getCurrentLocation(),
      validDirections: getValidDirections(),
      primaryCollectible,
      nearbySpecimenIds,
      specimenList,
      currentSpecimen,
      inventory,
      fatigue,
      traps,
      objectives,
      gameTime,
      daysPassed,
      maxSuggestions: 4,
    }));
  };

  useEffect(() => {
    if (!gameStarted) return;
    updateNextStepSuggestions();
  }, [
    gameStarted,
    currentLocationId,
    primaryCollectible,
    nearbySpecimenIds,
    specimenList,
    currentSpecimen,
    inventory,
    fatigue,
    traps,
    objectives,
    gameTime,
    daysPassed,
  ]);
  



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
  debugLog("Dismissing NPC based on [NPC_STATUS: dismissed]");
  setCurrentNPC(null);
  setVisibleNPCs([]);
}

// 2) Optionally, check for simple “departure” phrases.
//    This is only if you want to parse text for “He left” or “He walked away.” 
//    If you prefer to rely solely on the [NPC_STATUS] marker, skip this.
const departureRegex = /(left|walked away|departed|farewell)/i;
if (departureRegex.test(narrativeText)) {
  debugLog("Dismissing NPC based on a departure phrase in the text");
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
    
  }

}, [narrativeText, currentNPC, lastUserInput, specimenList, gameTime]);

const checkHybridsInLocation = (locationId) => {
  debugLog(`Checking for hybrids in location: ${locationId}`);

    const location = islandGrid.find(cell => cell.id === locationId);
  if (!location) {
    debugLog(`Location ${locationId} not found in islandGrid`);
    return;
  }

    const hybridsForLocation = specimenList.filter(s => 
    s?.isHybrid && 
    s.habitat &&
    habitatMatches(s, location.type)
  );
  
  debugLog(`Found ${hybridsForLocation.length} hybrids for location type ${location.type}:`,
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
  if (fatigue >= 95 && !passOutEvent) {
    handlePassOut();
  }
}, [fatigue, passOutEvent]);

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
    debugLog("Verifying hybrids in specimen list...");
    
    // Find hybrids in the specimen list
    const hybridsInList = specimenList.filter(s => s?.isHybrid);
    debugLog(`Found ${hybridsInList.length} hybrids in specimen list`);
    
    // Check if all hybrids have locations
    const hybridsWithoutLocations = hybridsInList.filter(s => !hasUsableLocation(s.location));
    
    // If any hybrids are missing locations, add them
    if (hybridsWithoutLocations.length > 0) {
      debugLog(`Found ${hybridsWithoutLocations.length} hybrids without locations, fixing...`);
      
      const updatedList = specimenList.map(specimen => {
        if (specimen?.isHybrid && !hasUsableLocation(specimen.location)) {
          return assignHybridLocation(specimen, { seed: `${expeditionSeed || 'young-darwin'}:repair` });
        }
        return specimen;
      });
      
      setSpecimenList(updatedList);
    }
  }
}, [hybridsEnabled, generatedHybrids, specimenList]);



  // Collection popup handlers
const handleOpenCollectionPopup = (specimenId) => {
  debugLog("Opening collection popup for:", specimenId);
  const specimen = resolveSpecimen(specimenList, specimenId);
  if (!specimen) {
    console.error("Invalid specimen ID:", specimenId);
    return;
  }
  
  // Set the current specimen (this is important for context)
  setCurrentSpecimen(specimen);
  
  // Set up the collection popup
  setCollectingSpecimenId(canonicalSpecimenId(specimen.id));
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

const handleSetTrapConfirm = () => {
  if (!collectingSpecimenId || !selectedMethod) return;
  const location = getCurrentLocation();
  const trap = createTrap({
    locationId: location?.id || currentLocationId,
    targetSpecimenId: collectingSpecimenId,
    method: selectedMethod,
    placement: collectionNotes || `Placed near signs of ${collectingSpecimenId}`,
    gameTime,
    daysPassed,
    seed: expeditionSeed
  });

  addTrap(trap);
  advanceTime(15);
  setShowCollectionPopup(false);
  sendToLLM(`Darwin sets a ${selectedMethod.name} as a trap for ${collectingSpecimenId} at ${location?.name || currentLocationId}. This is now a delayed fieldwork action; the trap should be checked later rather than resolved immediately.`);
};

const handleCheckTraps = (trapId = null) => {
  const location = getCurrentLocation();
  const trapsHere = traps.filter(trap => (
    trap.locationId === location?.id &&
    trap.status === 'set' &&
    (!trapId || trap.id === trapId)
  ));
  if (trapsHere.length === 0) {
    sendToLLM(trapId
      ? "Darwin looks for that trap, but it is not set at his current location."
      : "Darwin checks for traps here, but none have been set in this location.");
    return;
  }

  advanceTime(10);
  updateMoodAndFatigue(null, fatigue + 1);

  const results = trapsHere.map(trap => evaluateTrap(trap, {
    location,
    specimenList,
    fatigue,
    gameTime,
    daysPassed,
    seed: expeditionSeed
  }));

  results.forEach(result => {
    if (!result.ready) return;
    updateTrap(result.id, result);
    if (result.result?.success) {
      collectSpecimen(result.targetSpecimenId, buildCollectionMetadata(result.result, result.methodId, result.placement));
    } else {
      const specimen = resolveSpecimen(specimenList, result.targetSpecimenId);
      recordFieldEvidence(specimen, result.result, result.methodId, result.placement);
    }
  });

  const ready = results.filter(result => result.ready);
  if (ready.length === 0) {
    sendToLLM("Darwin checks the trap site. Nothing has sprung yet; the placement needs more time. The inspection costs a few minutes and a little energy.");
    return;
  }

  const summary = ready.map(result => {
    const specimen = resolveSpecimen(specimenList, result.targetSpecimenId);
    return `${specimen?.name || result.targetSpecimenId}: ${result.result?.reason || 'No result.'}`;
  }).join(' ');

  sendToLLM(`Darwin checks his traps at ${location?.name || currentLocationId}. ${summary}`);
};

const handleAbandonTrap = (trapId) => {
  const location = getCurrentLocation();
  const trap = traps.find(item => item.id === trapId);
  if (!trap || trap.status !== 'set' || trap.locationId !== location?.id) {
    sendToLLM("Darwin cannot abandon that trap from here; he must return to its site first.");
    return;
  }

  updateTrap(trap.id, {
    status: 'abandoned',
    ready: false,
    abandonedAt: gameTime,
    abandonedDay: daysPassed,
  });
  advanceTime(10);
  updateMoodAndFatigue(null, fatigue + 1);

  const specimen = resolveSpecimen(specimenList, trap.targetSpecimenId);
  sendToLLM(`Darwin retrieves and abandons the trap for ${specimen?.name || trap.targetSpecimenId} at ${location?.name || currentLocationId}, recording that the placement was unproductive.`);
};

  // Updated handleCollectNearbySpecimen function
const handleCollectNearbySpecimen = async (specimenId) => {
  const specimen = resolveSpecimen(specimenList, specimenId);
  
  if (specimen) {
    try {
      const handsMethod = collectionTools.find(tool => tool.id === 'hands') || { id: 'hands', name: 'Hands' };
      const result = evaluateCollectionAttempt({
        specimen,
        method: handsMethod,
        approach: 'A quick hand collection attempt without special preparation.',
        specimenId,
        location: getCurrentLocation(),
        fatigue,
        gameTime,
        seed: expeditionSeed
      });

      // Set popup data
      setCollectionResult(result);
      setCollectionSpecimenName(specimen.name);
      setCollectionMethod("hands"); // Default method when not specified
      
      // If successful, collect the specimen and send narrative
      if (result.success) {
        collectSpecimen(specimenId, buildCollectionMetadata(result, handsMethod, 'A quick hand collection attempt without special preparation.'));
        sendToLLM(`You successfully collected the ${specimen.name} for further study.`);
      } else {
        recordFieldEvidence(specimen, result, handsMethod, 'A quick hand collection attempt without special preparation.');
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
  debugLog("Collecting specimen with method:", method?.name, "notes:", notes);

  // Find the specimen to be collected
  const specimen = resolveSpecimen(specimenList, specimenId);
  if (!specimen) {
    console.error("Specimen not found:", specimenId);
    return;
  }

  try {
    const result = evaluateCollectionAttempt({
      specimen,
      method,
      approach: notes,
      location: getCurrentLocation(),
      fatigue,
      gameTime,
      seed: expeditionSeed
    });

    // Set popup data and show the popup IMMEDIATELY (while still loading)
    setCollectionResult(result);
    setCollectionSpecimenName(specimen.name);
    setCollectionMethod(method?.name || "your method");
    setShowCollectionResult(true);
    
    // Process the result in the background
    if (result.success) {
      // If successful, add to inventory
      collectSpecimen(specimenId, buildCollectionMetadata(result, method, notes));
      
      // Create a descriptive message about the successful collection
      const successMessage = `Collection result: ${result.reason} Darwin collected ${specimen.name} using ${method?.name}. Method fit ${Math.round(result.methodFit * 100)} percent; damage ${Math.round(result.damage * 100)} percent. ${notes ? `Player approach: ${notes}.` : ''}`;
      
      // Send success message to LLM
      sendToLLM(successMessage);
    } else {
      recordFieldEvidence(specimen, result, method, notes);

      // Create a descriptive message about the failed collection
      const failureMessage = `Collection result: ${result.reason} Darwin attempted to collect ${specimen.name} with ${method?.name}. This is a deterministic game outcome; do not reverse it. ${result.evidence ? `Usable evidence gained: ${result.evidence}.` : ''} ${notes ? `Player approach: ${notes}.` : ''}`;
      
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

const handleSurveySite = () => {
  const location = getCurrentLocation();
  if (!location) return;
  const note = buildSurveyNote({
    location,
    nearbySpecimenIds,
    specimenList,
    day: daysPassed,
    time: formatGameTime(),
  });

  addJournalEntry(note);
  addToGameHistory('field_notes', `FIELD SURVEY - ${location.name}: ${note.content}`);
  advanceTime(20);
  updateMoodAndFatigue(null, fatigue + 2);
  refreshObjectives();
  setNarrativeText(`You make a disciplined survey of ${location.name}, noting habitat, footing, visible life, and collecting conditions. The note is added to your field book.`);
};

const handleDocumentSpecimen = (specimen) => {
  const location = getCurrentLocation();
  const note = buildSpecimenDocumentationNote({
    specimen,
    location,
    method: 'field observation',
  });
  if (!note) return;

  addFieldEvidence(note);
  advanceTime(15);
  updateMoodAndFatigue(null, fatigue + 1);
  refreshObjectives();
  setCurrentSpecimen(specimen);
  setNarrativeText(`You document ${specimen.name} in place, emphasizing habitat, behavior, condition, and distinguishing characters before deciding whether to collect it.`);
};

const getPresentSpecimenCandidates = () => {
  const orderedIds = [
    currentSpecimen?.id,
    primaryCollectible,
    ...nearbySpecimenIds,
  ].map(canonicalSpecimenId).filter(Boolean);
  const seen = new Set();

  return orderedIds
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(id => resolveSpecimen(specimenList, id))
    .filter(Boolean);
};

const findPresentSpecimen = (query) => {
  const normalizedQuery = canonicalSpecimenId(query);
  const queryText = String(query || '').toLowerCase();
  const candidates = getPresentSpecimenCandidates();
  if (!queryText && candidates.length === 1) return candidates[0];

  return candidates.find(specimen => (
    canonicalSpecimenId(specimen.id) === normalizedQuery ||
    canonicalSpecimenId(specimen.name) === normalizedQuery ||
    specimen.name.toLowerCase().includes(queryText) ||
    queryText.includes(specimen.name.toLowerCase()) ||
    (specimen.keywords || []).some(keyword => queryText.includes(String(keyword).toLowerCase()))
  )) || null;
};

const updateNearbySpecimensAfterMovement = (movementResult) => {
  if (!movementResult?.newPosition) return;
  const newCell = getCellByCoordinates(
    movementResult.newPosition.x,
    movementResult.newPosition.y
  );
  if (newCell && newCell.type) {
    setNearbySpecimenIds(getVisibleEncounterIds({
      location: newCell,
      specimenList,
      inventory,
      gameTime,
      seed: expeditionSeed
    }));
  } else {
    setNearbySpecimenIds([]);
  }
};

const handleMovementResult = (movementResult) => {
  if (!movementResult) return false;

  handleNPCsOnMovement();
  sendToLLM(movementResult.message || "You cannot travel there.");

  if (movementResult.success) {
    if (movementResult.fatigueIncrease) {
      updateMoodAndFatigue(null, fatigue + movementResult.fatigueIncrease);
    }
    if (movementResult.travelMinutes) {
      advanceTime(movementResult.travelMinutes);
    }
    updateNearbySpecimensAfterMovement(movementResult);
    updateNextStepSuggestions();
  }

  return true;
};

const handleInteriorEntry = (interiorType) => {
  const layout = interiorLayouts[interiorType];
  if (!layout) {
    sendToLLM("There's nothing to enter here.");
    return;
  }

  const currentLocation = getCurrentLocation();
  if (currentLocation.id !== layout.exteriorLocation) {
    sendToLLM(`The ${layout.name} is not accessible from here.`);
    return;
  }

  const result = enterInterior(interiorType);
  if (result.success) {
    sendToLLM(result.message);
  }
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
  
  setPassOutEvent(rescuer);
};

const handlePassOutContinue = () => {
  if (!passOutEvent) return;
  const recoveryLocation = getCurrentLocation();
  const rescuerName = passOutEvent.name;
  setPassOutEvent(null);
  sendToLLM(`Darwin collapsed from exhaustion yesterday and was found by ${rescuerName}. It's now morning, and Darwin is recovering in ${recoveryLocation?.name || 'a safer place'}.`);
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
    
    const requestMeta = buildLLMRequestMeta({
      sessionId: expeditionSeed,
      route: '/api/generate',
      kind: 'switch_pov',
      gameTime,
      locationId: currentLocationId,
      prompt,
    });

    // Call the API using the tortoise prompt
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: requestMeta.headers,
      body: JSON.stringify({
        gameState: contextData,
        prompt: prompt,
        idempotencyKey: requestMeta.idempotencyKey,
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
    setLastUserInput(input);
    const command = routePlayerCommand(input);

    switch (command.type) {
      case 'empty':
        return;
      case 'rest': {
        const currentLocation = getCurrentLocation();
        const restableLocations = ['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT'];
        if (currentLocation && restableLocations.includes(currentLocation.id)) {
          handleRest();
        } else {
          sendToLLM("Darwin looks for shelter, but this place offers no sensible rest. He should return to the Beagle, the settlement, or the whaler's huts before exhausting himself.");
        }
        return;
      }
      case 'survey_site':
        handleSurveySite();
        return;
      case 'document_specimen': {
        const specimen = findPresentSpecimen(command.query) || selectDocumentableSpecimen({
          primaryCollectible,
          nearbySpecimenIds,
          specimenList,
        });
        if (specimen) {
          handleDocumentSpecimen(specimen);
        } else {
          sendToLLM("Darwin has no clearly visible specimen to document here. Survey the site first or move to a richer habitat.");
        }
        return;
      }
      case 'check_traps':
        handleCheckTraps();
        return;
      case 'abandon_trap': {
        const location = getCurrentLocation();
        const trapHere = traps.find(trap => trap.locationId === location?.id && trap.status === 'set');
        if (trapHere) {
          handleAbandonTrap(trapHere.id);
        } else {
          sendToLLM("Darwin finds no active trap to abandon at this site.");
        }
        return;
      }
      case 'enter_interior':
        handleInteriorEntry(command.interiorType);
        return;
      case 'move_direction':
        handleMovementResult(handleMove(command.direction));
        return;
      case 'move_location':
        handleMovementResult(moveToLocation(command.locationId));
        return;
      case 'collect_specimen': {
        const specimen = findPresentSpecimen(command.query);
        if (specimen && !specimen.collected) {
          handleCollectNearbySpecimen(specimen.id);
        } else {
          sendToLLM("Darwin cannot responsibly collect that specimen from here. He must first locate it in the field or select a visible specimen nearby.");
        }
        return;
      }
      case 'use_tool': {
        const toolDesc = useScientificTool(command.tool, command.target);
        if (toolDesc) sendToLLM(toolDesc);
        else sendToLLM(`Darwin cannot find a sensible way to use ${command.tool} on ${command.target}.`);
        return;
      }
      case 'open_journal':
        setJournalOpen(true);
        return;
      default:
        await sendToLLM(input);
    }
  };



  // Map location fast travel
const handleMapLocationClick = (locationIdOrDirection) => {
  // Set the movement flag (KEEP THIS LINE)
  setIsMovingViaMap(true);

  debugLog(`Player clicked: ${locationIdOrDirection}`);
  
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
    debugLog("After moveToLocation, result:", moveResult);
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
    if (moveResult.travelMinutes) {
      advanceTime(moveResult.travelMinutes);
    }
    
    // Update nearby specimens context
    const newCell = getCellByCoordinates(
      moveResult.newPosition ? moveResult.newPosition.x : playerPosition.x,
      moveResult.newPosition ? moveResult.newPosition.y : playerPosition.y
    );
    
    if (newCell && newCell.type) {
      setNearbySpecimenIds(getVisibleEncounterIds({
        location: newCell,
        specimenList,
        inventory,
        gameTime,
        seed: expeditionSeed
      }));
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
      
      const requestMeta = buildLLMRequestMeta({
        sessionId: expeditionSeed,
        route: '/api/generate',
        kind: 'memory',
        gameTime,
        locationId: currentLocationId,
        prompt: memoryPrompt,
      });

      // Call API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: requestMeta.headers,
        body: JSON.stringify({ 
          prompt: memoryPrompt,
          gameState: contextData,
          idempotencyKey: requestMeta.idempotencyKey,
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
    debugLog(`Adding fatigue increment: ${fatigueDelta}`);
    
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
    const primaryCollectible = canonicalSpecimenId(collectibleMatches[0]
      .replace('[COLLECTIBLE:', '')
      .replace(']', '')
      .trim());
    
    // Check if this is a hybrid specimen ID
    const hybridSpecimen = specimenList.find(s => 
      s.isHybrid && (
        s.id.toLowerCase() === primaryCollectible.toLowerCase() ||
        s.name.toLowerCase().includes(primaryCollectible.toLowerCase())
      )
    );
    
    if (hybridSpecimen) {
      debugLog(`Found hybrid specimen as collectible: ${hybridSpecimen.name} (${hybridSpecimen.id})`);
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
      debugLog("NPC dismissed based on LLM response");
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
    debugLog("User explicitly dismissed NPC");
    setCurrentNPC(null);
    setVisibleNPCs([]);
  }
    
    // Extract potential next steps

const stepsSection = response.match(/NEXTSTEPS:([\s\S]*?)(?=\[|$)/);
    
if (stepsSection && stepsSection[1]) {
  const stepsText = stepsSection[1].trim();
  const lines = stepsText.split('\n').filter(line => line.trim().startsWith('-'));
  
  if (lines.length > 0) {
    const narrativeSuggestions = lines.map(line => {
      const stepText = line.replace(/^-\s*/, '').trim();
      
      return {
        text: stepText,
        action: stepText,
        kind: 'narrative',
      };
    });
    
    if (narrativeSuggestions.length > 0) {
      const stateSuggestions = buildActionSuggestions({
        location: getCurrentLocation(),
        validDirections: getValidDirections(),
        primaryCollectible,
        nearbySpecimenIds,
        specimenList,
        currentSpecimen,
        inventory,
        fatigue,
        traps,
        objectives,
        gameTime,
        daysPassed,
        maxSuggestions: 4,
      });
      setNextStepSuggestions(mergeActionSuggestions(stateSuggestions, narrativeSuggestions, 4));
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

Remember to respond as if you are Darwin's first-person perspective, using second-person ("you"). Assessment of actions is almost always wittily barbed and critical. REmember the 1835 context. If the player pushes up against social and historical norms of the time, brutally and vividly reveal to them that the past truly is a foreign country, and life in 1835 was hard. But you can also be witty and take things in creative directions - though it must stay strictly within the bounds of historical accuracy. Your narratives are rarely more than two paragraphs. Follow your prompt exactly.
`;
    
    // Save the raw prompt for transparency
    setRawLLMPrompt(enhancedInput);
    
    const requestMeta = buildLLMRequestMeta({
      sessionId: expeditionSeed,
      route: '/api/generate',
      kind: 'main_turn',
      gameTime,
      locationId: currentLocationId,
      prompt: enhancedInput,
    });

    // Call API
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: requestMeta.headers,
      body: JSON.stringify({
        gameState: contextData,
        prompt: enhancedInput,
        idempotencyKey: requestMeta.idempotencyKey
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
          
          {savedExpeditionSummary && (
            <div className="mb-4 mx-auto max-w-xl rounded-lg border border-amber-300 bg-white/80 p-3 text-left text-sm text-amber-950">
              <div className="font-semibold">Saved expedition available</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-800">
                <span>Day {savedExpeditionSummary.day}, {savedExpeditionSummary.time}</span>
                <span>Location: {savedExpeditionSummary.locationId}</span>
                <span>{savedExpeditionSummary.specimens} specimens</span>
                <span>{savedExpeditionSummary.notes} field notes</span>
                <span>{savedExpeditionSummary.objectivesComplete}/{savedExpeditionSummary.objectivesTotal} objectives</span>
                <span>Fatigue {savedExpeditionSummary.fatigue}/100</span>
              </div>
            </div>
          )}

          {continueMessage && (
            <p className="mb-3 text-sm text-red-700">{continueMessage}</p>
          )}

          {/* Begin Expedition Button - Now centered */}
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <button
              className={`py-4 px-8 rounded-lg font-medium relative z-10 text-lg transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50 border border-amber-300 ${
                savedExpeditionSummary
                  ? 'transform hover:scale-105 bg-white/90 text-amber-900'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
              onClick={handleContinueSavedExpedition}
              disabled={!savedExpeditionSummary}
            >
              Continue Saved Expedition
            </button>
            <button 
              className="py-4 px-10 rounded-lg font-medium relative z-10 text-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50 group flex items-center gap-2"
              onClick={handleStartNewExpedition}
              style={{
                backgroundColor: 'rgb(var(--darwin-primary))',
                color: 'white',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            >
              <span className="absolute inset-0 w-full h-full bg-white rounded-lg opacity-0 group-hover:opacity-10 transition-opacity"></span>
              Start New Expedition
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
  
  const currentLocation = getCurrentLocation();
  const primaryActionSpecimen = primaryCollectible
    ? resolveSpecimen(specimenList, primaryCollectible)
    : null;
  const documentableSpecimen = selectDocumentableSpecimen({
    primaryCollectible,
    nearbySpecimenIds,
    specimenList,
  });
  const activeConversationNPC = currentNPC
    ? npcs.find(n => n.id === currentNPC)
    : null;
  const trapsSetHere = traps.some(trap => trap.locationId === currentLocation?.id && trap.status === 'set');
  const hasPrimaryActions = Boolean(
    trapsSetHere ||
    (primaryActionSpecimen && !primaryActionSpecimen.collected) ||
    activeConversationNPC ||
    visibleNPCs.length > 0
  );
  const secondaryActionSuggestions = [];
  const addSecondarySuggestion = (suggestion) => {
    if (!suggestion?.text || !suggestion?.action) return;
    const key = `${suggestion.text}:${suggestion.action}`.toLowerCase();
    if (secondaryActionSuggestions.some(item => `${item.text}:${item.action}`.toLowerCase() === key)) return;
    secondaryActionSuggestions.push(suggestion);
  };

  if (currentLocation) {
    addSecondarySuggestion({
      text: 'Survey site',
      action: 'Survey the site',
      kind: 'survey',
    });
  }
  if (documentableSpecimen) {
    addSecondarySuggestion({
      text: `Document ${documentableSpecimen.name}`,
      action: `Document ${documentableSpecimen.name}`,
      kind: 'evidence',
    });
  }
  nextStepSuggestions
    .filter(suggestion => (
      !['specimen', 'trap', 'npc', 'conversation'].includes(suggestion?.kind) &&
      !/^collect\b/i.test(suggestion?.text || '') &&
      !/^talk\b/i.test(suggestion?.text || '') &&
      !/^check\b/i.test(suggestion?.text || '')
    ))
    .forEach(addSecondarySuggestion);
  const visibleSecondaryActions = secondaryActionSuggestions.slice(0, 4);

  // Main game screen
  return (
    <div className="game-shell bg-darwin-light relative">

   <HamburgerMenu />
      
      <div className="darwin-panel game-hero mb-3 bg-amber-50 relative overflow-hidden shadow-sm rounded-lg">
        {/* Banner image */}
        <BannerImage 
  location={isInInterior ? currentInteriorRoom?.name : getCurrentLocation()?.name}
  activeTool={activeTool}
/>



        {/* Text container for title & details */}
        <div className="relative z-10 flex min-h-[inherit] flex-col items-center justify-center px-3 py-5 text-center sm:px-5">
          
          {/* Title */}
          <h1 className="game-hero-title font-bold text-white font-serif uppercase px-4 py-3 
            bg-black/65 rounded-md shadow-lg backdrop-blur-md inline-block sm:px-6">
            YOUNG DARWIN: 1835
          </h1>

          {/* Subtitle - Date & Location */}
          <div className="game-hero-meta mt-2 text-white font-serif px-4 py-2 bg-black/40 rounded-md shadow-md 
            inline-block opacity-95 backdrop-blur-md">
            {formatGameTime()} • Day {daysPassed} • Isla Floreana (Charles Island), Galápagos
          </div>

          {/* Decorative Line & Expedition Text */}
          <div className="mt-3 hidden items-center justify-center sm:flex">
            <div className="w-16 h-px bg-white/45 md:w-24"></div>
            <div className="mx-3 text-xs text-white/90 font-medium px-4 py-1.5 bg-black/35 rounded-md shadow-md uppercase
            inline-block opacity-98 backdrop-blur-md">
              HMS Beagle Expedition
            </div>
            <div className="w-16 h-px bg-white/45 md:w-24"></div>
          </div>
        </div>
      </div>
      
      <div className="game-main-grid">
        {/* Left column - Portrait and Map */}
        <div className="game-side-column order-2 lg:order-1">
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
    
    const matchingSpecimens = specimenList.filter(s => habitatMatches(s, roomType));
    debugLog(`Found ${matchingSpecimens.length} specimens for ${roomType}: `, 
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

         <ExpeditionStatusPanel />
         <TrapLedger
           traps={traps}
           specimenList={specimenList}
           locations={islandGrid}
           tools={collectionTools}
           currentLocationId={currentLocationId}
           gameTime={gameTime}
           daysPassed={daysPassed}
           onCheckTrap={handleCheckTraps}
           onAbandonTrap={handleAbandonTrap}
         />

         <EnhancedEventHistory /> 
    
        </div>


        
        {/* Center column - Game narrative */}
        <div className="order-1 lg:order-2 darwin-panel game-narrative-panel p-0">
          {hasPrimaryActions && (
            <div className="shrink-0 border-b border-amber-200 bg-stone-50/80 px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                {trapsSetHere && (
                  <button
                    type="button"
                    onClick={() => handleCheckTraps()}
                    className="rounded-md border border-stone-400 bg-white/85 px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                  >
                    Check traps
                  </button>
                )}

                {primaryActionSpecimen && !primaryActionSpecimen.collected && (
                  <button
                    type="button"
                    onClick={() => handleOpenCollectionPopup(primaryActionSpecimen.id)}
                    className="rounded-md border border-amber-700 bg-amber-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                  >
                    <span className="mr-2">{getSpecimenIcon(primaryActionSpecimen.id)}</span>
                    Collect {primaryActionSpecimen.name}
                  </button>
                )}

                {activeConversationNPC ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentNPC(null);
                      setVisibleNPCs([]);
                      sendToLLM("End conversation and continue exploration");
                    }}
                    className="rounded-md border border-emerald-700 bg-white/85 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                  >
                    End talk with {activeConversationNPC.name}
                  </button>
                ) : (
                  visibleNPCs.map(id => {
                    const npc = npcs.find(n => n.id === id);
                    return npc ? (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleTalkToNPC(id)}
                        className="rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLoading}
                      >
                        Talk to {npc.name}
                      </button>
                    ) : null;
                  })
                )}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <GameLog
              narrative={narrativeText}
              isLoading={isLoading}
              lastUserInput={lastUserInput}
              isMovingViaMap={isMovingViaMap}
            />
          </div>

          <div className="game-input-dock shrink-0 border-t border-amber-200 bg-[rgb(var(--parchment-light))]/95 p-2 shadow-[0_-8px_18px_rgba(74,55,40,0.08)] backdrop-blur sm:p-4">

            <PlayerInput
              onSubmit={handlePlayerInput}
              isLoading={isLoading}
              suggestions={visibleSecondaryActions}
              rawResponse={rawLLMResponse}
              rawPrompt={rawLLMPrompt}
              showSuggestions={visibleSecondaryActions.length > 0}
            />
          </div>
	        </div>
        
        {/* Right column - Weather and Specimen collection */}
        <div className="game-side-column order-3">


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
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-50 p-2 sm:items-center sm:p-4">
    <div className="bg-darwin-light max-w-lg w-full max-h-[94dvh] rounded-lg overflow-hidden shadow-xl border border-darwin-secondary/60 flex flex-col">
      {/* Specimen Header with Image */}
      <div className="relative">
        {/* Specimen Image */}
        <div className="w-full h-44 relative overflow-hidden sm:h-64">
          {(() => {
            const currentSpecimen = resolveSpecimen(specimenList, collectingSpecimenId);
            const isHybrid = currentSpecimen?.isHybrid;
            
            return isHybrid ? (
              <HybridSpecimenImage 
                specimen={currentSpecimen}
                className="w-full h-full"
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
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white sm:p-5">
          {(() => {
            const currentSpecimen = resolveSpecimen(specimenList, collectingSpecimenId);
            return (
              <>
                <h3 className="font-bold text-2xl mb-1 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)] sm:text-3xl">
                  Collect {currentSpecimen?.name}
                </h3>
                <p className="italic text-white/80 text-base font-serif drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-lg">
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
      <div className="min-h-0 overflow-y-auto">
      <div className="p-4 bg-gradient-to-r from-amber-200/40 to-amber-100/70 border-b border-amber-200/60 sm:p-5">
        <div className="flex flex-col gap-3">
          {(() => {
            const specimen = resolveSpecimen(specimenList, collectingSpecimenId);
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
      <div className="p-4 pb-4 bg-amber-50/50 sm:p-5">
        <h4 className="text-base text-darwin-dark font-medium mb-4 border-b border-amber-200 pb-2 flex items-center sm:text-lg">
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
                relative min-h-24 p-3 rounded-md flex flex-col items-center justify-center transition-all duration-200
                ${selectedMethod?.id === method.id 
                  ? 'bg-amber-800 text-white shadow-md border-2 border-amber-600' 
                  : 'bg-amber-50 text-darwin-dark border-2 border-amber-200/70 hover:bg-amber-100 hover:shadow-md'
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

        <CollectionMethodPreview
          specimen={resolveSpecimen(specimenList, collectingSpecimenId)}
          method={selectedMethod}
          approach={collectionNotes}
          location={getCurrentLocation()}
          fatigue={fatigue}
          gameTime={gameTime}
          seed={expeditionSeed}
        />

        <h4 className="text-base text-darwin-dark font-medium mb-3 flex items-center sm:text-lg">
          <span className="bg-darwin-primary/10 rounded-full w-7 h-7 flex items-center justify-center mr-2">
            <span className="text-darwin-primary text-sm font-bold">2</span>
          </span>
          Your Approach <span className="text-sm font-normal text-gray-600 ml-1">(Optional)</span>:
        </h4>
        
        <div className="mb-5">
          <textarea
            className="w-full p-3 rounded-md border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 bg-white shadow-inner sm:p-4"
            rows={3}
            placeholder="Describe how you'll approach the collection (e.g., 'I move slowly and quietly to avoid startling the animal')"
            value={collectionNotes}
            onChange={(e) => setCollectionNotes(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-1 gap-2 mt-6 sm:flex sm:justify-between sm:gap-3">
          <button
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-md transition-colors border border-gray-300 font-medium"
            onClick={() => setShowCollectionPopup(false)}
          >
            Cancel
          </button>
          {selectedMethod && ['snare', 'insect_net'].includes(selectedMethod.id) && (
            <button
              className="flex-1 bg-stone-700 hover:bg-stone-800 text-white py-3 px-4 rounded-md transition-colors font-medium"
              onClick={handleSetTrapConfirm}
            >
              Set Trap
            </button>
          )}
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

{passOutEvent && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-amber-50 rounded-lg border-2 border-amber-700 shadow-xl max-w-lg w-full p-6">
      <div className="text-center mb-4">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-amber-950 font-serif">Darwin Collapsed From Exhaustion</h3>
        <p className="mt-1 text-sm text-amber-800">You were found by {passOutEvent.name}.</p>
      </div>
      <p className="text-sm leading-relaxed text-gray-800 font-serif">
        {passOutEvent.description}
      </p>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handlePassOutContinue}
          className="bg-amber-700 hover:bg-amber-800 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
)}

{/* Fatigue Warning Popup */}
{showFatigueWarning && (
  <div className="fixed inset-x-3 top-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg z-50 sm:left-1/2 sm:right-auto sm:top-20 sm:w-full sm:max-w-md sm:-translate-x-1/2">
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
    debugLog('Journal entry saved:', entry);
    addJournalEntry(entry);
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
