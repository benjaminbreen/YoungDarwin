'use client';

import React, { useEffect } from 'react';
import { npcs } from '../data/npcs';
import SwitchPOV from './SwitchPOV'; // Add this import

export default function Portrait({ character, mood, fatigue, onSwitchPOV }) { // Add onSwitchPOV prop
  useEffect(() => {
    // Debug to see what's being passed
    console.log("Portrait received character:", character);
  }, [character]);

  // First, determine if we're dealing with an NPC
  let npcData = null;
  
  if (character === 'darwin' || !character) {
    // It's Darwin
    npcData = null;
  } else if (typeof character === 'string') {
    // It's an NPC ID string
    npcData = npcs.find(npc => npc.id === character);
    if (!npcData) {
      console.warn(`No NPC found with ID: ${character}`);
    }
  } else if (typeof character === 'object' && character !== null) {
    // It's an NPC object
    npcData = character;
  }
  
  const isNPC = npcData !== null;
  
  // Determine which portrait to show
  const getPortraitImage = () => {
    if (isNPC && npcData) {
      // Return NPC portrait
      return `/portraits/${npcData.id}.jpg`;
    } else {
      // Darwin portrait
      return `/portraits/darwin.jpg`;
    }
  };
  
  // Get description text
  const getDescriptionText = () => {
    if (isNPC && npcData) {
      return npcData.shortDescription || "A resident of the Galápagos";
    } else {
      // Darwin mood descriptions
      switch(mood) {
        case 'interested':
          return fatigue < 30 
            ? "Keenly observing with fresh enthusiasm" 
            : fatigue < 70 
              ? "Maintaining scholarly curiosity despite growing weariness" 
              : "Struggling to focus amid exhaustion, yet determined to continue observations";
        // Other mood cases remain the same
        default:
          return "Observing the island's wonders";
      }
    }
  };
  
  // Get status text
  const getStatusDetails = () => {
    if (isNPC && npcData) {
      return { text: npcData.role || 'Present', class: 'text-gray-600' };
    }
    
    // Darwin fatigue status
    if (fatigue < 20) {
      return { text: 'Well-rested', class: 'text-green-700' };
    } else if (fatigue < 40) {
      return { text: 'Refreshed', class: 'text-green-600' };
    } else if (fatigue < 60) {
      return { text: 'Somewhat tired', class: 'text-amber-600' };
    } else if (fatigue < 80) {
      return { text: 'Very tired', class: 'text-orange-600' };
    } else {
      return { text: 'Exhausted', class: 'text-red-600' };
    }
  };
  
  const statusDetails = getStatusDetails();
  const characterName = isNPC && npcData ? npcData.name : 'Charles Darwin';
  const characterRole = isNPC && npcData ? npcData.role : 'Naturalist';
  
return (
    <div className="darwin-panel darwin-portrait flex flex-col items-center">
      <div className="relative mb-2">
        <div className="portrait-frame absolute inset-0 rounded-full border-2 border-amber-700 opacity-10"></div>
        <img 
          src={getPortraitImage()} 
          alt={`${characterName}`}
          className="w-24 h-24 rounded-full object-cover portrait-image" 
          onError={(e) => {
            // Fallback to placeholder on error
            e.target.src = `https://placehold.co/150x150/8B5A2B/FFFFFF?text=${characterName.split(' ')[0]}`;
          }}
        />
        
        {/* Add the SwitchPOV button only for Darwin's portrait */}
        {!isNPC && onSwitchPOV && (
          <SwitchPOV onSwitchPOV={onSwitchPOV} />
        )}
      </div>
      
      <div className="text-center">
        <h3 className="font-bold text-darwin-dark text-xl font-serif">{characterName}</h3>
        <p className="text-sm italic text-darwin-primary mt-1 mb-2">{getDescriptionText()}</p>
        
        {!isNPC && (
          <div className="fatigue-meter w-full mt-3 mb-1">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Fatigue</span>
              <span className={statusDetails.class}>{statusDetails.text}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  fatigue < 30 ? 'bg-green-500' : 
                  fatigue < 60 ? 'bg-yellow-500' : 
                  fatigue < 80 ? 'bg-orange-500' : 'bg-red-500'
                }`} 
                style={{ width: `${fatigue}%` }}
              ></div>
            </div>
          </div>
        )}

        {isNPC && npcData && (
          <div className="mt-2 text-xs text-gray-600">
            <span className="px-2 py-1 bg-amber-100 rounded-full">{characterRole}</span>
          </div>
        )}
      </div>
    </div>
  );
}