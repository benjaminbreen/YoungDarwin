'use client';

import React, { useState, useEffect } from 'react';
import useGameStore from '../hooks/useGameStore';
import { getCellByCoordinates } from '../utils/locationSystem';
import Image from 'next/image';
import HybridSpecimenImage from './HybridSpecimenImage';

export default function EndGame() {
  // Game state
  const { 
    daysPassed, 
    inventory, 
    eventHistory, 
    journal, 
    currentLocationId,
    specimenList,
    formatGameTime
  } = useGameStore();

  // Local state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showEndGameScreen, setShowEndGameScreen] = useState(false);
  const [showHensloweAssessment, setShowHensloweAssessment] = useState(false);
  const [playerResponse, setPlayerResponse] = useState('');
  const [hensloweDialog, setHensloweDialog] = useState('');
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(false);
  const [gameStats, setGameStats] = useState(null);
  const [buttonHover, setButtonHover] = useState(false);
  
  // Calculate stats when showing end game screen
  useEffect(() => {
    if (showEndGameScreen && !gameStats) {
      calculateGameStats();
    }
  }, [showEndGameScreen]);

  // Calculate all game stats
  const calculateGameStats = () => {
    // Calculate locations visited
    const visitedLocations = new Set();
    eventHistory.forEach(event => {
      if (event.locationId) {
        visitedLocations.add(event.locationId);
      }
    });
    
    // Count specimen collections and tool usage
    const specimensCollected = inventory.length;
    
    // Count tool usages by type
    const toolUsage = {};
    eventHistory.forEach(event => {
      if (event.eventType === 'observation') {
        const toolMatch = event.fullContent?.match(/using (\w+) to examine/i);
        if (toolMatch && toolMatch[1]) {
          const tool = toolMatch[1].toLowerCase();
          toolUsage[tool] = (toolUsage[tool] || 0) + 1;
        }
      }
    });

    // Count NPCs encountered
    const npcsEncountered = new Set();
    eventHistory.forEach(event => {
      // Check NPC tags or detect NPC conversations
      const npcMatch = event.fullContent?.match(/\[NPC:\s*(.*?)\]/);
      if (npcMatch && npcMatch[1] && npcMatch[1] !== 'null') {
        npcsEncountered.add(npcMatch[1]);
      }
      
      // Also check for NPC names in content
      const npcNames = ['Syms Covington', 'María', 'Gabriel Puig', 'Captain FitzRoy', 'Lascar Joe', 'Nicolás Lawson'];
      npcNames.forEach(name => {
        if (event.fullContent?.includes(name)) {
          npcsEncountered.add(name.replace(' ', '_').toLowerCase());
        }
      });
    });
    
    // Count field notes
    const fieldNotes = journal.length;
    
    // Categorize specimens by type
    const specimensByType = {
      animals: 0,
      plants: 0,
      minerals: 0,
      hybrids: 0
    };
    
    inventory.forEach(specimen => {
      if (specimen.isHybrid) {
        specimensByType.hybrids++;
      } else if (specimen.ontology === 'Animal') {
        specimensByType.animals++;
      } else if (specimen.ontology === 'Plant') {
        specimensByType.plants++;
      } else if (specimen.ontology === 'Mineral') {
        specimensByType.minerals++;
      }
    });
    
    // Calculate average scientific value of collected specimens
    let totalValue = 0;
    inventory.forEach(specimen => {
      totalValue += specimen.scientificValue || 0;
    });
    const avgScientificValue = specimensCollected > 0 ? (totalValue / specimensCollected).toFixed(1) : 0;
    
    // Calculate time played
    const gameDays = daysPassed;
    const gameHours = Math.floor(eventHistory.length / 10); // Rough estimate
    
    // Save stats
    setGameStats({
      visitedLocations: {
        count: visitedLocations.size,
        total: 31, // Total island locations
        list: Array.from(visitedLocations)
      },
      specimensCollected: {
        count: specimensCollected,
        total: specimenList.length,
        byType: specimensByType
      },
      toolUsage: toolUsage,
      npcsEncountered: {
        count: npcsEncountered.size,
        total: 6, // Total NPCs
        list: Array.from(npcsEncountered)
      },
      fieldNotes: fieldNotes,
      scientificValue: avgScientificValue,
      timePlayed: {
        days: gameDays,
        hours: gameHours,
        events: eventHistory.length
      }
    });
  };

  // Handle the Henslowe assessment
  const getHensloweAssessment = async () => {
    setIsLoadingAssessment(true);
    
    try {
      // Prepare context data for the assessment
      const assessmentData = {
        inventory: inventory.map(specimen => ({
          id: specimen.id,
          name: specimen.name,
          latin: specimen.latin,
          scientificValue: specimen.scientificValue,
          isHybrid: specimen.isHybrid || false
        })),
        fieldNotes: journal.map(entry => ({
          specimenName: entry.specimenName,
          content: entry.content,
          date: entry.date
        })),
        locations: gameStats.visitedLocations,
        npcs: gameStats.npcsEncountered,
        toolUsage: gameStats.toolUsage,
        daysPassed: daysPassed,
        events: eventHistory.length
      };
      
      // Call the API endpoint
      const response = await fetch('/api/end-game-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assessmentData),
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setHensloweDialog(data.assessment);
      
    } catch (error) {
      console.error('Error getting Henslowe assessment:', error);
      setHensloweDialog("I regret that I am unable to properly assess your expedition at this time, Mr. Darwin. Perhaps the specimen transport has been delayed. Let us speak again when your collections arrive from the islands.");
    } finally {
      setIsLoadingAssessment(false);
    }
  };

  // Handle submit response to Henslowe
  const handleResponseSubmit = async () => {
    if (!playerResponse.trim()) return;
    
    setIsLoadingAssessment(true);
    
    try {
      const response = await fetch('/api/end-game-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          previousDialog: hensloweDialog,
          playerResponse: playerResponse,
          responseMode: true
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setHensloweDialog(prev => prev + "\n\n* * *\n\n" + data.assessment);
      setPlayerResponse('');
      
    } catch (error) {
      console.error('Error getting Henslowe response:', error);
    } finally {
      setIsLoadingAssessment(false);
    }
  };

  // Begin end game flow
  const handleEndGame = () => {
    setShowConfirmation(true);
  };

  // Confirm end game
  const confirmEndGame = () => {
    setShowConfirmation(false);
    setShowEndGameScreen(true);
  };

  // View Henslowe's assessment
  const viewHensloweAssessment = () => {
    setShowHensloweAssessment(true);
    if (!hensloweDialog) {
      getHensloweAssessment();
    }
  };

  // Return to game
  const returnToGame = () => {
    setShowConfirmation(false);
    setShowEndGameScreen(false);
    setShowHensloweAssessment(false);
  };

  // Share expedition results
  const shareResults = () => {
    // Implementation for sharing (could be to social media, etc.)
    alert("This feature would share your expedition results!");
  };

  const getSpecimenIcon = (specimen) => {
    if (!specimen) return '🔍';
    
    if (specimen.isHybrid) {
      return '🧬';
    }
    
    const emojiMap = {
      'tortoise': '🐢',
      'mockingbird': '🐦',
      'iguana': '🦎',
      'finch': '🐤',
      'cactus': '🌵',
      'lizard': '🦎',
      'crab': '🦀',
      'sealion': '🦭',
      'bird': '🐦',
      'coral': '🪸',
      'seashell': '🐚',
      'rock': '🪨',
      'barnacle': '🐌',
      'mangrove': '🌱',
      'turtle': '🐢',
      'fish': '🐠',
      'shark': '🦈',
      'ray': '🐟',
      'flamingo': '🦩'
    };
    
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (specimen.id.toLowerCase().includes(key)) {
        return emoji;
      }
    }
    
    return '🔍';
  };

  return (
    <>
      {/* End Game Button */}
      <div className="flex justify-center mt-5 mb-4">
        <button
          onClick={handleEndGame}
          onMouseEnter={() => setButtonHover(true)}
          onMouseLeave={() => setButtonHover(false)}
          className={`relative overflow-hidden group px-5 py-1 rounded-lg font-bold text-white transition-all duration-300 transform ${
            buttonHover ? 'scale-105' : ''
          }`}
          style={{
            backgroundColor: buttonHover ? '#a30000' : '#e60',
            boxShadow: buttonHover 
              ? '0 4px 20px rgba(204, 0, 0, 0.6), 0 0 10px rgba(255, 100, 100, 0.4)' 
              : '0 4px 6px rgba(204, 0, 0, 0.25)'
          }}
        >
    
          
          {/* Button text with icon */}
          <span className="relative z-10 flex items-center gap-2">
            
            End the game
          </span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-amber-50 rounded-lg max-w-md w-full shadow-xl border-2 border-amber-700 transform transition-all duration-300 animate-appear">
            <div className="p-6 text-center">
              <div className="mb-4 text-amber-900">
                <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-amber-900 mb-4 font-serif">Conclude Your Expedition?</h3>
              <p className="text-amber-800 mb-6">
                Are you certain you wish to conclude your Galápagos expedition? This will end your current exploration and provide a final assessment of your scientific discoveries.
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={returnToGame}
                  className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
                >
                  Continue Exploring
                </button>
                <button
                  onClick={confirmEndGame}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg transition-colors"
                >
                  Conclude Expedition
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End Game Screen */}
      {showEndGameScreen && !showHensloweAssessment && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4  overflow-auto">
          <div className="bg-amber-50 rounded-lg max-w-4xl w-full max-h-[85vh] overflow-y-auto shadow-xl border-2 border-amber-700 transform transition-all">
            {/* Header */}
            <div className="relative">
              {/* Background image with overlay */}
              <div className="h-52 bg-cover bg-center" style={{ backgroundImage: "url('/darwins-voyage.jpg')" }}>
                <div className="absolute drop-shadow-xl inset-0 bg-gradient-to-b from-amber-900/60 to-amber-800/80"></div>
              </div>
              
              {/* Title overlay */}
              <div className="absolute inset-x-0 bottom-0 text-center pb-4 p-6">
                <h2 className="text-2xl font-bold text-white px-5 font-serif tracking-wide drop-shadow-xl">
                 After nearly five years at sea, Darwin reached England in October, 1836...
                </h2>
                <p className="text-amber-200 drop-shadow-xl text-lg italic mt-2" >
                 You spent {daysPassed} days investigating Charles Island (Isla Floreana). How will your discoveries there be received by Darwin's mentor, John Stepvens Henslow?
                </p>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {gameStats ? (
                <div className="space-y-8">
                  {/* Top stats row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-amber-100/50 p-4 rounded-lg border border-amber-200 text-center">
                      <div className="text-4xl font-bold text-amber-800 mb-1">{gameStats.visitedLocations.count}</div>
                      <div className="text-sm text-amber-700">Locations Visited</div>
                      <div className="text-xs text-amber-600 mt-1">of {gameStats.visitedLocations.total}</div>
                    </div>
                    
                    <div className="bg-amber-100/50 p-4 rounded-lg border border-amber-200 text-center">
                      <div className="text-4xl font-bold text-amber-800 mb-1">{gameStats.specimensCollected.count}</div>
                      <div className="text-sm text-amber-700">Specimens Collected</div>
                      <div className="text-xs text-amber-600 mt-1">Avg. Value: {gameStats.scientificValue}/10</div>
                    </div>
                    
                    <div className="bg-amber-100/50 p-4 rounded-lg border border-amber-200 text-center">
                      <div className="text-4xl font-bold text-amber-800 mb-1">{gameStats.npcsEncountered.count}</div>
                      <div className="text-sm text-amber-700">People Encountered</div>
                      <div className="text-xs text-amber-600 mt-1">of {gameStats.npcsEncountered.total}</div>
                    </div>
                  </div>
                  
                  {/* Specimen collection */}
                  <div className="bg-white rounded-lg border border-amber-200 shadow-md overflow-hidden">
                    <div className="bg-amber-800 text-white p-3">
                      <h3 className="font-bold text-white/80 text-xl">Specimen Collection</h3>
                    </div>
                    
                    <div className="p-4">
                      <div className="mb-4 flex flex-wrap gap-3 justify-center">
                        <div className="flex items-center text-sm bg-amber-100 px-3 py-1 rounded-full">
                          <span className="mr-1">🐾</span> Animals: {gameStats.specimensCollected.byType.animals}
                        </div>
                        <div className="flex items-center text-sm bg-green-100 px-3 py-1 rounded-full">
                          <span className="mr-1">🌱</span> Plants: {gameStats.specimensCollected.byType.plants}
                        </div>
                        <div className="flex items-center text-sm bg-gray-100 px-3 py-1 rounded-full">
                          <span className="mr-1">🪨</span> Minerals: {gameStats.specimensCollected.byType.minerals}
                        </div>
                        {gameStats.specimensCollected.byType.hybrids > 0 && (
                          <div className="flex items-center text-sm bg-purple-100 px-3 py-1 rounded-full">
                            <span className="mr-1">🧬</span> Hybrids: {gameStats.specimensCollected.byType.hybrids}
                          </div>
                        )}
                      </div>
                      
                      {/* Specimens grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-2">
                        {inventory.slice(0, 8).map((specimen) => (
                          <div key={specimen.id} className="flex flex-col items-center bg-amber-50 rounded-lg border border-amber-200 p-3 text-center hover:shadow-md transition-shadow">
                            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-2 overflow-hidden">
                              {specimen.isHybrid ? (
                                <HybridSpecimenImage 
                                  specimen={specimen}
                                  size="thumbnail"
                                  disableGeneration={true}
                                  className="w-full h-full object-cover"
                                  fallbackIcon={getSpecimenIcon(specimen)}
                                />
                              ) : (
                                <div className="text-3xl">{getSpecimenIcon(specimen)}</div>
                              )}
                            </div>
                            <div className="text-xs font-medium truncate w-full">{specimen.name}</div>
                            <div className="text-amber-600 text-[10px] italic truncate w-full">{specimen.latin}</div>
                          </div>
                        ))}
                        
                        {inventory.length > 8 && (
                          <div className="flex flex-col items-center justify-center bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                            <div className="text-lg">+{inventory.length - 8}</div>
                            <div className="text-xs text-amber-700">more specimens</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Field Methods */}
                  <div className="bg-white rounded-lg border border-amber-200 shadow-md overflow-hidden">
                    <div className="bg-amber-800 text-white p-3">
                      <h3 className="font-bold text-white/80 text-xl text-lg">Scientific Methods Employed</h3>
                    </div>
                    
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Tool Usage */}
                      <div>
                        <h4 className="font-medium text-amber-900 mb-2 border-b border-amber-100 pb-1">Tool Usage</h4>
                        <div className="space-y-2">
                          {Object.keys(gameStats.toolUsage).length > 0 ? (
                            Object.entries(gameStats.toolUsage).map(([tool, count]) => (
                              <div key={tool} className="flex justify-between items-center">
                                <div className="text-sm capitalize">{tool === 'lens' ? 'Hand Lens' : tool}</div>
                                <div className="text-sm font-medium bg-amber-100 px-2 py-0.5 rounded-md">{count} times</div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500 italic">No specialized tools used</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Field Notes */}
                      <div>
                        <h4 className="font-medium text-amber-900 mb-2 border-b border-amber-100 pb-1">Field Notes</h4>
                        <div className="flex items-center justify-between">
                          <div className="text-sm">Total Field Notes:</div>
                          <div className="text-sm font-medium bg-amber-100 px-2 py-0.5 rounded-md">{gameStats.fieldNotes}</div>
                        </div>
                        
                        <div className="mt-4 bg-amber-50 p-3 rounded-lg text-sm italic border border-amber-200">
                          {journal.length > 0 ? (
                            <>
                              <p className="text-xs text-amber-800 mb-1 font-medium">Example from your notes:</p>
                              <p className="line-clamp-3 text-gray-700">
                                {journal[journal.length - 1]?.content?.substring(0, 120)}...
                              </p>
                            </>
                          ) : (
                            <p className="text-gray-500">No field notes recorded during the expedition.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expedition Summary */}
                  <div className="bg-white rounded-lg border border-amber-200 shadow-md overflow-hidden">
                    <div className="bg-amber-800 text-white p-3">
                      <h3 className="font-bold text-white/80 text-xl text-lg">Expedition Summary</h3>
                    </div>
                    
                    <div className="p-4">
                      <p className="text-amber-900 mb-3 font-serif italic">
                        Your expedition to the Galápagos lasted {gameStats.timePlayed.days} days, during which you 
                        explored {gameStats.visitedLocations.count} unique locations and 
                        documented {gameStats.specimensCollected.count} specimens. You encountered  
                        {gameStats.npcsEncountered.count} of the island's inhabitants and recorded 
                        {gameStats.fieldNotes} detailed field notes.
                      </p>
                      
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                        <p className="text-m text-amber-800 font-medium mb-2">Professor Henslow awaits your findings in Cambridge...</p>
                        <button 
                          onClick={viewHensloweAssessment}
                          className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          See What Professor Henslow Thinks
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-800"></div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-amber-200 bg-amber-50 flex justify-between items-center">
              <button
                onClick={returnToGame}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
              >
                Return to Exploration
              </button>
              
              <button
                onClick={shareResults}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share Expedition Results
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Henslowe Assessment Screen */}
      {showHensloweAssessment && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-amber-50 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border-2 border-amber-700">
            {/* Header with decorative elements */}
            <div className="bg-amber-800 text-white p-4 flex items-center justify-between relative overflow-hidden">
              {/* Background Pattern */}
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z' fill='%23FFFFFF' fill-opacity='0.4'/%3E%3C/svg%3E")`,
                  backgroundSize: "100px 100px"
                }}
              ></div>
              
              <h2 className="text-xl  text-white/90 font-bold font-serif flex items-center relative z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Professor Henslow's Assessment
              </h2>
              
              <button 
                onClick={() => setShowHensloweAssessment(false)}
                className="relative z-10 text-amber-200 hover:text-white transition-colors rounded-full p-1 hover:bg-amber-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="flex flex-col md:flex-row p-6 gap-6">
              {/* Henslow Portrait */}
              <div className="md:w-1/3 flex flex-col items-center">
                <div className="rounded-lg shadow-md overflow-hidden">
                  <img 
                    src="/portraits/henslow.jpg" 
                    alt="Professor Henslow" 
                    className="w-full h-auto"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "https://placehold.co/200x250/8B5A2B/FFFFFF?text=Professor+Henslow";
                    }}
                  />
                </div>
                <div className="text-center mt-4">
                  <h3 className="font-bold text-amber-900">Professor John Stevens Henslow</h3>
                  <p className="text-sm text-amber-700 italic">University of Cambridge, 1836</p>
                </div>
                <div className="mt-4 p-3 bg-amber-100/50 text-sm rounded-lg border border-amber-200">
                  <p className="italic text-amber-800">
                    "A natural science instructor at Cambridge, Henslow became Darwin's mentor and friend. It was Henslow who recommended the young Darwin for the position aboard HMS Beagle, thus setting in motion the journey that would transform natural history forever."
                  </p>
                </div>
                
                {/* Cambridge University emblem */}
                <div className="mt-6 opacity-50">
                  <img 
                    src="/cambridge-emblem.png" 
                    alt="Cambridge University Emblem" 
                    className="w-16 h-auto mx-auto"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              </div>
              
              {/* Assessment dialog */}
              <div className="md:w-2/3">
                {isLoadingAssessment ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-800 mb-4"></div>
                    <p className="text-amber-800 italic">Professor Henslow is evaluating your specimens...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Henslowe's assessment */}
                    <div className="bg-white rounded-lg border border-amber-200 p-4 shadow-md">
                      <h3 className="font-medium text-amber-900 mb-4 border-b border-amber-100 pb-2">
                        A letter arrives from Professor Henslow a day after you proudly show your Charles Island collections to him...
                      </h3>
                      <div 
                        className="prose prose-amber max-w-none font-serif"
                        dangerouslySetInnerHTML={{ 
                          __html: hensloweDialog 
                            ? hensloweDialog.replace(/\n\n/g, '<br><br>').replace(/\*/g, '<span class="text-amber-500">*</span>') 
                            : '<p class="italic text-gray-500">Assessment will appear here...</p>' 
                        }}
                      />
                    </div>
                    
                    {/* Your response */}
                    <div>
                      <h3 className="font-medium text-amber-900 mb-2">Your Response to Professor Henslow</h3>
                      <textarea
                        className="w-full p-3 border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 min-h-[120px] shadow-inner"
                        placeholder="Discuss your specimens and thoughts with Professor Henslow..."
                        value={playerResponse}
                        onChange={(e) => setPlayerResponse(e.target.value)}
                        disabled={isLoadingAssessment}
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={handleResponseSubmit}
                          disabled={isLoadingAssessment || !playerResponse.trim()}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:bg-amber-300"
                        >
                          {isLoadingAssessment ? 'Sending...' : 'Send Response'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              </div>
            </div>
            
            {/* Footer with return button */}
            <div className="p-4 border-t border-amber-200 bg-amber-50 flex justify-between items-center">
              <button
                onClick={() => setShowHensloweAssessment(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
              >
                Back to Summary
              </button>
              
              <button
                onClick={returnToGame}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
              >
                Return to Exploration
              </button>
            </div>
          </div>

      )}
      
      {/* Floating animation for button effects */}
      <style jsx>{`
        @keyframes float-up {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-20px); opacity: 0; }
        }
        
        @keyframes float-up-delay {
          0% { transform: translateY(0); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(-20px); opacity: 0; }
        }
        
        @keyframes float-up-delay-2 {
          0% { transform: translateY(0); opacity: 0; }
          60% { opacity: 1; }
          100% { transform: translateY(-20px); opacity: 0; }
        }
        
        @keyframes appear {
          0% { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .animate-float-up {
          animation: float-up 2s ease-out infinite;
        }
        
        .animate-float-up-delay {
          animation: float-up-delay 2s ease-out infinite;
          animation-delay: 0.3s;
        }
        
        .animate-float-up-delay-2 {
          animation: float-up-delay-2 2s ease-out infinite;
          animation-delay: 0.6s;
        }
        
        .animate-appear {
          animation: appear 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
}