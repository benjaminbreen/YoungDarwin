// utils/hybridImageGenerator.js
/**
 * Utility for generating hybrid species images using DALL-E
 * with optional queue-based rate limiting and localStorage caching.
 */

// Key for localStorage cache
const CACHE_KEY = 'darwin_hybrid_image_cache';

// In-memory cache object
let imageCache = {};

// Attempt to load from localStorage on the client, if available
if (typeof window !== 'undefined') {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      imageCache = JSON.parse(cachedData);
    }
  } catch (err) {
    console.warn('Failed to load hybrid image cache from localStorage:', err);
  }
}

// Simple helper to persist the cache to localStorage, client-side only
function saveImageCache() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(imageCache));
    } catch (e) {
      console.warn('Failed to save image cache', e);
    }
  }
}

// Queue for managing image generation requests
let imageQueue = [];
let isProcessingQueue = false;
const QUEUE_INTERVAL = 12000; // process next item every 12 sec (~5 calls/min)

// Helper to create a placeholder for immediate use
function getPlaceholderUrl(name) {
  const encodedName = encodeURIComponent(name.substring(0, 30));
  return `https://via.placeholder.com/256x256/8B5A2B/FFFFFF?text=${encodedName}`;
}

/**
 * The main function to queue up a request for generating a hybrid image.
 * Returns a placeholder right away but eventually resolves to the remote URL.
 *
 * @param {Object} hybrid - The hybrid specimen object (with .id, .name, etc.)
 * @param {Object} options - Optional parameters: parent1, parent2, hybridityMode, etc.
 * @returns {Promise<string>} - A Promise that resolves to the final image URL
 */
export async function generateHybridImage(hybrid, options = {}) {
  if (!hybrid) {
    throw new Error("No hybrid specimen provided");
  }

  // Make a stable key (or use hybrid.id if guaranteed unique)
  const cacheKey = hybrid.id || `hybrid_${hybrid.name}_${Date.now()}`;

  // If we already have an image in cache, just return it
  if (imageCache[cacheKey]) {
    console.log(`Using cached image for ${hybrid.name}`);
    return imageCache[cacheKey];
  }

  // We'll return a placeholder immediately...
  const placeholderUrl = getPlaceholderUrl(hybrid.name);

  // ... but queue the actual generation in the background
  return new Promise((resolve) => {
    console.log(`Queueing image generation for hybrid: ${hybrid.name}`);

    imageQueue.push({
      hybrid,
      options,
      cacheKey,
      onComplete: (finalUrl) => {
        resolve(finalUrl);
      },
      placeholderUrl
    });

    if (!isProcessingQueue) {
      processQueue();
    }

    // Immediately resolve the placeholder for now
    resolve(placeholderUrl);
  });
}

/**
 * Checks whether an image has been generated (or cached) for a given ID.
 */
export function hasGeneratedImage(hybridId) {
  return Boolean(imageCache[hybridId]);
}

/**
 * Returns the cached image URL, if any, else null.
 */
export function getCachedImageUrl(hybridId) {
  return imageCache[hybridId] || null;
}

/**
 * Internal: Process the next item in the queue, then schedule the next check.
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

    // Prepare request body for your /api/generate-hybrid-image endpoint
    const requestBody = {
      hybridName: item.hybrid.name,
      hybridDescription: item.hybrid.description,
      parent1Name: item.options.parent1?.name || null,
      parent2Name: item.options.parent2?.name || null,
      hybridityMode: item.options.hybridityMode || 'mild',
      // no need for a "cacheKey" param if your API doesn’t require it,
      // but you can pass it if you do
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000); // 50s

    let finalUrl = item.placeholderUrl; // fallback if error happens

    try {
      const response = await fetch('/api/generate-hybrid-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      const data = await response.json();

      if (data.success && data.imageUrl) {
        finalUrl = data.imageUrl;
        console.log(`Generated image for ${item.hybrid.name}`);
      } else {
        console.warn(`Fallback used for ${item.hybrid.name}:`, data.message || 'Unknown reason');
      }

    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Image generation failed for ${item.hybrid.name}:`, err);
      // finalUrl remains the placeholder
    }

    // Store finalUrl in in-memory & localStorage cache
    imageCache[item.cacheKey] = finalUrl;
    saveImageCache();

    // Resolve the promise for whichever code is waiting
    item.onComplete(finalUrl);

  } catch (error) {
    console.error(`Unexpected error generating image for ${item.hybrid.name}:`, error);
    item.onComplete(item.placeholderUrl);
  } finally {
    // Move on to next queue item after delay
    setTimeout(processQueue, QUEUE_INTERVAL);
  }
}
