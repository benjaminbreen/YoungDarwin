// FatigueManagement.jsx
import React, { useState, useEffect } from 'react';

const FatigueManagement = ({ 
  fatigue, 
  playerPosition, 
  gameTime,
  getCurrentLocation,
  updateMoodAndFatigue,
  advanceTime,
  moveToLocation,
  sendToLLM
}) => {
  const [showFatigueWarning, setShowFatigueWarning] = useState(false);
  const [showRestButton, setShowRestButton] = useState(false);
  
  // Define restable locations once
  const restableLocations = ['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT'];
  
  // Monitor fatigue and show warnings or trigger pass out
  useEffect(() => {
    // High fatigue warning (75% or higher)
    if (fatigue >= 75 && fatigue < 95) {
      setShowFatigueWarning(true);
      // Auto-hide warning after 5 seconds
      const timer = setTimeout(() => {
        setShowFatigueWarning(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
    
    // Critical fatigue - pass out (95% or higher)
    if (fatigue >= 95) {
      handlePassOut();
    }
  }, [fatigue]);
  
  // Check if current location allows resting
  useEffect(() => {
    const currentLocation = getCurrentLocation();
    if (currentLocation && restableLocations.includes(currentLocation.id)) {
      setShowRestButton(true);
    } else {
      setShowRestButton(false);
    }
  }, [playerPosition, getCurrentLocation]);
  
  // Handle passing out from exhaustion
  const handlePassOut = () => {
    // Reset fatigue
    updateMoodAndFatigue(null, 0);
    
    // Advance time to next morning
    const currentHour = Math.floor((gameTime % 1440) / 60);
    const minutesToNextDay = (24 - currentHour) * 60;
    advanceTime(minutesToNextDay + 6 * 60); // Add 6 hours for next morning at 6 AM
    
    // Move back to HMS Beagle
    moveToLocation('POST_OFFICE_BAY');
    
    // Send message about passing out
    sendToLLM("You collapse from exhaustion, your body unable to continue. The world fades to black. Hours later, you awaken in your cabin aboard the HMS Beagle. Syms Covington explains that some sailors found you unconscious and carried you back to the ship. Captain FitzRoy looks concerned but says nothing. After a night of deep sleep, you feel refreshed and ready to continue your explorations, though somewhat embarrassed by yesterday's misadventure.");
  };
  
  // Generic rest function that works in any valid rest location
  const handleRest = () => {
    // Get current location
    const currentLocation = getCurrentLocation();
    if (!currentLocation || !restableLocations.includes(currentLocation.id)) {
      return; // Safety check
    }
    
    // Reset fatigue
    updateMoodAndFatigue(null, 0);
    
    // Advance time (different amounts based on location)
    const currentHour = Math.floor((gameTime % 1440) / 60);
    
    // Different rest messages based on location
    let restMessage = "";
    
    if (currentLocation.id === 'POST_OFFICE_BAY') {
      // Full night's rest on Beagle
      const minutesToNextDay = (24 - currentHour) * 60;
      advanceTime(minutesToNextDay + 6 * 60); // Next day at 6 AM
      
      restMessage = "You return to the HMS Beagle for the night, enjoying a hearty meal with the crew. After a good night's rest in your small but comfortable cabin, you awaken refreshed and ready to continue your explorations at dawn.";
    } 
    else if (currentLocation.id === 'W_LAVA') {
      // Shorter rest at whaler's huts
      advanceTime(240); // 4 hours
      
      restMessage = "You take shelter in one of the seasonal whaler's huts. The simple structure offers welcome protection from the elements. You spread your coat on the dirt floor and rest for several hours, lulled by the distant sound of waves. When you awaken, you feel remarkably refreshed.";
    }
    else if (currentLocation.id === 'SETTLEMENT') {
      // Rest at settlement
      advanceTime(360); // 6 hours
      
      restMessage = "Despite the grim atmosphere of the penal colony, you find a relatively comfortable corner in one of the structures where travelers are permitted to stay. The colonists leave you to your own devices, and you manage several hours of solid rest. You awaken feeling restored and ready to continue your explorations.";
    }
    
    // Send message about rest
    sendToLLM(restMessage);
  };
  
  // Function to check if text contains rest commands (exported for use in main handler)
  const isRestCommand = (text) => {
    if (!text) return false;
    const restTerms = ['rest', 'sleep', 'nap', 'lay down', 'lie down', 'make camp', 'build shelter'];
    return restTerms.some(term => text.toLowerCase().includes(term));
  };
  
  // Public method to check and handle rest commands
  const checkForRestCommand = (input) => {
    // If it's a rest command and in a valid location, handle rest
    if (isRestCommand(input)) {
      const currentLocation = getCurrentLocation();
      if (currentLocation && restableLocations.includes(currentLocation.id)) {
        handleRest();
        return true; // Command was handled
      }
    }
    return false; // Command was not handled
  };
  
  return (
    <>
      {/* Fatigue Warning Popup */}
      {showFatigueWarning && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg z-50 max-w-md">
          <div className="flex">
            <div className="py-1">
              <svg className="h-6 w-6 text-red-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-bold">Extreme Fatigue</p>
              <p className="text-sm">Darwin is becoming dangerously exhausted. Find shelter to rest soon or risk collapse. Try returning to the Beagle or finding shelter in a settlement.</p>
            </div>
          </div>
        </div>
      )}

      {/* Rest Button */}
      {showRestButton && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <button 
            onClick={handleRest}
            className="bg-amber-700 hover:bg-amber-800 text-white py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 transition-all"
          >
            <span>🛌</span> Find Shelter
          </button>
        </div>
      )}
    </>
  );
};

export default FatigueManagement;

// Also export the handleRest and checkForRestCommand functions
export const createFatigueManager = ({
  fatigue,
  playerPosition,
  gameTime,
  getCurrentLocation,
  updateMoodAndFatigue,
  advanceTime,
  moveToLocation,
  sendToLLM
}) => {
  // Create a utility object with methods that can be accessed outside the component
  const handleRest = () => {
    // Get current location
    const currentLocation = getCurrentLocation();
    const restableLocations = ['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT'];
    
    if (!currentLocation || !restableLocations.includes(currentLocation.id)) {
      return false; // Cannot rest here
    }
    
    // Reset fatigue
    updateMoodAndFatigue(null, 0);
    
    // Advance time (different amounts based on location)
    const currentHour = Math.floor((gameTime % 1440) / 60);
    
    // Different rest messages based on location
    let restMessage = "";
    
    if (currentLocation.id === 'POST_OFFICE_BAY') {
      // Full night's rest on Beagle
      const minutesToNextDay = (24 - currentHour) * 60;
      advanceTime(minutesToNextDay + 6 * 60); // Next day at 6 AM
      
      restMessage = "You return to the HMS Beagle for the night, enjoying a hearty meal with the crew. After a good night's rest in your small but comfortable cabin, you awaken refreshed and ready to continue your explorations at dawn.";
    } 
    else if (currentLocation.id === 'W_LAVA') {
      // Shorter rest at whaler's huts
      advanceTime(240); // 4 hours
      
      restMessage = "You take shelter in one of the seasonal whaler's huts. The simple structure offers welcome protection from the elements. You spread your coat on the dirt floor and rest for several hours, lulled by the distant sound of waves. When you awaken, you feel remarkably refreshed.";
    }
    else if (currentLocation.id === 'SETTLEMENT') {
      // Rest at settlement
      advanceTime(360); // 6 hours
      
      restMessage = "Despite the grim atmosphere of the penal colony, you find a relatively comfortable corner in one of the structures where travelers are permitted to stay. The colonists leave you to your own devices, and you manage several hours of solid rest. You awaken feeling restored and ready to continue your explorations.";
    }
    
    // Send message about rest
    sendToLLM(restMessage);
    return true;
  };

  const isRestCommand = (text) => {
    if (!text) return false;
    const restTerms = ['rest', 'sleep', 'nap', 'lay down', 'lie down', 'make camp', 'build shelter'];
    return restTerms.some(term => text.toLowerCase().includes(term));
  };

  const checkForRestCommand = (input) => {
    // If it's a rest command and in a valid location, handle rest
    if (isRestCommand(input)) {
      return handleRest();
    }
    return false; // Command was not handled
  };
  
  return {
    handleRest,
    isRestCommand,
    checkForRestCommand
  };
};