// utils/locationSystem.js
// utility for managing location data from locations.js and integrating with main game component

import { locations } from '../data/locations';
import { canonicalizeSpecimenIds } from './canonicalIds';

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

const directionLabels = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest'
};

const directionByDelta = Object.values(directionMapping).reduce((acc, direction) => {
  acc[`${direction.x},${direction.y}`] = direction.abbr;
  return acc;
}, {});

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
  return cell ? canonicalizeSpecimenIds(cell.specimens || []) : [];
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

const normalizeDirection = (directionString) => {
  if (!directionString) return null;
  const direction = directionMapping[String(directionString).toLowerCase()];
  return direction ? direction.abbr : null;
};

const getDirectionBetweenCells = (fromCell, toCell) => {
  if (!fromCell || !toCell) return null;
  return directionByDelta[`${toCell.x - fromCell.x},${toCell.y - fromCell.y}`] || null;
};

const terrainProfile = (cell) => {
  const type = String(cell?.type || '').toLowerCase();
  if (type === 'highland') return { factor: 1.55, fatigue: 1.45, note: 'steep highland ground' };
  if (type === 'forest') return { factor: 1.45, fatigue: 1.35, note: 'wet forest and tangled undergrowth' };
  if (type === 'wetland') return { factor: 1.4, fatigue: 1.25, note: 'muddy brackish ground' };
  if (type === 'lavafield' || type === 'coastallava') return { factor: 1.35, fatigue: 1.4, note: 'broken volcanic rock' };
  if (type === 'scrubland') return { factor: 1.18, fatigue: 1.15, note: 'thorny dry scrub' };
  if (type === 'reef' || type === 'ocean') return { factor: 1.25, fatigue: 1.1, note: 'boat work and surf' };
  if (type === 'cliff' || type === 'promontory') return { factor: 1.5, fatigue: 1.45, note: 'exposed rocky slopes' };
  if (type === 'beagle' || type === 'bay' || type === 'beach' || type === 'settlement') return { factor: 0.9, fatigue: 0.85, note: 'easy going' };
  return { factor: 1, fatigue: 1, note: 'open ground' };
};

const estimateTravelStep = (fromCell, toCell, directionAbbr = null) => {
  const direction = directionAbbr || getDirectionBetweenCells(fromCell, toCell);
  const diagonal = direction && direction.length === 2;
  const baseMinutes = diagonal ? 50 : 35;
  const profile = terrainProfile(toCell);
  const minutes = Math.max(10, Math.round(baseMinutes * profile.factor));
  const fatigue = Math.max(1, Math.round((minutes / 18) * profile.fatigue));

  return {
    direction,
    directionLabel: directionLabels[direction] || 'onward',
    minutes,
    fatigue,
    terrainNote: profile.note,
  };
};

const routeNeighbors = (cell) => {
  if (!cell) return [];
  return (cell.validMoves || [])
    .map(abbr => {
      const direction = Object.values(directionMapping).find(item => item.abbr === abbr);
      if (!direction) return null;
      const toCell = getCellByCoordinates(cell.x + direction.x, cell.y + direction.y);
      return toCell ? { from: cell, to: toCell, abbr } : null;
    })
    .filter(Boolean);
};

const findRouteBetweenCells = (fromCell, toCell) => {
  if (!fromCell || !toCell) return null;
  if (fromCell.id === toCell.id) return [];

  const queue = [{ cell: fromCell, steps: [] }];
  const visited = new Set([fromCell.id]);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of routeNeighbors(current.cell)) {
      if (visited.has(edge.to.id)) continue;
      const nextSteps = [...current.steps, edge];
      if (edge.to.id === toCell.id) return nextSteps;
      visited.add(edge.to.id);
      queue.push({ cell: edge.to, steps: nextSteps });
    }
  }

  return null;
};

const summarizeRoute = (steps) => {
  if (!steps || steps.length === 0) return 'remain here';
  return steps.map(step => step.abbr).join(' -> ');
};

const estimateRouteTravel = (fromCell, toCell) => {
  const route = findRouteBetweenCells(fromCell, toCell);
  if (!route) return null;

  const steps = route.map(edge => ({
    from: edge.from.id,
    to: edge.to.id,
    toName: edge.to.name,
    ...estimateTravelStep(edge.from, edge.to, edge.abbr),
  }));
  const travelMinutes = steps.reduce((sum, step) => sum + step.minutes, 0);
  const fatigueIncrease = steps.reduce((sum, step) => sum + step.fatigue, 0);
  const terrainNotes = [...new Set(steps.map(step => step.terrainNote).filter(Boolean))];

  return {
    reachable: true,
    steps,
    routeLabel: summarizeRoute(steps),
    travelMinutes,
    fatigueIncrease,
    terrainNotes,
  };
};

const formatTravelTime = (minutes = 0) => {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours === 1 ? '' : 's'}${remainingMinutes ? ` ${remainingMinutes} min` : ''}`;
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
  const travel = estimateTravelStep(currentCell, newCell, normalizeDirection(directionString));
  let narrative = `You travel ${travel.directionLabel} from ${currentCell.name} to ${newCell.name}. ${newCell.description}`;
  if (travel.terrainNote !== 'easy going') {
    narrative += ` The route crosses ${travel.terrainNote}, costing time and strength.`;
  }
  
  return {
    success: true,
    message: narrative,
    newPosition: newPosition,
    newLocationId: newCell.id,
    newLocationName: newCell.name,
    travelMinutes: travel.minutes,
    fatigueIncrease: travel.fatigue,
    routeLabel: travel.direction,
    specimensInArea: canonicalizeSpecimenIds(newCell.specimens || []),
    npcsInArea: newCell.npcs
  };
};

const processTravelToLocation = (currentPosition, locationId) => {
  const currentCell = getCellByCoordinates(currentPosition.x, currentPosition.y);
  const targetCell = getCellById(locationId);

  if (!currentCell) {
    return {
      success: false,
      message: 'Your current position is not on the expedition map.',
      newPosition: currentPosition,
    };
  }

  if (!targetCell) {
    return {
      success: false,
      message: `Location "${locationId}" not found.`,
      newPosition: currentPosition,
    };
  }

  if (targetCell.id === currentCell.id) {
    return {
      success: false,
      message: `You are already at ${targetCell.name}.`,
      newPosition: currentPosition,
    };
  }

  const travel = estimateRouteTravel(currentCell, targetCell);
  if (!travel) {
    return {
      success: false,
      message: `There is no practical route from ${currentCell.name} to ${targetCell.name} from here. Follow connected paths or return to the Beagle for a longer relocation.`,
      newPosition: currentPosition,
    };
  }

  const terrainText = travel.terrainNotes.length
    ? ` The route crosses ${travel.terrainNotes.join(', ')}.`
    : '';

  return {
    success: true,
    message: `You travel from ${currentCell.name} to ${targetCell.name} by way of ${travel.routeLabel}. The journey takes ${formatTravelTime(travel.travelMinutes)}.${terrainText} ${targetCell.description}`,
    newPosition: { x: targetCell.x, y: targetCell.y },
    newLocationId: targetCell.id,
    newLocationName: targetCell.name,
    travelMinutes: travel.travelMinutes,
    fatigueIncrease: travel.fatigueIncrease,
    routeLabel: travel.routeLabel,
    routeSteps: travel.steps,
    specimensInArea: canonicalizeSpecimenIds(targetCell.specimens || []),
    npcsInArea: targetCell.npcs,
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
  estimateRouteTravel,
  formatTravelTime,
  processTravelToLocation,
  isValidMove,
  processMovement,
  initialPosition,
  initialLocationId
};
