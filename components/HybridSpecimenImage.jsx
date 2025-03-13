'use client';

import React, { useState, useEffect } from 'react';
import { generateHybridImage, hasGeneratedImage, getCachedImageUrl } from '../utils/hybridImageGenerator';

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
  // State for image loading and URL
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [isImageGenerated, setIsImageGenerated] = useState(false);
  const [generationAttempted, setGenerationAttempted] = useState(false);
  
  // Determine size class
  const sizeClasses = {
    small: "w-12 h-12",
    medium: "w-24 h-24", 
    large: "w-40 h-40",
    full: "w-full h-full"
  };
  const sizeClass = sizeClasses[size] || sizeClasses.medium;
  
  // Load a cached image or generate a new one when component mounts
  useEffect(() => {
    // Skip if no specimen, if generation is disabled, or if we already have an image
    if (!specimen || disableGeneration || imageUrl) {
      return;
    }
    
    // Check if we already have a generated image
    if (specimen.id && hasGeneratedImage(specimen.id)) {
      const cachedUrl = getCachedImageUrl(specimen.id);
      if (cachedUrl) {
        setImageUrl(cachedUrl);
        setIsImageGenerated(true);
        if (onImageLoaded) {
          onImageLoaded(cachedUrl);
        }
        return;
      }
    }
    
    // Generate a new image only for hybrid specimens
    if (specimen.isHybrid && !generationAttempted) {
      generateImage();
    }
  }, [specimen, disableGeneration, imageUrl, generationAttempted]);
  
  // Function to generate an image using DALL-E
  const generateImage = async () => {
    if (!specimen || !specimen.isHybrid || isLoading || generationAttempted) {
      return;
    }
    
    setIsLoading(true);
    setImageError(false);
    setGenerationAttempted(true);
    
    try {
      // Get parent information from game data if possible
      const parent1 = specimen.parent1 || null;
      const parent2 = specimen.parent2 || null;
      
      // Generate the image
      const url = await generateHybridImage(specimen, {
        parent1,
        parent2,
        hybridityMode: specimen.hybridityType || 'mild'
      });
      
      // Update state with the new image
      if (url) {
        setImageUrl(url);
        setIsImageGenerated(true);
        
        // Call the onImageLoaded callback if provided
        if (onImageLoaded) {
          onImageLoaded(url);
        }
      } else {
        // Handle null URL (failed generation) gracefully
        setImageError(true);
        console.log("Image generation returned null, using fallback");
      }
    } catch (error) {
      console.error("Failed to generate hybrid image:", error);
      setImageError(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle image load errors
  const handleImageError = () => {
    console.warn("Error loading hybrid image for", specimen?.name);
    setImageError(true);
    setImageUrl(null);
  };
  
  // Helper function to get an appropriate emoji for the specimen type
  const getEmojiForSpecimen = () => {
    if (!specimen) return fallbackIcon;
    
    // Specimen might have an emoji property already
    if (specimen.emoji) return specimen.emoji;
    
    // Try to determine type from name or ID
    const name = (specimen.name || '').toLowerCase();
    const id = (specimen.id || '').toLowerCase();
    
    if (name.includes('tortoise') || id.includes('tortoise')) return '🐢';
    if (name.includes('finch') || id.includes('finch') || name.includes('bird')) return '🐦';
    if (name.includes('iguana') || id.includes('iguana')) return '🦎';
    if (name.includes('lizard') || id.includes('lizard')) return '🦎';
    if (name.includes('crab') || id.includes('crab')) return '🦀';
    if (name.includes('fish') || id.includes('fish')) return '🐠';
    if (name.includes('plant') || id.includes('plant') || 
        name.includes('cactus') || id.includes('cactus')) return '🌱';
    
    // Default emoji for hybrid
    return fallbackIcon;
  };
  
  // Get parent emojis if available
  const getParentEmojis = () => {
    if (!specimen || !specimen.parent1Id || !specimen.parent2Id) return null;
    
    const parent1Emoji = getEmojiForParent(specimen.parent1Id);
    const parent2Emoji = getEmojiForParent(specimen.parent2Id);
    
    if (parent1Emoji && parent2Emoji) {
      return { parent1: parent1Emoji, parent2: parent2Emoji };
    }
    
    return null;
  };
  
  const getEmojiForParent = (parentId) => {
    if (!parentId) return null;
    
    // Simple ID-based emoji mapping
    if (parentId.includes('tortoise')) return '🐢';
    if (parentId.includes('finch') || parentId.includes('bird') || 
        parentId.includes('mockingbird')) return '🐦';
    if (parentId.includes('iguana')) return '🦎';
    if (parentId.includes('lizard')) return '🦎';
    if (parentId.includes('crab')) return '🦀';
    if (parentId.includes('fish')) return '🐠';
    if (parentId.includes('plant') || parentId.includes('cactus')) return '🌱';
    
    return null;
  };
  
  const parentEmojis = getParentEmojis();
  const mainEmoji = getEmojiForSpecimen();
  
  // Should we display emoji fallback?
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
      
      {/* Fallback: Emoji Representation */}
      {showEmojiFallback && (
        <div className="absolute inset-0 flex items-center justify-center">
          {parentEmojis ? (
            // Creative parent combination display
            <div className="relative text-center">
              <div className="text-5xl relative">
                <span className="absolute -left-4 -top-2 transform -rotate-12 opacity-70">
                  {parentEmojis.parent1}
                </span>
                <span className="absolute -right-4 -top-2 transform rotate-12 opacity-70">
                  {parentEmojis.parent2}
                </span>
                <span className="relative z-10">{mainEmoji}</span>
              </div>
              <div className="text-xs text-amber-800 mt-2 font-medium">
                Hybrid Specimen
              </div>
            </div>
          ) : (
            // Simple emoji display
            <div className="text-5xl">{mainEmoji}</div>
          )}
        </div>
      )}
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
          <div className="animate-pulse flex flex-col items-center">
            <div className="text-2xl mb-1">🧬</div>
            <div className="text-xs text-amber-700">Generating...</div>
          </div>
        </div>
      )}
      
      {/* Hybrid Badge */}
     
      
      {/* Generate Button (shown when image failed and we haven't tried generation yet) */}
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