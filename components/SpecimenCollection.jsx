'use client';

import React, { useState, useEffect } from 'react';
import { specimens, analyzeNarrativeForSpecimens } from '../data/specimens';
import { tools } from '../data/tools'; // Only import the analysis tools
import SpecimenDetail from './SpecimenDetail';
import Journal from './Journal';


export default function SpecimenCollection({ 
  currentSpecimen,
  inventory,
  onSpecimenSelect,
  onCollect,
  onUseTool,
  narrativeText,
   onViewNearbySpecimenDetail,
  availableSpecimenIds,
  onOpenCollectionPopup 
}) {
  // states
  const [showDetailPopup, setShowDetailPopup] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [nearbySpecimenIds, setNearbySpecimenIds] = useState([]);
   const [showJournalPopup, setShowJournalPopup] = useState(false);
  const [selectedJournalSpecimen, setSelectedJournalSpecimen] = useState(null);

//  analyze the narrative to see which specimens are nearby
useEffect(() => {
  if (availableSpecimenIds && availableSpecimenIds.length > 0) {
    setNearbySpecimenIds(availableSpecimenIds);
  }
}, [availableSpecimenIds]);

  // open the detail popup for analysis tools
  const handleToolUse = (toolId) => {
    if (currentSpecimen && onUseTool) {
      const tool = tools.find(t => t.id === toolId);
      if (tool) {
        setSelectedTool(tool);
        setShowDetailPopup(true);
      }
    }
  };

  // getSpecimenIcon logic
 const getSpecimenIcon = (id) => {
    switch(id) {
        case 'easternsantacruztortoise': return '🐢';
        case 'floreanagianttortoise': return '🐢';
        case 'galapagosmockingbird': return '🐦';
        case 'floreanamockingbird': return '🐦';
        case 'largegroundfinch': return '🐤';
        case 'mediumgroundfinch': return '🐤';
        case 'marineiguana': return '🐊';
        case 'terrestrialiguana': return '🐊';
        case 'cactus': return '🌵';
        case 'lavaLizard': return '🦎';
        case 'crab': return '🦀';
        case 'seaLion': return '🦭';
        case 'booby': return '🐦';
        case 'frigatebird': return '🕊️';
        case 'coralFragment': return '🪸';
        case 'plicopurpura': return '🐚';
        case 'seashell': return '🐚';
        case 'neorapana': return '🐚';
        case 'olivine': return '🦠';
        case 'basalt': return '🪨';
        case 'barnacle': return '🐌';
        case 'mangrove': return '🌱';
        case 'greenTurtle': return '🐢';
        case 'parrotfish': return '🐠';
        case 'hammerhead': return '🦈';
        case 'mantaRay': return '🐟';  
        case 'flamingo': return '🦩';
        case 'seaurchin': return '🪸';  
        case 'socialisttreatise': return '📜';
        case 'memoirsofautopian': return '📖';
        case 'governorsletter': return '✉️';
        case 'rumflask': return '⚱️';
        case 'petmonkey': return '🐵';
        case 'feralgoat': return '🐐';
        case 'captainsskull': return '💀';
        default: return '🔍';
    }
};

  // finding potentially collectible nearby specimens
 const getNearbySpecimens = () => {
  return specimens  // Use 'specimens' here instead of 'specimenids'
    .filter(s => nearbySpecimenIds.includes(s.id) && !inventory.some(item => item.id === s.id));
};

  const [showDetailedView, setShowDetailedView] = useState(null);

// Get specimen image path
  const getSpecimenImagePath = (specimenId) => {
    return `/specimens/${specimenId.toLowerCase()}.jpg`;
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

  // Inside the SpecimenCollection component, add this useEffect:
useEffect(() => {
  const handleShowDetail = (event) => {
    const { specimenId } = event.detail;
    if (specimenId) {
      // Find the specimen 
      const specimen = inventory.find(s => s.id === specimenId);
      if (specimen) {
        setShowDetailedView(specimen);
      }
    }
  };
  
  document.addEventListener('showSpecimenDetail', handleShowDetail);
  
  return () => {
    document.removeEventListener('showSpecimenDetail', handleShowDetail);
  };
}, [inventory]);

  return (
    <div className="darwin-panel">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif border-b border-amber-200 pb-1">
        Specimen Collection
      </h3>

      {/* 1) popup */}
      <SpecimenDetail 
        isOpen={showDetailPopup}
        onClose={() => setShowDetailPopup(false)}
        specimen={currentSpecimen}
        toolName={selectedTool?.name || ''}
        toolAction={selectedTool?.action || ''}
        onSubmit={(userInput, toolName, specimenId) => {
          const toolId = tools.find(t => t.name === toolName)?.id;
          if (toolId && onUseTool) {
            onUseTool(toolId, specimenId, userInput);
          }
        }}
      />

      {/* 2) "Current specimen details" block */}
      {currentSpecimen ? (
        <div className="mb-5 p-4 bg-white rounded-lg border border-amber-300 shadow-sm specimen-card selected">
    <div className="flex items-center mb-3">
      <div 
        className="relative w-16 h-16 bg-amber-50 rounded-lg flex items-center justify-center mr-4 shrink-0 border border-amber-200 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setShowDetailedView(currentSpecimen)}
      >
        <img 
          src={getSpecimenImagePath(currentSpecimen.id)} 
          alt={currentSpecimen.name}
          className="w-full h-full object-cover rounded-lg"
          onError={handleImageError}
        />
        <div className="hidden emoji-fallback text-3xl flex items-center justify-center absolute inset-0">
          {getSpecimenIcon(currentSpecimen.id)}
        </div>
        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-500"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500"></div>
      </div>
      <div>
        <h4 className="font-bold text-lg text-amber-900">{currentSpecimen.name}</h4>
        <p className="text-sm italic text-amber-700 font-serif">{currentSpecimen.latin}</p>
        <p className="text-xs mt-.5 text-gray-500">Habitat: {currentSpecimen.habitat}</p>
      </div>
    </div>
      
          
          {/* Observations section remains unchanged */}
          {currentSpecimen.observations && currentSpecimen.observations.length > 0 && (
            <div className="mb-4">
              <h5 className="font-medium text-sm mb-2 text-amber-800">Observations:</h5>
              <ul className="text-sm text-gray-700 space-y-1.5 pl-4">
                {currentSpecimen.observations.map((obs, index) => (
                  <li key={index} className="flex items-start">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-600 mt-1.5 mr-2"></span>
                    {obs.text} 
                    <span className="text-xs text-amber-700 ml-1">
                      ({tools.find(t => t.id === obs.tool)?.name}, {obs.date})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Field notes button */}
          <button
        onClick={() => {
          setSelectedJournalSpecimen(currentSpecimen);
          setShowJournalPopup(true);
        }}
        className="text-sm w-full bg-green-600 hover:bg-green-700 p-1 text-white font-bold py-1.5 rounded-lg mb-2 transition"
      >
        Document {currentSpecimen.name}
      </button>
      <p className="text-xs text-gray-600 text-center mb-4 italic">
        Remember to use at least one  Tool first!
      </p>

        <Journal
        isOpen={showJournalPopup}
        onClose={() => setShowJournalPopup(false)}
        specimen={selectedJournalSpecimen}
        onSave={(entry) => {
          // Optional: Add logic to handle saved journal entries
          console.log('Journal entry saved:', entry);
        }}
      />
          
          {/* Analysis Tools  */}
          <div className="mt-4">
            <h5 className="font-medium text-sm mb-2 text-amber-800 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Scientific Tools:
            </h5>
            <div className="flex flex-wrap gap-1">
              {tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => handleToolUse(tool.id)}
                  className="tool-button group"
                  title={tool.description}
                >
                  <span className="mr-1.5 text-lg group-hover:scale-110 transition-transform inline-block">
                    {tool.icon}
                  </span> 
                  <span className="text-xs">{tool.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        //  "no current specimen" block
        <div className="text-center text-gray-600 mb-6 p-4 bg-white rounded-lg border border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-amber-400 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1.5} 
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-sm mb-1">Select a specimen to study it</p>
          <p className="text-xs text-gray-500">or collect new specimens during your exploration.</p>
        </div>
      )}
      
      {/* Inventory of collected specimens */}
      <div className="mb-4">
        <h4 className="text-amber-800 font-medium flex items-center mb-2 text-sm border-b border-amber-200 pb-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path 
              fillRule="evenodd" 
              d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" 
              clipRule="evenodd" 
            />
          </svg>
          Collected Specimens:
        </h4>
        
        {inventory.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {inventory.map(item => (
              <div 
                key={item.id}
                onClick={() => onSpecimenSelect(item.id)}
                className={`p-2 rounded-lg cursor-pointer border transition-all duration-200 flex items-center specimen-card ${
                  currentSpecimen && currentSpecimen.id === item.id 
                    ? 'selected' 
                    : ''
                }`}
              >
                <div className="w-8 h-8 bg-amber-50 rounded-md flex items-center justify-center mr-2 border border-amber-200">
                  <span className="text-lg">{getSpecimenIcon(item.id)}</span>
                </div>
                <div className="text-xs flex-1 overflow-hidden">
                  <p className="font-medium text-amber-900 truncate">{item.name}</p>
                  <p className="text-amber-700 opacity-75 truncate text-xs italic font-serif">{item.latin}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mb-4 py-2 px-4 bg-amber-50/50 rounded-lg italic text-center">
            No specimens collected yet.
          </div>
        )}
      </div>

      {/* Detailed Specimen View Modal */}
{showDetailedView && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
      <div className="p-4 border-b border-amber-200 flex justify-between items-center bg-amber-50">
        <h2 className="text-2xl font-bold text-darwin-dark font-serif">{showDetailedView.name}</h2>
        <button 
          onClick={() => setShowDetailedView(null)}
          className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
        >
          &times;
        </button>
      </div>
      
      <div className="flex flex-col lg:flex-row">
        {/* Large specimen image */}
        <div className="lg:w-3/5 h-[40vh] lg:h-[70vh] relative overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center shadow-inner"
            style={{ 
              backgroundImage: `url(${getSpecimenImagePath(showDetailedView.id)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Fallback for image error */}
            <div className="hidden absolute inset-0 flex items-center justify-center bg-amber-50">
              <span className="text-[15rem] opacity-50">{getSpecimenIcon(showDetailedView.id)}</span>
            </div>
          </div>
        </div>
        
        {/* Specimen details panel */}
        <div className="lg:w-2/5 p-6 bg-darwin-light overflow-y-auto">
          <div className="prose max-w-none font-serif">
            <h3 className="text-xl font-medium mb-2 border-b border-amber-200 pb-2">{showDetailedView.name}</h3>
            <p className="italic text-amber-800 mb-4">{showDetailedView.latin}</p>
            
            <div className="mb-4">
              <h4 className="font-medium text-amber-900">Typical habitat</h4>
              <p>{showDetailedView.habitat}</p>
            </div>
            
            <div className="mb-4">
              <h4 className="font-medium text-amber-900">Description</h4>
              <p>{showDetailedView.description}</p>
            </div>
            
            {showDetailedView.details && showDetailedView.details.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-amber-900 mb-2">Notable Features</h4>
                <ul className="list-disc pl-5 space-y-1 text-gray-800">
                  {showDetailedView.details.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-amber-200 bg-amber-50 text-center">
        <button
          onClick={() => setShowDetailedView(null)}
          className="px-6 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors shadow-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
      
      {/* Nearby specimens  */}
      <div>
        <h4 className="text-amber-800 font-medium flex items-center mb-1 text-sm border-b border-amber-200 pb-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
            />
          </svg>
          Nearby Specimens:
        </h4>
        
        {getNearbySpecimens().length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
           {getNearbySpecimens().map(specimen => (
  <button
    key={specimen.id}
    onClick={() => onViewNearbySpecimenDetail(specimen)}
    className="specimen-card p-2 flex items-center group"
  >
    <div className="w-8 h-8 bg-amber-50 rounded-md flex items-center justify-center mr-2 border border-amber-200 group-hover:bg-amber-100 transition-colors">
      <span className="text-lg">{getSpecimenIcon(specimen.id)}</span>
    </div>
    <div className="text-xs text-left flex-1 overflow-hidden">
      <p className="font-medium text-amber-900 truncate">{specimen.name}</p>
      <p className="text-amber-700 opacity-75 truncate">{specimen.habitat}</p>
    </div>
  </button>
))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-3 px-4 bg-amber-50/50 rounded-lg italic text-center">
            No specimens visible nearby.
          </div>
        )}
      </div>
    </div>


  );
}