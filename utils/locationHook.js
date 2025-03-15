// utils/locationHook.js
import { useState, useEffect } from 'react';
import { 
  initialPosition, 
  initialLocationId, 
  processMovement, 
  getCellByCoordinates,
  islandGrid
} from './locationSystem';
import interiorLayouts, { 
  findRoomById, 
  getInteriorTypeFromRoomId, 
  getNPCsForRoom,
  getSpecimensForRoom
} from './interiorLayouts';
import useGameStore from '../hooks/useGameStore';

/**
 * Custom hook for managing location in the grid-based system
 * @param {Function} onLocationUpdate - Callback when location changes
 * @returns {Object} Location state and functions
 */
export function useLocationSystem(onLocationUpdate) {
  // State for tracking player's position and current location ID
  const [playerPosition, setPlayerPosition] = useState(initialPosition);
  const [currentLocationId, setCurrentLocationId] = useState(initialLocationId);
  const [isInInterior, setIsInInterior] = useState(false);
  const [interiorType, setInteriorType] = useState(null);
  const [interiorPlayerPosition, setInteriorPlayerPosition] = useState({ x: 0, y: 0 });
  const [currentRoomId, setCurrentRoomId] = useState(null);
  
  // Update location ID when position changes (for exterior locations)
  useEffect(() => {
    if (isInInterior) return; // Skip this effect when in interiors
    
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (cell && cell.id !== currentLocationId) {
      setCurrentLocationId(cell.id);
      
      // Update game store with the new location ID
      const gameStore = useGameStore.getState();
      if (gameStore && gameStore.moveToLocation) {
        gameStore.moveToLocation(cell.id);
      }
      
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
  }, [playerPosition, currentLocationId, isInInterior, onLocationUpdate]);
  
  /**
   * Handle movement in a specific direction (exterior only)
   * @param {string} direction - Direction to move (north, south, east, west, etc.)
   * @returns {object} Result of the movement attempt
   */
  const handleMove = (direction) => {
    // Can't use cardinal directions in interiors
    if (isInInterior) {
      return {
        success: false,
        message: "You need to exit this interior location before traveling in that direction."
      };
    }
    
    const result = processMovement(playerPosition, direction);
    
    if (result.success) {
      // Update local state
      setPlayerPosition(result.newPosition);
      setCurrentLocationId(result.newLocationId);
      
      // Update game store with the new location ID
      const gameStore = useGameStore.getState();
      if (gameStore && gameStore.moveToLocation) {
        gameStore.moveToLocation(result.newLocationId);
      }
    }
    
    return result;
  };
  
  /**
   * Move directly to a specific location ID
   * @param {string} locationId - ID of the location to move to
   * @returns {object} Result with success status and message
   */
  const moveToLocation = (locationId) => {
    // Handle room IDs in interiors
    if (isInInterior) {
      const room = findRoomById(locationId);
      if (room) {
        return moveInInterior({ x: room.x, y: room.y }, locationId);
      }
      
      // If this is an exterior location ID, exit first
      const exteriorCell = islandGrid.find(cell => cell.id === locationId);
      if (exteriorCell) {
        const exitResult = exitInterior();
        if (!exitResult.success) return exitResult;
        
        // Now move to the exterior location
        setPlayerPosition({ x: exteriorCell.x, y: exteriorCell.y });
        setCurrentLocationId(locationId);
        
        // Update game store
        const gameStore = useGameStore.getState();
        if (gameStore && gameStore.moveToLocation) {
          gameStore.moveToLocation(locationId);
        }
        
        return {
          success: true,
          message: `You've exited and traveled to ${exteriorCell.name}. ${exteriorCell.description}`,
          newPosition: { x: exteriorCell.x, y: exteriorCell.y },
          newLocationId: locationId,
          newLocationName: exteriorCell.name,
          fatigueIncrease: 10, // Default fatigue for teleportation
          specimensInArea: exteriorCell.specimens,
          npcsInArea: exteriorCell.npcs
        };
      }
      
      // If we can't find the location ID
      return {
        success: false,
        message: `Cannot move to ${locationId} from within this interior location.`
      };
    }
    
    // Handle moving to a different exterior location
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
    
    // Direct movement to another exterior location
    const targetCell = islandGrid.find(cell => cell.id === locationId);
    if (!targetCell) {
      return {
        success: false,
        message: `Location "${locationId}" not found.`
      };
    }
    
    // Update position and location
    setPlayerPosition({ x: targetCell.x, y: targetCell.y });
    setCurrentLocationId(locationId);
    
    // Update game store
    const gameStore = useGameStore.getState();
    if (gameStore && gameStore.moveToLocation) {
      gameStore.moveToLocation(locationId);
    }
    
    return {
      success: true,
      message: `You've traveled to ${targetCell.name}. ${targetCell.description}`,
      newPosition: { x: targetCell.x, y: targetCell.y },
      newLocationId: locationId,
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
    if (!text || isInInterior) return null;
    
    // More specific regex that requires movement intent words before directions
    const movementRegex = /\b(?:go|move|walk|travel|head|proceed)(?:\s+(?:to|towards|toward|into))?\s+(?:the\s+)?(?:north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)\b/i;
    
    const match = text.match(movementRegex);
    
    if (match) {
      const directionMatch = match[0].match(/(?:north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)$/i);
      
      if (directionMatch && directionMatch[0]) {
        return handleMove(directionMatch[0].toLowerCase());
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
      // Get the layout for this interior type
      const layout = interiorLayouts[interiorType];
      if (!layout) {
        return {
          id: 'unknown_interior',
          name: 'Unknown Interior',
          description: 'You are inside an unknown structure.',
          type: 'interior',
          specimens: [],
          npcs: []
        };
      }
      
      // Find the current room based on position
      const currentRoom = layout.rooms.find(room => 
        room.x === interiorPlayerPosition.x && room.y === interiorPlayerPosition.y
      ) || layout.rooms[0];
      
      return {
        id: currentRoom.id,
        name: currentRoom.name,
        description: currentRoom.description,
        type: 'interior',
        specimens: currentRoom.specimens || [],
        npcs: currentRoom.npcs || [],
        interiorType,
        parentInterior: layout.id,
        exteriorLocation: layout.exteriorLocation
      };
    }
    
    // Return exterior location info
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
      // No cardinal directions in interiors
      return [];
    }
    
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    return cell ? cell.validMoves : [];
  };
  
  /**
   * Enter an interior location
   * @param {string} type - Interior type key
   * @param {object} startPosition - Initial position {x, y}
   * @returns {object} Result with success status and message
   */
  const enterInterior = (type, startPosition = { x: 0, y: 0 }) => {
    // Check if the interior type exists
    const layout = interiorLayouts[type];
    if (!layout) {
      return {
        success: false,
        message: `Invalid interior type: ${type}`
      };
    }
    
    // Check if we're already in this interior
    if (isInInterior && interiorType === type) {
      return {
        success: false,
        message: `Already in ${layout.name}`
      };
    }
    
    // Validate that we can enter from current location
    const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (currentCell?.id !== layout.exteriorLocation) {
      return {
        success: false,
        message: `Cannot enter ${layout.name} from here. You need to be at ${layout.exteriorLocation}.`
      };
    }
    
    // Find the starting room (or default to first room)
    const startingRoom = layout.rooms.find(room => 
      room.x === startPosition.x && room.y === startPosition.y
    ) || layout.rooms[0];
    
    // Update state
    setIsInInterior(true);
    setInteriorType(type);
    setInteriorPlayerPosition(startPosition);
    setCurrentRoomId(startingRoom.id);
    
    // Update game store
    const gameStore = useGameStore.getState();
    if (gameStore && gameStore.moveToLocation) {
      gameStore.moveToLocation(startingRoom.id);
    }
    
    // Create appropriate message for entering
    let entryMessage = `You have entered ${layout.name}. ${startingRoom.description}`;
    
    return {
      success: true,
      message: entryMessage,
      roomId: startingRoom.id,
      specimens: startingRoom.specimens || [],
      npcs: startingRoom.npcs || []
    };
  };
  
  /**
   * Exit an interior location
   * @returns {object} Result with success status and message
   */
  const exitInterior = () => {
    if (!isInInterior) {
      return {
        success: false,
        message: "You are already outside."
      };
    }
    
    // Get the exterior location this interior is connected to
    const layout = interiorLayouts[interiorType];
    if (!layout) {
      setIsInInterior(false);
      setInteriorType(null);
      setCurrentRoomId(null);
      
      return {
        success: true,
        message: "You have exited the interior location.",
      };
    }
    
    const exteriorLocationId = layout.exteriorLocation;
    const exteriorCell = islandGrid.find(cell => cell.id === exteriorLocationId);
    
    // Reset interior state
    setIsInInterior(false);
    setInteriorType(null);
    setCurrentRoomId(null);
    
    // Update position to the exterior location
    if (exteriorCell) {
      setPlayerPosition({ x: exteriorCell.x, y: exteriorCell.y });
      setCurrentLocationId(exteriorLocationId);
      
      // Update game store
      const gameStore = useGameStore.getState();
      if (gameStore && gameStore.moveToLocation) {
        gameStore.moveToLocation(exteriorLocationId);
      }
    }
    
    const exitMessageContent = layout.name === "HMS Beagle" 
      ? "You have disembarked from the HMS Beagle. A small rowboat has taken you to shore." 
      : `You have exited ${layout.name} and returned to the exterior.`;
    
    return {
      success: true,
      message: exitMessageContent,
      locationId: exteriorLocationId,
      newPosition: exteriorCell 
        ? { x: exteriorCell.x, y: exteriorCell.y }
        : playerPosition
    };
  };
  
  /**
   * Move within an interior location
   * @param {object} newPosition - New position {x, y}
   * @param {string} roomId - ID of the room
   * @returns {object} Result with success status and message
   */
  const moveInInterior = (newPosition, roomId) => {
    if (!isInInterior) {
      return {
        success: false,
        message: "Not currently in an interior location."
      };
    }
    
    // Get the layout
    const layout = interiorLayouts[interiorType];
    if (!layout) {
      return {
        success: false,
        message: `Invalid interior type: ${interiorType}`
      };
    }
    
    // Validate the room exists
    const room = layout.rooms.find(r => r.id === roomId);
    if (!room) {
      return {
        success: false,
        message: `Room ${roomId} not found.`
      };
    }
    
    // Check if the room is adjacent to current position
    const isAdjacent = (
      (Math.abs(room.x - interiorPlayerPosition.x) === 1 && room.y === interiorPlayerPosition.y) ||
      (Math.abs(room.y - interiorPlayerPosition.y) === 1 && room.x === interiorPlayerPosition.x)
    );
    
    // Small interiors (1x1) don't need adjacency check
    const is1x1 = layout.grid[0] === 1 && layout.grid[1] === 1;
    
    // Allow movement to same position (looking around the same room)
    const isSamePosition = (
      room.x === interiorPlayerPosition.x && room.y === interiorPlayerPosition.y
    );
    
    if (!is1x1 && !isAdjacent && !isSamePosition) {
      return {
        success: false,
        message: "You can only move to adjacent rooms."
      };
    }
    
    // Update state
    setInteriorPlayerPosition(newPosition);
    setCurrentRoomId(roomId);
    
    // Update game store
    const gameStore = useGameStore.getState();
    if (gameStore && gameStore.moveToLocation) {
      gameStore.moveToLocation(roomId);
    }
    
    return {
      success: true,
      message: isSamePosition
        ? `You look around the ${room.name}. ${room.description}`
        : `You move to the ${room.name}. ${room.description}`,
      roomId: room.id,
      specimens: room.specimens || [],
      npcs: room.npcs || []
    };
  };
  
  /**
   * Check if we can enter an interior from the current location
   * @param {string} interiorType - Type of interior to check
   * @returns {boolean} - True if we can enter
   */
  const canEnterInterior = (interiorType) => {
    const layout = interiorLayouts[interiorType];
    if (!layout) return false;
    
    const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    return currentCell?.id === layout.exteriorLocation;
  };
  
  /**
   * Get a list of interiors that can be entered from the current location
   * @returns {string[]} - Array of interior types that can be entered
   */
  const getAvailableInteriors = () => {
    if (isInInterior) return [];
    
    const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    if (!currentCell) return [];
    
    return Object.keys(interiorLayouts).filter(interiorType => 
      interiorLayouts[interiorType].exteriorLocation === currentCell.id
    );
  };

  // Return the hook's API
  return {
    playerPosition,
    currentLocationId,
    isInInterior,
    interiorType,
    interiorPlayerPosition,
    currentRoomId,
    handleMove,
    moveToLocation,
    detectMovementInText,
    getCurrentLocation,
    getValidDirections,
    enterInterior,
    exitInterior,
    moveInInterior,
    canEnterInterior,
    getAvailableInteriors,
    
    // Utility functions for working with interiors
    getNPCsForCurrentRoom: () => {
      if (!isInInterior || !currentRoomId) return [];
      return getNPCsForRoom(currentRoomId);
    },
    
    getSpecimensForCurrentRoom: () => {
      if (!isInInterior || !currentRoomId) return [];
      return getSpecimensForRoom(currentRoomId);
    }
  };
}