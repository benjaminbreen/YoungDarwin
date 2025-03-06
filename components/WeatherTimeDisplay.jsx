'use client';

import React, { useEffect, useState } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function WeatherTimeDisplay() {
  const { gameTime, formatGameTime, daysPassed } = useGameStore();
  const [weather, setWeather] = useState('sunny');
  const [sounds, setSounds] = useState([]);
  const [parsedTime, setParsedTime] = useState({ hours: 6, minutes: 0, period: 'AM' });
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  // Direct access to the narrative text from DOM
 const getNarrativeText = () => {
    // First, try to get the raw data from the hidden div
    const rawDataEls = document.querySelectorAll('.narrative-raw-data');
    if (rawDataEls.length > 0) {
      return rawDataEls[0].textContent || '';
    }
    
    // Fallback: Try different container selectors that might contain the narrative
    const narrativeEls = document.querySelectorAll('.narrative-content, .prose');
    let fullText = '';
    
    // Collect text from all potential narrative elements
    narrativeEls.forEach(el => {
      fullText += ' ' + el.textContent;
    });
    
    return fullText;
  };

  // Parse narrative text for weather and sounds markers
  const parseNarrativeForWeather = () => {
    const text = getNarrativeText();
    if (!text) return;
    
    console.log("Looking for weather data in text");
    
    // Manually look for the markers in text using simpler string operations
    // for weather
    const weatherIndex = text.indexOf('[WEATHER:');
    if (weatherIndex !== -1) {
      const weatherEndIndex = text.indexOf(']', weatherIndex);
      if (weatherEndIndex !== -1) {
        const weatherText = text.substring(weatherIndex + 9, weatherEndIndex).toLowerCase().trim();
        console.log("Found weather text:", weatherText);
        
        // Look for specific keywords
        const weatherKeywords = ['sunny', 'hot', 'cloudy', 'mist', 
                                'night', 'storm', 'windy', 'hail', 'humid', 'rainy', 'cold', 'cool',
                              'wind', 'rainbow', 'humidity', 'fog', 
                            ];
        
        for (const keyword of weatherKeywords) {
          if (weatherText.includes(keyword)) {
            console.log("Setting weather to:", keyword);
            setWeather(keyword);
            break;
          }
        }
      }
    }
    
    // for sounds
    const soundsIndex = text.indexOf('[SOUNDS:');
    if (soundsIndex !== -1) {
      const soundsEndIndex = text.indexOf(']', soundsIndex);
      if (soundsEndIndex !== -1) {
        const soundsText = text.substring(soundsIndex + 8, soundsEndIndex).trim();
        console.log("Found sounds text:", soundsText);
        
        // Split by ellipses
        const soundList = soundsText.split('...')
          .map(sound => sound.trim())
          .filter(sound => sound.length > 0);
        
        if (soundList.length > 0) {
          console.log("Setting sounds to:", soundList);
          setSounds(soundList);
        }
      }
    }
  };

  // Process the time to get hours and calculate sun position
  useEffect(() => {
    if (gameTime === undefined) return;
    
    const totalMinutes = gameTime % 1440; // Minutes in a day
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    setParsedTime({ hours, minutes, period, displayHours });
  }, [gameTime]);

 

  // Listen for DOM changes (alternative approach)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      // Only check if enough time has passed since last update
      if (Date.now() - lastUpdateTime > 2000) {
        parseNarrativeForWeather();
        setLastUpdateTime(Date.now());
      }
    });
    
    // Watch for changes to the entire document body
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      characterData: true,
      attributes: false
    });
    
    return () => observer.disconnect();
  }, [lastUpdateTime]);

  // Calculate sun position along the arc (fixed to move left to right)
  const getSunPosition = () => {
    const { hours, minutes } = parsedTime;
    const timeOfDay = hours + (minutes / 60); // Time as decimal
    
    // Sun rises at 5am (5) and sets at 7pm (19)
    const dayStart = 5;
    const dayEnd = 19;
    const dayLength = dayEnd - dayStart;
    
    // Calculate position as percentage of day (0% to 100%)
    if (timeOfDay < dayStart) return 0; // Before sunrise
    if (timeOfDay > dayEnd) return 100; // After sunset
    
    return ((timeOfDay - dayStart) / dayLength) * 100;
  };

  // Calculate sun's vertical position (height in the sky)
  const getSunHeight = () => {
    const { hours, minutes } = parsedTime;
    const timeOfDay = hours + (minutes / 60);
    
    // Sun is highest at noon (12)
    const dayStart = 5;
    const dayEnd = 19;
    const midday = (dayStart + dayEnd) / 2; // 12 noon
    
    // Before sunrise or after sunset
    if (timeOfDay < dayStart || timeOfDay > dayEnd) {
      return 0;
    }
    
    // Calculate height (0 to 1) with a sine curve for natural arc
    // Peaks at noon (midday)
    const dayProgress = (timeOfDay - dayStart) / (dayEnd - dayStart);
    return Math.sin(dayProgress * Math.PI);
  };

  // Get weather icon based on current weather
