'use client';

import React, { useEffect, useState } from 'react';

export default function CollectionResultPopup({ 
  isOpen, 
  onClose, 
  result, 
  specimenName, 
  method,
  onShowSpecimenDetail,
  specimenId 
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Auto-close after 10 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  // Reset states when popup opens
  useEffect(() => {
    if (isOpen) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSuccess = result?.success;

  // Format specimen ID to match file name
  const getSpecimenImagePath = () => {
    if (!specimenId) return '/specimens/placeholder.jpg';
    
    // Convert camelCase to lowercase (e.g., 'marineIguana' -> 'marineiguana')
    const formattedId = specimenId.toLowerCase();
    
    // Check for special case mappings
    const specialCases = {
      'eastern_santa_cruz_tortoise': 'eastern_santa_cruz_tortoise',
      'floreana_giant_tortoise': 'floreana_giant_tortoise',
      'galapagos_mockingbird': 'mockingbird',
      'floreana_mockingbird': 'mockingbird',
      'iguana': 'iguana',
      'medium_ground_finch': 'finch',
      'large_ground_finch': 'finch',
      'cactus': 'cactus',
      'lavaliza': 'lavaLizard',
      'sallylightfoot': 'sallyLightfoot',
      'sealion': 'seaLion',
      'booby': 'booby',
      'coralfragment': 'coralFragment',
      'seashell': 'seashell',
      'volcanorock': 'volcanoRock',
      'frigatebird': 'frigatebird',
      'barnacle': 'barnacle',
      'mangrove': 'mangrove'
    };

    // Specimen file paths in the screenshot are lowercase versions of the IDs
    return `/specimens/${specialCases[formattedId] || formattedId}.jpg`;
  };

  const handleContinue = () => {
    onClose();
    
    if (isSuccess && onShowSpecimenDetail) {
      setTimeout(() => {
        onShowSpecimenDetail();
      }, 100);
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    console.error(`Failed to load image for specimen: ${specimenId} at path: ${getSpecimenImagePath()}`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl p-8 max-w-md w-full ${
        isSuccess 
          ? 'border-4 border-green-200 shadow-green-600/20 shadow-lg' 
          : 'border-4 border-red-200 shadow-red-600/20 shadow-lg'
      }`}>
        <div className="text-center mb-6 relative">
          {/* Top decorative element */}
          <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 w-24 h-1 ${
            isSuccess ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          
          {/* Specimen Image Thumbnail */}
          <div className={`relative mx-auto w-32 h-32 rounded-full overflow-hidden 
            ${isSuccess 
              ? 'border-4 border-green-400 shadow-lg shadow-green-300/50' 
              : 'border-4 border-red-400 shadow-md shadow-red-300/50'
            } mb-4`}
          >
            <img 
              src={getSpecimenImagePath()}
              alt={specimenName} 
              className={`w-full h-full object-cover transition-opacity duration-500 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
            
            {/* Loading state or fallback */}
            {(!imageLoaded || imageError) && (
              <div className="absolute inset-0 flex items-center justify-center bg-amber-50">
                {imageError ? (
                  <div className="text-4xl">{getSpecimenEmoji(specimenId)}</div>
                ) : (
                  <div className="animate-pulse flex space-x-4">
                    <div className="w-full h-full bg-gray-200 rounded"></div>
                  </div>
                )}
              </div>
            )}
            
            {/* Success effect */}
            {isSuccess && (
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-green-500 opacity-20"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/70 rounded-full p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
            
            {/* Failure effect */}
            {!isSuccess && (
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-red-500 opacity-20"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/70 rounded-full p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <h2 className={`text-3xl font-bold font-serif ${
            isSuccess ? 'text-green-700' : 'text-red-700'
          }`}>
            {isSuccess ? 'Collection Successful!' : 'Collection Failed'}
          </h2>
          
          {/* Method icon */}
          <div className="flex justify-center mt-2 mb-4">
            <span className="inline-block px-3 py-1 text-sm rounded-full 
              bg-amber-100 text-amber-800 border border-amber-300">
              {getMethodIcon(method)} {formatMethodName(method)}
            </span>
          </div>
        </div>
        
        {/* Success or Failure Message */}
        {isSuccess ? (
          <div className="text-center mb-6">
            <p className="text-gray-700 text-lg leading-relaxed">
              You successfully collected the <span className="font-bold text-green-700">{specimenName}</span>.
            </p>
            <p className="text-gray-600 mt-2">
              This specimen is now available in your collection for detailed examination.
            </p>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-center text-gray-700 text-lg mb-3">
              Your attempt to collect the <span className="font-bold text-red-700">{specimenName}</span> was unsuccessful.
            </p>
            
            {result?.reason && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                <p className="text-md text-gray-700 italic">
                  {result.reason}
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Continue Button */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            className={`px-8 py-3 rounded-md font-medium text-white shadow-md transition-all transform hover:translate-y-[-2px] ${
              isSuccess 
                ? 'bg-green-600 hover:bg-green-700 shadow-green-500/30' 
                : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'
            }`}
          >
            Continue
          </button>
        </div>
        
        {/* Additional info/tip */}
        <div className="mt-4 text-xs text-center text-gray-500">
          {isSuccess 
            ? "Tip: Use your scientific tools to study this specimen in detail." 
            : "Tip: Different collection methods work better for different types of specimens."}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getSpecimenEmoji(specimenId) {
  // Return an appropriate emoji based on specimen type
  const emojiMap = {
 'floreana_giant_tortoise':  '🐢',
    'eastern_santa_cruz_tortoise': '🐢',
    'mockingbird': '🐦',
    'iguana': '🦎',
    'large_ground_finch': '🐦',
    'medium_ground_finch': '🐦',
    'cactus': '🌵',
    'lavaLizard': '🦎',
    'sallyLightfoot': '🦀',
    'seaLion': '🦭',
    'booby': '🐦',
    'coralFragment': '🪸',
    'seashell': '🐚',
    'volcanoRock': '🪨',
    'frigatebird': '🕊️',
    'barnacle': '🐌',
    'mangrove': '🌱'
  };
  
  return emojiMap[specimenId] || '🔍';
}

function getMethodIcon(methodName) {
  // Return an appropriate icon based on collection method
  if (!methodName) return '🔍';
  
  const lowerMethod = methodName.toLowerCase();
  
  if (lowerMethod.includes('shotgun')) return '💥';
  if (lowerMethod.includes('net')) return '🦋';
  if (lowerMethod.includes('snare')) return '🔗';
  if (lowerMethod.includes('hammer') || lowerMethod.includes('chisel')) return '⛏️';
  if (lowerMethod.includes('hand')) return '👐';
  
  return '🔍';
}

function formatMethodName(methodName) {
  if (!methodName) return 'Method';
  
  // Capitalize first letter
  return methodName.charAt(0).toUpperCase() + methodName.slice(1);
}