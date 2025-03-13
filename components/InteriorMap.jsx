'use client';

import React, { useState, useEffect } from 'react';

export default function InteriorMap({ 
  locationType,
  onExitInterior,
  onInteriorMove,
  playerPosition,
  currentNPC
}) {
  // 1) Define your interiorLayouts object first, at the top.
  const interiorLayouts = {
    'cave': {
      name: "Gabriel's Cave",
      description: "A hidden revolutionary's sanctuary, carved into volcanic rock",
      rooms: [
        { id: 'CAVE_ENTRANCE', name: 'Cave Entrance', x: 1, y: 2, description: 'The narrow entrance to the cave, dimly lit by filtered sunlight.', emoji: '🚪', accessible: true },
        { id: 'CAVE_BACK', name: 'Back Chamber', x: 1, y: 0, description: 'A filthy area filled with the remains of crab legs and goat bones.', emoji: '📚', accessible: true },
        { id: 'CAVE_LEFT', name: 'Storage Area', x: 1, y: 1, description: 'Supplies and materials are stacked against the wall. Barrels of water and dried food.', emoji: '🛢️', accessible: true },
        { id: 'CAVE_STORAGE', name: 'Hidden Cache', x: 0, y: 0, description: "A secret compartment containing Gabriel's most treasured possessions and banned books.", emoji: '🗝️', accessible: true },
        { id: 'CAVE_LOOKOUT', name: 'Lookout Point', x: 2, y: 0, description: 'A narrow opening that provides a view of the eastern coast of the island.', emoji: '👁️', accessible: true },
        { id: 'CAVE_WRITING', name: 'Writing Nook', x: 0, y: 2, description: 'A small desk with quills and parchment where Gabriel drafts his manifestos.', emoji: '✍️', accessible: true },
      ],
      npcs: ['gabriel_puig'],
      grid: [3, 3],
      floorColor: 'bg-stone-700',
      wallColor: 'bg-stone-800',
      accentColor: 'amber'
    },
    'hms_beagle': {
      name: "HMS Beagle",
      description: "Captain FitzRoy's meticulously maintained survey vessel",
      rooms: [
        // Upper Deck (y=0)
        { id: 'BEAGLE', name: "Ship's Bow", x: 0, y: 0, description: 'Forward part of the ship, offering views of the open ocean ahead.', emoji: '🌊', accessible: true },
        { id: 'BEAGLE_FOREMAST', name: 'Foremast', x: 1, y: 0, description: 'Tall foremast with sailors working on the rigging.', emoji: '⛵', accessible: true },
        { id: 'BEAGLE_MAINMAST', name: 'Mainmast', x: 2, y: 0, description: 'Primary mast with the ship’s bell nearby.', emoji: '🔔', accessible: true },
        { id: 'BEAGLE_QUARTERDECK', name: 'Quarterdeck', x: 3, y: 0, description: 'Raised deck at the stern; Captain FitzRoy often stands here.', emoji: '🧭', accessible: true },
    
        
        // Lower Deck (y=1)
        { id: 'BEAGLE_FORECASTLE', name: 'Forecastle', x: 0, y: 1, description: 'Forward lower compartment where some crew sleep.', emoji: '🛌', accessible: true },
        { id: 'BEAGLE_STORAGE', name: 'Specimen Storage', x: 1, y: 1, description: 'Where collected specimens are stored.', emoji: '🧪', accessible: true },
        { id: 'BEAGLE_QUARTERS', name: 'Your Quarters', x: 2, y: 1, description: 'Small but comfortable berth for sleeping and studying.', emoji: '📓', accessible: true },
        { id: 'BEAGLE_CABIN', name: "Captain's Cabin", x: 3, y: 1, description: 'FitzRoy’s private quarters with charts and instruments.', emoji: '📐', accessible: true },
      ],
      npcs: ['fitzroy'],
      grid: [4, 2],
      floorColor: 'bg-amber-800',
      wallColor: 'bg-amber-900',
      accentColor: 'blue'
    },
    'governors_house': {
      name: "Vice-Governor's House",
      description: "The colonial residence of Nicolás Lawson, modest yet befitting his station",
      rooms: [
        // Top row (y=0)
        { id: 'GOVERNORS_HOUSE', name: 'Office', x: 1, y: 1, description: "Lawson's official business is done here.", emoji: '📜', accessible: true },
       
        { id: 'GOVERNORS_HOUSE_LIBRARY', name: 'Small Library', x: 1, y: 0, description: 'Shelves with books on navigation, natural history, admin.', emoji: '📚', accessible: true },
        
        // Bottom row (y=1)
        { id: 'GOVERNORS_HOUSE_DINING', name: 'Dining Room', x: 0, y: 1, description: 'A modest table, half-empty rum bottle, maritime chart.', emoji: '🍽️', accessible: true },
        { id: 'GOVERNORS_HOUSE_ENTRANCE', name: 'Entrance Hall', x: 0, y: 0, description: 'A modest foyer; Lawson greets visitors here.', emoji: '🚪', accessible: true },
        { id: 'GOVERNORS_HOUSE_GARDEN', name: 'Rear Garden', x: 2, y: 1, description: 'A walled garden with exotic plants from the archipelago.', emoji: '🌱', accessible: true },
      ],
      npcs: ['nicolas_lawson'],
      grid: [3, 2],
      floorColor: 'bg-amber-100',
      wallColor: 'bg-amber-200',
      accentColor: 'emerald'
    },
    'watkins_cabin': {
      name: "Patrick Watkins's Cabin",
      description: "The crude shelter of the island's first settler, solitary and mysterious",
      rooms: [
        { id: 'WATKINS_INTERIOR', name: 'Watkins Cabin Interior', x: 0, y: 0, description: 'A one-room shelter of driftwood and stone, with pungent smells.', emoji: '🏚️', accessible: true },
      ],
      npcs: [],
      grid: [1, 1],
      floorColor: 'bg-amber-950',
      wallColor: 'bg-black-900',
      accentColor: 'amber'
    },
    'whalers_hut': {
      name: "Whaler's Hut",
      description: "A seasonal shelter used by American whalers for water/provisions",
      rooms: [
        { id: 'WHALERS_INTERIOR', name: 'Hut Interior', x: 0, y: 0, description: 'A simple stone structure, scattered harpoon parts, a rough firepit.', emoji: '🪵', accessible: true },
      ],
      npcs: [],
      grid: [1, 1],
      floorColor: 'bg-stone-500',
      wallColor: 'bg-stone-700',
      accentColor: 'amber'
    },

    'mail_barrel': {
  name: "Mail Barrel",
  description: "A wooden barrel used by sailors for mail exchange. Why are you here?",
  rooms: [
    { 
      id: 'MAIL_BARREL', 
      name: 'Mail Barrel', 
      x: 0, 
      y: 0, 
      description: 'The cramped interior is mostly filled with sand, leaving just enough space to reach in. A few tattered letters poke out from the grit. Curiously, a faint smell of urine lingers in the stale air.', 
      emoji: '📨', 
      accessible: true 
    },
  ],
  npcs: [],
  grid: [1, 1],
  floorColor: 'bg-amber-800',
  wallColor: 'bg-amber-900',
  accentColor: 'amber'
}
  };

  // 2) Grab the layout from the object
  const layout = interiorLayouts[locationType];
  if (!layout || !layout.rooms) {
    console.error(`InteriorMap: Invalid or missing layout for location type: "${locationType}"`);
    return <div>Invalid interior location: {locationType}</div>;
  }

  // 3) Helper to find the current room based on playerPosition
  function getCurrentRoom() {
    return (
      layout.rooms.find(r => r.x === playerPosition.x && r.y === playerPosition.y)
      || layout.rooms[0]
    );
  }

  // Determine the current room
  const currentRoom = getCurrentRoom();

  // 4) Local component state for hover and mount animation
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 5) On mount, set loaded
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // 6) If we want to inform the parent about the “current room” (for UI or LLM)
  useEffect(() => {
    if (currentRoom && onInteriorMove) {
      onInteriorMove(playerPosition, currentRoom.id, currentRoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationType]); 
  // Note: do not pass currentRoom as a dep, or it might cause repeated triggers

  // 7) Handle user clicks on a room
  const handleRoomClick = (room) => {
    if (!room || !room.accessible) return;
    // Check adjacency or 1x1
    const is1x1 = (layout.grid[0] === 1 && layout.grid[1] === 1);
    const isAdjacent =
      (Math.abs(room.x - playerPosition.x) === 1 && room.y === playerPosition.y)
      || (Math.abs(room.y - playerPosition.y) === 1 && room.x === playerPosition.x);

    if (is1x1 || isAdjacent || (room.x === playerPosition.x && room.y === playerPosition.y)) {
      onInteriorMove({ x: room.x, y: room.y }, room.id, room);
    }
  };

  // 8) Helper to pick text color based on accent
  const getTextColor = () => {
    switch (layout.accentColor) {
      case 'amber':   return 'text-amber-800';
      case 'emerald': return 'text-emerald-800';
      case 'blue':    return 'text-blue-800';
      default:        return 'text-gray-800';
    }
  };

  // 9) Return the main JSX
  return (
    <div className={`darwin-panel p-3 transition-all duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className={`font-bold ${getTextColor()} text-xl font-serif flex items-center`}>
          {layout.name}
          {locationType === 'governors_house' && <span className="ml-2 text-sm">🏛️</span>}
          {locationType === 'cave' && <span className="ml-2 text-sm">🌋</span>}
          {locationType === 'hms_beagle' && <span className="ml-2 text-sm">⛵</span>}
          {locationType === 'watkins_cabin' && <span className="ml-2 text-sm">🏚️</span>}
          {locationType === 'whalers_hut' && <span className="ml-2 text-sm">🪵</span>}
        </h3>
        <button 
          onClick={onExitInterior}
          className={`px-3 py-1 text-sm bg-${layout.accentColor}-100 hover:bg-${layout.accentColor}-200 rounded border border-${layout.accentColor}-300 transition-colors`}
        >
          Exit to Island
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-3 italic">{layout.description}</p>
      
      {/* Current location info */}
      <div className={`p-3 bg-${layout.accentColor}-50 border border-${layout.accentColor}-200 rounded-lg mb-4 relative overflow-hidden`}>
        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-12 h-12 opacity-10">
          <div className={`w-6 h-6 border-t border-l border-${layout.accentColor}-800`}></div>
        </div>
        <div className="absolute bottom-0 right-0 w-12 h-12 opacity-10">
          <div className={`w-6 h-6 border-b border-r border-${layout.accentColor}-800 ml-6 mt-6`}></div>
        </div>

        <div className="flex items-start">
          <div className="mr-3 text-2xl" aria-hidden="true">
            {currentRoom.emoji}
          </div>
          <div className="flex-1">
            <h4 className={`font-medium ${getTextColor()} mb-1`}>{currentRoom.name}</h4>
            <p className="text-sm">{currentRoom.description}</p>
          </div>
        </div>

        {/* Show NPC if present */}
        {currentNPC && layout.npcs.includes(currentNPC) && (
          <div className={`mt-2 text-sm text-${layout.accentColor}-700 border-t border-${layout.accentColor}-100 pt-2`}>
            <span className="font-medium">Present:</span> {currentNPC.replace('_', ' ')}
          </div>
        )}
      </div>

      {/* If multi-room layout, show the grid; if 1x1, show simpler view */}
      {(layout.grid[0] > 1 || layout.grid[1] > 1) ? (
        <div className={`relative rounded-lg overflow-hidden border-2 border-${layout.accentColor}-300 ${layout.floorColor} p-4 shadow-inner`}>
          {/* Subtle background pattern */}
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: locationType === 'governors_house'
                ? "url(\"data:image/svg+xml,%3Csvg width='20' height='20' ...%3E\")"
                : locationType === 'cave'
                ? "url(\"data:image/svg+xml,%3Csvg width='20' height='20' ...%3E\")"
                : "url(\"data:image/svg+xml,%3Csvg width='20' height='20' ...%3E\")",
              backgroundSize: "20px 20px"
            }}
          ></div>

          {/* Corner decorations */}
          <div className="absolute top-0 left-0 w-8 h-8">
            <div className={`w-4 h-4 border-t-2 border-l-2 border-${layout.accentColor}-400`}></div>
          </div>
          <div className="absolute top-0 right-0 w-8 h-8">
            <div className={`w-4 h-4 border-t-2 border-r-2 border-${layout.accentColor}-400`} />
          </div>
          <div className="absolute bottom-0 left-0 w-8 h-8">
            <div className={`w-4 h-4 border-b-2 border-l-2 border-${layout.accentColor}-400`} />
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8">
            <div className={`w-4 h-4 border-b-2 border-r-2 border-${layout.accentColor}-400`} />
          </div>
          
          <div
            className="grid gap-2 relative z-10"
            style={{
              gridTemplateColumns: `repeat(${layout.grid[0]}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.grid[1]}, minmax(0, 1fr))`
            }}
          >
            {Array.from({ length: layout.grid[0] * layout.grid[1] }).map((_, idx) => {
              const col = idx % layout.grid[0];
              const row = Math.floor(idx / layout.grid[0]);
              const room = layout.rooms.find(r => r.x === col && r.y === row);

              const isCurrent = (playerPosition.x === col && playerPosition.y === row);
              const isAccessible = room?.accessible;
              // Check adjacency for visual highlight
              const isAdjacent = room && (
                (Math.abs(col - playerPosition.x) === 1 && row === playerPosition.y)
                || (Math.abs(row - playerPosition.y) === 1 && col === playerPosition.x)
              );

              return (
                <div
                  key={idx}
                  className={`aspect-square rounded-lg border
                    ${room ? (
                      isAccessible
                        ? 'cursor-pointer hover:scale-105 transition-transform'
                        : 'opacity-50 cursor-not-allowed'
                    ) : 'opacity-20'}
                    ${isCurrent 
                      ? `bg-${layout.accentColor}-400 border-${layout.accentColor}-600 shadow-lg`
                      : room
                        ? `${layout.wallColor} border-${layout.accentColor}-300`
                        : 'bg-gray-100 border-gray-200'}
                    ${isAdjacent ? `shadow-md border-${layout.accentColor}-500 border-2 pulse-subtle` : ''}
                  `}
                  onClick={() => room && handleRoomClick(room)}
                  onMouseEnter={() => room && setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  {room && (
                    <div className="flex items-center justify-center h-full relative">
                      <span className="text-2xl" role="img" aria-label={room.name}>
                        {room.emoji}
                      </span>
                      {isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-4 h-4 bg-white rounded-full border-2 border-amber-700 shadow-xl z-20"></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>



          {/* Hover tooltip */}
          {hoveredRoom && (
            <div className={`absolute -bottom-10 left-0 right-0 text-center text-xs font-medium bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-${layout.accentColor}-200 transition-all`}>
              <div className="font-bold">{hoveredRoom.name}</div>
              <div className="opacity-75 text-xs truncate">
                {hoveredRoom.description.substring(0, 50)}...
              </div>
            </div>
          )}
        </div>
      ) : (


    // Enhanced single-room interior (Zelda-style in 3x3 grid)
<div className={`relative rounded-lg overflow-hidden border-2 border-${layout.accentColor}-700 bg-gray-950 p-4 shadow-inner h-64`}>
  {/* Dark grid background */}
  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 p-2">
    {Array.from({ length: 9 }).map((_, idx) => {
      const isCenter = idx === 4; // Center cell in 3x3 grid
      return (
        <div 
          key={idx} 
          className={`
            relative rounded border 
            ${isCenter 
              ? `${layout.floorColor} border-${layout.accentColor}-600` 
              : 'bg-gray-900 border-gray-800 opacity-40'}
          `}
        >
          {/* Light effect for center room */}
          {isCenter && (
            <div className="absolute inset-0 bg-gradient-radial from-yellow-500/50 to-transparent opacity-90"></div>
          )}
        </div>
      );
    })}
  </div>
  
  {/* Room content centered in the grid */}
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <div className="w-1/3 h-1/4 relative z-10 flex flex-col items-center">
      <div className="text-5xl mb-2 animate-pulse-slow">{currentRoom.emoji}</div>
      <div className="absolute -bottom-14 left-1/2 transform -translate-x-1/2 w-40">
        <p className="text-white/70 text-s text-center italic line-clamp-2">
          {currentRoom.name}
        </p>
      </div>
    </div>
  </div>
  
  {/* Torchlight effect */}
  <div className="absolute top-1/4 right-1/5 w-8 h-8 bg-amber-800 rounded-full blur-sm animate-torch-flicker"></div>
  <div className="absolute bottom-1/3 left-1/4 w-2 h-2 bg-amber-500 rounded-full blur-lg animate-torch-flicker-delay"></div>
  <div className="absolute top-1/4 right-1/4 w-8 h-8 bg-amber-800 rounded-full blur-sm animate-torch-flicker"></div>
  
 
</div>


      )}

      {/* Legend for multi-room layouts */}
      {(layout.grid[0] > 1 || layout.grid[1] > 1) && (
        <div className="mt-4 text-xs text-gray-500 flex items-center justify-center space-x-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full bg-${layout.accentColor}-400 border border-${layout.accentColor}-600 mr-1`}></div>
            <span>Your position</span>
          </div>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded border border-${layout.accentColor}-500 mr-1`}></div>
            <span>Accessible room</span>
          </div>
        </div>
      )}



      {/* Subtle pulse animation */}
      <style jsx>{`
        @keyframes pulse-subtle {
    0% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0.4); }
    70% { box-shadow: 0 0 0 4px rgba(var(--${layout.accentColor}-500), 0); }
    100% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0); }
  }
  .pulse-subtle {
    animation: pulse-subtle 2s infinite;
  }
  
  @keyframes pulse-slow {
    0% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); opacity: 0.8; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 30s infinite;
  }
  
  @keyframes torch-flicker {
    0% { opacity: 0.2; filter: blur(2px); }
    25% { opacity: 0.1; filter: blur(3px); }
    50% { opacity: 0.1; filter: blur(2px); } 
    75% { opacity: 0.1; filter: blur(4px); }
    100% { opacity: 0.2; filter: blur(2px); }
  }
  .animate-torch-flicker {
    animation: torch-flicker 2s infinite;
  }
  
  .animate-torch-flicker-delay {
    animation: torch-flicker 5s infinite;
    animation-delay: 0.5s;
  }

  /* Gradient for the light effect */
  .bg-gradient-radial {
    background-image: radial-gradient(var(--tw-gradient-stops));
  }

        @keyframes pulse-subtle {
          0% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0.4); }
          70% { box-shadow: 0 0 0 4px rgba(var(--${layout.accentColor}-500), 0); }
          100% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0); }
        }
        .pulse-subtle {
          animation: pulse-subtle 2s infinite;
        }
      `}</style>
    </div>
  );
}
