// useGameStore.js - Updated with enhanced event history and LLM context generation

import { create } from 'zustand';
import { tools } from '../data/tools';
import { npcs } from '../data/npcs'; 
import { initializeSpecimens } from '../data/specimens';
import { queueEventForSummary, compileEventHistorySummary } from '../utils/generateLLMContext';
import { locations } from '../data/locations';
import { canonicalSpecimenId, canonicalizeSpecimen, resolveSpecimen } from '../utils/canonicalIds';
import { createDefaultObjectives, createExpeditionSeed, updateObjectiveProgress } from '../utils/expeditionSystems';
import { clearExpeditionSave, loadExpedition, saveExpedition } from '../utils/localSave';

const useGameStore = create((set, get) => ({
  // Core game state
  gameStarted: false,
  currentScreen: 'title',
  currentLocationId: 'POST_OFFICE_BAY',
  playerLocation: { x: 1, y: 0 },
  expeditionSeed: null,
  objectives: createDefaultObjectives(),
  traps: [],


  setPlayerLocation: (position) => {
   const foundCell = locations.find(cell =>
      cell.x === position.x && cell.y === position.y
    );
    set({
      playerLocation: position,
      currentLocationId: foundCell ? foundCell.id : 'unknown'
    });
  },

  gameTime: 360, // starting at 6:00 AM (in minutes)
  daysPassed: 1,
  fatigue: 1,
  darwinMood: 'interested',
  specimenList: [], // Initially empty; populated when the game starts
  currentSpecimen: null,

  inventory: [],
  journal: [],
  scientificScore: 0,
  narrativeText: '',
  isLoading: false,
  visibleNPCs: [],
  currentNPC: null, 

  // Add event history for the EnhancedEventHistory component
  eventHistory: [],

  // Initialize gameHistory with an initial system message
  gameHistory: [
    {
      role: 'system',
      content: `This is an educational historical simulation game designed by a history professor. You are simulating Charles Darwin's expedition to the Galápagos Islands in 1835, specifically his exploration of Isla Floreana (Charles Island) in Galapagos. As the game begins, the player (playing as Darwin) has taken a rowboat from the HMS Beagle, which is anchored nearby, to Post Office Bay, accompanied by Syms Covington, and ready to spend the day botanizing.`
    }
  ],

  // Method to add a visible NPC
  addVisibleNPC: (npcId) => set((state) => ({
    visibleNPCs: state.visibleNPCs.includes(npcId) 
      ? state.visibleNPCs 
      : [...state.visibleNPCs, npcId]
  })),

  // Method to remove a visible NPC
  removeVisibleNPC: (npcId) => set((state) => ({
    visibleNPCs: state.visibleNPCs.filter(id => id !== npcId)
  })),

  // Method to clear all visible NPCs
  clearVisibleNPCs: () => set({ visibleNPCs: [] }),

  // Helper: set specimen list (e.g., after randomization)
  setSpecimenList: (specimens) => set({ specimenList: specimens.map(canonicalizeSpecimen) }),

  // Method to update an event's summary with LLM-generated one
  updateEventSummary: (eventId, llmSummary) => set(state => ({
    eventHistory: state.eventHistory.map(event => 
      event.id === eventId 
        ? { ...event, llmSummary, hasLLMSummary: true } 
        : event
    )
  })),

// Enhanced addToGameHistory function with improved event classification
addToGameHistory: (role, content) => set((state) => {
  // Get the most current state values
  const currentState = get();
  
  // Use the current state values, not the state parameter
  const { daysPassed, gameTime } = currentState;
  const currentLocationId = currentState.currentLocationId;
  
  // Ensure content is a string to avoid method errors
  const contentString = typeof content === 'string' ? content : 
                        (typeof content === 'object' && content !== null) ? 
                          (content.content || JSON.stringify(content)) : 
                          String(content);
  
  const newEntry = { role, content: contentString };
  const updatedHistory = [...state.gameHistory, newEntry].slice(-5);
  
  const formattedTime = formatTime(gameTime);
  const currentLocation = locations.find(loc => loc.id === currentLocationId);
  const locationName = currentLocation ? currentLocation.name : getLocationName(currentLocationId);
  
  // Determine event type based on role and content
  let eventType = 'event'; // Default to 'event' instead of 'narrative'
  
  if (role === 'user') {
    // Check if this is an observation (tool use)
    if (contentString.toLowerCase().includes('use') && 
        (contentString.toLowerCase().includes('examine') || 
         contentString.toLowerCase().includes('observe') ||
         contentString.toLowerCase().includes('dissect') || 
         contentString.toLowerCase().includes('kit') || 
         contentString.toLowerCase().includes('lens') || 
         contentString.toLowerCase().includes('caliper'))) {
      eventType = 'observation';
    } else {
      eventType = 'action';
    }
  } else if (role === 'field_notes') {
    eventType = 'field_notes';
  } else if (contentString.toLowerCase().includes('collect') && 
             (contentString.toLowerCase().includes('successfully') || 
              contentString.toLowerCase().includes('added to inventory'))) {
    eventType = 'collection';
  } else if (contentString.toLowerCase().includes('travel') || 
             contentString.toLowerCase().includes('move') ||
             contentString.toLowerCase().includes('arrive') || 
             contentString.match(/\bto\s+[^.]+\b/i)) {
    eventType = 'movement';
  } else if (contentString.toLowerCase().includes('use') && 
             (contentString.toLowerCase().includes('kit') || 
              contentString.toLowerCase().includes('lens') || 
              contentString.toLowerCase().includes('caliper') ||
              contentString.toLowerCase().includes('observation'))) {
    eventType = 'observation';
  }
  
  // Extract relevant metadata from content
  const moodMatch = contentString.match(/\[MOOD:\s*(.*?)\]/);
  const fatigueMatch = contentString.match(/\[FATIGUE:\s*(\d+)\]/);
  const weatherMatch = contentString.match(/\[WEATHER:\s*(.*?)\]/);
  const insightMatch = contentString.match(/\[SCIENTIFIC_INSIGHT:\s*(.*?)\]/);
  const collectibleMatch = contentString.match(/\[COLLECTIBLE:\s*(.*?)\]/);
  
  // Create an initial summary
  let summary = '';
  
  if (role === 'field_notes') {
    // For field notes, use the content directly (it's already formatted)
    summary = contentString;
    if (summary.length > 100) {
      summary = summary.substring(0, 200) + '...';
    }
  } else {
    // For other types, clean and process the content
    const cleanContent = contentString
      .replace(/\[MOOD:.*?\]/g, '')
      .replace(/\[FATIGUE:.*?\]/g, '')
      .replace(/\[WEATHER:.*?\]/g, '')
      .replace(/\[COLLECTIBLE:.*?\]/g, '')
      .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
      .replace(/\[NPC:.*?\]/g, '')
      .replace(/NEXTSTEPS:[\s\S]*?(?=\[|$)/g, '') // Remove the next steps section
      .trim();
    
    // Get first sentence or first 100 chars, avoiding empty results
    let firstSentence = cleanContent.split(/\.|\!|\?/)[0];
    if (!firstSentence || firstSentence.length < 5) {
      // If splitting by sentences fails, just take the first 200 chars
      firstSentence = cleanContent.substring(0, 200);
    }
    
    summary = firstSentence.length > 200 
      ? firstSentence.substring(0, 200) + '...' 
      : firstSentence + (firstSentence.endsWith('.') ? '' : '.');
  }
  
  // Add a unique id for the event
  const eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Create the event entry with extracted details
  const eventEntry = {
    id: eventId,
    day: daysPassed,
    timestamp: gameTime,
    time: formattedTime,
    location: locationName,
    locationId: currentLocationId,
    locationType: currentLocation?.type || null,
    summary,     // Initial summary (will be replaced by LLM summary)
    llmSummary: null, // Will be filled by background LLM process
    hasLLMSummary: false,
    mood: moodMatch ? moodMatch[1].trim() : state.darwinMood,
    fatigue: fatigueMatch ? parseInt(fatigueMatch[1]) : null,
    weather: weatherMatch ? weatherMatch[1].trim() : null,
    scientificInsight: insightMatch ? insightMatch[1].trim() : null,
    specimenCollected: collectibleMatch ? collectibleMatch[1].trim() : null,
    role,
    fullContent: contentString,
    eventType
  };
  
  // Add to event history, keeping the last 30 events
  const updatedEventHistory = [...state.eventHistory, eventEntry].slice(-30);
  
  // Queue only narrative-scale events for LLM summarization. Field notes are
  // already concise records and should not create background API traffic.
  if (role !== 'user' && role !== 'field_notes' && contentString.length > 30) {
    queueEventForSummary(eventEntry, get());
  }
  
  return { 
    gameHistory: updatedHistory,
    eventHistory: updatedEventHistory
  };
}),


  // Method to generate compact context for LLM
  generateLLMContext: () => {
    return compileEventHistorySummary(get().eventHistory);
  },
  
  // Debug-getter
  getState: () => get(),

  // Helper to retrieve recent history (last 5 turns)
  getRecentHistory: () => get().gameHistory,

  refreshObjectives: () => set((state) => ({
    objectives: updateObjectiveProgress(state.objectives, state)
  })),

  addTrap: (trap) => set((state) => ({
    traps: [...state.traps, trap]
  })),

  updateTrap: (trapId, updates) => set((state) => ({
    traps: state.traps.map(trap => trap.id === trapId ? { ...trap, ...updates } : trap)
  })),

  saveGame: () => saveExpedition(get()),

  loadSavedGame: () => {
    const saved = loadExpedition();
    if (!saved) return false;

    set({
      gameStarted: saved.gameStarted ?? true,
      currentScreen: saved.currentScreen || 'exploration',
      currentLocationId: saved.currentLocationId || 'POST_OFFICE_BAY',
      playerLocation: saved.playerLocation || { x: 1, y: 0 },
      expeditionSeed: saved.expeditionSeed || createExpeditionSeed(),
      gameTime: saved.gameTime ?? 360,
      daysPassed: saved.daysPassed ?? 1,
      fatigue: saved.fatigue ?? 1,
      darwinMood: saved.darwinMood || 'interested',
      scientificScore: saved.scientificScore || 0,
      inventory: (saved.inventory || []).map(canonicalizeSpecimen),
      journal: saved.journal || [],
      traps: saved.traps || [],
      objectives: saved.objectives || createDefaultObjectives(),
      eventHistory: saved.eventHistory || [],
      specimenList: (saved.specimenList && saved.specimenList.length > 0)
        ? saved.specimenList.map(canonicalizeSpecimen)
        : initializeSpecimens()
    });

    get().refreshObjectives();
    return true;
  },

  clearSavedGame: () => clearExpeditionSave(),

  // Other game actions:
 startGame: () => {
  // Get the current state before starting the game
  const currentState = get();
  const currentSpecimenList = currentState.specimenList;
  
  // Keep track of any hybrid specimens that might have been created
  const existingHybrids = currentSpecimenList.filter(s => s.isHybrid === true);
  
  // Initialize new specimens
  let initialSpecimens = initializeSpecimens();
  
  // If there were hybrids, merge them with the new specimens
  if (existingHybrids && existingHybrids.length > 0) {
    console.log(`Preserving ${existingHybrids.length} hybrid specimens during game start`);
    initialSpecimens = [...initialSpecimens, ...existingHybrids.map(canonicalizeSpecimen)];
  }
  
  set({
    gameStarted: true,
    currentScreen: 'exploration',
    expeditionSeed: currentState.expeditionSeed || createExpeditionSeed(),
    objectives: currentState.objectives?.length ? currentState.objectives : createDefaultObjectives(),
    specimenList: initialSpecimens
  });
},

  setIsLoading: (isLoading) => set({ isLoading }),
  setNarrativeText: (text) => set({ narrativeText: text }),

  // Set the current NPC 
  setCurrentNPC: (npcId) => {
    if (!npcId) {
      set({ currentNPC: null });
      return;
    }

    const npc = npcs.find(n => n.id === npcId);
    if (npc) {
      set({ currentNPC: npc.id });
    }
  },

  // Updated moveToLocation function to include NPC encounters
moveToLocation: (locationId) => {
  // Check if we're already at this location to prevent duplicate entries
  const currentLocId = get().currentLocationId;
  if (currentLocId === locationId) {
    return null;
  }
  
  const location = locations.find(loc => loc.id === locationId);
  if (location) {
    // First set the state
    set({
      playerLocation: { x: location.x, y: location.y },
      currentLocationId: locationId
    });

    // Now add to game history with the updated location ID
    return get().addToGameHistory('movement', `Moved to ${location.name}`);
  } else {
    console.warn('moveToLocation failed to find:', locationId);
    return null;
  }
},


  collectSpecimen: (id, metadata = {}) => {
    const { specimenList, playerLocation, addToGameHistory } = get();
    const specimenId = canonicalSpecimenId(id);
    const specimen = resolveSpecimen(specimenList, specimenId);
    if (specimen && !specimen.collected) {
      const quality = metadata.quality ?? Math.max(0, Math.round((1 - (metadata.damage || 0)) * 100));
      const currentLocation = locations.find(loc => loc.id === get().currentLocationId);

      // Add the collection location to the specimen
      const specimenWithLocation = {
        ...specimen,
        collected: true,
        collectionMethod: metadata.methodName || metadata.methodId || 'Unknown method',
        collectionNotes: metadata.notes || '',
        collectionOutcome: metadata.outcomeType || 'collected',
        collectionReason: metadata.reason || '',
        collectionQuality: quality,
        collectionDamage: metadata.damage || 0,
        collectionScoreDelta: metadata.scoreDelta || 0,
        collectionTime: formatTime(get().gameTime),
        collectionDay: get().daysPassed,
        collectionLocationName: currentLocation?.name || getLocationName(get().currentLocationId),
        collectionLocation: { 
          x: playerLocation.x, 
          y: playerLocation.y 
        }
      };
      
      set((state) => ({
        specimenList: state.specimenList.map(spec => 
          canonicalSpecimenId(spec.id) === specimenId ? { ...spec, id: specimenId, collected: true } : spec
        ),
        inventory: state.inventory.some(item => canonicalSpecimenId(item.id) === specimenId)
          ? state.inventory
          : [...state.inventory, { ...canonicalizeSpecimen(specimenWithLocation), id: specimenId }],
        scientificScore: state.scientificScore + (metadata.scoreDelta || 0),
        fatigue: Math.min(100, state.fatigue + (metadata.fatigueDelta ?? 5))
      }));
      
      const collectDesc = `Darwin collects ${specimen.name} (${specimen.latin}) with ${specimenWithLocation.collectionMethod}. Specimen quality: ${quality}/100.`;
      addToGameHistory('narrative', collectDesc);
      get().refreshObjectives();
      return collectDesc;
    }
    return null;
  },

  addFieldEvidence: ({
    specimenId,
    specimenName,
    methodName,
    evidence,
    notes = '',
    scoreDelta = 1,
  } = {}) => {
    if (!evidence || !specimenName) return null;

    const state = get();
    const location = locations.find(loc => loc.id === state.currentLocationId);
    const entry = {
      specimenId: specimenId ? canonicalSpecimenId(specimenId) : null,
      specimenName,
      location: location?.name || getLocationName(state.currentLocationId),
      method: methodName || 'field observation',
      content: `${specimenName}: ${evidence}. ${notes ? `Player note: ${notes}` : ''}`.trim(),
      evidence,
      type: 'field_evidence',
    };

    set(current => ({
      journal: [...current.journal, {
        ...entry,
        id: Date.now(),
        timestamp: current.gameTime,
        day: current.daysPassed,
      }],
      scientificScore: current.scientificScore + scoreDelta,
    }));

    state.addToGameHistory('field_notes', `FIELD EVIDENCE - ${specimenName}: ${entry.content}`);
    get().refreshObjectives();
    return entry;
  },

  useScientificTool: (toolId, specimenId) => {
    const { specimenList, addToGameHistory } = get();
    const tool = tools.find(t => t.id === toolId);
    const specimen = resolveSpecimen(specimenList, specimenId);
    if (tool && specimen) {
      set((state) => ({
        fatigue: Math.min(100, state.fatigue + 3),
        scientificScore: state.scientificScore + 1
      }));
      const toolDesc = `Darwin uses his ${tool.name} to examine the ${specimen.name} specimen. He carefully observes its ${specimen.details?.[0] || 'features'}.`;
      addToGameHistory('narrative', toolDesc);
      return toolDesc;
    }
    return null;
  },

  setCurrentSpecimen: (specimenId) => {
    const { specimenList, inventory } = get();
    const canonicalId = canonicalSpecimenId(specimenId);
    const specimen = inventory.find(spec => canonicalSpecimenId(spec.id) === canonicalId) ||
                     resolveSpecimen(specimenList, canonicalId);
    set({ currentSpecimen: specimen });
  },

  formatGameTime: () => {
    const { gameTime } = get();
    const totalMinutes = gameTime % 1440;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  },

  updateMoodAndFatigue: (mood, fatigue) => {
    if (mood) set({ darwinMood: mood });
    if (fatigue !== undefined) set({ fatigue: Math.min(100, Math.max(0, fatigue)) });
  },

  advanceTime: (minutes) => set((state) => {
    const newGameTime = state.gameTime + minutes;
    const daysPassed = state.daysPassed + Math.floor(newGameTime / 1440);
    return { gameTime: newGameTime % 1440, daysPassed };
  }),

  // Method to add a journal entry
  addJournalEntry: (entry) => {
    set(state => ({
      journal: [...state.journal, {
        ...entry,
        id: entry.id || Date.now(),
        timestamp: entry.timestamp ?? state.gameTime,
        day: entry.day ?? entry.gameDay ?? state.daysPassed,
        gameDay: entry.gameDay ?? entry.day ?? state.daysPassed,
        gameTime: entry.gameTime || formatTime(state.gameTime),
        type: entry.type || 'field_notes',
      }]
    }));
    get().refreshObjectives();
  },

  importJournalEntries: (entries = []) => {
    set(state => {
      const existingKeys = new Set(state.journal.map(entry => entry.id || `${entry.specimenName}:${entry.content}`));
      const imported = entries
        .filter(entry => entry?.content)
        .filter(entry => !existingKeys.has(entry.id || `${entry.specimenName}:${entry.content}`))
        .map(entry => ({
          ...entry,
          id: entry.id || Date.now() + Math.random(),
          timestamp: entry.timestamp ?? entry.gameTime ?? state.gameTime,
          day: entry.day ?? entry.gameDay ?? state.daysPassed,
          gameDay: entry.gameDay ?? entry.day ?? state.daysPassed,
          type: entry.type || 'field_notes',
        }));

      if (imported.length === 0) return state;
      return { journal: [...state.journal, ...imported] };
    });
    get().refreshObjectives();
  },

  deleteJournalEntry: (id) => {
    set(state => ({
      journal: state.journal.filter(entry => entry.id !== id)
    }));
    get().refreshObjectives();
  }
}));

// Helper function to format time display
function formatTime(minutes) {
  const totalMinutes = minutes % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

// Helper function to get location name from ID
function getLocationName(locationId) {
  if (!locationId) {
    return 'Unknown';
  }
  
  const found = locations.find(loc => loc.id === locationId);
  
  if (found) {
    return found.name;
  } else {
    return locationId; // Return the ID as fallback
  }
}

export default useGameStore;
