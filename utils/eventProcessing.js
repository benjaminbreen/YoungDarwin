// utils/eventProcessing.js
// Utility functions for processing and categorizing game events

/**
 * Determine the appropriate event type based on content and context
 * @param {string} content - The event content
 * @param {string} role - The role of the event creator ('user', 'assistant', etc.)
 * @param {Object} context - Additional context for better classification
 * @returns {string} The determined event type
 */
export function determineEventType(content, role, context = {}) {
  // Convert content to string and lowercase for easier matching
  const contentStr = String(content).toLowerCase();
  
  // Check for user input type events
  if (role === 'user') {
    // Check for tool usage (observation)
    if (containsToolUsage(contentStr)) {
      return 'observation';
    }
    // Check for movement commands
    else if (containsMovementCommand(contentStr)) {
      return 'movement';
    }
    // Check for collection attempts
    else if (containsCollectionAttempt(contentStr)) {
      return 'collection';
    }
    // Default user input is an action
    return 'action';
  }
  
  // For system-generated content
  if (role === 'assistant' || role === 'system') {
    // Field notes are always field_notes
    if (role === 'field_notes') {
      return 'field_notes';
    }
    
    // Successful collections
    if (contentStr.includes('collect') && 
        (contentStr.includes('successfully') || contentStr.includes('added to inventory'))) {
      return 'collection';
    }
    
    // Movement events
    if ((contentStr.includes('travel') || contentStr.includes('moved to') || 
         contentStr.includes('arrived at')) && 
        contentStr.match(/\bto\s+[^.]+\b/i)) {
      return 'movement';
    }
    
    // Observations from tool use
    if ((contentStr.includes('examine') || contentStr.includes('observe') || 
         contentStr.includes('using') || contentStr.includes('analysis')) && 
        (contentStr.includes('specimen') || contentStr.includes('sample'))) {
      return 'observation';
    }
    
    // Generic narrative descriptions should be 'event' type
    return 'event';
  }
  
  // Default fallback
  return 'event';
}

/**
 * Check if content contains tool usage for observations
 * @param {string} content - The lowercase content string
 * @returns {boolean} True if the content contains tool usage
 */
function containsToolUsage(content) {
  const toolTerms = [
    'dissect', 'examine', 'observe', 'lens', 'magnifier', 'caliper',
    'measure', 'analyze', 'kit', 'tool', 'microscope', 'sample', 'comparative'
  ];
  
  return toolTerms.some(term => content.includes(term));
}

/**
 * Check if content contains movement commands
 * @param {string} content - The lowercase content string
 * @returns {boolean} True if the content contains movement commands
 */
function containsMovementCommand(content) {
  const movementTerms = [
    'go', 'move', 'walk', 'travel', 'head', 'proceed',
    'north', 'south', 'east', 'west', 'northwest', 'northeast',
    'southwest', 'southeast'
  ];
  
  return movementTerms.some(term => content.includes(term));
}

/**
 * Check if content contains collection attempts
 * @param {string} content - The lowercase content string
 * @returns {boolean} True if the content contains collection attempts
 */
function containsCollectionAttempt(content) {
  const collectionTerms = [
    'collect', 'gather', 'take', 'pick', 'capture', 'catch', 'bag',
    'specimen', 'sample'
  ];
  
  return collectionTerms.some(term => content.includes(term));
}

/**
 * Clean the event content by removing metadata markers
 * @param {string} content - The content to clean
 * @returns {string} The cleaned content
 */
export function cleanEventContent(content) {
  if (!content) return '';
  
  return content
    .replace(/\[MOOD:.*?\]/g, '')
    .replace(/\[FATIGUE:.*?\]/g, '')
    .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
    .replace(/\[COLLECTIBLE:.*?\]/g, '')
    .replace(/\[STATUS:.*?\]/g, '')
    .replace(/\[WEATHER:.*?\]/g, '')
    .replace(/\[SOUNDS:.*?\]/g, '')
    .replace(/\[NPC:.*?\]/g, '')
    .replace(/NEXTSTEPS:[\s\S]*?(?=\[|$)/g, '')
    .trim();
}

/**
 * Get an appropriate icon for each event type
 * @param {string} eventType - The type of event
 * @returns {string} An emoji icon representing the event type
 */
export function getEventIcon(eventType) {
  switch (eventType) {
    case 'movement': return '🧭';
    case 'collection': return '🧪';
    case 'observation': return '🔍';
    case 'action': return '🔄';
    case 'field_notes': return '📝';
    case 'event': return '📣';
    default: return '📜';
  }
}

/**
 * Get style classes for an event type
 * @param {string} eventType - The type of event
 * @returns {string} CSS classes for styling the event
 */
export function getEventClasses(eventType) {
  switch (eventType) {
    case 'movement': 
      return 'movement-event';
    case 'collection':
      return 'collection-event';
    case 'observation':
      return 'observation-event';
    case 'action':
      return 'action-event';
    case 'field_notes':
      return 'field-notes-event';
    case 'event':
      return 'event-event';
    default:
      return '';
  }
}

/**
 * Deduplicate and process events for display
 * @param {Array} events - The raw event history
 * @param {string} filter - The filter to apply (or 'all' for no filter)
 * @returns {Array} Processed events ready for display
 */
export function processEventsForDisplay(events, filter = 'all') {
  if (!events || !events.length) return [];
  
  // Deduplicate movement entries that have the same destination
  const uniqueEvents = [];
  const movementTargets = new Set();
  
  events.forEach(event => {
    // Skip duplicate movements
    if (event.eventType === 'movement') {
      const target = event.fullContent?.match(/to\s+([^.]+)/i)?.[1];
      if (target) {
        const key = `${event.day}-${event.locationId}`;
        if (movementTargets.has(key)) return;
        movementTargets.add(key);
      }
    }
    
    // Reclassify narrative descriptions as "event" type if needed
    const processedEvent = { ...event };
    if (event.eventType === 'collection' && !event.fullContent?.toLowerCase().includes('collect')) {
      processedEvent.eventType = 'event';
    }
    
    // Filter events based on selected category
    if (filter === 'all' || processedEvent.eventType === filter) {
      uniqueEvents.push(processedEvent);
    }
  });
  
  return uniqueEvents;
}