const getWeatherIcon = () => {
  switch (weather) {
    case 'sunny':
      return '☀️';
       case 'night':
      return '🌌';
    case 'hot':
      return '🌞';
    case 'cloudy':
      return '☁️';
    case 'rainy':
      return '🌧️';
       case 'rain':
      return '🌧️';
    case 'misty':
      return '🌫️';
    case 'storm':
      return '⛈️';
    case 'windy':
      return '💨';
    case 'hail':
      return '🌨️';
    case 'humid':
      return '💧';
    case 'rainbow':
      return '🌈';
    case 'cold':
      return '❄️';
    default:
      return '☀️';
  }
};

  // Get background gradient based on time and weather
  const getBackgroundStyle = () => {
    const { hours } = parsedTime;

// rain
    if (weather === 'rain' || weather === 'rainy') {
  return 'bg-gradient-to-t from-gray-400 to-gray-700';
}
    
    // Early morning (5-7 AM)
    if (hours >= 5 && hours < 7) {
      return 'bg-gradient-to-t from-amber-200 via-pink-200 to-sky-400';
    }
    
    // Morning (7-10 AM)
    if (hours >= 7 && hours < 10) {
      if (weather === 'cloudy' || weather === 'mist') {
        return 'bg-gradient-to-t from-gray-300 via-gray-400 to-gray-500';
      }
      return 'bg-gradient-to-t from-blue-200 via-blue-300 to-sky-500';
    }
    
    // Midday (10 AM - 2 PM)
    if (hours >= 10 && hours < 14) {
      if (weather === 'cloudy') {
        return 'bg-gradient-to-t from-gray-300 to-gray-400';
      }
      if (weather === 'rain' || weather === 'storm') {
        return 'bg-gradient-to-t from-gray-600 to-gray-700';
      }
      return 'bg-gradient-to-t from-blue-300 to-sky-500';
    }
    
    // Afternoon (2-5 PM)
    if (hours >= 14 && hours < 17) {
      if (weather === 'cloudy') {
        return 'bg-gradient-to-t from-gray-300 to-gray-400';
      }
      return 'bg-gradient-to-t from-sky-300 to-blue-500';
    }
    
    // Late afternoon / Sunset (5-7 PM)
    if (hours >= 17 && hours < 19) {
      return 'bg-gradient-to-t from-orange-300 via-red-300 to-purple-500';
    }
    
    // Evening / Night (7 PM - 5 AM)
    return 'bg-gradient-to-t from-gray-900 via-blue-900 to-purple-900';
  };

  // Get sun glow color based on time of day
  const getSunGlowColor = () => {
    const { hours } = parsedTime;
    
    // Dawn (5-7 AM)
    if (hours >= 5 && hours < 7) {
      return 'rgba(255, 200, 120, 0.5)';
    }
    
    // Midday (10 AM - 2 PM)
    if (hours >= 10 && hours < 14) {
      if (weather === 'hot') {
        return 'rgba(255, 160, 60, 0.5)';
      }
      return 'rgba(255, 255, 180, 0.4)';
    }
    
    // Sunset (5-7 PM)
    if (hours >= 17 && hours < 19) {
      return 'rgba(255, 120, 80, 0.5)';
    }

    // Night time (8 PM - 5 AM)
  if (hours >= 20 || hours < 5) {
    return 'bg-gradient-to-t from-gray-900 via-blue-900 to-purple-900';
  }
    
    // Normal daylight
    return 'rgba(255, 255, 200, 0.4)';
  };

  // Get current sun position
  const sunPosition = getSunPosition();
  const sunHeight = getSunHeight();
  const isSunVisible = parsedTime.hours >= 5 && parsedTime.hours < 19;
  const isNightTime = parsedTime.hours >= 20 || parsedTime.hours < 5;


  return (
    <div className="darwin-panel darwin-portrait flex flex-col items-center">
      {/* Weather display with sun arc */}
      <div className={`relative w-full h-36 rounded-md overflow-hidden ${getBackgroundStyle()}`}>
        {/* Weather effects overlay */}
        {weather === 'rain' && (
          <div className="absolute inset-0 bg-blue-900/20 overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
              <div 
                key={i}
                className="absolute w-px bg-white/10" 
                style={{
                  height: `${Math.random() * 10 + 40}px`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `rainfall ${Math.random() * 2 + 1}s linear infinite`,
                  animationDelay: `${Math.random() * 1}s`
                }}
              ></div>
            ))}
          </div>
        )}
        
        {weather === 'mist' && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm"></div>
        )}
        
      {weather === 'storm' && (
  <div className="absolute inset-0 bg-gray-900 overflow-hidden">
    {/* Dark storm gradient effect fully obscuring the sun */}
    <div 
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(to bottom, rgba(15, 15, 15, 0.95), rgba(30, 30, 30, 1), rgba(10, 10, 10, 1))',
      }}
    ></div>

    {/* Heavy Rain layers with random motion */}
    {Array.from({ length: 25 }).map((_, i) => (
      <div 
        key={i}
        className="absolute w-px bg-white/30" 
        style={{
          height: `${Math.random() * 60 + 80}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `rainfall ${Math.random() * 1 + 0.8}s linear infinite`,
          animationDelay: `${Math.random() * 1}s`
        }}
      ></div>
    ))}

    {/* Lightning Flash Effect (Brightens the entire scene briefly) */}
    <div 
      className="absolute inset-0 bg-white"
      style={{
        opacity: 0,
        animation: `lightningFlash ${Math.random() * 8 + 4}s infinite`,
        animationDelay: `${Math.random() * 6}s`
      }}
    ></div>

    {/* Lightning Bolt Strikes */}
    {Array.from({ length: 3 }).map((_, i) => (
      <div 
        key={`bolt-${i}`}
        className="absolute bg-white"
        style={{
          height: `${Math.random() * 80 + 100}px`,
          width: '2px',
          left: `${Math.random() * 90 + 5}%`,
          top: '10%',
          opacity: 0,
          animation: `lightningStrike ${Math.random() * 10 + 10}s infinite`,
          animationDelay: `${Math.random() * 8}s`
        }}
      ></div>
    ))}
  </div>
)}


        
        {weather === 'cloudy' && (
          <div className="absolute inset-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div 
                key={i}
                className="absolute bg-white/80 rounded-full blur-md"
                style={{
                  height: `${Math.random() * 40 + 30}px`,
                  width: `${Math.random() * 80 + 60}px`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 60}%`,
                  animation: `driftClouds ${Math.random() * 100 + 200}s linear infinite`,
                  opacity: Math.random() * 0.3 + 0.4
                }}
              ></div>
            ))}
          </div>
        )}


        
        {/* Horizon line */}
        <div className="absolute bottom-0 left-0 w-full border-t border-white/20"></div>
        
        {/* Arc path for sun (visual guide) */}
        <div className="absolute bottom-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-0 w-full h-full border-t border-white/10 rounded-full scale-y-[0.5] origin-bottom"></div>
        </div>
        
        {/* Sun and Night*/}
    {isNightTime ? (
  <div className="absolute inset-0">
    {/* Starry night background */}
    {Array.from({ length: 30 }).map((_, i) => (
      <div 
        key={i}
        className="absolute bg-white rounded-full"
        style={{
          width: `${Math.random() * 2 + 1}px`,
          height: `${Math.random() * 2 + 1}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          opacity: Math.random() * 0.7 + 0.3,
          animation: `twinkle ${Math.random() * 5 + 3}s ease-in-out infinite`
        }}
      ></div>
    ))}
  </div>
) : null}


{isSunVisible && !isNightTime && (
          <div 
            className="absolute"
            style={{
              left: `${sunPosition}%`,
              bottom: `${sunHeight * 80}%`, // 0-80% of height
              transform: 'translate(-50%, 50%)',
            }}
          >
            {/* Sun glow */}
            <div
              className="absolute rounded-full blur-lg z-0"
              style={{
                width: '50px',
                height: '50px',
                backgroundColor: getSunGlowColor(),
                transform: 'translate(-50%, -50%)',
              }}
            ></div>
            
            {/* Sun itself */}
            <div
              className="absolute rounded-full z-10 shadow-lg"
              style={{
                width: '24px',
                height: '24px',
                backgroundColor: '#FEFCD7',
                transform: 'translate(-50%, -50%)',
              }}
            ></div>
          </div>
        )}
        
        {/* Weather icon */}
        <div className="absolute top-3 right-3 text-2xl drop-shadow-md">
          {getWeatherIcon()}
        </div>
      </div>
      
      {/* Time information */}
      <div className="w-full mt-1.5 text-center">
        <p className="text-xl font-bold text-darwin-dark">
          {formatGameTime ? formatGameTime() : '6:00 AM'} 
          <span className="text-sm text-gray-600 ml-2">Day {daysPassed || 1}</span>
        </p>
        
        {/* Weather description */}
        <p className="text-sm font-medium text-amber-700 capitalize mt-0 mb-1">
          {weather} {weather === 'hot' ? '(32°C)' : weather === 'cloudy' ? '(24°C)' : ''}
        </p>
        
        {/* Ambient sounds */}
        {sounds.length > 0 && (
          <p className="text-xs italic text-gray-600 mb-1">
            {sounds.join(' • ')}
          </p>
        )}
      </div>

      {/* Weather effects overlays based on weather type */}
{weather === 'cloudy' && (
  <div className="absolute inset-0">
    {Array.from({ length: 5 }).map((_, i) => (
      <div 
        key={i}
        className="absolute bg-white/80 rounded-full blur-md"
        style={{
          height: `${Math.random() * 40 + 30}px`,
          width: `${Math.random() * 80 + 60}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 60}%`,
          animation: `driftClouds ${Math.random() * 100 + 200}s linear infinite`,
          opacity: Math.random() * 0.3 + 0.4
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'rainy' && (
  <div className="absolute inset-0 bg-blue-900/20 overflow-hidden">
    {Array.from({ length: 30 }).map((_, i) => (
      <div 
        key={i}
        className="absolute w-px bg-white/70" 
        style={{
          height: `${Math.random() * 30 + 20}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `rainfall ${Math.random() * 0.5 + 0.5}s linear infinite`,
          animationDelay: `${Math.random() * 1}s`
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'misty' && (
  <div className="absolute inset-0 backdrop-blur-sm">
    {Array.from({ length: 8 }).map((_, i) => (
      <div 
        key={i}
        className="absolute bg-white/40 rounded-full blur-xl"
        style={{
          height: `${Math.random() * 100 + 50}px`,
          width: `${Math.random() * 150 + 100}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `mistDrift ${Math.random() * 120 + 180}s linear infinite`,
          opacity: Math.random() * 0.2 + 0.1
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'storm' && (
  <div className="absolute inset-0 bg-gray-800/30 overflow-hidden">
    {/* Rain */}
    {Array.from({ length: 40 }).map((_, i) => (
      <div 
        key={i}
        className="absolute w-px bg-white/60" 
        style={{
          height: `${Math.random() * 30 + 20}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          transform: `rotate(${15 + Math.random() * 10}deg)`,
          animation: `rainfall ${Math.random() * 0.3 + 0.3}s linear infinite`,
          animationDelay: `${Math.random() * 0.5}s`
        }}
      ></div>
    ))}
    
    {/* Lightning */}
    {Array.from({ length: 3 }).map((_, i) => (
      <div 
        key={`lightning-${i}`}
        className="absolute bg-white/90 origin-center"
        style={{
          height: '2px',
          width: `${Math.random() * 50 + 50}px`,
          left: `${Math.random() * 80 + 10}%`,
          top: `${Math.random() * 40 + 5}%`,
          transform: `rotate(${Math.random() * 360}deg)`,
          opacity: 0,
          animation: `lightning 8s ease-in-out infinite`,
          animationDelay: `${i * 2.7}s`
        }}
      ></div>
    ))}
    
    {/* Dark clouds */}
    {Array.from({ length: 4 }).map((_, i) => (
      <div 
        key={`cloud-${i}`}
        className="absolute bg-gray-700/60 rounded-full blur-lg"
        style={{
          height: `${Math.random() * 60 + 40}px`,
          width: `${Math.random() * 100 + 80}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 50}%`,
          animation: `stormClouds ${Math.random() * 80 + 120}s linear infinite`,
          opacity: Math.random() * 0.4 + 0.2
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'windy' && (
  <div className="absolute inset-0 overflow-hidden">
    {/* Wind streaks */}
    {Array.from({ length: 20 }).map((_, i) => (
      <div 
        key={i}
        className="absolute bg-white/20 rounded-full blur-md"
        style={{
          height: `${Math.random() *  + 10}px`,
          width: `${Math.random() * 60 + 30}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          transform: `rotate(${5 + Math.random() * 10}deg)`,
          animation: `windStreak ${Math.random() * 6 + 1}s linear infinite`,
          animationDelay: `${Math.random() * 1}s`
        }}
      ></div>
    ))}
    
    {/* Small dust particles */}
    {Array.from({ length: 20 }).map((_, i) => (
      <div 
        key={`dust-${i}`}
        className="absolute bg-amber-200/60 rounded-full"
        style={{
          height: `${Math.random() * 3 + 2}px`,
          width: `${Math.random() * 3 + 1}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `dustParticle ${Math.random() * 4 + 2}s linear infinite`,
          animationDelay: `${Math.random() * 1}s`
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'hail' && (
  <div className="absolute inset-0 bg-blue-900/10 overflow-hidden">
    {Array.from({ length: 25 }).map((_, i) => (
      <div 
        key={i}
        className="absolute bg-white/80 rounded-full" 
        style={{
          height: `${Math.random() * 4 + 3}px`,
          width: `${Math.random() * 4 + 3}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `hailfall ${Math.random() * 1 + 1}s linear infinite`,
          animationDelay: `${Math.random() * 2}s`
        }}
      ></div>
    ))}
  </div>
)}

{weather === 'humid' && (
  <div className="absolute inset-0 overflow-hidden">
    {/* Heat haze effect */}
    <div 
      className="absolute inset-0"
      style={{
        animation: 'heatHaze 8s linear infinite alternate',
        backdropFilter: 'blur(2px)', // Apply subtle distortion
        opacity: 0.8
      }}
    ></div>
    
    {/* Yellowish heat gradient at the bottom */}
    <div 
      className="absolute bottom-0 left-0 w-full h-20"
      style={{
        background: 'linear-gradient(to top, rgba(255, 200, 100, 0.4), transparent)',
        opacity: 0.9
      }}
    ></div>
  </div>
)}




{weather === 'rainbow' && (
  <div className="absolute inset-3 overflow-hidden">
    <div 
      className="absolute"
      style={{
        width: '100%',
        height: '150%',
        left: '20%',
        top: '-90%',
        background: 'radial-gradient(circle at top, transparent 10%, rgba(255,0,0,0.1) 70%, rgba(255,165,0,0.1) 71%, rgba(255,255,0,0.1) 72%, rgba(0,128,0,0.1) 73%, rgba(0,0,255,0.1) 74%, rgba(75,0,130,0.1) 75%, rgba(238,130,238,0.1) 76%, transparent 77%)',
        borderRadius: '50%',
        transform: 'rotate(40deg)',
        opacity: 0.99
      }}
    ></div>
  </div>
)}

{weather === 'hot' && (
  <div className="absolute inset-0 overflow-hidden">
    {/* Heat haze effect */}
    <div 
      className="absolute inset-0 backdrop-blur-[0.5px]"
      style={{
        animation: 'heatHaze 8s ease-in-out infinite'
      }}
    ></div>
    
    {/* Sun glare */}
    <div 
      className="absolute"
      style={{
        width: '120px',
        height: '120px',
        right: '5%',
        top: '15%',
        background: 'radial-gradient(circle, rgba(255,255,200,0.3) 0%, rgba(255,200,100,0.1) 50%, transparent 70%)',
        borderRadius: '50%',
        animation: 'sunPulse 4s ease-in-out infinite'
      }}
    ></div>
  </div>
)}

{/* CSS animations */}
<style jsx>{`
 @keyframes rainfall {
  0% { transform: translateY(-100%); opacity: 0.5; }
  100% { transform: translateY(100vh); opacity: 0.3; }
}

/* Lightning Flash Effect - Makes the screen briefly bright */
@keyframes lightningFlash {
  0%, 95%, 100% { opacity: 0; }
  96% { opacity: 0.4; }
  97% { opacity: 0.3; }
}

/* Lightning Bolt Strike */
@keyframes lightningStrike {
  0%, 98%, 100% { opacity: 0; height: 0; }
  99% { opacity: 1; height: 2000px; }
}
  
  @keyframes hailfall {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(1000%); }
  }
  
  @keyframes driftClouds {
    from { transform: translateX(-120%); }
    to { transform: translateX(120%); }
  }
  
  @keyframes stormClouds {
    from { transform: translateX(-120%); }
    to { transform: translateX(120%); }
  }
  
  @keyframes mistDrift {
    0% { transform: translateX(-100%) translateY(0); opacity: 0.1; }
    50% { opacity: 0.3; }
    100% { transform: translateX(100%) translateY(-20%); opacity: 0.1; }
  }
  
  @keyframes lightning {
    0%, 15%, 17%, 19%, 21%, 23%, 25%, 27%, 29%, 31%, 100% { opacity: 0; }
    16%, 18%, 20%, 22%, 24%, 26%, 28%, 30% { opacity: 1; }
  }
  
  @keyframes windStreak {
    0% { transform: translateX(-100%) rotate(5deg); }
    100% { transform: translateX(200%) rotate(5deg); }
  }
  
  @keyframes dustParticle {
    0% { transform: translateX(-20px) translateY(0); opacity: 0; }
    10% { opacity: 0.6; }
    100% { transform: translateX(40px) translateY(-20px); opacity: 0; }
  }
  
  @keyframes heatWave {
    0%, 100% { transform: translateY(0) scaleY(1); opacity: 0.3; }
    50% { transform: translateY(-10px) scaleY(1.1); opacity: 0.4; }
  }
  
  @keyframes heatHaze {
    0% { backdrop-filter: blur(0.4px); }
    50% { backdrop-filter: blur(1px); }
    100% { backdrop-filter: blur(0.4px); }
  }
  
  @keyframes sunPulse {
    0%, 100% { opacity: 0.8; transform: scale(1); }
    50% { opacity: 0.95; transform: scale(1.1); }
  }
`}</style>
      
      {/* CSS animations */}
      <style jsx>{`
        @keyframes rainfall {
          0% { transform: translateY(-20px); }
          100% { transform: translateY(150px); }
        }
        
        @keyframes driftClouds {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
        
        @keyframes lightning {
          0%, 20%, 40%, 60%, 80%, 100% { opacity: 0; }
          10%, 30%, 50%, 70%, 90% { opacity: ${Math.random() < 0.7 ? 0 : 1}; }
        }
      `}</style>
    </div>
  );
}