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
        'beagle': { 
          id: 'BEAGLE', 
          name: "HMS Beagle",
          description: "Captain FitzRoy's trusty survey vessel.",
          type: 'ship',
          specimens: ['ship_logs'],
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
          description: "A crude one-room shelter built from driftwood and volcanic stone.",
          type: 'interior',
          specimens: [],
          npcs: []
        },
        'whalers_hut': {
          id: 'WHALERS_HUT',
          name: "Whaler's Hut",
          description: "A stone structure with a battered wooden roof and whaling artifacts.",
          type: 'interior',
          specimens: [],
          npcs: []
        },
        'mail_barrel': {
          id: 'MAIL_BARREL',
          name: "Mail Barrel Interior",
          description: "The cramped interior of the Post Office Bay barrel, mostly filled with sand and very dark.",
          type: 'interior',
          specimens: ['whalersletter'],
          npcs: []
        }
      };
      
      return interiorInfo[interiorType] || {
        id: 'interior',
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
        id: 'unknown',
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
      'whalers_hut': 'WHALERS_HUT',
      'mail_barrel': 'MAIL_BARREL'
    };
    

    
    // Create appropriate message for entering each location type
    let entryMessage = "";
    switch(type) {
      case 'cave':
        entryMessage = "You have entered Gabriel's Cave. The air is cool and damp, with the scent of earth and burning candles.";
        break;
      case 'hms_beagle':
        entryMessage = "You have boarded HMS Beagle. The familiar creak of timbers and smell of tar welcome you back.";
        break;
      case 'governors_house':
        entryMessage = "You have entered the Vice-Governor's House. The colonial furnishings speak of a man attempting to recreate European comfort.";
        break;
      case 'watkins_cabin':
        entryMessage = "You have entered Watkins's abandoned cabin. The musty air holds traces of a solitary life lived years ago.";
        break;
      case 'whalers_hut':
        entryMessage = "You have entered the whaler's hut. Broken harpoon parts and the lingering smell of blubber reveal its purpose.";
        break;
      case 'mail_barrel':
        entryMessage = "You peer inside the mail barrel. It's dark and mostly filled with sand, but you can make out various letters and parcels.";
        break;
      default:
        entryMessage = "You have entered an interior location.";
    }
    
    return {
      success: true,
      message: entryMessage
    };
  };
  
  /**
   * Exit an interior location
   */
  const exitInterior = () => {
    setIsInInterior(false);
    setInteriorType(null);
    
    // ensure game store knows we've exited
    const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (currentCell) {
      useGameStore.getState().moveToLocation(currentCell.id);
    }
    
    return {
      success: true,
      message: `Darwin has returned to the exterior from an interior location. This is a shift in context that should be noted in the narrative. Consequently, NPCs who had been in the interior are no longer accessible to Darwin, because he is now in the exterior. If he is leaving the Beagle, describe how he has been rowed to shore by two sailors and is now on the island again. No NPCs follow him.`
    };
  };
  
  /**
   * Move within an interior location
   */
  const moveInInterior = (newPosition, roomId) => {
    setInteriorPlayerPosition(newPosition);
    
    // CRITICAL FIX: Update the game store with the new interior room
    if (useGameStore && useGameStore.getState().moveToLocation) {
      try {
        useGameStore.getState().moveToLocation(roomId);
      } catch (error) {
        console.warn("Could not update game store with interior room:", error);
      }
    }
    
    return {
      success: true,
      message: `You move to ${roomId}`
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