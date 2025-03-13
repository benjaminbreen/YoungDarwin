// utils/LocationSystemSync.js
// not used, defunct, obsolete - just keeping in case

// Mapping of interior location IDs to their entry points on the main map
const interiorToExteriorMapping = {
  'GOVERNORS_HOUSE': 'SETTLEMENT',
  'GOVERNORS_HOUSE_OFFICE': 'SETTLEMENT',
  'GOVERNORS_HOUSE_PRIVATE': 'SETTLEMENT',
  'GOVERNORS_HOUSE_LIBRARY': 'SETTLEMENT',
  'GOVERNORS_HOUSE_DINING': 'SETTLEMENT',
  'GOVERNORS_HOUSE_ENTRANCE': 'SETTLEMENT',
  'GOVERNORS_HOUSE_GARDEN': 'SETTLEMENT',
  'CAVE': 'E_MID',
  'CAVE_ENTRANCE': 'E_MID',
  'CAVE_LOOKOUT': 'E_MID',
  'CAVE_BACK': 'E_MID',
  'CAVE_LEFT': 'E_MID',
  'CAVE_WRITING': 'E_MID',
  'CAVE_STORAGE': 'E_MID',
  'BEAGLE': 'POST_OFFICE_BAY',
  'BEAGLE_BOW': 'POST_OFFICE_BAY',
  'BEAGLE_STERN': 'POST_OFFICE_BAY',
  'BEAGLE_CABIN': 'POST_OFFICE_BAY',
  'BEAGLE_QUARTERS': 'POST_OFFICE_BAY',
  'BEAGLE_STORAGE': 'POST_OFFICE_BAY',
  'BEAGLE_CREW': 'POST_OFFICE_BAY',
  'BEAGLE_FORECASTLE': 'POST_OFFICE_BAY',
  'BEAGLE_FOREMAST': 'POST_OFFICE_BAY',
  'BEAGLE_MAINMAST': 'POST_OFFICE_BAY',
  'BEAGLE_QUARTERDECK': 'POST_OFFICE_BAY',
  'WATKINS_CABIN_INTERIOR': 'W_LAVA',
  'WHALERS_HUT_INTERIOR': 'SW_BEACH'
};

// Mapping of exterior to interior location IDs
const exteriorToInteriorMapping = {
  'SETTLEMENT': 'GOVERNORS_HOUSE',
  'E_MID': 'CAVE',
  'POST_OFFICE_BAY': 'BEAGLE',
  'W_LAVA': 'WATKINS_CABIN_INTERIOR',
  'SW_BEACH': 'WHALERS_HUT_INTERIOR'
};

// Interior type mapping based on ID prefixes
const getInteriorTypeFromId = (locationId) => {
  if (!locationId) return null;
  
  if (locationId.startsWith('GOVERNORS_HOUSE')) return 'governors_house';
  if (locationId.startsWith('CAVE')) return 'cave';
  if (locationId.startsWith('BEAGLE')) return 'hms_beagle';
  if (locationId.startsWith('WATKINS')) return 'watkins_cabin';
  if (locationId.startsWith('WHALERS')) return 'whalers_hut';
  
  return null;
};

/**
 * Enhanced moveToLocation that properly handles interior locations
 * 
 * @param {string} targetLocationId - The ID of the location to move to
 * @param {object} locationSystem - The useLocationSystem hook instance
 * @param {object} gameStore - The game store instance
 * @returns {object} Result of the movement attempt
 */
