// utils/hybridImageGenerator.js
/**
 * Utility for generating hybrid species images using DALL-E
 * With enhanced caching, rate limiting, and error handling
 */

// Cache for storing generated image URLs (persistent through localStorage)
const CACHE_KEY = 'darwin_hybrid_image_cache';
let imageCache = loadImageCache();

// Queue for managing image generation requests
let imageQueue = [];
let isProcessingQueue = false;
const QUEUE_INTERVAL = 12000; // Process queue every 12 seconds (5/min)

/**
 * Load image cache from localStorage
 */
function loadImageCache() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    return cachedData ? JSON.parse(cachedData) : {};
  } catch (e) {
    console.warn('Failed to load image cache', e);
    return {};
  }
}

/**
 * Save image cache to localStorage
 */
function saveImageCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(imageCache));
  } catch (e) {
    console.warn('Failed to save image cache', e);
  }
}

/**
 * Generate an image for a hybrid specimen using DALL-E
 * 
 * @param {Object} hybrid - The hybrid specimen object
 * @param {Object} options - Optional parameters
 * @returns {Promise<string>} - URL of the generated image or a placeholder
 */
export async function generateHybridImage(hybrid, options = {}) {
  if (!hybrid) {
    throw new Error("No hybrid specimen provided");
  }
  
  // Create a stable cache key
  const cacheKey = hybrid.id || createCacheKey(hybrid);
  
  // Check cache first
  if (imageCache[cacheKey]) {
    console.log(`Using cached image for ${hybrid.name}`);
    return imageCache[cacheKey];
  }
  
  // Add to queue instead of generating immediately
  return new Promise((resolve) => {
    console.log(`Queueing image generation for hybrid: ${hybrid.name}`);
    
    // Create a placeholder image URL as immediate feedback
    const placeholderUrl = getPlaceholderUrl(hybrid.name);
    
    // Add to queue with callback to resolve the promise when done
    imageQueue.push({
      hybrid,
      options,
      cacheKey,
      onComplete: (imageUrl) => {
        resolve(imageUrl);
      },
      placeholderUrl
    });
    
    // Start queue processing if not already running
    if (!isProcessingQueue) {
      processQueue();
    }
    
    // Return placeholder immediately
    resolve(placeholderUrl);
  });
}

/**
 * Process the image generation queue
 */
async function processQueue() {
  if (imageQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  
  isProcessingQueue = true;
  const item = imageQueue.shift();
  
  try {
    console.log(`Processing image request for ${item.hybrid.name}`);
    
    // Get parent names if available
    const parent1 = item.options.parent1 || 
                    (item.hybrid.parent1Id ? `a ${item.hybrid.parent1Id.replace(/_/g, ' ')}` : null);
                    
    const parent2 = item.options.parent2 || 
                    (item.hybrid.parent2Id ? `a ${item.hybrid.parent2Id.replace(/_/g, ' ')}` : null);
    
    // Prepare the request body
    const requestBody = {
      hybridName: item.hybrid.name,
      hybridDescription: item.hybrid.description,
      parent1Name: parent1,
      parent2Name: parent2,
      hybridityMode: item.hybrid.hybridityType || item.options.hybridityMode || 'mild',
      cacheKey: item.cacheKey
    };
    
    // Set up the fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout
    
    try {
      // Call our API endpoint
      const response = await fetch('/api/generate-hybrid-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // Check for errors
      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // If response can't be parsed as JSON, use status text
          console.warn("Could not parse error response as JSON:", e);
        }
        throw new Error(`API error: ${errorMessage}`);
      }
      
      // Extract the image URL
      const data = await response.json();
      const imageUrl = data.imageUrl;
      
      // Handle fallback case
      if (data.fallback) {
        console.log(`API returned fallback: ${data.message}`);
        
        // Still cache the fallback URL
        if (imageUrl) {
          imageCache[item.cacheKey] = imageUrl;
          saveImageCache();
        }
        
        // Resolve with the fallback URL
        item.onComplete(imageUrl || item.placeholderUrl);
      } else if (imageUrl) {
        // Cache the successful URL
        console.log(`Generated image for ${item.hybrid.name}`);
        imageCache[item.cacheKey] = imageUrl;
        saveImageCache();
        
        // Resolve with the image URL
        item.onComplete(imageUrl);
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      // Handle fetch errors
      console.warn(`Image generation failed for ${item.hybrid.name}:`, error);
      
      // Clear the timeout if it's still active
      clearTimeout(timeoutId);
      
      // For timeout or abort errors, cache and return the placeholder
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        console.warn(`Image generation request timed out`);
      }
      
      // Resolve with the placeholder URL
      item.onComplete(item.placeholderUrl);
    }
  } catch (error) {
    // Handle any unexpected errors
    console.error(`Unexpected error generating image for ${item.hybrid.name}:`, error);
    item.onComplete(item.placeholderUrl);
  } finally {
    // Process the next item after a delay (to respect rate limits)
    setTimeout(processQueue, QUEUE_INTERVAL);
  }
}

/**
 * Create a placeholder URL for a hybrid name
 */
function getPlaceholderUrl(name) {
  const encodedName = encodeURIComponent(name.substring(0, 30));
  return `https://via.placeholder.com/256x256/8B5A2B/FFFFFF?text=${encodedName}`;
}

/**
 * Create a cache key from a hybrid specimen
 */
function createCacheKey(hybrid) {
  const baseName = hybrid.name || 'unknown';
  const parent1 = hybrid.parent1Id || '';
  const parent2 = hybrid.parent2Id || '';
  
  return `hybrid_${baseName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${parent1}_${parent2}`;
}

/**
 * Check if an image has been generated for a hybrid
 * 
 * @param {string} hybridId - The hybrid specimen ID
 * @returns {boolean} - Whether an image exists in the cache
 */
export function hasGeneratedImage(hybridId) {
  return !!imageCache[hybridId];
}

/**
 * Get a cached image URL for a hybrid
 * 
 * @param {string} hybridId - The hybrid specimen ID
 * @returns {string|null} - The cached image URL or null
 */
export function getCachedImageUrl(hybridId) {
  return imageCache[hybridId] || null;
}

/**
 * Store an image URL in the cache
 * 
 * @param {string} hybridId - The hybrid specimen ID
 * @param {string} imageUrl - The image URL to cache
 */
export function cacheImageUrl(hybridId, imageUrl) {
  if (hybridId && imageUrl) {
    imageCache[hybridId] = imageUrl;
    saveImageCache();
  }
}

/**
 * Get the current status of the image queue
 */
export function getQueueStatus() {
  return {
    queueLength: imageQueue.length,
    isProcessing: isProcessingQueue
  };
}