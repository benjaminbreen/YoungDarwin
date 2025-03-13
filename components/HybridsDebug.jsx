'use client';

import React, { useState, useEffect } from 'react';
import useGameStore from '../hooks/useGameStore';
import { hasGeneratedImage, getCachedImageUrl, generateHybridImage } from '../utils/hybridImageGenerator';

/**
 * HybridsDebug - A developer tool for monitoring hybrid species in the game
 * Enhanced with image thumbnails and manual generation capabilities
 */
export default function HybridsDebug() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHybrid, setSelectedHybrid] = useState(null);
  const [hybrids, setHybrids] = useState([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentGenerating, setCurrentGenerating] = useState(null);
  const [imageGenerationStatus, setImageGenerationStatus] = useState({});
  const specimenList = useGameStore(state => state.specimenList);
  
  // Find and filter hybrid specimens whenever the specimen list updates
  useEffect(() => {
    if (!specimenList) return;
    
    // Filter specimens to only show hybrids
    const foundHybrids = specimenList.filter(specimen => {
      if (!specimen) return false;
      
      // Check for hybrid indicators in multiple properties for robustness
      return (
        specimen.isHybrid === true || 
        (specimen.id && (specimen.id.includes('hybrid') || specimen.id.startsWith('hybrid_'))) ||
        (specimen.name && specimen.name.toLowerCase().includes('hybrid')) ||
        (specimen.parent1Id && specimen.parent2Id)
      );
    });
    
    console.log(`Found ${foundHybrids.length} hybrid specimens:`, foundHybrids);
    setHybrids(foundHybrids);
    
    // Check image status for all hybrids
    const statuses = {};
    foundHybrids.forEach(hybrid => {
      if (hybrid.id) {
        statuses[hybrid.id] = hasGeneratedImage(hybrid.id) ? 'generated' : 'pending';
      }
    });
    
    setImageGenerationStatus(prev => ({...prev, ...statuses}));
  }, [specimenList]);
  
  // Get the parent specimens for a hybrid
  const getParentSpecimens = (hybrid) => {
    if (!hybrid || !hybrid.parent1Id || !hybrid.parent2Id) return [null, null];
    
    const parent1 = specimenList.find(s => s.id === hybrid.parent1Id);
    const parent2 = specimenList.find(s => s.id === hybrid.parent2Id);
    
    return [parent1, parent2];
  };
  
  // Function to get a color based on scientific value
  const getScientificValueColor = (value) => {
    if (!value) return 'bg-gray-500';
    if (value >= 8) return 'bg-purple-500';
    if (value >= 6) return 'bg-amber-500';
    if (value >= 4) return 'bg-green-500';
    return 'bg-blue-500';
  };
  
  // Get image URL for a hybrid
  const getHybridImageUrl = (hybridId) => {
    if (!hybridId) return null;
    return getCachedImageUrl(hybridId);
  };
  
  // Handle manual image generation
  const handleGenerateImage = async (hybrid) => {
    if (!hybrid || isGeneratingImage) return;
    
    setIsGeneratingImage(true);
    setCurrentGenerating(hybrid.id);
    setImageGenerationStatus(prev => ({...prev, [hybrid.id]: 'generating'}));
    
    try {
      // Get parent information
      const [parent1, parent2] = getParentSpecimens(hybrid);
      
      // Manually trigger image generation
      const imageUrl = await generateHybridImage(hybrid, {
        parent1: parent1?.name,
        parent2: parent2?.name,
        hybridityMode: hybrid.hybridityType || 'mild',
        forceRegenerate: true // Force a new generation even if cached
      });
      
      // Update status based on result
      setImageGenerationStatus(prev => ({
        ...prev, 
        [hybrid.id]: imageUrl ? 'generated' : 'failed'
      }));
      
      // If we're generating for the selected hybrid, update the selection to refresh the view
      if (selectedHybrid?.id === hybrid.id) {
        setSelectedHybrid({...hybrid});
      }
      
    } catch (error) {
      console.error("Failed to generate image:", error);
      setImageGenerationStatus(prev => ({...prev, [hybrid.id]: 'failed'}));
    } finally {
      setIsGeneratingImage(false);
      setCurrentGenerating(null);
    }
  };
  
  return (
    <div className="fixed bottom-0 left-0 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1 rounded-tr-md flex items-center gap-1"
      >
        <span className="text-xs">🧬</span>
        Hybrids Debug {isOpen ? '▼' : '▲'}
      </button>
      
      {/* Debug panel */}
      {isOpen && (
        <div className="bg-gray-800 text-white p-3 w-80 h-96 overflow-auto rounded-tr-md shadow-xl">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold">Hybrid Species ({hybrids.length})</h3>
            
            {/* Clear selection */}
            {selectedHybrid && (
              <button
                onClick={() => setSelectedHybrid(null)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-2 py-1"
              >
                Back to List
              </button>
            )}
          </div>
          
          {selectedHybrid ? (
            // Hybrid detail view
            <div className="space-y-2 text-xs">
              <div className="border border-gray-700 p-3 rounded bg-gray-900">
                {/* Hybrid image (larger in detail view) */}
                <div className="mb-3 flex justify-center">
                  {getHybridImageUrl(selectedHybrid.id) ? (
                    <div className="relative w-full h-48 overflow-hidden rounded-md">
                      <img
                        src={getHybridImageUrl(selectedHybrid.id)}
                        alt={selectedHybrid.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/specimens/placeholder.jpg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/70 to-transparent"></div>
                      <div className="absolute bottom-2 left-2 text-white text-xs bg-gray-900/60 px-2 py-1 rounded">
                        {selectedHybrid.name}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gray-700 rounded-md flex items-center justify-center relative">
                      <div className="text-6xl mb-4">{getHybridEmoji(selectedHybrid)}</div>
                      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                        <span className="text-gray-300 text-xs">No image generated</span>
                        <button
                          onClick={() => handleGenerateImage(selectedHybrid)}
                          disabled={isGeneratingImage}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded disabled:opacity-50"
                        >
                          {imageGenerationStatus[selectedHybrid.id] === 'generating' ? 'Generating...' : 'Generate Image'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between mb-2">
                  <span className={`${getScientificValueColor(selectedHybrid.scientificValue)} text-white text-xs px-2 py-0.5 rounded-full`}>
                    Value: {selectedHybrid.scientificValue || '?'}
                  </span>
                  <span className="text-gray-400">
                    ID: {selectedHybrid.id}
                  </span>
                </div>
                
                <h4 className="text-white font-bold text-sm">{selectedHybrid.name}</h4>
                <p className="text-gray-400 italic mb-2">{selectedHybrid.latin}</p>
                
                <div className="border-t border-gray-700 my-2 pt-2">
                  <p className="text-gray-300">{selectedHybrid.description}</p>
                </div>
                
                {/* Parent information */}
                <div className="border-t border-gray-700 my-2 pt-2">
                  <h5 className="text-gray-300 font-medium mb-1">Hybrid Parentage:</h5>
                  {(() => {
                    const [parent1, parent2] = getParentSpecimens(selectedHybrid);
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-950 p-1 rounded">
                          <p className="font-medium text-gray-300">{parent1?.name || 'Unknown'}</p>
                          <p className="text-gray-400 text-[10px]">{parent1?.latin || ''}</p>
                        </div>
                        <div className="bg-gray-950 p-1 rounded">
                          <p className="font-medium text-gray-300">{parent2?.name || 'Unknown'}</p>
                          <p className="text-gray-400 text-[10px]">{parent2?.latin || ''}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Details section */}
                {selectedHybrid.details && selectedHybrid.details.length > 0 && (
                  <div className="border-t border-gray-700 my-2 pt-2">
                    <h5 className="text-gray-300 font-medium mb-1">Notable Features:</h5>
                    <ul className="list-disc list-inside text-gray-400">
                      {selectedHybrid.details.map((detail, idx) => (
                        <li key={idx} className="text-[10px] mb-1">{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Additional information */}
                <div className="border-t border-gray-700 my-2 pt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="text-gray-400">Habitat: <span className="text-gray-300">{selectedHybrid.habitat || 'Unknown'}</span></p>
                    <p className="text-gray-400">Order: <span className="text-gray-300">{selectedHybrid.order || 'Unknown'}</span></p>
                    <p className="text-gray-400">Sub-order: <span className="text-gray-300">{selectedHybrid.sub_order || 'Unknown'}</span></p>
                    <p className="text-gray-400">Danger: <span className="text-gray-300">{selectedHybrid.danger || '0'}</span></p>
                  </div>
                  <div>
                    <p className="text-gray-400">Collected: <span className="text-gray-300">{selectedHybrid.collected ? 'Yes' : 'No'}</span></p>
                    <p className="text-gray-400">Time: <span className="text-gray-300">{selectedHybrid.timeofday || 'Diurnal'}</span></p>
                    <p className="text-gray-400">Hybrid Ease: <span className="text-gray-300">{selectedHybrid.hybrid_ease || '?'}</span></p>
                    <p className="text-gray-400">Hybrid Temp: <span className="text-gray-300">{selectedHybrid.hybrid_temperature || '?'}</span></p>
                  </div>
                </div>
                
                {/* Raw data toggle */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-[10px]">Raw Data</summary>
                  <pre className="text-gray-400 mt-1 whitespace-pre-wrap break-all text-[10px] bg-gray-950 p-1 rounded">
                    {JSON.stringify(selectedHybrid, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ) : (
            // Hybrid list view
            <div className="space-y-2 text-xs">
              {hybrids.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-2xl mb-2">🧬</div>
                  <p>No hybrid species generated yet.</p>
                  <p className="text-[10px] mt-2">Enable hybrid species in the title screen to see them here.</p>
                </div>
              ) : (
                hybrids.map((hybrid, index) => {
                  const imageUrl = getHybridImageUrl(hybrid.id);
                  const imageStatus = imageGenerationStatus[hybrid.id] || 'pending';
                  const isGeneratingThis = currentGenerating === hybrid.id;
                  
                  return (
                    <div 
                      key={index} 
                      className="border border-gray-700 p-2 rounded bg-gray-900 hover:bg-gray-800 cursor-pointer"
                    >
                      <div className="flex items-start space-x-2">
                        {/* Thumbnail */}
                        <div 
                          className="w-16 h-16 bg-gray-800 rounded flex-shrink-0 overflow-hidden relative"
                          onClick={() => setSelectedHybrid(hybrid)}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={hybrid.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/specimens/placeholder.jpg';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl">{getHybridEmoji(hybrid)}</span>
                            </div>
                          )}
                          
                          {imageStatus === 'generating' && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            </div>
                          )}
                        </div>
                        
                        {/* Info */}
                        <div 
                          className="flex-1"
                          onClick={() => setSelectedHybrid(hybrid)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`${getScientificValueColor(hybrid.scientificValue)} text-white text-xs px-1 rounded`}>
                              Value: {hybrid.scientificValue || '?'}
                            </span>
                            <span className="text-gray-400 text-[10px]">
                              {hybrid.collected ? 'Collected' : 'Not Collected'}
                            </span>
                          </div>
                          <div className="text-gray-300 font-medium">{hybrid.name}</div>
                          <div className="text-gray-400 italic text-[10px]">{hybrid.latin}</div>
                          
                          {/* Parentage info */}
                          {hybrid.parent1Id && hybrid.parent2Id && (
                            <div className="mt-1 text-[10px] text-gray-400">
                              Hybrid of: {(() => {
                                const [parent1, parent2] = getParentSpecimens(hybrid);
                                return (
                                  <>
                                    <span className="text-gray-300">{parent1?.name || 'Unknown'}</span>
                                    {' × '}
                                    <span className="text-gray-300">{parent2?.name || 'Unknown'}</span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Image generation button */}
                      {!imageUrl && (
                        <div className="mt-1 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateImage(hybrid);
                            }}
                            disabled={isGeneratingImage}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
                          >
                            {isGeneratingThis ? 'Generating...' : 'Generate Image'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to generate an appropriate emoji for a hybrid
function getHybridEmoji(hybrid) {
  if (!hybrid) return '🧬';
  
  // First try to determine from parent IDs
  if (hybrid.parent1Id && hybrid.parent2Id) {
    const parent1Id = hybrid.parent1Id.toLowerCase();
    const parent2Id = hybrid.parent2Id.toLowerCase();
    
    // Birds
    if ((parent1Id.includes('finch') || parent2Id.includes('finch')) ||
        (parent1Id.includes('bird') || parent2Id.includes('bird')) ||
        (parent1Id.includes('booby') || parent2Id.includes('booby')) ||
        (parent1Id.includes('frigate') || parent2Id.includes('frigate')) ||
        (parent1Id.includes('mocking') || parent2Id.includes('mocking'))) {
      return '🐦';
    }
    
    // Reptiles
    if ((parent1Id.includes('tortoise') || parent2Id.includes('tortoise')) ||
        (parent1Id.includes('turtle') || parent2Id.includes('turtle'))) {
      return '🐢';
    }
    
    if ((parent1Id.includes('iguana') || parent2Id.includes('iguana')) ||
        (parent1Id.includes('lizard') || parent2Id.includes('lizard'))) {
      return '🦎';
    }
    
    // Sea life
    if ((parent1Id.includes('fish') || parent2Id.includes('fish'))) {
      return '🐠';
    }
    
    if ((parent1Id.includes('crab') || parent2Id.includes('crab'))) {
      return '🦀';
    }
    
    if ((parent1Id.includes('shell') || parent2Id.includes('shell')) ||
        (parent1Id.includes('snail') || parent2Id.includes('snail'))) {
      return '🐚';
    }
    
    // Plants
    if ((parent1Id.includes('plant') || parent2Id.includes('plant')) ||
        (parent1Id.includes('cactus') || parent2Id.includes('cactus'))) {
      return '🌱';
    }
    
    // Minerals
    if ((parent1Id.includes('rock') || parent2Id.includes('rock')) ||
        (parent1Id.includes('mineral') || parent2Id.includes('mineral')) ||
        (parent1Id.includes('olivine') || parent2Id.includes('olivine')) ||
        (parent1Id.includes('basalt') || parent2Id.includes('basalt'))) {
      return '🪨';
    }
  }
  
  // If we can't determine from parent IDs, try specimen name
  const name = (hybrid.name || '').toLowerCase();
  
  if (name.includes('finch') || name.includes('bird') || 
      name.includes('booby') || name.includes('frigate') ||
      name.includes('mocking')) {
    return '🐦';
  }
  
  if (name.includes('tortoise') || name.includes('turtle')) {
    return '🐢';
  }
  
  if (name.includes('iguana') || name.includes('lizard')) {
    return '🦎';
  }
  
  if (name.includes('fish')) {
    return '🐠';
  }
  
  if (name.includes('crab')) {
    return '🦀';
  }
  
  if (name.includes('shell') || name.includes('snail')) {
    return '🐚';
  }
  
  if (name.includes('plant') || name.includes('cactus')) {
    return '🌱';
  }
  
  // Default hybrid emoji
  return '🧬';
}