export const enhancedMoveToLocation = (targetLocationId, locationSystem, gameStore) => {
  console.log(`Enhanced moveToLocation called with targetLocationId: ${targetLocationId}`);
  
  // Check if this is an interior location
  const isInteriorLocation = Object.keys(interiorToExteriorMapping).includes(targetLocationId);
  
  if (isInteriorLocation) {
    console.log(`Identified ${targetLocationId} as an interior location`);
    
    // Get the exterior location this interior is connected to
    const exteriorLocationId = interiorToExteriorMapping[targetLocationId];
    
    // First move to the exterior location if needed
    let exteriorMoveResult = { success: true };
    if (gameStore.currentLocationId !== exteriorLocationId) {
      console.log(`Moving to exterior location ${exteriorLocationId} first`);
      exteriorMoveResult = locationSystem.moveToLocation(exteriorLocationId);
      
      if (!exteriorMoveResult.success) {
        console.error(`Failed to move to exterior location ${exteriorLocationId}`);
        return exteriorMoveResult;
      }
    }
    
    // Now enter the interior
    const interiorType = getInteriorTypeFromId(targetLocationId);
    if (!interiorType) {
      console.error(`Could not determine interior type for ${targetLocationId}`);
      return { 
        success: false, 
        message: `Could not enter ${targetLocationId}. Unknown interior type.` 
      };
    }
    
    console.log(`Entering interior type: ${interiorType}`);
    
    // Call enterInterior from the locationSystem
    const enterResult = locationSystem.enterInterior(interiorType);
    
    if (!enterResult.success) {
      console.error(`Failed to enter interior ${interiorType}`);
      return enterResult;
    }
    
    // Special case: if this is a specific room within an interior
    // For example, GOVERNORS_HOUSE_OFFICE within GOVERNORS_HOUSE
    if (targetLocationId !== exteriorToInteriorMapping[exteriorLocationId]) {
      // Get room coordinates from the interior map
      const roomCoords = getRoomCoordinates(targetLocationId, interiorType);
      if (roomCoords) {
        console.log(`Moving to specific room ${targetLocationId} at coordinates:`, roomCoords);
        locationSystem.moveInInterior(roomCoords, targetLocationId);
      }
    }
    
    return {
      success: true,
      message: `You have entered ${targetLocationId.replace(/_/g, ' ').toLowerCase()}.`,
      newLocationId: targetLocationId
    };
  }
  
  // Handle regular (exterior) location movement
  console.log(`Proceeding with standard moveToLocation for ${targetLocationId}`);
  return locationSystem.moveToLocation(targetLocationId);
};

/**
 * Helper function to get room coordinates within an interior
 */
const getRoomCoordinates = (roomId, interiorType) => {
  // These should match the coordinates in your InteriorMap component
  const roomCoordinates = {
    // Governor's House
    'GOVERNORS_HOUSE_OFFICE': { x: 0, y: 1 },
    'GOVERNORS_HOUSE_ENTRANCE': { x: 1, y: 1 },
    'GOVERNORS_HOUSE_GARDEN': { x: 2, y: 1 },
    'GOVERNORS_HOUSE_DINING': { x: 0, y: 0 },
    'GOVERNORS_HOUSE_PRIVATE': { x: 1, y: 0 },
    'GOVERNORS_HOUSE_LIBRARY': { x: 2, y: 0 },
    
    // Cave
    'CAVE_ENTRANCE': { x: 1, y: 2 },
    'CAVE_BACK': { x: 1, y: 0 },
    'CAVE_LEFT': { x: 0, y: 1 },
    'CAVE_STORAGE': { x: 0, y: 0 },
    'CAVE_LOOKOUT': { x: 2, y: 0 },
    'CAVE_WRITING': { x: 0, y: 2 },
    
    // HMS Beagle
    'BEAGLE_BOW': { x: 0, y: 0 },
    'BEAGLE_FOREMAST': { x: 1, y: 0 },
    'BEAGLE_MAINMAST': { x: 2, y: 0 },
    'BEAGLE_QUARTERDECK': { x: 3, y: 0 },
    'BEAGLE_STERN': { x: 4, y: 0 },
    'BEAGLE_FORECASTLE': { x: 0, y: 1 },
    'BEAGLE_CREW': { x: 1, y: 1 },
    'BEAGLE_STORAGE': { x: 2, y: 1 },
    'BEAGLE_QUARTERS': { x: 3, y: 1 },
    'BEAGLE_CABIN': { x: 4, y: 1 },
    
    // Single-room interiors
    'WATKINS_CABIN_INTERIOR': { x: 0, y: 0 },
    'WHALERS_HUT_INTERIOR': { x: 0, y: 0 },
  };
  
  return roomCoordinates[roomId];
};

