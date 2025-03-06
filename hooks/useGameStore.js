// useGameStore.js - Updated with enhanced event history and LLM context generation

import { create } from 'zustand';
import { tools } from '../data/tools';
import { npcs, getNPC } from '../data/npcs'; 
import { initializeSpecimens } from '../data/specimens';
import { queueEventForSummary, compileEventHistorySummary } from '../utils/generateLLMContext';
import { locations } from '../data/locations';
console.log('Our location IDs are:', locations.map(l => l.id));

const useGameStore = create((set, get) => ({
  // Core game state
  gameStarted: false,
  currentScreen: 'title',
  currentLocationId: 'POST_OFFICE_BAY',
    playerLocation: { x: 1, y: 0 }, 


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
  setSpecimenList: (specimens) => set({ specimenList: specimens }),

  // Method to update an event's summary with LLM-generated one
  updateEventSummary: (eventId, llmSummary) => set(state => ({
    eventHistory: state.eventHistory.map(event => 
      event.id === eventId 
        ? { ...event, llmSummary, hasLLMSummary: true } 
        : event
    )
  })),

  // Enhanced addToGameHistory function with improved summary generation
  addToGameHistory: (role, content) => set((state) => {
  // Get the most current state values
  const currentState = get();
  console.log('Current state location ID:', currentState.currentLocationId); 
  
  // Use the current state values, not the state parameter
  const { daysPassed, gameTime } = currentState;
  const currentLocationId = currentState.currentLocationId;
  
  console.log('Inside addToGameHistory, currentLocationId =', currentLocationId);
    // Ensure content is a string to avoid method errors
    const contentString = typeof content === 'string' ? content : 
                          (typeof content === 'object' && content !== null) ? 
                            (content.content || JSON.stringify(content)) : 
                            String(content);
    
    const newEntry = { role, content: contentString };
    const updatedHistory = [...state.gameHistory, newEntry].slice(-5);
    
 
    const formattedTime = formatTime(gameTime);
    const locationName = getLocationName(currentLocationId);
    
    // Determine event type based on role and content
    let eventType = 'narrative';
    
    if (role === 'user') {
      eventType = 'action';
    } else if (role === 'field_notes') {
      eventType = 'field_notes';
    } else if (contentString.toLowerCase().includes('collect')) {
      eventType = 'collection';
    } else if (contentString.toLowerCase().includes('examine') || contentString.toLowerCase().includes('observe')) {
      eventType = 'observation';
    } else if (contentString.toLowerCase().includes('travel') || contentString.toLowerCase().includes('move')) {
      eventType = 'movement';
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
    
    // Queue this event for LLM summarization (non-blocking)
    if (role !== 'user' && contentString.length > 30) {
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

  // Other game actions:
  startGame: () => {
    // Initialize specimens with random locations (or other initializations)
    const initialSpecimens = initializeSpecimens();
    set({
      gameStarted: true,
      currentScreen: 'exploration',
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
      set({ currentNPC: npc });
    }
  },

  // Updated moveToLocation function to include NPC encounters
moveToLocation: (locationId) => {
  console.log('Moving to locationId:', locationId);
  
  const location = locations.find(loc => loc.id === locationId);
  if (location) {
    console.log('Found location object:', location);
    
    // First set the state
    set({
      playerLocation: { x: location.x, y: location.y },
      currentLocationId: locationId
    });
    
    // Then get the updated state for logging
    const updatedState = get();
    console.log('After set, currentLocationId is now:', updatedState.currentLocationId);
    
    // Now add to game history with the updated location ID
    return get().addToGameHistory('movement', `Moved to ${location.name}`);
  } else {
    console.warn('moveToLocation failed to find:', locationId);
    return null;
  }
},


  collectSpecimen: (id) => {
    const { specimenList, playerLocation, addToGameHistory } = get();
    const specimen = specimenList.find(spec => spec.id === id);
    if (specimen && !specimen.collected) {
      // Add the collection location to the specimen
      const specimenWithLocation = {
        ...specimen,
        collected: true,
        collectionLocation: { 
          x: playerLocation.x, 
          y: playerLocation.y 
        }
      };
      
      set((state) => ({
        specimenList: state.specimenList.map(spec => 
          spec.id === id ? { ...spec, collected: true } : spec
        ),
        inventory: [...state.inventory, specimenWithLocation], // Add specimen with location to inventory
        fatigue: Math.min(100, state.fatigue + 5)
      }));
      
      const collectDesc = `Darwin attempts to collect a specimen of ${specimen.name} (${specimen.latin}).`;
      addToGameHistory('narrative', collectDesc);
      return collectDesc;
    }
    return null;
  },

  useScientificTool: (toolId, specimenId) => {
    const { specimenList, addToGameHistory } = get();
    const tool = tools.find(t => t.id === toolId);
    const specimen = specimenList.find(s => s.id === specimenId);
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
    const specimen = inventory.find(spec => spec.id === specimenId) ||
                     specimenList.find(spec => spec.id === specimenId);
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
  addJournalEntry: (entry) => set(state => ({
    journal: [...state.journal, {
      ...entry,
      id: Date.now(),
      timestamp: state.gameTime,
      day: state.daysPassed
    }]
  }))
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
    console.log('getLocationName called with empty locationId');
    return 'Unknown';
  }
  
  console.log('Looking up location name for ID:', locationId);
  const found = locations.find(loc => loc.id === locationId);
  
  if (found) {
    console.log('Found location:', found.name);
    return found.name;
  } else {
    console.log('No location found for ID:', locationId);
    return locationId; // Return the ID as fallback
  }
}

export default useGameStore;