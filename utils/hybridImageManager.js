// utils/hybridImageManager.js
/**
 * Utility for managing hybrid specimen images
 */

// In-memory cache for hybrid image URLs
const hybridImageCache = new Map();

/**
 * Get image URL for a hybrid specimen
 * - First checks if URL is already in cache
 * - If not, attempts to generate a new image
 * - Returns placeholder if all else fails
 */
export async function getHybridImageUrl(specimen) {
  // If not a hybrid, return normal path
  if (!specimen?.isHybrid) {
    return `/specimens/${specimen.id.toLowerCase()}.jpg`;
  }
  
  // Check if we already have this hybrid's image URL cached
  if (hybridImageCache.has(specimen.id)) {
    return hybridImageCache.get(specimen.id);
  }
  
  // Gather description data
  const description = specimen.description || 
    `A hybrid between ${specimen.parent1Id} and ${specimen.parent2Id}`;
  
  try {
    // Call API to generate image
    const response = await fetch('/api/generate-hybrid-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hybridId: specimen.id,
        description: description,
        name: specimen.name
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Use the direct image URL from DALL-E
    if (data.imageUrl) {
      // Cache the URL for future use
      hybridImageCache.set(specimen.id, data.imageUrl);
      return data.imageUrl;
    }
    
    // Fallback to imagePath or placeholder
    return data.imagePath || `/specimens/placeholder.jpg`;
    
  } catch (error) {
    console.error(`Error getting hybrid image for ${specimen.id}:`, error);
    return `/specimens/placeholder.jpg`;
  }
}

/**
 * Enhanced getSpecimenImagePath with hybrid support
 * - Direct replacement for existing getSpecimenImagePath functions
 * - Returns a promise that resolves to an image path or URL
 */
export async function getSpecimenImagePathAsync(specimen) {
  if (specimen?.isHybrid) {
    return getHybridImageUrl(specimen);
  }
  
  // Standard path for normal specimens
  return `/specimens/${specimen.id.toLowerCase()}.jpg`;
}

/**
 * Synchronous version for existing components
 * - Returns placeholder immediately
 * - Starts async process to load real image
 * - Updates target image element when ready
 */
export function getSpecimenImagePathSync(specimen, imageElement = null) {
  if (!specimen?.isHybrid) {
    return `/specimens/${specimen.id.toLowerCase()}.jpg`;
  }
  
  // For hybrids, return placeholder immediately but start async loading
  const placeholderPath = `/specimens/placeholder.jpg`;
  
  // Start async fetch but don't wait
  getHybridImageUrl(specimen).then(url => {
    // If an image element was provided, update it when URL is ready
    if (imageElement && imageElement.src) {
      imageElement.src = url;
    }
    
    // Dispatch an event that components can listen for
    const event = new CustomEvent('hybridImageLoaded', {
      detail: { hybridId: specimen.id, imageUrl: url }
    });
    document.dispatchEvent(event);
  }).catch(err => {
    console.error('Error loading hybrid image:', err);
  });
  
  return placeholderPath;
}