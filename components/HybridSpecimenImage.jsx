'use client';

import React, { useState, useEffect } from 'react';
import {
  generateHybridImage,
  hasGeneratedImage,
  getCachedImageUrl
} from '../utils/hybridImageGenerator';

/**
 * Component that displays images for hybrid specimens
 * Handles DALL-E image generation and fallbacks
 */
export default function HybridSpecimenImage({
  specimen,
  className = "",
  fallbackIcon = '🧬',
  onImageLoaded = null,
  size = "medium",
  disableGeneration = false
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [generationAttempted, setGenerationAttempted] = useState(false);

  // Determine size class
  const sizeClasses = {
    small: "w-12 h-12",
    medium: "w-24 h-24",
    large: "w-40 h-40",
    full: "w-full h-full"
  };
  const sizeClass = sizeClasses[size] || sizeClasses.medium;

  // On mount, load or generate the image if needed
  useEffect(() => {
    if (!specimen || disableGeneration || imageUrl) return;

    // If we have a cached URL already, just use it
    if (specimen.id && hasGeneratedImage(specimen.id)) {
      const cachedUrl = getCachedImageUrl(specimen.id);
      if (cachedUrl) {
        setImageUrl(cachedUrl);
        if (onImageLoaded) onImageLoaded(cachedUrl);
        return;
      }
    }

    // If it's a hybrid but not already generated, trigger generation
    if (specimen.isHybrid && !generationAttempted) {
      generateImage();
    }
  }, [specimen, disableGeneration, imageUrl, generationAttempted]);

  // Actually generate the hybrid image (fetch from /api/generate-hybrid-image)
  const generateImage = async () => {
    if (!specimen?.isHybrid || isLoading || generationAttempted) return;

    setIsLoading(true);
    setImageError(false);
    setGenerationAttempted(true);

    try {
      // For clarity, unify to 'hybridityMode' if your code uses that:
      const hybridityMode = specimen.hybridityMode || 'mild';

      const url = await generateHybridImage(specimen, {
        parent1: specimen.parent1 || null,
        parent2: specimen.parent2 || null,
        hybridityMode
      });

      if (url) {
        setImageUrl(url);
        if (onImageLoaded) onImageLoaded(url);
      } else {
        console.warn("No URL returned; using fallback/emoji");
        setImageError(true);
      }
    } catch (error) {
      console.error("Failed to generate hybrid image:", error);
      setImageError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // If the actual <img> fails to load, revert to fallback
  const handleImageError = () => {
    console.warn("Error loading hybrid image for", specimen?.name);
    setImageError(true);
    setImageUrl(null);
  };

  // Simple function to pick an emoji if no image
  const getEmojiForSpecimen = () => {
    if (!specimen) return fallbackIcon;
    if (specimen.emoji) return specimen.emoji; // if your data has an .emoji field

    const name = (specimen.name || '').toLowerCase();
    const id   = (specimen.id   || '').toLowerCase();

    if (name.includes('tortoise') || id.includes('tortoise')) return '🐢';
    if (name.includes('finch') || id.includes('finch') || name.includes('bird')) return '🐦';
    if (name.includes('iguana') || id.includes('iguana') || name.includes('lizard')) return '🦎';
    if (name.includes('crab'))  return '🦀';
    if (name.includes('fish'))  return '🐠';
    if (name.includes('plant') || name.includes('cactus')) return '🌱';

    // default for hybrid
    return fallbackIcon;
  };

  // Some optional logic for combining parent emojis, etc.
  const mainEmoji = getEmojiForSpecimen();
  const showEmojiFallback = !imageUrl || imageError;

  return (
    <div className={`relative ${className} bg-amber-50 overflow-hidden rounded-lg ${sizeClass}`}>
      {/* DALL-E Generated Image (if available) */}
      {imageUrl && !imageError && (
        <img
          src={imageUrl}
          alt={`Hybrid specimen: ${specimen?.name || 'Unknown'}`}
          className="w-full h-full object-cover"
          onError={handleImageError}
        />
      )}

      {/* If no image or it errored out, show an emoji fallback */}
      {showEmojiFallback && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-5xl">{mainEmoji}</div>
        </div>
      )}

      {/* Simple loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
          <div className="animate-pulse flex flex-col items-center">
            <div className="text-2xl mb-1">🧬</div>
            <div className="text-xs text-amber-700">Generating...</div>
          </div>
        </div>
      )}

      {/* Show "Retry" if it failed once and generation isn't disabled */}
      {showEmojiFallback && !isLoading && !disableGeneration && generationAttempted && (
        <button
          onClick={() => {
            setGenerationAttempted(false);
            generateImage();
          }}
          className="absolute bottom-1 right-1 bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded-md z-20 hover:bg-amber-700 transition-colors"
          title="Retry image generation"
        >
          Retry
        </button>
      )}
    </div>
  );
}
