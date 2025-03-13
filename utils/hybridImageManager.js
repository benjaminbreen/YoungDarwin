// utils/hybridImageManager.js

/**
 * Utility for fetching hybrid specimen images from the DALL·E endpoint
 * and returning them as a remote URL. Falls back to placeholder
 * if the request fails or no image is returned.
 */

// In-memory cache for hybrid image URLs (to avoid repeated fetches)
const hybridImageCache = new Map();

/**
 * Main function to get an image URL for any specimen (hybrid or normal).
 * If it's a normal specimen, returns "/specimens/<id>.jpg"
 * If it's a hybrid, calls /api/generate-hybrid-image for a remote DALL·E URL.
 */
export async function getHybridImageUrl(specimen) {
  if (!specimen) {
    return '/specimens/placeholder.jpg';
  }

  // For normal (non-hybrid) specimens, just use your standard local image
  if (!specimen.isHybrid) {
    return `/specimens/${(specimen.id || '').toLowerCase()}.jpg`;
  }

  // If we already fetched this hybrid's image, return from cache
  if (hybridImageCache.has(specimen.id)) {
    return hybridImageCache.get(specimen.id);
  }

  // Prepare text for your DALL·E generation route
  const description = specimen.description
    || `A hybrid between ${specimen.parent1Id} and ${specimen.parent2Id}`;

  try {
    // Call your /api/generate-hybrid-image endpoint
    const response = await fetch('/api/generate-hybrid-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hybridName: specimen.name,
        hybridDescription: description,
        parent1Name: specimen.parent1?.name,
        parent2Name: specimen.parent2?.name,
        hybridityMode: specimen.hybridityMode || 'mild'
      }),
    });

    if (!response.ok) {
      throw new Error(`generate-hybrid-image API returned ${response.status}`);
    }

    const data = await response.json();

    // If we got back a remote imageUrl, store and return that
    if (data.success && data.imageUrl) {
      hybridImageCache.set(specimen.id, data.imageUrl);
      return data.imageUrl;
    }

    // Otherwise, fallback to local placeholder
    return '/specimens/placeholder.jpg';

  } catch (error) {
    console.error(`Error getting hybrid image for "${specimen.id}":`, error);
    return '/specimens/placeholder.jpg';
  }
}

/**
 * Simple async helper to unify hybrid vs. non-hybrid logic.
 * Example usage:  const url = await getSpecimenImagePathAsync(someSpecimen);
 */
export async function getSpecimenImagePathAsync(specimen) {
  return getHybridImageUrl(specimen);
}
