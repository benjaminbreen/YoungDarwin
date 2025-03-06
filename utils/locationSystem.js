// utils/locationSystem.js
// A modular grid-based location system for the Darwin game

// Island grid data - each cell represents a distinct area
const islandGrid = [
  { id: 'BEAGLE', x: 0, y: -1, name: 'HMS Beagle', description: 'The trusty ship that has carried you and its crew across the world.', type: 'ship', validMoves: [], specimens: [], npcs: ['fitzroy','lascar_joe'], boundaries: { north: 'ocean', west: 'ocean', south: 'ocean' }, color: 'tan' },
  { id: 'NW_REEF', x: 0, y: 0, name: 'Northwest Reef', description: 'Shallow reef with sea turtles and reef fish.', type: 'reef', validMoves: ['SE','SW','S','E'], specimens: ['greenTurtle','parrotfish','seaLion'], npcs: [], boundaries: { north: 'ocean', west: 'ocean' }, color: '#4682b4' },
  { id: 'POST_OFFICE_BAY', x: 1, y: 0, name: 'Post Office Bay', description: 'A sheltered cove where sailors leave letters in a barrel and crabs flourish.', type: 'bay', validMoves: ['W','E','SW','S'], specimens: ['crab','basalt','barnacle'], npcs: ['lascar_joe'], boundaries: { north: 'ocean' }, color: 'beige' },
  { id: 'N_SHORE', x: 2, y: 0, name: 'Northern Shore', description: 'Black volcanic sand beach. Peaceful.', type: 'beach', validMoves: ['W','E','SW','S', 'N'], specimens: ['frigatebird','booby','seaLion'], npcs: [], boundaries: { north: 'ocean' }, color: '#5f9ea0' },
  { id: 'CORMORANT_BAY', x: 3, y: 0, name: 'Cormorant Bay', description: 'A lagoon with flamingos and brackish water.', type: 'wetland', validMoves: ['W','SW','S','E'], specimens: ['flamingo','frigatebird','booby'], npcs: [], boundaries: {}, color: '#6b8e23' },
  { id: 'DEVILS_CROWN', x: 4, y: 0, name: "Devil's Crown", description: 'A partially submerged volcanic crater teeming with marine life.', type: 'coastallava', validMoves: ['W','S'], specimens: ['mantaRay','greenTurtle','booby'], npcs: [], boundaries: { north: 'ocean', east: 'ocean' }, color: '#20b2aa' },
  { id: 'N_OUTCROP', x: 2, y: -1, name: 'Desolate Outcrop', description: 'A lonely jetty of volcanic rock.', type: 'ocean', validMoves: ['S'], specimens: ['seaLion'], npcs: ['gabriel_puig'], boundaries: { north: 'ocean', east: 'ocean', west: 'ocean' }, color: '#696969' },
  
  { id: 'BLACK_BEACH_OCEAN', x: -1, y: 1, name: 'Black Beach, Surf', description: 'Waist-deep in the choppy ocean surf. The undertow seems quite dangerous.', type: 'ocean', validMoves: ['E','SE','S'], specimens: ['seaLion','marineIguana'], npcs: [], boundaries: { west: 'ocean' }, color: '#4682b4' },
  { id: 'BLACK_BEACH', x: 0, y: 1, name: 'Black Beach Uplands', description: 'Volcanic sand, home to sea lions and iguanas.', type: 'coastallava', validMoves: ['E','SE','S'], specimens: ['seaLion','marineIguana'], npcs: [], boundaries: { west: 'ocean' }, color: '#bdb76b' },
  { id: 'LAVA_FLATS', x: 1, y: 1, name: 'Lava Flats', description: 'Barren lava field with sparse vegetation.', type: 'lavaField', validMoves: ['W','E','SW','S','SE','NW','NE','N'], specimens: ['lavaLizard','basalt'], npcs: [], boundaries: {}, color: '#696969' },
  { id: 'NORTHERN_HIGHLANDS', x: 2, y: 1, name: 'Northern Highlands', description: 'Scrubby terrain with finches and cacti, plus small introduced crops.', type: 'scrubland', validMoves: ['N','E','W','S'], specimens: ['cactus','large_ground_finch','medium_ground_finch','floreana_giant_tortoise'], npcs: ['maria'], boundaries: {}, color: '#bdb76b' },
  { id: 'EASTERN_CLIFFS', x: 3, y: 1, name: 'Eastern Cliffs', description: 'Steep cliffs where frigatebirds nest.', type: 'cliff', validMoves: ['N','W','SW','S'], specimens: ['frigatebird','galapagos_mockingbird'], npcs: ['gabriel_puig'], boundaries: {}, color: '#8fbc8f' },
  { id: 'ENDERBY', x: 4, y: 1, name: 'Enderby Sector', description: 'A windswept eastern stretch of scrubland frequented by mockingbirds.', type: 'scrubland', validMoves: ['W','S'], specimens: ['floreana_mockingbird','cactus','gray_warbler_finch'], npcs: [], boundaries: {}, color: '#bdb76b' },
  { id: 'PUNTA_CORMORANT', x: 5, y: 1, name: 'Punta Cormorant', description: 'Headland with a strangely green-colored beach and a brackish lagoon inland.', type: 'beach', validMoves: ['N','W','SW'], specimens: ['flamingo','frigatebird'], npcs: [], boundaries: {}, color: '#5f9ea0' },
  
  { id: 'W_LAVA', x: -1, y: 2, name: 'Western Lowlands', description: 'A half-flooded tidal lagoon with a few dilapidated whaler huts.', type: 'coastalTrail', validMoves: ['N','E','NE','SE'], specimens: ['floreana_giant_tortoise'], npcs: [], boundaries: {}, color: '#bdb76b' },
  { id: 'W_HIGH', x: 0, y: 2, name: 'Western Highlands', description: 'Mist-covered forest with giant tortoises.', type: 'forest', validMoves: ['N','SE','E','SW','S','W'], specimens: ['floreana_giant_tortoise','floreana_mockingbird'], npcs: [], boundaries: {}, color: 'green' },
  { id: 'C_HIGH', x: 1, y: 2, name: 'Cerro Pajas', description: 'The highest point of the island.', type: 'highland', validMoves: ['N','E','S','W'], specimens: ['galapagos_mockingbird'], npcs: [], boundaries: {}, color: 'black' },
  { id: 'SETTLEMENT', x: 2, y: 2, name: 'Asilo de la Paz (Penal Colony)', description: 'A small, gloomy settlement of prisoners and soldiers. The Vice Governor’s house stands out.', type: 'settlement', validMoves: ['N','E','W','S'], specimens: ['mangrove','medium_ground_finch'], npcs: [], boundaries: {}, color: '#cd853f' },
  { id: 'E_MID', x: 3, y: 2, name: 'Rocky Clearing', description: 'Mountainous terrain with mysterious caves.', type: 'highland', validMoves: ['N','E','W','S'], specimens: ['floreana_mockingbird','cactus'], npcs: [], boundaries: {}, color: '#bdb76b' },
  { id: 'EL_MIRADOR', x: 4, y: 2, name: 'El Mirador', description: 'A vantage point in the eastern highlands with steep drops and panoramic views.', type: 'highland', validMoves: ['W','S', 'E'], specimens: ['floreana_giant_tortoise','large_ground_finch'], npcs: [], boundaries: {}, color: '#bdb76b' },
  { id: 'WATKINS', x: 5, y: 2, name: 'Watkins Camp', description: 'Ruined campsite of the Irish castaway Patrick Watkins, the first resident of the island.', type: 'camp', validMoves: ['W'], specimens: ['watkinswill'], npcs: [], boundaries: {}, color: '#bdb76b' },
  
  { id: 'SW_BEACH', x: 0, y: 3, name: 'Marine Iguana Colony', description: 'Volcanic rock covered in basking iguanas.', type: 'coastalTrail', validMoves: ['N','E','S'], specimens: ['marineIguana','sallyLightfoot'], npcs: [], boundaries: { west: 'ocean' }, color: '#8b4513' },
  { id: 'MANGROVES', x: 1, y: 3, name: 'Southern Forest', description: 'A lush jungle, choked with vines. Travel is difficult here.', type: 'forest', validMoves: ['N','E','W','S'], specimens: ['mangrove','floreana_giant_tortoise'], npcs: [], boundaries: {}, color: 'green' },
  { id: 'S_VOLCANIC', x: 2, y: 3, name: 'Basalt Plains', description: 'A stark, black volcanic plain.', type: 'lavaField', validMoves: ['N','E','W','S'], specimens: ['lavaLizard'], npcs: [], boundaries: {}, color: '#696969' },
  { id: 'SE_PROMONTORY', x: 3, y: 3, name: 'Wind-Swept Promontory', description: 'A high, rocky outcrop.', type: 'promontory', validMoves: ['N','W','S'], specimens: ['frigatebird'], npcs: [], boundaries: { east: 'cliff' }, color: 'gray' },
  { id: 'SE_COAST', x: 4, y: 3, name: 'Southeastern Coast', description: 'A remote, windblown coastline littered with wreckage.', type: 'coastalTrail', validMoves: ['N','W'], specimens: ['booby','seaLion'], npcs: [], boundaries: {}, color: '#5f9ea0' },

  { id: 'SE_SHALLOW_SURF', 
  x: 4, y: 4, 
  name: 'Shallow Surf', 
  description: 'Calm, shallow waters near the shore, where sea lions and green turtles swim.', 
  type: 'ocean', 
  validMoves: ['N', 'W'], 
  specimens: ['greenTurtle', 'parrotfish', 'seaLion'], 
  npcs: [], 
  boundaries: { south: 'ocean', east: 'ocean' }, 
  color: 'lightblue' 
},
  { id: 'SW_CLIFFS', x: 0, y: 4, name: 'Southwestern Cliffs', description: 'Sheer cliffs with crashing waves and seabird nests.', type: 'cliff', validMoves: ['N','E'], specimens: ['booby','frigatebird'], npcs: [], boundaries: { south: 'ocean', west: 'ocean' }, color: '#8b4513' },
 
  { id: 'PUNTA_SUR', x: 2, y: 4, name: 'Punta Sur', description: 'A dramatic headland with steep cliffs and frequent rainbows.', type: 'promontory', validMoves: ['N','E','W'], specimens: ['frigatebird','booby'], npcs: [], boundaries: { south: 'cliff' }, color: '#8b4513' },
  { id: 'S_WETLANDS', x: 3, y: 4, name: 'Wetlands Forest', description: 'Mangroves in the lowlands, moving up to dense tropical vegation.', type: 'wetland', validMoves: ['N','E','W'], specimens: ['mangrove'], npcs: [], boundaries: {}, color: '#6b8e23' },
{ id: 'S_INTERTIDAL', x: 1, y: 4, name: 'Intertidal Flats', description: 'Mangroves and rocky tide pools teeming with marine life.', type: 'wetland', validMoves: ['N','E','W'], specimens: ['crab', 'mangrove','sallyLightfoot','greenTurtle'], npcs: [], boundaries: { south: 'ocean' }, color: '#5f9ea0' },


   { id: 'S_HUT', x: 1, y: 5, name: 'Abandoned Beach Hut', description: 'A protected beach with a small hut and the remains of a household garden.', type: 'hut', validMoves: ['N','E'], specimens: ['crab','sallyLightfoot','greenTurtle'], npcs: [], boundaries: { south: 'ocean' , west: 'ocean'}, color: '#5f9ea0' },
  { id: 'S_REEFS', x: 2, y: 5, name: 'Southern Reefs', description: 'Shallow reefs with rich biodiversity, frequented by sea turtles and rays.', type: 'reef', validMoves: ['N','W'], specimens: ['greenTurtle','mantaRay','parrotfish'], npcs: [], boundaries: { south: 'ocean' }, color: '#4682b4' }
];




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