/**
 * Detect interior location mentions in user input
 * 
 * @param {string} text - User input text to analyze
 * @returns {string|null} Interior location ID if detected, null otherwise
 */
export const detectInteriorLocationInText = (text) => {
  if (!text) return null;
  
  const lowercaseText = text.toLowerCase();
  
  // Check for governor's house references
  if (lowercaseText.includes('governor') || 
      lowercaseText.includes('lawson') || 
      lowercaseText.includes('vice-governor') ||
      lowercaseText.includes('administration')) {
    
    // Check for specific rooms
    if (lowercaseText.includes('office')) return 'GOVERNORS_HOUSE_OFFICE';
    if (lowercaseText.includes('garden')) return 'GOVERNORS_HOUSE_GARDEN';
    if (lowercaseText.includes('library')) return 'GOVERNORS_HOUSE_LIBRARY';
    if (lowercaseText.includes('dining')) return 'GOVERNORS_HOUSE_DINING';
    if (lowercaseText.includes('private') || lowercaseText.includes('bedroom')) return 'GOVERNORS_HOUSE_PRIVATE';
    
    // Default to entrance
    return 'GOVERNORS_HOUSE';
  }
  
  // Check for cave references
  if (lowercaseText.includes('cave') || 
      lowercaseText.includes('gabriel') || 
      lowercaseText.includes('puig') ||
      lowercaseText.includes('hideout')) {
    
    // Check for specific areas
    if (lowercaseText.includes('writing') || lowercaseText.includes('desk')) return 'CAVE_WRITING';
    if (lowercaseText.includes('lookout')) return 'CAVE_LOOKOUT';
    if (lowercaseText.includes('back')) return 'CAVE_BACK';
    if (lowercaseText.includes('storage') || lowercaseText.includes('cache')) return 'CAVE_STORAGE';
    if (lowercaseText.includes('entrance')) return 'CAVE_ENTRANCE';
    
    // Default to main cave
    return 'CAVE';
  }
  
  // Check for HMS Beagle references
  if (lowercaseText.includes('beagle') || 
      lowercaseText.includes('ship') || 
      lowercaseText.includes('vessel') ||
      lowercaseText.includes('fitzroy')) {
    
    // Check for specific areas
    if (lowercaseText.includes('cabin') || lowercaseText.includes('captain')) return 'BEAGLE_CABIN';
    if (lowercaseText.includes('quarter') || lowercaseText.includes('your room')) return 'BEAGLE_QUARTERS';
    if (lowercaseText.includes('storage') || lowercaseText.includes('specimen')) return 'BEAGLE_STORAGE';
    if (lowercaseText.includes('crew')) return 'BEAGLE_CREW';
    if (lowercaseText.includes('deck')) return 'BEAGLE_QUARTERDECK';
    if (lowercaseText.includes('bow')) return 'BEAGLE_BOW';
    if (lowercaseText.includes('stern')) return 'BEAGLE_STERN';
    
    // Default to ship
    return 'BEAGLE';
  }
  
  // Check for Watkins Cabin references
  if (lowercaseText.includes('watkins') || 
      lowercaseText.includes('castaway') || 
      lowercaseText.includes('irish')) {
    return 'WATKINS_CABIN_INTERIOR';
  }
  
  // Check for Whaler's Hut references
  if (lowercaseText.includes('whaler') || 
      lowercaseText.includes('hut')) {
    return 'WHALERS_HUT_INTERIOR';
  }
  
  return null;
};

// Named exports for individual access
export {
  enhancedMoveToLocation,
  detectInteriorLocationInText,
  getInteriorTypeFromId,
  interiorToExteriorMapping,
  exteriorToInteriorMapping
};

// Default export for backward compatibility
export default {
  enhancedMoveToLocation,
  detectInteriorLocationInText,
  getInteriorTypeFromId,
  interiorToExteriorMapping,
  exteriorToInteriorMapping
};