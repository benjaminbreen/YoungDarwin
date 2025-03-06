// locationHook.js
import { useState, useEffect } from 'react';
import { 
  initialPosition, 
  initialLocationId, 
  processMovement, 
  getCellByCoordinates,
  islandGrid
} from './locationSystem';
import useGameStore from '../hooks/useGameStore';

/**
 * Custom hook for managing location in the grid-based system
 */
export function useLocationSystem(onLocationUpdate) {
  // State for tracking player's position and current location ID
  const [playerPosition, setPlayerPosition] = useState(initialPosition);
  const [currentLocationId, setCurrentLocationId] = useState(initialLocationId);
  const [isInInterior, setIsInInterior] = useState(false);
  const [interiorType, setInteriorType] = useState(null);
  const [interiorPlayerPosition, setInteriorPlayerPosition] = useState({ x: 0, y: 0 });
  
  // Update location ID when position changes
  useEffect(() => {
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (cell && cell.id !== currentLocationId) {
      setCurrentLocationId(cell.id);
      
      // CRITICAL FIX: Update game store with the new location ID
      useGameStore.getState().moveToLocation(cell.id);
      
      // Call the callback if provided
      if (onLocationUpdate) {
        onLocationUpdate({
          locationId: cell.id,
          locationName: cell.name,
          position: playerPosition,
          specimens: cell.specimens,
          npcs: cell.npcs,
          description: cell.description
        });
      }
    }
  }, [playerPosition, currentLocationId, onLocationUpdate]);
  
  /**
   * Handle movement in a specific direction
   * @param {string} direction - Direction to move (north, south, east, west, etc.)
   * @returns {object} Result of the movement attempt
   */
  const handleMove = (direction) => {
    const result = processMovement(playerPosition, direction);
    
    if (result.success) {
      // Update local state
      setPlayerPosition(result.newPosition);
      setCurrentLocationId(result.newLocationId);
      
      // CRITICAL FIX: Update game store with the new location ID
      useGameStore.getState().moveToLocation(result.newLocationId);
      
      console.log("handleMove succeeded, new locationId:", result.newLocationId);
    }
    
    return result;
  };
  
  /**
   * Move directly to a specific location ID
   * @param {string} locationId - ID of the location to move to
   * @returns {object} Result with success status and message
   */
  const moveToLocation = (locationId) => {
    console.log("moveToLocation called with:", locationId);
    
    // If we're just getting a direction (N, S, E, W, etc.)
    if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(locationId)) {
      // Convert the direction to a full direction name
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
      
      return handleMove(directionMap[locationId]);
    }
    
    // If we're teleporting to a specific location ID
    const targetCell = islandGrid.find(cell => cell.id === locationId);
    if (!targetCell) {
      console.warn(`Location "${locationId}" not found.`);
      return {
        success: false,
        message: `Location "${locationId}" not found.`
      };
    }
    
    // Update position and location
    setPlayerPosition({ x: targetCell.x, y: targetCell.y });
    setCurrentLocationId(targetCell.id);
    
    // CRITICAL FIX: Update the game store explicitly
    useGameStore.getState().moveToLocation(targetCell.id);
    
    return {
      success: true,
      message: `You've traveled to ${targetCell.name}. ${targetCell.description}`,
      newPosition: { x: targetCell.x, y: targetCell.y },
      newLocationId: targetCell.id,
      newLocationName: targetCell.name,
      fatigueIncrease: 10, // Default fatigue for teleportation
      specimensInArea: targetCell.specimens,
      npcsInArea: targetCell.npcs
    };
  };
  
  /**
   * Analyze text for movement directions
   * @param {string} text - Text to analyze for movement commands
   * @returns {object|null} Result of the movement if a direction was found, null otherwise
   */
  const detectMovementInText = (text) => {
    if (!text) return null;
    
    // More specific regex that requires movement intent words before directions
    // This checks for phrases like "go east", "move north", "walk to the west", etc.
    const movementRegex = /\b(?:go|move|walk|travel|head|proceed)(?:\s+(?:to|towards|toward|into))?\s+(?:the\s+)?(?:north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)\b/i;
    
    const match = text.match(movementRegex);
    
    if (match) {
      // Extract the actual direction from the matched text
      const directionMatch = match[0].match(/(?:north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)$/i);
      
      if (directionMatch && directionMatch[0]) {
        // Process the detected direction
        const result = handleMove(directionMatch[0].toLowerCase());
        console.log("detectMovementInText found direction:", directionMatch[0].toLowerCase());
        if (result.success) {
          console.log("Movement successful to:", result.newLocationId);
        }
        return result;
      }
    }
    
    return null;
  };
  
  /**
   * Get information about the current location
   * @returns {object} Current location information
   */
  const getCurrentLocation = () => {
    if (isInInterior) {
      // Return interior location info
      const interiorInfo = {
        'cave': { 
          id: 'CAVE', 
          name: "Gabriel's Cave",
          description: "A hidden cave serving as refuge for Gabriel Puig.",
          type: 'interior',
          specimens: [],
          npcs: ['gabriel_puig']
        },
        'hms_beagle': { 
          id: 'HMS_BEAGLE', 
          name: "HMS Beagle",
          description: "Captain FitzRoy's survey vessel.",
          type: 'ship',
          specimens: [],
          npcs: ['fitzroy']
        },
        'governors_house': { 
          id: 'GOVERNORS_HOUSE', 
          name: "Vice-Governor's House",
          description: "The residence of Nicolás Lawson.",
          type: 'building',
          specimens: [],
          npcs: ['nicolas_lawson']
        },
        'watkins_cabin': {
          id: 'WATKINS_CABIN',
          name: "Patrick Watkins's Cabin",
          description: "A crude shelter built by the Irish castaway who once lived alone on the island.",
          type: 'cabin',
          specimens: [],
          npcs: []
        },
        'whalers_hut': {
          id: 'WHALERS_HUT',
          name: "Whaler's Hut",
          description: "A simple shelter used by whalers when they come ashore for supplies.",
          type: 'hut',
          specimens: [],
          npcs: []
        }
      };
      
      return interiorInfo[interiorType] || {
        id: 'INTERIOR',
        name: 'Interior Location',
        description: 'You are inside a structure.',
        type: 'interior',
        specimens: [],
        npcs: []
      };
    }
    
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    
    if (!cell) {
      return {
        id: 'UNKNOWN',
        name: 'Unknown Location',
        description: 'You are lost.',
        specimens: [],
        npcs: []
      };
    }
    
    return {
      id: cell.id,
      name: cell.name,
      description: cell.description,
      type: cell.type,
      specimens: cell.specimens,
      npcs: cell.npcs,
      position: playerPosition
    };
  };
  
  /**
   * Get valid directions from current location
   * @returns {string[]} Array of valid direction abbreviations (N, S, E, W, etc.)
   */
  const getValidDirections = () => {
    if (isInInterior) {
      // Return empty array for interiors - direction buttons won't work inside
      return [];
    }
    
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    return cell ? cell.validMoves : [];
  };
  
  /**
   * Enter an interior location
   */
  const enterInterior = (type, startPosition = { x: 0, y: 0 }) => {
    setIsInInterior(true);
    setInteriorType(type);
    setInteriorPlayerPosition(startPosition);
    
    // Update game store to reflect we're in an interior
    const interiorLocations = {
      'cave': 'CAVE',
      'hms_beagle': 'HMS_BEAGLE',
      'governors_house': 'GOVERNORS_HOUSE',
      'watkins_cabin': 'WATKINS_CABIN',
      'whalers_hut': 'WHALERS_HUT'
    };
    
    // CRITICAL FIX: Ensure game store knows we're in an interior
    if (interiorLocations[type]) {
      try {
        // Update the game store, but handle it safely if the method doesn't exist
        useGameStore.getState().moveToLocation(interiorLocations[type]);
      } catch (error) {
        console.warn("Could not update game store with interior location:", error);
      }
    }
    
    const messages = {
      'cave': "You have entered Gabriel's Cave, a hidden revolutionary sanctuary.",
      'hms_beagle': "You have boarded the HMS Beagle, Captain FitzRoy's survey vessel.",
      'governors_house': "You have entered the Vice-Governor's House, Nicolás Lawson's residence.",
      'watkins_cabin': "You have entered Patrick Watkins's crude cabin, abandoned but full of stories.",
      'whalers_hut': "You have entered the simple Whaler's Hut, used by sailors when they come ashore."
    };
    
    return {
      success: true,
      message: messages[type] || `You have entered the ${type}.`
    };
  };
  
  /**
   * Exit an interior location
   */
  const exitInterior = () => {
    setIsInInterior(false);
    setInteriorType(null);
    
    // CRITICAL FIX: Ensure game store knows we've exited
    const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (currentCell) {
      useGameStore.getState().moveToLocation(currentCell.id);
    }
    
    return {
      success: true,
      message: `You have returned to the island.`
    };
  };
  
  /**
   * Move within an interior location
   */
  const moveInInterior = (newPosition, roomId) => {
    setInteriorPlayerPosition(newPosition);
    
    // Simple room descriptions
    const roomDescriptions = {
      // Gabriel's Cave rooms
      'CAVE_ENTRANCE': 'You move to the narrow cave entrance.',
      'CAVE_MAIN': 'You enter the main chamber with its crackling fire.',
      'CAVE_BACK': 'You move to the back chamber with pamphlets and a printing press.',
      'CAVE_LEFT': 'You enter the storage area with supplies.',
      'CAVE_RIGHT': 'You move to the sleeping area with a simple bedroll.',
      'CAVE_STORAGE': 'You discover a hidden cache of treasured possessions.',
      'CAVE_LOOKOUT': 'You approach the narrow opening with a view of the settlement.',
      'CAVE_WRITING': 'You examine the small writing desk with quills and parchment.',
      'CAVE_ESCAPE': 'You find a tight passage that leads to another exit.',
      
      // HMS Beagle rooms
      'BEAGLE_BOW': 'You move to the ship\'s bow with its view of the ocean.',
      'BEAGLE_FOREMAST': 'You stand beneath the foremast watching sailors work.',
      'BEAGLE_MAINMAST': 'You approach the mainmast where the ship\'s bell hangs.',
      'BEAGLE_QUARTERDECK': 'You step onto the raised quarterdeck with its polished wheel.',
      'BEAGLE_STERN': 'You move to the stern gallery overlooking the ship\'s wake.',
      'BEAGLE_FORECASTLE': 'You enter the forecastle with its swinging hammocks.',
      'BEAGLE_CREW': 'You move through the cramped crew quarters.',
      'BEAGLE_STORAGE': 'You enter the storage area for specimens.',
      'BEAGLE_QUARTERS': 'You return to your small but comfortable quarters.',
      'BEAGLE_CABIN': 'You enter FitzRoy\'s meticulously organized cabin.',
      
      // Governor's House rooms
      'HOUSE_OFFICE': 'You enter the office with its large desk covered in maps.',
      'HOUSE_PRIVATE': 'You step into Lawson\'s surprisingly elegant private quarters.',
      'HOUSE_LIBRARY': 'You browse the small library of navigation and natural history books.',
      'HOUSE_DINING': 'You enter the dining room with its modest table.',
      'HOUSE_ENTRANCE': 'You return to the entrance hall with colonial furnishings.',
      'HOUSE_GARDEN': 'You step into the small walled garden with exotic plants.',
      
      // Patrick Watkins's Cabin (single room)
      'WATKINS_CABIN_MAIN': 'You explore the crude single-room cabin of Irish castaway Patrick Watkins. A rough bed of palm fronds lies in one corner, while crude shelves hold primitive tools and a small collection of books.',
      
      // Whaler's Hut (single room)
      'WHALERS_HUT_MAIN': 'You enter the simple whaler\'s hut. Barrels of freshwater, salt meat, and hardtack are stacked against one wall. A few hammocks hang from the ceiling beams.'
    };
    
    return {
      success: true,
      message: roomDescriptions[roomId] || `You move to a different area.`
    };
  };

  // Return the hook's API
  return {
    playerPosition,
    currentLocationId,
    isInInterior,
    interiorType,
    interiorPlayerPosition,
    handleMove,
    moveToLocation,
    detectMovementInText,
    getCurrentLocation,
    getValidDirections,
    enterInterior,
    exitInterior,
    moveInInterior
  };
}