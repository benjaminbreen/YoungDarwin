// generateLLMContext.js - Fixed version
// This addresses the API key issue by using /api/summarize endpoint instead of direct API calls

// Queue to manage background summary requests
let summaryQueue = [];
let isProcessingQueue = false;

// Main function to build LLM prompt context
const buildLLMPromptContext = (gameState) => {
  const {
    location,
    locationDesc,
    time,
    day,
    fatigue,
    mood,
    currentSpecimen,
    collectedSpecimens,
    currentNPC,
    validDirections,
    potentialSpecimens,
    primaryCollectible
  } = gameState;

  // Get cached context summary from the gameState
  const contextSummary = gameState.contextSummary || '';

  // Format the current state information
  const stateContext = `
[Current State]
Location: ${location || 'Unknown'}
Time: ${time} on Day ${day}
Fatigue: ${fatigue}/100
Mood: ${mood || 'neutral'}
Examining: ${currentSpecimen !== 'None' ? currentSpecimen : 'Nothing in particular'}
NPC Present: ${currentNPC !== 'None' ? currentNPC : 'None'}
Collected: ${collectedSpecimens || 'None'}
  `;

  return `${stateContext}\n\n[Recent Events]\n${contextSummary}`;
};

// Function to add an event to the summary queue
const queueEventForSummary = async (event, gameStore) => {
  // Add the event to the queue
  summaryQueue.push({ event, gameStore });
  
  // Start processing if not already in progress
  if (!isProcessingQueue) {
    processQueue();
  }
};

// Process the summary queue without blocking the main game
const processQueue = async () => {
  if (summaryQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const { event, gameStore } = summaryQueue.shift();

  try {
    // Generate summary for this event using LLM
    const summary = await generateEventSummary(event);
    
    // Update the event with the LLM-generated summary
    if (summary && gameStore) {
      // Update the event in the store with the improved summary
      gameStore.updateEventSummary(event.id, summary);
    }
  } catch (error) {
    console.error("Error generating event summary:", error);
  }

  // Continue processing the queue
  setTimeout(processQueue, 100); // Small delay to not block the main thread
};

// Generate an LLM summary for an event using the API endpoint
// Instead of direct OpenAI call, use our own API endpoint that has access to env vars
const generateEventSummary = async (event) => {
  // Skip empty or malformed events
  if (!event || !event.fullContent) {
    return null;
  }

  try {
    // Call our own API endpoint (which has access to the API key from env)
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event })
    });

    if (!response.ok) {
      console.error(`Summary API error: Status ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Return the summary if available
    return data.summary || null;
    
  } catch (error) {
    console.error("Error generating event summary:", error);
    return null;
  }
};

// Function to compile event history summary for context
// This doesn't make an API call, just uses the summaries we already have
const compileEventHistorySummary = (eventHistory) => {
  if (!eventHistory || !Array.isArray(eventHistory)) {
    return "No recent events.";
  }
  
  // Get the last 15 events
  const recentEvents = eventHistory.slice(-15);
  
  // Format them into a compact summary string
  return recentEvents.map((event, index) => {
    if (!event) return `${index + 1}. [EVENT] Unknown event`;
    
    const eventNumber = index + 1;
    
    // Use LLM-generated summary if available, fall back to auto-generated summary
    const summary = (event.llmSummary || event.summary || 'Event occurred').trim();
    
    // Format based on event type
    let prefix;
    switch(event.eventType) {
      case 'action':
        prefix = `${eventNumber}. [ACTION]`;
        break;
      case 'collection':
        prefix = `${eventNumber}. [COLLECTION]`;
        break;
      case 'observation':
        prefix = `${eventNumber}. [OBSERVATION]`;
        break;
      case 'movement':
        prefix = `${eventNumber}. [MOVEMENT]`;
        break;
      case 'field_notes':
        prefix = `${eventNumber}. [FIELD_NOTES]`;
        break;
      default:
        prefix = `${eventNumber}. [EVENT]`;
    }
    
    return `${prefix} Day ${event.day || 1}, ${event.time || ''}: ${summary}`;
  }).join('\n');
};

export {
  buildLLMPromptContext as default,
  queueEventForSummary,
  compileEventHistorySummary
};