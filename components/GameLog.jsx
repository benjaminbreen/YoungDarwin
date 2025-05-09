'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function GameLog({ narrative, isLoading, lastUserInput, isMovingViaMap }) {
  const logRef = useRef(null);
  const [displayedNarrative, setDisplayedNarrative] = useState(narrative);
  const [isFading, setIsFading] = useState(false);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const prevNarrativeRef = useRef(narrative);
  
  // Handle fade transitions when narrative changes
  useEffect(() => {
    // Only trigger transitions if we have content and it's different
    if (narrative && narrative !== prevNarrativeRef.current) {
      // Start fade out
      setIsFading(true);
      
      // After fade out completes, update the displayed narrative
      const fadeOutTimer = setTimeout(() => {
        setDisplayedNarrative(narrative);
        setIsFading(false);
        prevNarrativeRef.current = narrative;
      }, 10); // Matches the CSS transition duration
      
      return () => clearTimeout(fadeOutTimer);
    }
  }, [narrative]);
  
  // Delayed loading animation to prevent flicker on quick responses
  useEffect(() => {
    let loadingTimer;
    
    if (isLoading) {
      // Delay showing loading animation to prevent flickering on fast responses
      loadingTimer = setTimeout(() => {
        setShowLoadingAnimation(true);
      }, 10);
    } else {
      setShowLoadingAnimation(false);
    }
    
    return () => clearTimeout(loadingTimer);
  }, [isLoading]);
  
  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (logRef.current && !isFading) {
      // Add a small delay to ensure content is fully rendered before scrolling
      const scrollTimer = setTimeout(() => {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 0);
      
      return () => clearTimeout(scrollTimer);
    }
  }, [displayedNarrative, isFading, showLoadingAnimation]);
  
  // Process narrative to format markdown-style elements
  const formatNarrative = (text) => {
    if (!text) return '';
    
    const rawText = text;
    
    // Filter out markers but store text first in data attribute
    const processedText = text
      .replace(/\[STATUS:.*?\]/g, '')
      .replace(/\[FATIGUE:.*?\]/g, '')
      .replace(/\[WEATHER:.*?\]/g, '')
      .replace(/\[SOUNDS:.*?\]/g, '')
      .replace(/\[MOOD:.*?\]/g, '')
      .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
      .replace(/\[COLLECTIBLE:.*?\]/g, '')
      .replace(/\[NPC:.*?\]/g, '')
      .replace(/\[NPC_STATUS:.*?\]/g, '')
      .replace(/\[NEXTSTEPS:.*?\]/g, '')
      .trim();
    
    // Enhanced Markdown -> HTML with more styling options
    const formattedText = processedText
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-900">$1</strong>')
      // Italic text
      .replace(/\*(.*?)\*/g, '<em class="text-amber-800">$1</em>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="mb-3">')
      // Basic quotes
      .replace(/>(.*?)(\n|$)/g, '<blockquote class="border-l-4 border-amber-300 pl-3 py-1 italic text-amber-800 my-2">$1</blockquote>');
    
    return `
      <div class="hidden narrative-raw-data">${rawText}</div>
      <div class="narrative-content font-serif">
        <p class="mb-3">${formattedText}</p>
      </div>
    `;
  };
  
  // Determine loading animation based on user input
  const getLoadingContext = () => {
    // Default
    let loadingText = 'Darwin is investigating...';
    let loadingImage = '/loading/defaultDarwin.jpg';
    
    if (isMovingViaMap) {
      loadingText = 'Darwin is traveling...';
      loadingImage = '/loading/travelDarwin.jpg';
    } else {
      // Convert player input to lowercase for easier checks
      const input = (lastUserInput || '').toLowerCase();
      
      // Motion/travel
      if (input.includes('travel') || input.includes('move') || input.includes('go') || 
          input.includes('walk') || input.includes('north') || input.includes('south') || 
          input.includes('east') || input.includes('west')) {
        loadingText = 'Darwin is traveling...';
        loadingImage = '/loading/travelDarwin.jpg';
      } 
      // Observation 
      else if (input.includes('observe') || input.includes('look') || 
        input.includes('examine') || input.includes('watch') ||
        input.includes('study') || input.includes('inspect')) {
        loadingText = 'Darwin is observing...';
        loadingImage = '/loading/observingDarwin.jpg';
      } 
      // Collection
      else if (input.includes('collect') || input.includes('specimen') || 
        input.includes('natural') || input.includes('gather') ||
        input.includes('pick') || input.includes('take')) {
        loadingText = 'Darwin is collecting...';
        loadingImage = '/loading/collectingDarwin.jpg';
      } 
      // Conversation
      else if (input.includes('talk') || input.includes('speak') || 
        input.includes('ask') || input.includes('tell') ||
        input.includes('discuss') || input.includes('conversation')) {
        loadingText = 'Darwin is conversing...';
        loadingImage = '/loading/talkingDarwin.jpg';
      }
    }
    
    return { loadingText, loadingImage };
  };
  
  // If loading, show the watercolor-style loading state with delay
  if (isLoading && showLoadingAnimation) {
    const { loadingText, loadingImage } = getLoadingContext();
    
    return (
      <div ref={logRef} className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center relative">
        {/* Watercolor container with enhanced effects */}
        <div className="watercolor-container">
          <div className="watercolor-image-wrapper">
            <div 
              className="watercolor-image"
              style={{
                backgroundImage: `url(${loadingImage})`,
              }}
            >
              {/* Additional blended edges overlay */}
              <div className="edge-blend"></div>
            </div>
          </div>
        </div>
        
        {/* Loading text with letter-by-letter animation but preserving spaces */}
        <div className="text-container">
          {loadingText.split('').map((char, index) => (
            <span 
              key={index} 
              className={char === ' ' ? 'space-char' : 'animated-letter'}
              style={{ 
                animationDelay: `${0.5 + (index * 0.05)}s`, // Reduced delay for faster appearance
                animationDuration: `${2.5}s` // Slightly longer duration for better readability
              }}
            >
              {char}
            </span>
          ))}
        </div>
        
        {/* CSS for the enhanced loading display */}
        <style jsx>{`
          .watercolor-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 20px;
            opacity: 0;
            animation: containerFade 8s ease-in forwards;
          }
          
          .watercolor-image-wrapper {
            position: relative;
            width: 500px;
            height: 500px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          
          .watercolor-image {
            position: relative;
            width: 85%;
            height: 75%;
            background-size: cover;
            background-position: center center;
            transform-origin: center;
            animation: slowZoom 8s ease-in-out infinite alternate;
            
            /* Create soft, irregular shape */
            mask-image: 
              radial-gradient(ellipse at center, black 30%, transparent 75%);
            -webkit-mask-image: 
              radial-gradient(ellipse at center, black 30%, transparent 75%);
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 0 30px rgba(139, 90, 43, 0.15);
          }
          
          /* Additional layer for blended edges */
          .edge-blend {
            position: absolute;
            inset: -10px;
            background: transparent;
            z-index: 1;
            
            /* Multiple overlapping masks for natural watercolor look */
            mask-image: 
              radial-gradient(ellipse at 30% 35%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 70% 65%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 65% 25%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 35% 75%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 50% 50%, transparent 40%, black 60%, transparent 90%);
            -webkit-mask-image: 
              radial-gradient(ellipse at 30% 35%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 70% 65%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 65% 25%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 35% 75%, transparent 50%, black 75%, transparent 90%),
              radial-gradient(ellipse at 50% 50%, transparent 40%, black 60%, transparent 90%);
            
            /* Watercolor texture appearance */
            background-image: 
              linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
              linear-gradient(135deg, rgba(255,255,255,0.05) 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%),
              linear-gradient(135deg, transparent 75%, rgba(255,255,255,0.05) 75%);
            background-size: 20px 20px;
            background-position: 0 0, 10px 0, 10px -10px, 0px 10px;
            opacity: 0.1;
          }
          
          .watercolor-image:before {
            content: '';
            position: absolute;
            inset: -15%;
            background: radial-gradient(circle at center, rgba(139, 90, 43, 0.3), transparent 70%);
            z-index: -1;
            filter: blur(20px);
          }
          
          .text-container {
            height: 30px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 10px;
            overflow: hidden;
          }
          
          .animated-letter {
            display: inline-block;
            font-family: 'Georgia', serif;
            font-style: italic;
            font-size: 1.2rem;
            color: #8B5A2B;
            opacity: 0;
            animation: letterFade forwards;
            text-shadow: 0 1px 2px rgba(139, 90, 43, 0.15);
          }
          
          /* Special class for space characters to preserve word spacing */
          .space-char {
            display: inline-block;
            width: 0.5em; /* Adjust as needed for proper spacing */
            opacity: 0;
            animation: letterFade forwards;
          }
          
          @keyframes containerFade {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          
          @keyframes slowZoom {
            0% { 
              transform: scale(1);
              filter: brightness(1) contrast(1);
            }
            100% { 
              transform: scale(1.05); 
              filter: brightness(1.05) contrast(1.03);
            }
          }
          
          @keyframes letterFade {
            0% { 
              opacity: 0;
              transform: translateY(5px);
            }
            15% { 
              opacity: 1;
              transform: translateY(0);
            }
            85% { 
              opacity: 1;
              transform: translateY(0);
            }
            100% { 
              opacity: 0;
              transform: translateY(-5px);
            }
          }
        `}</style>
      </div>
    );
  }
  
  // Otherwise, render the normal narrative with fade effect
  return (
    <div
      ref={logRef}
      className="flex-1 overflow-y-auto p-6 prose max-w-none relative"
    >
      <div 
        className={`transition-opacity duration-10 ${isFading ? 'opacity-0' : 'opacity-100'}`}
        dangerouslySetInnerHTML={{ 
          __html: `
            ${formatNarrative(displayedNarrative)}
            <div class="decorative-corner-top-right absolute top-2 right-2 w-8 h-8 opacity-10"
              style="background-image: url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'%3E%3Cpath fill=\\'%238B5A2B\\' d=\\'M0,0 L24,0 L24,6 C18,6 12,12 12,18 L6,18 C6,12 0,6 0,0 Z\\'/%3E%3C/svg%3E'); background-size: contain;">
            </div>
            <div class="decorative-corner-bottom-left absolute bottom-2 left-2 w-8 h-8 opacity-10"
              style="background-image: url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'%3E%3Cpath fill=\\'%238B5A2B\\' d=\\'M0,24 L0,18 C6,18 12,12 12,6 L18,6 C18,12 24,18 24,24 L0,24 Z\\'/%3E%3C/svg%3E'); background-size: contain;">
            </div>
          `
        }}
      />
    </div>
  );
}