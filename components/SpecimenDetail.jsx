'use client';

import React, { useState, useEffect } from 'react';
import { tools } from '../data/tools';
import HybridSpecimenImage from './HybridSpecimenImage';

export default function SpecimenDetail({ 
  isOpen, 
  onClose, 
  specimen, 
  toolName, 
  toolAction,
  onSubmit 
}) {
  const [userInput, setUserInput] = useState('');
  const [showDetailedView, setShowDetailedView] = useState(false);
  
  if (!isOpen || !specimen) return null;
  
  // Get specimen icon based on type
  const getSpecimenIcon = (id) => {
    switch(id) {
      case 'floreana_giant_tortoise': return '🐢';
      case 'eastern_santa_cruz_tortoise': return '🐢';
      case 'galapagosmockingbird': return '🐦';
      case 'floreanamockingbird': return '🐦';
      case 'largegroundfinch': return '🐤';
      case 'mediumgroundfinch': return '🐤';
      case 'marineiguana': return '🦎';
      case 'terrestrialiguana': return '🦎';
      case 'cactus': return '🌵';
      case 'lavaLizard': return '🦎';
      case 'crab': return '🦀';
      case 'sallyLightfoot': return '🦀';
      case 'seaLion': return '🦭';
      case 'booby': return '🐦';
      case 'coralFragment': return '🪸';
      case 'seashell': return '🐚';
      case 'volcanoRock': return '🪨';
      case 'basalt': return '🪨';
      case 'frigatebird': return '🕊️';
      case 'barnacle': return '🐌';
      case 'mangrove': return '🌱';
      default: 
        // Check if this is a hybrid ID
        if (id && typeof id === 'string' && id.startsWith('hybrid_')) {
          return '🧬';
        }
        return '🔍';
    }
  };
  
  // Find the tool details from the tools array
  const getToolDetails = () => {
    return tools.find(t => t.name === toolName) || { 
      id: 'default',
      icon: '🔍', 
      description: 'Examine the specimen',
      detailedDescription: 'A scientific tool for specimen examination',
      usage: 'Used for detailed scientific examination'
    };
  };
  
  const toolDetails = getToolDetails();
  
  // Generate prompt based on tool
  const getPrompt = () => {
    switch(toolName) {
      case 'Visual Observation':
        return `You have selected ${toolName}. Is there a specific aspect of this specimen you would like to look at more carefully?`;
      case 'Hand Lens':
        return `You have selected ${toolName}. Which minute details would you like to examine more closely?`;
      case 'Dissection Kit':
        return `You have selected ${toolName}. Please specify what you have in mind. This will harm the specimen. Are you sure you want to proceed?`;
      case 'Field Notes':
        return `You have selected ${toolName}. What specific observations would you like to document about this specimen?`;
      case 'Sketch Pad':
        return `You have selected ${toolName}. Which features of the specimen would you like to sketch in detail?`;
      case 'Calipers':
        return `You have selected ${toolName}. Which dimensions of the specimen would you like to measure?`;
      case 'Sample Collection':
        return `You have selected ${toolName}. Please specify what sample you wish to collect. Depending on the nature of your choice, taking a sample may harm the animal. Are you sure you want to proceed?`;
      case 'Comparative Analysis':
        return `You have selected ${toolName}. What specific comparisons would you like to make with other specimens or known species?`;
      default:
        return `You have selected ${toolName}. What would you like to do with this specimen?`;
    }
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim()) {
      onSubmit(userInput, toolName, specimen.id);
      setUserInput('');
      onClose();
    }
  };

  // Get specimen image path for normal specimens
  const getSpecimenImagePath = () => {
    // For regular specimens
    if (!specimen.isHybrid) {
      const imageName = specimen.id.toLowerCase();
      return `/specimens/${imageName}.jpg`;
    }
    // Hybrid specimens will use the HybridSpecimenImage component instead
    return null;
  };

  // Fallback handling for image loading errors
  const handleImageError = (e) => {
    e.target.onerror = null; // Prevent infinite error loops
    e.target.src = `/specimens/placeholder.jpg`; // Use placeholder
    if (!e.target.classList.contains('emoji-fallback')) {
      e.target.style.display = 'none';
      e.target.nextElementSibling.style.display = 'block';
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-darwin-light rounded-lg border border-amber-300 shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-amber-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-darwin-dark font-serif">{toolName}: {specimen.name}</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Specimen image with thumbnail */}
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 flex flex-col items-center justify-center">
            <div 
              className="w-40 h-40 rounded-full overflow-hidden border-4 border-amber-300 shadow-md cursor-pointer transition-transform hover:scale-105"
              onClick={() => setShowDetailedView(true)}
              title="Click for detailed view"
            >
              {specimen.isHybrid ? (
                <HybridSpecimenImage 
                  specimen={specimen}
                  className="w-full h-full"
                  size="full"
                  fallbackIcon={getSpecimenIcon(specimen.id)}
                />
              ) : (
                <>
                  <img 
                    src={getSpecimenImagePath()} 
                    alt={specimen.name}
                    className="w-full h-full object-cover"
                    onError={handleImageError}
                  />
                  <div className="text-8xl hidden emoji-fallback flex items-center justify-center h-full">
                    {getSpecimenIcon(specimen.id)}
                  </div>
                </>
              )}
            </div>
            
            <div className="text-xs text-center mt-2 text-amber-800 italic">Click for detailed view</div>
            <div className="text-2xl mt-4 text-center">
              {/* Show hybrid badge for hybrid specimens */}
              {specimen.isHybrid ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-lg">🧬</span>
                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">Hybrid</span>
                </span>
              ) : (
                <span>{getSpecimenIcon(specimen.id)}</span>
              )}
            </div>
          </div>
          
          {/* Specimen details */}
          <div>
            <h3 className="text-lg font-bold text-amber-900 mb-1">{specimen.name}</h3>
            <p className="text-sm italic text-amber-700 font-serif mb-3">{specimen.latin}</p>
            <p className="text-sm mb-2"><strong>Typical habitat:</strong> {specimen.habitat}</p>
            <p className="mb-4">{specimen.description}</p>
            
            {/* Show parent species for hybrids */}
            {specimen.isHybrid && specimen.parent1Id && specimen.parent2Id && (
              <div className="mb-4 p-2 bg-amber-50 border border-amber-100 rounded-md">
                <p className="text-sm font-medium text-amber-800">Hybrid Species</p>
                <p className="text-xs">
                  A hybrid of <span className="font-medium">{specimen.parent1Id?.replace(/_/g, ' ')}</span> and <span className="font-medium">{specimen.parent2Id?.replace(/_/g, ' ')}</span>
                </p>
              </div>
            )}
            
            {specimen.observations && specimen.observations.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-sm mb-2 text-amber-800">Previous Observations:</h4>
                <ul className="text-sm text-gray-700 space-y-1.5 pl-4">
                  {specimen.observations.map((obs, index) => (
                    <li key={index} className="list-disc">
                      {obs.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {specimen.memoryText && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-inner">
                <h4 className="font-medium text-amber-800 flex items-center mb-1 text-sm">
                  <span className="mr-1">💭</span>
                  Darwin's Thoughts
                </h4>
                <p className="italic text-gray-700 text-sm">{specimen.memoryText}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Tool information section */}
        <div className="px-6 pt-0 pb-6">
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-4 shadow-inner">
            <div className="flex flex-col sm:flex-row">
              <div className="shrink-0 sm:mr-4 mb-3 sm:mb-0 flex justify-center">
                <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-md overflow-hidden border-2 border-amber-300 shadow-sm">
                  <img 
                    src={`/tools/${toolDetails.id || 'default'}.jpg`} 
                    alt={toolName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/tools/default.jpg';
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-amber-900 border-b border-amber-200 pb-1 mb-2 flex items-center">
                  <span className="mr-2">{toolDetails.icon || '🔍'}</span>
                  {toolName}
                </h4>
                <p className="text-sm text-gray-700 mb-2">
                  {toolDetails.detailedDescription || toolDetails.description}
                </p>
                <p className="text-xs text-amber-800 italic">
                  <span className="font-medium">Usage:</span> {toolDetails.usage || 'For detailed examination of specimens'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* User input section */}
        <div className="p-6 border-t border-amber-200 bg-amber-50">
          <p className="mb-4" dangerouslySetInnerHTML={{ __html: getPrompt() }}></p>
          
          <form onSubmit={handleSubmit}>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className="w-full p-3 border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[100px]"
              placeholder="Describe what you want Darwin to do..."
            ></textarea>
            
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-amber-300 rounded-lg mr-2 hover:bg-amber-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent"
                disabled={!userInput.trim()}
              >
                Proceed
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Detailed specimen view popup */}
      {showDetailedView && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-4 border-b border-amber-200 flex justify-between items-center bg-amber-50">
              <h2 className="text-2xl font-bold text-darwin-dark font-serif">
                {specimen.name}
                {specimen.isHybrid && (
                  <span className="ml-2 text-sm bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                    Hybrid Species
                  </span>
                )}
              </h2>
              <button 
                onClick={() => setShowDetailedView(false)}
                className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <div className="flex flex-col lg:flex-row">
              {/* Large specimen image */}
              <div className="lg:w-3/5 h-[40vh] lg:h-[75vh] relative overflow-hidden">
                {specimen.isHybrid ? (
                  <div className="w-full h-full relative">
                    <HybridSpecimenImage 
                      specimen={specimen} 
                      className="w-full h-full"
                      size="full"
                    />
                  </div>
                ) : (
                  <div 
                    className="absolute inset-0 bg-cover bg-center shadow-inner"
                    style={{ 
                      backgroundImage: `url(${getSpecimenImagePath()})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    {/* Fallback for image error */}
                    <div className="hidden absolute inset-0 flex items-center justify-center bg-amber-50">
                      <span className="text-[15rem] opacity-50">{getSpecimenIcon(specimen.id)}</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Specimen details panel */}
              <div className="lg:w-2/5 p-6 bg-darwin-light overflow-y-auto">
                <div className="prose max-w-none font-serif">
                  <h3 className="text-xl font-medium mb-2 border-b border-amber-200 pb-2">{specimen.name}</h3>
                  <p className="italic text-amber-800 mb-4">{specimen.latin}</p>
                  
                  {/* Hybrid parentage section */}
                  {specimen.isHybrid && specimen.parent1Id && specimen.parent2Id && (
                    <div className="mb-4 p-3 bg-amber-50/60 rounded-md border border-amber-200">
                      <h4 className="font-medium text-amber-900 mb-1">Hybrid Parentage</h4>
                      <p className="text-sm">
                        This specimen is a hybrid of <strong>{specimen.parent1Id.replace(/_/g, ' ')}</strong> and <strong>{specimen.parent2Id.replace(/_/g, ' ')}</strong>.
                      </p>
                      {specimen.hybridityType && (
                        <p className="text-xs text-amber-700 mt-1">
                          Hybridity Type: {specimen.hybridityType === 'extreme' ? 'Extreme (cross-order)' : 'Mild (same sub-order)'}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="font-medium text-amber-900">Typical habitat</h4>
                    <p>{specimen.habitat}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="font-medium text-amber-900">Description</h4>
                    <p>{specimen.description}</p>
                  </div>
                  
                  {specimen.details && specimen.details.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-medium text-amber-900 mb-2">Notable Features</h4>
                      <ul className="list-disc pl-5 space-y-1 text-gray-800">
                        {specimen.details.map((detail, idx) => (
                          <li key={idx}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {specimen.memoryText && (
                    <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-inner">
                      <h4 className="font-medium text-amber-800 flex items-center mb-2">
                        <span className="mr-2">💭</span>
                        Darwin's Thoughts
                      </h4>
                      <p className="italic text-gray-700">{specimen.memoryText}</p>
                    </div>
                  )}

                  {specimen.observations && specimen.observations.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium text-amber-900 mb-2">Your Observations</h4>
                      <ul className="list-disc pl-5 space-y-1 text-gray-800">
                        {specimen.observations.map((obs, idx) => (
                          <li key={idx}>{obs.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-amber-200 bg-amber-50 text-center">
              <button
                onClick={() => setShowDetailedView(false)}
                className="px-6 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors shadow-md"
              >
                Return to Tool Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}