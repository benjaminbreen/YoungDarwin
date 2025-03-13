// utils/locationSystem.js
// utility for managing location data from locations.js and integrating with main game component

import { locations } from '../data/locations';

// Island grid data 
const islandGrid = locations;




// Direction mapping for movement
const directionMapping = {
  'north': { x: 0, y: -1, abbr: 'N' },
  'n': { x: 0, y: -1, abbr: 'N' },
  'northeast': { x: 1, y: -1, abbr: 'NE' },
  'ne': { x: 1, y: -1, abbr: 'NE' },
  'east': { x: 1, y: 0, abbr: 'E' },
  'e': { x: 1, y: 0, abbr: 'E' },
  'southeast': { x: 1, y: 1, abbr: 'SE' },
  'se': { x: 1, y: 1, abbr: 'SE' },
  'south': { x: 0, y: 1, abbr: 'S' },
  's': { x: 0, y: 1, abbr: 'S' },
  'southwest': { x: -1, y: 1, abbr: 'SW' },
  'sw': { x: -1, y: 1, abbr: 'SW' },
  'west': { x: -1, y: 0, abbr: 'W' },
  'w': { x: -1, y: 0, abbr: 'W' },
  'northwest': { x: -1, y: -1, abbr: 'NW' },
  'nw': { x: -1, y: -1, abbr: 'NW' }
};

// Functions to get information about the current location
const getCellById = (id) => islandGrid.find(cell => cell.id === id);
const getCellByCoordinates = (x, y) => islandGrid.find(cell => cell.x === x && cell.y === y);
const getCellByName = (name) => islandGrid.find(cell => 
  cell.name.toLowerCase() === name.toLowerCase() || 
  cell.type.toLowerCase() === name.toLowerCase()
);

// Get a list of all available locations for selection
const getAllLocations = () => islandGrid.map(cell => ({
  id: cell.id,
  name: cell.name,
  x: cell.x, 
  y: cell.y,
  type: cell.type,
  color: cell.color
}));

// Get available specimens at a specific location
const getLocationSpecimens = (locationId) => {
  const cell = getCellById(locationId);
  return cell ? cell.specimens : [];
};

// Get NPCs that might appear at a specific location
const getLocationNPCs = (locationId) => {
  const cell = getCellById(locationId);
  return cell ? cell.npcs : [];
};

// Calculate new position based on current position and direction
const calculateNewPosition = (currentPosition, directionString) => {
  const direction = directionMapping[directionString.toLowerCase()];
  
  if (!direction) return null;
  
  return {
    x: currentPosition.x + direction.x,
    y: currentPosition.y + direction.y
  };
};

// Check if a move is valid from the current cell
const isValidMove = (currentPosition, directionString) => {
  const currentCell = getCellByCoordinates(currentPosition.x, currentPosition.y);
  if (!currentCell) return false;
  
  const direction = directionMapping[directionString.toLowerCase()];
  if (!direction) return false;
  
  // Check if direction is in validMoves
  return currentCell.validMoves.includes(direction.abbr);
};

// Process a movement command and return the new position and narrative
const processMovement = (currentPosition, directionString) => {
  // Check if move is valid
  if (!isValidMove(currentPosition, directionString)) {
    // Determine why the move is invalid
    const currentCell = getCellByCoordinates(currentPosition.x, currentPosition.y);
    const direction = directionMapping[directionString.toLowerCase()];
    
    if (!direction) {
      return {
        success: false,
        message: `"${directionString}" is not a valid direction. Try north, south, east, west, etc.`,
        newPosition: currentPosition
      };
    }
    
    // Determine what blocks the path
    const boundary = Object.entries(currentCell.boundaries)
      .find(([key, _]) => key === directionString.toLowerCase());
    
    if (boundary) {
      return {
        success: false,
        message: `You cannot travel ${directionString}. The ${boundary[1]} prevents your progress.`,
        newPosition: currentPosition
      };
    }
    
    return {
      success: false,
      message: `You cannot travel ${directionString} from here. Perhaps try another direction.`,
      newPosition: currentPosition
    };
  }
  
  // Calculate new position
  const newPosition = calculateNewPosition(currentPosition, directionString);
  const newCell = getCellByCoordinates(newPosition.x, newPosition.y);
  
  if (!newCell) {
    return {
      success: false,
      message: "That path leads nowhere. You should choose another direction.",
      newPosition: currentPosition
    };
  }
  
  // Generate travel narrative
  const currentCell = getCellByCoordinates(currentPosition.x, currentPosition.y);
  let narrative = `You travel ${directionString} from ${currentCell.name} to ${newCell.name}. ${newCell.description}`;
  
  // Add fatigue based on terrain type
  let fatigueIncrease = 6; // Base fatigue
  
  if (newCell.type === 'highland') {
    fatigueIncrease += 7; // Uphill is more tiring
    narrative += " The uphill climb taxes your strength.";
  } else if (newCell.type === 'lavaField') {
    fatigueIncrease += 3; // Rough terrain
    narrative += " Traversing the jagged lava rock requires careful footing.";
  }
  
  return {
    success: true,
    message: narrative,
    newPosition: newPosition,
    newLocationId: newCell.id,
    newLocationName: newCell.name,
    fatigueIncrease: fatigueIncrease,
    specimensInArea: newCell.specimens,
    npcsInArea: newCell.npcs
  };
};

// Initial starting position (Post Office Bay)
const initialPosition = { x: 1, y: 0 }; // NE cell
const initialLocationId = 'POST_OFFICE_BAY';

export {
  islandGrid,
  directionMapping,
  getCellById,
  getCellByCoordinates,
  getCellByName,
  getAllLocations,
  getLocationSpecimens,
  getLocationNPCs,
  calculateNewPosition,
  isValidMove,
  processMovement,
  initialPosition,
  initialLocationId
};